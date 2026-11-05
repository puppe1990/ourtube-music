//! Localhost audio proxy. The webview asks for `/audio/<videoId>`; the proxy
//! resolves a fresh googlevideo URL, downloads the whole track in 1 MiB windows
//! (the CDN rejects bigger spans) and serves byte ranges from memory. It keeps
//! playback working when a URL expires and gives MSE a stable, seekable source.

use std::collections::HashMap;
use std::io::{self, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Instant;

use crate::innertube::client::MusicClient;
use crate::session::AuthSession;

const MAX_HEAD_BYTES: usize = 8 * 1024;
const RANGE_WINDOW: u64 = 1024 * 1024;
const FALLBACK_WINDOWS: [u64; 2] = [256 * 1024, 64 * 1024];
const CACHE_TTL_SECS: u64 = 900;

pub struct AudioProxy {
    base_url: String,
}

impl AudioProxy {
    pub fn base_url(&self) -> &str {
        &self.base_url
    }
}

pub struct AudioRequest {
    pub video_id: String,
    pub variant: Option<String>,
}

struct MediaFile {
    mime: String,
    bytes: Vec<u8>,
    stored_at: Instant,
}

pub fn audio_path(video_id: &str, variant: Option<&str>) -> String {
    match variant_from_query(variant) {
        Some(kind) => format!("/audio/{video_id}?variant={kind}"),
        None => format!("/audio/{video_id}"),
    }
}

/// `muxed` = progressive MP4 (itag 18), `webm` = Opus; anything else is the
/// default adaptive AAC.
pub fn variant_from_query(value: Option<&str>) -> Option<&'static str> {
    match value {
        Some("webm") => Some("webm"),
        Some("muxed") => Some("muxed"),
        _ => None,
    }
}

pub fn parse_request_line(line: &str) -> Option<AudioRequest> {
    let mut parts = line.split_whitespace();
    let method = parts.next()?;
    let target = parts.next()?;
    if method != "GET" {
        return None;
    }
    let path = target.strip_prefix("/audio/")?;
    let (video_id, query) = match path.split_once('?') {
        Some((video_id, query)) => (video_id, Some(query)),
        None => (path, None),
    };
    if video_id.is_empty() {
        return None;
    }
    let variant = query.and_then(|query| {
        query
            .split('&')
            .find_map(|pair| pair.strip_prefix("variant="))
            .and_then(|value| variant_from_query(Some(value)))
            .map(str::to_string)
    });
    Some(AudioRequest {
        video_id: video_id.to_string(),
        variant,
    })
}

pub fn range_header<'a, I>(lines: &mut I) -> Option<String>
where
    I: Iterator<Item = &'a str>,
{
    for line in lines {
        let Some((name, value)) = line.split_once(':') else {
            continue;
        };
        if name.trim().eq_ignore_ascii_case("range") {
            return Some(value.trim().to_string());
        }
    }
    None
}

pub fn bounded_range(header: Option<&str>) -> String {
    range_candidates(header)
        .into_iter()
        .next()
        .unwrap_or_else(|| format!("bytes=0-{}", RANGE_WINDOW - 1))
}

/// Ordered upstream ranges to try: the client's own range when it is closed,
/// otherwise a 1 MiB window and progressively smaller ones.
pub fn range_candidates(header: Option<&str>) -> Vec<String> {
    let Some(raw) = header.map(str::trim).and_then(|value| value.strip_prefix("bytes=")) else {
        return range_windows(0);
    };
    let Some((start, end)) = raw.split_once('-') else {
        return range_windows(0);
    };
    let Ok(start) = start.parse::<u64>() else {
        return range_windows(0);
    };
    if end.is_empty() {
        return range_windows(start);
    }
    let Ok(end) = end.parse::<u64>() else {
        return range_windows(start);
    };
    vec![format!("bytes={start}-{end}")]
}

fn range_windows(start: u64) -> Vec<String> {
    let mut windows: Vec<String> = Vec::with_capacity(1 + FALLBACK_WINDOWS.len());
    windows.push(format!("bytes={start}-{}", start + RANGE_WINDOW - 1));
    for size in FALLBACK_WINDOWS {
        windows.push(format!("bytes={start}-{}", start + size - 1));
    }
    windows
}

/// Maps a client `Range` onto a buffer of `total` bytes.
pub fn slice_for_range(total: u64, header: Option<&str>) -> Option<(u64, u64)> {
    let Some(raw) = header.map(str::trim).and_then(|value| value.strip_prefix("bytes=")) else {
        return Some((0, total));
    };
    let (start, end) = raw.split_once('-')?;
    let start = start.parse::<u64>().ok()?;
    if start >= total {
        return None;
    }
    let end = if end.is_empty() {
        total
    } else {
        end.parse::<u64>()
            .map(|value| value + 1)
            .unwrap_or(total)
            .min(total)
    };
    if end <= start {
        return None;
    }
    Some((start, end))
}

