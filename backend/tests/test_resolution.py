"""Tests for observed-resolution detection (services/resolution.py)."""

from datetime import datetime, timedelta, timezone

import pytest

from services.resolution import detect_resolution, resolution_label

UTC = timezone.utc


def test_detect_resolution_returns_smallest_gap_and_histogram():
    values = [
        datetime(2026, 1, 1, 0, 0, tzinfo=UTC),
        datetime(2026, 1, 1, 0, 30, tzinfo=UTC),
        datetime(2026, 1, 1, 1, 0, tzinfo=UTC),
        datetime(2026, 1, 1, 2, 0, tzinfo=UTC),  # 60-min gap after a 30-min one
    ]

    result = detect_resolution(values)

    assert result.minutes == 30
    assert result.label == "30 minutes"
    assert result.distinct_timestamps == 4
    assert result.unavailable_reason is None
    assert {d.delta_minutes for d in result.delta_histogram} == {30, 60}


def test_detect_resolution_handles_naive_values_as_utc():
    values = [
        datetime(2026, 1, 1, 0, 0),
        datetime(2026, 1, 1, 1, 0),
    ]

    result = detect_resolution(values)

    assert result.minutes == 60
    assert result.label == "1 hour"


def test_detect_resolution_unavailable_for_fewer_than_two_values():
    result = detect_resolution([datetime(2026, 1, 1, tzinfo=UTC)])

    assert result.minutes is None
    assert result.label is None
    assert result.distinct_timestamps == 1
    assert result.unavailable_reason is not None


def test_detect_resolution_unavailable_for_duplicate_timestamps():
    result = detect_resolution(
        [
            datetime(2026, 1, 1, 0, 0, tzinfo=UTC),
            datetime(2026, 1, 1, 0, 0, tzinfo=UTC),
        ]
    )

    assert result.minutes is None
    assert result.unavailable_reason == "fewer than two distinct timestamps in the retrieved records"


def test_resolution_label_formats_hours_and_minutes():
    assert resolution_label(30) == "30 minutes"
    assert resolution_label(60) == "1 hour"
    assert resolution_label(120) == "2 hours"
    assert resolution_label(1) == "1 minute"
    assert resolution_label(15) == "15 minutes"