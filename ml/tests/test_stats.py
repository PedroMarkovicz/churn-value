import numpy as np
import pytest

from churnvalue.stats import cliffs_band, cliffs_delta


def test_cliffs_delta_bounds_and_symmetry():
    assert cliffs_delta([5, 6, 7], [1, 2, 3]) == pytest.approx(1.0)
    assert cliffs_delta([1, 2, 3], [5, 6, 7]) == pytest.approx(-1.0)
    assert cliffs_delta([1, 2, 3], [1, 2, 3]) == pytest.approx(0.0)


def test_cliffs_delta_hand_computed():
    # x = [1, 4], y = [2, 3]: x > y for (4,2),(4,3); x < y for (1,2),(1,3) -> (2 - 2) / 4 = 0
    assert cliffs_delta([1, 4], [2, 3]) == pytest.approx(0.0)
    # x = [3, 4], y = [1, 3]: x > y for (3,1),(4,1),(4,3); one tie (3,3) -> (3 - 0) / 4
    assert cliffs_delta([3, 4], [1, 3]) == pytest.approx(0.75)


def test_cliffs_delta_ignores_non_finite_and_rejects_empty():
    assert cliffs_delta([5, np.nan, 6], [1, np.inf]) == pytest.approx(1.0)
    with pytest.raises(ValueError, match="at least one finite"):
        cliffs_delta([np.nan], [1.0])


@pytest.mark.parametrize(
    ("delta", "band"),
    [(0.1, "negligible"), (-0.2, "small"), (0.4, "medium"), (-0.9, "large")],
)
def test_cliffs_band(delta, band):
    assert cliffs_band(delta) == band
