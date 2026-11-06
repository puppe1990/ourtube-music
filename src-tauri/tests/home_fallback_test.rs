use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::thread;

use ourtube_music::innertube::client::MusicClient;

fn empty_home_payload() -> &'static str {
    r#"{"contents":{"singleColumnBrowseResultsRenderer":{"tabs":[]}}}"#
}

fn explore_payload() -> &'static str {
    r#"{"contents":{"singleColumnBrowseResultsRenderer":{"tabs":[{"tabRenderer":{"content":{"sectionListRenderer":{"contents":[{"musicCarouselShelfRenderer":{"header":{"musicCarouselShelfBasicHeaderRenderer":{"title":{"runs":[{"text":"Explore"}]}}},"contents":[{"musicTwoRowItemRenderer":{"title":{"runs":[{"text":"Track"}]},"subtitle":{"runs":[{"text":"Artist"}]},"thumbnailRenderer":{"musicThumbnailRenderer":{"thumbnail":{"thumbnails":[{"url":"https://img/one"}]}}},"navigationEndpoint":{"watchEndpoint":{"videoId":"vid-1"}}}}]}}]}}}}]}}}"#
}

/// Serves `empty_home_payload` for the first browse and `explore_payload` for
/// the next one, so the fallback has to happen client-side.
fn spawn_scripted_browse_server() -> (String, Arc<AtomicUsize>) {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind scripted server");
    let address = listener.local_addr().expect("local addr");
    let hits = Arc::new(AtomicUsize::new(0));
    let counter = Arc::clone(&hits);

    thread::spawn(move || {
        for connection in listener.incoming().flatten() {
            let mut stream = connection;
            read_request(&mut stream);
            let call = counter.fetch_add(1, Ordering::SeqCst);
            let body = if call == 0 {
                empty_home_payload()
            } else {
                explore_payload()
            };
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            let _ = stream.write_all(response.as_bytes());
        }
    });

    (format!("http://{address}"), hits)
}

fn read_request(stream: &mut std::net::TcpStream) {
    let mut buffer = Vec::new();
    let mut chunk = [0_u8; 1024];
    while !buffer.windows(4).any(|window| window == b"\r\n\r\n") {
        match stream.read(&mut chunk) {
            Ok(0) | Err(_) => return,
            Ok(read) => buffer.extend_from_slice(&chunk[..read]),
        }
    }
    let head_end = buffer
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .map(|index| index + 4)
        .unwrap_or(buffer.len());
    let head = String::from_utf8_lossy(&buffer[..head_end]).to_string();
    let length = head
        .lines()
        .find_map(|line| {
            let (name, value) = line.split_once(':')?;
            name.trim()
                .eq_ignore_ascii_case("content-length")
                .then(|| value.trim().parse::<usize>().ok())
                .flatten()
        })
        .unwrap_or(0);
    // The first read may already hold part of the body; only the remainder is
    // still on the socket.
    let already = buffer.len().saturating_sub(head_end);
    let mut remaining = length.saturating_sub(already);
    let mut sink = [0_u8; 1024];
    while remaining > 0 {
        let want = remaining.min(sink.len());
        match stream.read(&mut sink[..want]) {
            Ok(0) | Err(_) => return,
            Ok(read) => remaining -= read,
        }
    }
}

#[test]
fn home_falls_back_to_explore_when_the_anonymous_feed_is_empty() {
    let (base_url, hits) = spawn_scripted_browse_server();
    let client = MusicClient::with_base(&base_url);

    let feed = client.home(None).expect("home with fallback");

    assert_eq!(hits.load(Ordering::SeqCst), 2, "want home then explore");
    assert_eq!(feed.shelves.len(), 1);
    assert_eq!(feed.shelves[0].title, "Explore");
    assert_eq!(feed.shelves[0].tracks[0].video_id, "vid-1");
}

#[test]
fn browse_page_stays_on_the_requested_id_even_when_empty() {
    let (base_url, hits) = spawn_scripted_browse_server();
    let client = MusicClient::with_base(&base_url);

    let feed = client
        .browse_page("FEmusic_library_landing")
        .expect("library browse");

    assert_eq!(
        hits.load(Ordering::SeqCst),
        1,
        "library must not fall through to explore"
    );
    assert!(feed.shelves.is_empty());
}
