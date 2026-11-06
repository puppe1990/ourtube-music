use ourtube_music::audio_proxy::{bounded_range, range_candidates, slice_for_range};

#[test]
fn an_open_ended_range_is_capped() {
    // googlevideo 403s `bytes=0-` and spans above ~1 MiB (probed 2026-11-05).
    assert_eq!(bounded_range(None), "bytes=0-1048575");
    assert_eq!(bounded_range(Some("bytes=0-")), "bytes=0-1048575");
    assert_eq!(bounded_range(Some("bytes=100-")), "bytes=100-1048675");
}

#[test]
fn closed_ranges_pass_through() {
    assert_eq!(bounded_range(Some("bytes=0-1023")), "bytes=0-1023");
    assert_eq!(
        bounded_range(Some("bytes=524288-1048575")),
        "bytes=524288-1048575"
    );
}

#[test]
fn garbage_ranges_fall_back_to_the_first_chunk() {
    assert_eq!(bounded_range(Some("nonsense")), "bytes=0-1048575");
}

#[test]
fn open_ranges_fall_back_to_smaller_windows() {
    assert_eq!(
        range_candidates(Some("bytes=0-")),
        vec![
            "bytes=0-1048575".to_string(),
            "bytes=0-262143".to_string(),
            "bytes=0-65535".to_string()
        ]
    );
}

#[test]
fn slice_for_range_reads_a_closed_window() {
    assert_eq!(
        slice_for_range(1000, Some("bytes=100-199")),
        Some((100, 200))
    );
}

#[test]
fn slice_for_range_clamps_open_and_overflowing_windows() {
    assert_eq!(slice_for_range(1000, Some("bytes=900-")), Some((900, 1000)));
    assert_eq!(
        slice_for_range(1000, Some("bytes=900-5000")),
        Some((900, 1000))
    );
    assert_eq!(slice_for_range(1000, None), Some((0, 1000)));
}

#[test]
fn slice_for_range_rejects_out_of_bounds_starts() {
    assert_eq!(slice_for_range(1000, Some("bytes=1000-1100")), None);
}
