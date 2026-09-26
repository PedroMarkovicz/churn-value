"""Leakage-safe temporal splits over snapshot cutoffs (ADR 0005)."""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd


@dataclass(frozen=True)
class TemporalSplit:
    train: tuple[pd.Timestamp, ...]
    calibration: pd.Timestamp
    test: pd.Timestamp


def label_closes_by(cutoff: pd.Timestamp, horizon_days: int, deadline: pd.Timestamp) -> bool:
    return cutoff + pd.Timedelta(days=horizon_days) <= deadline


def make_temporal_split(
    cutoffs: list[pd.Timestamp], horizon_days: int, calibration_offset_months: int
) -> TemporalSplit:
    ordered = sorted(cutoffs)
    if len(ordered) <= calibration_offset_months:
        raise ValueError("not enough cutoffs for a calibration cutoff before the test cutoff")
    test = ordered[-1]
    calibration = ordered[-1 - calibration_offset_months]
    if not label_closes_by(calibration, horizon_days, test):
        raise ValueError("calibration label window must close before the test cutoff")
    train = tuple(c for c in ordered if label_closes_by(c, horizon_days, calibration))
    if not train:
        raise ValueError("no training cutoff has a label window closing before calibration")
    return TemporalSplit(train=train, calibration=calibration, test=test)


def rolling_origin_folds(
    train_cutoffs: tuple[pd.Timestamp, ...], horizon_days: int, min_train_cutoffs: int = 3
) -> list[tuple[tuple[pd.Timestamp, ...], pd.Timestamp]]:
    """(fit cutoffs, validation cutoff) pairs; fit labels always close before validation starts."""
    folds = []
    for validation in train_cutoffs:
        fit = tuple(c for c in train_cutoffs if label_closes_by(c, horizon_days, validation))
        if len(fit) >= min_train_cutoffs:
            folds.append((fit, validation))
    return folds
