"""Single backend entrypoint linking APDRA, PhysioAlert, and review actions.

No medical diagnosis, health-status classification, or automatic clinical action.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Sequence
import pandas as pd

from physiograph.apdra import normalize_measurements, analyze
from physiograph.stability import characterize
from physiograph.physioalert import build_physioalerts
from physiograph.workflow import join_review_state
from physiograph.quality import validate_monitoring_input


@dataclass
class MonitoringResult:
    measurements: pd.DataFrame
    apdra: pd.DataFrame
    evidence: pd.DataFrame
    alerts: pd.DataFrame


def monitor(measurements: pd.DataFrame, *, threshold_percent: float = 30.0,
            threshold_npq: float = 1.0, review_events: Sequence[dict] = ()) -> MonitoringResult:
    data = validate_monitoring_input(normalize_measurements(measurements))
    # APDRA's original grouping does not include assay source. Analyze each
    # source separately so different instruments cannot silently share a
    # personal baseline. This preserves the frozen APDRA implementation.
    scored, described = [], []
    for _, subset in data.groupby("source", sort=True):
        scored.append(analyze(subset, screening_percent=threshold_percent))
        described.append(characterize(subset, threshold_percent=threshold_percent,
                                      threshold_npq=threshold_npq))
    if not scored:
        raise ValueError("At least one measurement is required")
    apdra = pd.concat(scored, ignore_index=True)
    evidence = pd.concat(described, ignore_index=True)
    alerts = build_physioalerts(evidence, already_characterized=True)
    alerts = join_review_state(alerts, review_events)
    return MonitoringResult(data, apdra, evidence, alerts)
