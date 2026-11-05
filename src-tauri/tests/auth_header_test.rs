use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::{Arc, Mutex};
use std::thread;

use ourtube_music::innertube::client::MusicClient;

fn search_payload() -> &'static str {
    r#"{"contents":{"tabbedSearchResultsRenderer":{"tabs":[{"tabRenderer":{"content":{"sectionListRenderer":{"contents":[{"musicShelfRenderer":{"contents":[{"musicResponsiveListItemRenderer":{"flexColumns":[{"musicResponsiveListItemFlexColumnRenderer":{"text":{"runs":[{"text":"Track"}]}}}],"playlistItemData":{"videoId":"vid-1"}}}]}}]}}}}]}}}"#
}

fn spawn_capture_server() -> (String, Arc<Mutex<Vec<String>>>) {
    let listener = TcpListener::bind("127.0.0.1:0").expect("bind");
    let address = listener.local_addr().expect("addr");
    let seen = Arc::new(Mutex::new(Vec::new()));
    let sink = Arc::clone(&seen);

    thread::spawn(move || {
        for mut connection in listener.incoming().flatten() {
            let mut buffer = Vec::new();
            let mut chunk = [0_u8; 1024];
            while !buffer.windows(4).any(|window| window == b"\r\n\r\n") {
                match connection.read(&mut chunk) {
                    Ok(0) | Err(_) => break,
                    Ok(read) => buffer.extend_from_slice(&chunk[..read]),
                }
            }
            let head = String::from_utf8_lossy(&buffer).to_string();
            sink.lock().expect("lock").push(head);
            let body = search_payload();
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            let _ = connection.write_all(response.as_bytes());
        }
    });

    (format!("http://{address}"), seen)
}

#[test]
fn authenticated_client_sends_the_oauth_bearer_header() {
    let (base_url, seen) = spawn_capture_server();
    let client = MusicClient::with_base(&base_url).with_token(Some("token-123".to_string()));

    client.search("daft punk").expect("search");

    let request = seen.lock().expect("lock").first().cloned().unwrap_or_default().to_lowercase();
    assert!(
        request.contains("authorization: bearer token-123"),
        "request must carry the bearer header: {request}"
    );
    assert!(
        request.contains("x-goog-authuser: 0"),
        "request must pick the primary account: {request}"
    );
}

#[test]
fn anonymous_client_has_no_authorization_header() {
    let (base_url, seen) = spawn_capture_server();
    let client = MusicClient::with_base(&base_url);

    client.search("daft punk").expect("search");

    let request = seen.lock().expect("lock").first().cloned().unwrap_or_default().to_lowercase();
    assert!(!request.contains("authorization:"), "anonymous request must not authenticate: {request}");
}
