"""Property: features at a cutoff never depend on transactions after that cutoff."""

import numpy as np
import pandas as pd
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from churnvalue.features import add_derived_features, compute_base_features

CUTOFFS = pd.date_range("2010-06-10", "2011-09-10", freq="MS") + pd.Timedelta(days=9)


@settings(
    max_examples=25, deadline=None, suppress_health_check=[HealthCheck.function_scoped_fixture]
)
@given(
    cutoff_idx=st.integers(0, len(CUTOFFS) - 1),
    seed=st.integers(0, 2**16),
    shift=st.integers(1, 400),
)
def test_features_ignore_post_cutoff_mutations(tx_synthetic, cutoff_idx, seed, shift):
    cutoff = CUTOFFS[cutoff_idx]
    rng = np.random.default_rng(seed)
    future = tx_synthetic["date"] > cutoff
    mutated = tx_synthetic.copy()
    # Scramble every post-cutoff row: move dates further out, change revenue, drop some rows.
    mutated.loc[future, "date"] = mutated.loc[future, "date"] + pd.Timedelta(days=shift)
    mutated.loc[future, "revenue"] = mutated.loc[future, "revenue"] * rng.uniform(0.1, 10.0)
    drop = future & (rng.random(len(mutated)) < 0.5)
    mutated = mutated.loc[~drop]

    def features(tx: pd.DataFrame) -> pd.DataFrame:
        base = compute_base_features(tx, cutoff, horizon_days=90)
        return add_derived_features(base, horizon_days=90, cadence_floor_days=7.0)

    pd.testing.assert_frame_equal(features(tx_synthetic), features(mutated))
