//! Localhost audio proxy. The webview asks for `/audio/<videoId>` and this
//! server resolves a fresh googlevideo URL, forwards the Range header and
//! streams the bytes back. It keeps the player working when a URL expires or
//! when the CDN rejects a direct media request from the origin.

use std::io::{self, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::Arc;
use std::thread;

use crate::innertube::client::{AudioResponse, MusicClient};

const MAX_HEAD_BYTES: usize = 8 * 1024;

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
    pub container: Option<String>,
}

pub fn audio_path(video_id: &str, container: Option<&str>) -> String {
    match container_from_query(container) {
        Some(kind) => format!("/audio/{video_id}?container={kind}"),
        None => format!("/audio/{video_id}"),
    }
}

pub fn container_from_query(value: Option<&str>) -> Option<&'static str> {
    match value {
        Some("webm") => Some("webm"),
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
    let container = query.and_then(|query| {
        query
            .split('&')
            .find_map(|pair| pair.strip_prefix("container="))
            .and_then(|value| container_from_query(Some(value)))
            .map(str::to_string)
    });
    Some(AudioRequest {
        video_id: video_id.to_string(),
        container,
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

pub fn start(client: Arc<MusicClient>) -> io::Result<AudioProxy> {
    let listener = TcpListener::bind("127.0.0.1:0")?;
    let port = listener.local_addr()?.port();
    thread::spawn(move || {
        for connection in listener.incoming().flatten() {
            let client = Arc::clone(&client);
            thread::spawn(move || {
                let _ = serve(connection, client);
            });
        }
    });
    let base_url = format!("http://127.0.0.1:{port}");
    println!("audio proxy: {base_url}");
    Ok(AudioProxy { base_url })
}

fn serve(mut connection: TcpStream, client: Arc<MusicClient>) -> io::Result<()> {
    let head = read_head(&mut connection)?;
    let mut lines = head.split("\r\n");
    let Some(request) = lines.next().and_then(parse_request_line) else {
        return write_plain(&mut connection, 404, "not found");
    };
    let range = range_header(&mut lines);

    let media = match client.open_audio(&request.video_id, request.container.as_deref(), range.as_deref()) {
        Ok(media) => media,
        Err(error) => return write_plain(&mut connection, 502, &error),
    };
    write_media(&mut connection, media)
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

fn write_media(connection: &mut TcpStream, mut media: AudioResponse) -> io::Result<()> {
    let mut head = format!("HTTP/1.1 {} OK\r\n", media.status);
    head.push_str(&format!("Content-Type: {}\r\n", media.content_type));
    head.push_str("Accept-Ranges: bytes\r\n");
    head.push_str("Cache-Control: no-store\r\n");
    if let Some(range) = &media.content_range {
        head.push_str(&format!("Content-Range: {range}\r\n"));
    }
    if let Some(length) = media.content_length {
        head.push_str(&format!("Content-Length: {length}\r\n"));
        head.push_str("Connection: close\r\n\r\n");
        connection.write_all(head.as_bytes())?;
        let copied = io::copy(&mut media.body, connection)?;
        debug_assert!(length == copied || length == 0);
        return Ok(());
    }
    head.push_str("Connection: close\r\n\r\n");
    connection.write_all(head.as_bytes())?;
    io::copy(&mut media.body, connection)?;
    Ok(())
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
