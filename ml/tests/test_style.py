from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import pytest  # noqa: E402

from churnvalue.viz import style  # noqa: E402


@pytest.mark.parametrize(
    ("value", "text"),
    [(950, "£950"), (12_345, "£12.3k"), (-1_250_000, "−£1.25m"), (-23_461, "−£23.5k")],
)
def test_gbp(value, text):
    assert style.gbp(value) == text


def test_model_palette_is_fixed_and_complete():
    assert list(style.MODEL_COLORS) == style.MODEL_ORDER
    assert len(set(style.MODEL_COLORS.values())) == len(style.MODEL_ORDER)
    assert style.CHURN not in style.MODEL_COLORS.values()
    assert style.ACCENT not in style.MODEL_COLORS.values()


def test_save_fig_names_by_stage(tmp_path: Path):
    style.apply_style()
    fig, ax = plt.subplots()
    ax.plot([0, 1], [0, 1])
    style.headline(fig, "Revenue peaks every November", "monthly revenue, £")
    style.add_source(fig)
    path = style.save_fig(fig, tmp_path, "03", "revenue")
    plt.close(fig)
    assert path == tmp_path / "03_revenue.png"
    assert path.stat().st_size > 0


def test_date_axis_uses_quarterly_ticks():
    import pandas as pd

    style.apply_style()
    fig, ax = plt.subplots()
    dates = pd.date_range("2010-01-01", "2011-12-31", freq="MS")
    ax.plot(dates, range(len(dates)))
    style.date_axis(ax)
    fig.canvas.draw()
    labels = [t.get_text() for t in ax.get_xticklabels() if t.get_text()]
    plt.close(fig)
    assert labels[:4] == ["Jan\n2010", "Apr", "Jul", "Oct"]
