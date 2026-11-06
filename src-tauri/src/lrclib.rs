//! Synced lyrics from LRCLib. Innertube ANDROID_MUSIC still returns
//! timedLyricsModel without cueRange (probed 2026-11-06), so karaoke timing
//! comes from this public LRC search. Failures are silent: the static
//! Innertube sheet stays.

use std::time::Duration;

use serde::Deserialize;

use crate::innertube::models::{LyricCue, Lyrics};

const LRCLIB_SEARCH: &str = "https://lrclib.net/api/search";
const LRCLIB_UA: &str = "OurTubeMusic/0.2.0 (https://github.com/puppe1990/ourtube-music)";

#[derive(Debug, Clone, Default, Deserialize)]
pub struct LrclibHit {
    pub duration: Option<f64>,
    #[serde(default, rename = "syncedLyrics")]
    pub synced_lyrics: Option<String>,
}

pub fn parse_lrc(lrc: &str) -> Vec<LyricCue> {
    let mut cues = Vec::new();
    for raw in lrc.lines() {
        let line = raw.trim();
        if line.is_empty() || is_meta(line) {
            continue;
        }
        let (stamps, text) = split_tags(line);
        if text.is_empty() {
            continue;
        }
        for start_ms in stamps {
            cues.push(LyricCue {
                text: text.clone(),
                start_ms,
            });
        }
    }
    cues.sort_by_key(|cue| cue.start_ms);
    cues
}

pub fn pick_synced_hit(hits: &[LrclibHit], duration_sec: f64) -> Option<&LrclibHit> {
    let synced: Vec<&LrclibHit> = hits
        .iter()
        .filter(|hit| {
            hit.synced_lyrics
                .as_deref()
                .is_some_and(|text| !text.trim().is_empty())
        })
        .collect();
    let first = *synced.first()?;
    if !duration_sec.is_finite() || duration_sec <= 0.0 {
        return Some(first);
    }
    synced.into_iter().min_by(|left, right| {
        let left_delta = (left.duration.unwrap_or(0.0) - duration_sec).abs();
        let right_delta = (right.duration.unwrap_or(0.0) - duration_sec).abs();
        left_delta
            .partial_cmp(&right_delta)
            .unwrap_or(std::cmp::Ordering::Equal)
    })
}

pub fn overlay_synced(lyrics: &Lyrics, lrc: &str) -> Lyrics {
    let cues = parse_lrc(lrc);
    if cues.is_empty() {
        return lyrics.clone();
    }
    Lyrics {
        lines: cues.iter().map(|cue| cue.text.clone()).collect(),
        cues,
        source: if lyrics.source.trim().is_empty() {
            "LRCLib".into()
        } else {
            lyrics.source.clone()
        },
        message: String::new(),
    }
}

pub fn fetch_synced_lyrics(track: &str, artist: &str, duration_sec: f64) -> Option<String> {
    let track = track.trim();
    let artist = artist.trim();
    if track.is_empty() || artist.is_empty() {
        return None;
    }
    let url = search_url(track, artist);
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .ok()?;
    let response = client
        .get(url)
        .header("User-Agent", LRCLIB_UA)
        .header("Accept", "application/json")
        .send()
        .ok()?;
    if !response.status().is_success() {
        return None;
    }
    let hits: Vec<LrclibHit> = response.json().ok()?;
    pick_synced_hit(&hits, duration_sec)
        .and_then(|hit| hit.synced_lyrics.clone())
        .filter(|text| !text.trim().is_empty())
}

fn search_url(track: &str, artist: &str) -> String {
    format!(
        "{LRCLIB_SEARCH}?track_name={}&artist_name={}",
        urlencoding_plus(track),
        urlencoding_plus(artist)
    )
}

fn urlencoding_plus(value: &str) -> String {
    let mut encoded = String::new();
    for byte in value.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                encoded.push(*byte as char)
            }
            b' ' => encoded.push('+'),
            _ => encoded.push_str(&format!("%{byte:02X}")),
        }
    }
    encoded
}

fn is_meta(line: &str) -> bool {
    let bytes = line.as_bytes();
    bytes.len() > 1 && bytes[0] == b'[' && bytes[1].is_ascii_alphabetic()
}

fn split_tags(line: &str) -> (Vec<u32>, String) {
    let mut stamps = Vec::new();
    let mut rest = line;
    while let Some(inner) = rest.strip_prefix('[') {
        let Some(end) = inner.find(']') else {
            break;
        };
        let Some(ms) = parse_stamp(&inner[..end]) else {
            break;
        };
        stamps.push(ms);
        rest = &inner[end + 1..];
    }
    (stamps, rest.trim().to_string())
}

fn parse_stamp(tag: &str) -> Option<u32> {
    let (minutes_raw, rest) = tag.split_once(':')?;
    if minutes_raw.is_empty() || !minutes_raw.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    let minutes: u32 = minutes_raw.parse().ok()?;
    let (seconds_raw, fraction) = rest
        .split_once(['.', ':'])
        .map(|(seconds, frac)| (seconds, frac))
        .unwrap_or((rest, ""));
    if seconds_raw.len() != 2 {
        return None;
    }
    let seconds: u32 = seconds_raw.parse().ok()?;
    let extra = if fraction.is_empty() {
        0
    } else {
        let padded = format!("{fraction:0<3}");
        padded.chars().take(3).collect::<String>().parse().ok()?
    };
    Some(minutes * 60_000 + seconds * 1_000 + extra)
}
