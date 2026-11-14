"""Accurate time-axis plots for mission-relative or calendar-dated measurements."""
from __future__ import annotations

import pandas as pd
import plotly.express as px


def biomarker_line(df: pd.DataFrame, *, color: str | None = None,
                   title: str | None = None, baseline: float | None = None):
    """Plot at actual time offsets; categorical spacing would mislead.

    Mission time labels L-92 and R+194 map to -92 and +197 approximate
    days from launch for a three-day mission. No in-flight values are made up.
    Calendar date inputs are plotted on their actual ordinal-day spacing.
    """
    if df.empty:
        raise ValueError("Cannot plot empty data")
    required = {"time_numeric", "timepoint", "value"}
    if not required.issubset(df):
        raise ValueError(f"Missing plot columns: {required.difference(df.columns)}")
    data = df[df.time_numeric.notna()].sort_values("time_numeric").copy()
    if data.empty:
        raise ValueError("No valid numerical times")
    data["sampling_label"] = data.timepoint.astype(str)
    chart = px.line(data, x="time_numeric", y="value", color=color,
                    markers=True, hover_data={"sampling_label": True,
                                              "time_numeric": ":.0f"},
                    title=title)
    mission = data.timepoint.astype(str).str.match(r"^(L-\d+|R\+\d+)$").all()
    if mission:
        chart.add_vrect(x0=0, x1=3, line_width=0, fillcolor="lightsteelblue", opacity=0.11,
                        annotation_text="Flight (no serum samples)", annotation_position="top left")
        chart.update_xaxes(title_text="Approximate days from launch (return at day 3)")
    else:
        chart.update_xaxes(title_text="Sampling date / time (ordinal days)")
    if color is None:
        if baseline is not None and pd.notna(baseline):
            chart.add_hline(y=float(baseline), line_dash="dash", line_color="#B8BAC3",
                            annotation_text="Preflight median")
        ticks = data.drop_duplicates(["time_numeric","timepoint"]).sort_values("time_numeric")
        chart.update_xaxes(tickmode="array", tickvals=ticks.time_numeric.tolist(),
                           ticktext=ticks.timepoint.tolist(), tickangle=-35)
    chart.update_layout(height=420, margin=dict(l=5, r=10, t=40 if title else 15, b=10),
                        legend_title_text="Crew")
    return chart