pub fn start(session: Arc<AuthSession>) -> io::Result<AudioProxy> {
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let port = listener.local_addr()?.port();
    let cache: Arc<Mutex<HashMap<String, MediaFile>>> = Arc::new(Mutex::new(HashMap::new()));
    thread::spawn(move || {
        for connection in listener.incoming().flatten() {
            let session = Arc::clone(&session);
            let cache = Arc::clone(&cache);
            thread::spawn(move || {
                let _ = serve(connection, session, cache);
            });
        }
    });
    let base_url = format!("http://127.0.0.1:{port}");
    println!("audio proxy: {base_url}");
    Ok(AudioProxy { base_url })
}

fn serve(
    mut connection: TcpStream,
    session: Arc<AuthSession>,
    cache: Arc<Mutex<HashMap<String, MediaFile>>>,
) -> io::Result<()> {
    let head = read_head(&mut connection)?;
    let mut lines = head.split("\r\n");
    let request_line = lines.next().unwrap_or_default();
    if request_line.starts_with("OPTIONS ") {
        return write_preflight(&mut connection);
    }
    let Some(request) = parse_request_line(request_line) else {
        return write_plain(&mut connection, 404, "not found");
    };
    let range = range_header(&mut lines);

    let key = format!("{}:{:?}", request.video_id, request.variant);
    let cached = cache
        .lock()
        .ok()
        .and_then(|map| map.get(&key).map(|entry| (entry.mime.clone(), entry.bytes.clone(), entry.stored_at)));
    let (mime, bytes) = match cached {
        Some((mime, bytes, stored_at)) if stored_at.elapsed().as_secs() < CACHE_TTL_SECS => (mime, bytes),
        _ => {
            let client = MusicClient::new().with_cookies(session.credentials());
            match client.fetch_media(&request.video_id, request.variant.as_deref()) {
                Ok((stream, bytes)) => {
                    if let Ok(mut map) = cache.lock() {
                        map.insert(
                            key,
                            MediaFile {
                                mime: stream.mime_type.clone(),
                                bytes: bytes.clone(),
                                stored_at: Instant::now(),
                            },
                        );
                    }
                    (stream.mime_type, bytes)
                }
                Err(error) => return write_plain(&mut connection, 502, &error),
            }
        }
    };

    let total = bytes.len() as u64;
    match slice_for_range(total, range.as_deref()) {
        Some((start, end)) => write_slice(&mut connection, &mime, &bytes, total, start, end),
        None => write_plain(&mut connection, 416, "range not satisfiable"),
    }
}

fn write_slice(
    connection: &mut TcpStream,
    mime: &str,
    bytes: &[u8],
    total: u64,
    start: u64,
    end: u64,
) -> io::Result<()> {
    let body = &bytes[start as usize..end as usize];
    let partial = start != 0 || end != total;
    let status = if partial { "206 Partial Content" } else { "200 OK" };
    let mut head = format!("HTTP/1.1 {status}\r\n");
    head.push_str(&format!("Content-Type: {mime}\r\n"));
    head.push_str("Accept-Ranges: bytes\r\n");
    head.push_str("Access-Control-Allow-Origin: *\r\n");
    head.push_str("Access-Control-Expose-Headers: content-range, content-length, content-type\r\n");
    head.push_str("Cache-Control: no-store\r\n");
    if partial {
        head.push_str(&format!("Content-Range: bytes {start}-{}/{total}\r\n", end - 1));
    }
    head.push_str(&format!("Content-Length: {}\r\n", body.len()));
    head.push_str("Connection: close\r\n\r\n");
    connection.write_all(head.as_bytes())?;
    connection.write_all(body)
}

fn read_head(connection: &mut TcpStream) -> io::Result<String> {
    let mut buffer = Vec::with_capacity(1024);
    let mut chunk = [0_u8; 512];
    while !buffer.windows(4).any(|window| window == b"\r\n\r\n") {
        if buffer.len() > MAX_HEAD_BYTES {
            return Err(io::Error::new(io::ErrorKind::InvalidData, "request head too large"));
        }
        let read = connection.read(&mut chunk)?;
        if read == 0 {
            break;
        }
        buffer.extend_from_slice(&chunk[..read]);
    }
    Ok(String::from_utf8_lossy(&buffer).to_string())
}

fn write_preflight(connection: &mut TcpStream) -> io::Result<()> {
    connection.write_all(
        b"HTTP/1.1 204 No Content\r\n\
          Access-Control-Allow-Origin: *\r\n\
          Access-Control-Allow-Methods: GET, OPTIONS\r\n\
          Access-Control-Allow-Headers: range\r\n\
          Access-Control-Max-Age: 86400\r\n\
          Content-Length: 0\r\n\
          Connection: close\r\n\r\n",
    )
}

fn write_plain(connection: &mut TcpStream, status: u16, message: &str) -> io::Result<()> {
    let body = message.as_bytes();
    let head = format!(
        "HTTP/1.1 {status} Error\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    connection.write_all(head.as_bytes())?;
    connection.write_all(body)
}
