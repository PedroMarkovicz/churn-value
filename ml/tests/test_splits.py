import pandas as pd
import pytest

from churnvalue.snapshots import make_cutoffs
from churnvalue.splits import make_temporal_split, rolling_origin_folds

H = 90
CUTOFFS = make_cutoffs(pd.Timestamp("2009-12-01"), pd.Timestamp("2011-12-09"), H, 6)


def test_split_on_real_calendar():
    split = make_temporal_split(CUTOFFS, H, calibration_offset_months=3)
    assert split.test == pd.Timestamp("2011-09-10")
    assert split.calibration == pd.Timestamp("2011-06-10")
    assert split.train[0] == pd.Timestamp("2010-06-10")
    assert split.train[-1] == pd.Timestamp("2011-03-10")


def test_no_label_window_overlaps_a_later_stage():
    split = make_temporal_split(CUTOFFS, H, calibration_offset_months=3)
    horizon = pd.Timedelta(days=H)
    assert all(c + horizon <= split.calibration for c in split.train)
    assert split.calibration + horizon <= split.test


def test_offset_too_small_for_horizon_is_rejected():
    with pytest.raises(ValueError, match="calibration label window"):
        make_temporal_split(CUTOFFS, H, calibration_offset_months=2)


def test_rolling_origin_folds_are_leakage_safe():
    split = make_temporal_split(CUTOFFS, H, calibration_offset_months=3)
    folds = rolling_origin_folds(split.train, H, min_train_cutoffs=3)
    assert folds, "expected at least one fold"
    for fit, validation in folds:
        assert len(fit) >= 3
        assert all(c + pd.Timedelta(days=H) <= validation for c in fit)
    assert folds[-1][1] == pd.Timestamp("2011-03-10")
