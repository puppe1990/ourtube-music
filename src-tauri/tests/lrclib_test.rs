use fake::faker::lorem::en::Sentence;
use fake::Fake;
use ourtube_music::innertube::models::Lyrics;
use ourtube_music::lrclib::{overlay_synced, parse_lrc, pick_synced_hit, LrclibHit};

#[test]
fn parse_lrc_reads_hundredths_and_skips_metadata_and_empty_lines() {
    let first: String = Sentence(3..8).fake();
    let second: String = Sentence(3..8).fake();
    let artist: String = Sentence(1..2).fake();
    let lrc = format!("[ar:{artist}]\n[00:14.12] {first}\n[01:11.34]\n[01:11.34] {second}\n");

    let cues = parse_lrc(&lrc);

    assert_eq!(cues.len(), 2);
    assert_eq!(cues[0].text, first);
    assert_eq!(cues[0].start_ms, 14_120);
    assert_eq!(cues[1].text, second);
    assert_eq!(cues[1].start_ms, 71_340);
}

#[test]
fn parse_lrc_duplicates_a_line_with_two_timestamps() {
    let text: String = Sentence(2..5).fake();
    let cues = parse_lrc(&format!("[00:12.00][01:37.34] {text}"));

    assert_eq!(cues.len(), 2);
    assert_eq!(cues[0].start_ms, 12_000);
    assert_eq!(cues[1].start_ms, 97_340);
    assert_eq!(cues[0].text, text);
    assert_eq!(cues[1].text, text);
}

#[test]
fn pick_synced_hit_prefers_the_closest_duration_with_synced_lyrics() {
    let closer = LrclibHit {
        duration: Some(216.0),
        synced_lyrics: Some("[00:01.00] a".into()),
    };
    let farther = LrclibHit {
        duration: Some(180.0),
        synced_lyrics: Some("[00:01.00] b".into()),
    };
    let unsynced = LrclibHit {
        duration: Some(214.0),
        synced_lyrics: Some(String::new()),
    };

    let hits = [unsynced, farther, closer.clone()];
    let picked = pick_synced_hit(&hits, 214.0).expect("hit");
    assert_eq!(picked.duration, closer.duration);
}

#[test]
fn overlay_synced_replaces_static_lines_when_lrc_has_cues() {
    let static_line: String = Sentence(3..8).fake();
    let sung: String = Sentence(3..8).fake();
    let lyrics = Lyrics {
        lines: vec![static_line],
        source: "Musixmatch".into(),
        message: "Letra não disponível".into(),
        ..Lyrics::default()
    };

    let overlaid = overlay_synced(&lyrics, &format!("[00:09.00] {sung}"));

    assert_eq!(overlaid.lines, vec![sung.clone()]);
    assert_eq!(overlaid.cues.len(), 1);
    assert_eq!(overlaid.cues[0].text, sung);
    assert_eq!(overlaid.cues[0].start_ms, 9_000);
    assert_eq!(overlaid.source, "Musixmatch");
    assert_eq!(overlaid.message, "");
}

#[test]
fn overlay_synced_keeps_innertube_when_lrc_is_empty() {
    let line: String = Sentence(3..8).fake();
    let lyrics = Lyrics {
        lines: vec![line.clone()],
        source: "Musixmatch".into(),
        ..Lyrics::default()
    };

    assert_eq!(overlay_synced(&lyrics, ""), lyrics);
}
