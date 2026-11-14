"""Auditable in-session verification decisions with explicit JSON import/export.

This is a research/demo record of *user review actions*, not a clinical chart.
No persistent server-side patient database, automatic treatment, or medical
claims. The client explicitly chooses whether to export a JSON copy.
"""
from __future__ import annotations

from datetime import datetime, timezone
import json
from uuid import uuid4
from typing import Any, Mapping, Sequence

import pandas as pd

WORKFLOW_SCHEMA_VERSION = 1
UNREVIEWED = "Not reviewed"
REVIEW_STATES = (
    UNREVIEWED,
    "Recheck requested",
    "Measurement verified",
    "Authorized medical review requested",
    "Review closed (administrative)",
)
ALLOWED_NEXT = {
    UNREVIEWED: set(REVIEW_STATES[1:4]),
    "Recheck requested": {"Measurement verified", "Authorized medical review requested", "Review closed (administrative)"},
    "Measurement verified": {"Recheck requested", "Authorized medical review requested", "Review closed (administrative)"},
    "Authorized medical review requested": {"Recheck requested", "Measurement verified", "Review closed (administrative)"},
    "Review closed (administrative)": {"Recheck requested", "Authorized medical review requested"},
}
EVENT_FIELDS = ("event_id", "alert_id", "from_status", "to_status", "timestamp_utc", "actor_code")


def validate_events(events: Sequence[Mapping[str, Any]]) -> list[dict]:
    """Validate schema and entire transition chain to prevent forged shortcuts."""
    if isinstance(events, (str, bytes, dict)):
        raise ValueError("Events must be a list")
    states = {}
    ids = set()
    clean = []
    for event in events:
        if not isinstance(event, dict) or not set(EVENT_FIELDS).issubset(event):
            raise ValueError("Each event must have the complete review event schema")
        item = {k: str(event[k]).strip() for k in EVENT_FIELDS}
        if any(not v for v in item.values()):
            raise ValueError("Review events cannot contain blank mandatory fields")
        if item["event_id"] in ids:
            raise ValueError("Duplicate event ID")
        ids.add(item["event_id"])
        try:
            stamp = datetime.fromisoformat(item["timestamp_utc"].replace("Z", "+00:00"))
            if stamp.tzinfo is None:
                raise ValueError("Timestamp must include timezone")
        except ValueError as exc:
            raise ValueError("Invalid timezone-aware review event timestamp") from exc
        before = states.get(item["alert_id"], UNREVIEWED)
        if item["from_status"] != before:
            raise ValueError("Review events are not in valid transition order")
        if item["to_status"] not in ALLOWED_NEXT.get(before, set()):
            raise ValueError(f"Disallowed review transition: {before} -> {item['to_status']}")
        states[item["alert_id"]] = item["to_status"]
        clean.append(item)
    return clean


def current_status(alert_id: str, events: Sequence[dict]) -> str:
    checked = validate_events(events)
    state = UNREVIEWED
    for e in checked:
        if e["alert_id"] == alert_id:
            state = e["to_status"]
    return state


def allowed_states(status: str) -> list[str]:
    if status not in ALLOWED_NEXT:
        raise ValueError("Invalid review status")
    return [state for state in REVIEW_STATES if state in ALLOWED_NEXT[status]]


def add_event(events: Sequence[dict], alert_id: str, next_status: str,
              *, actor_code: str = "CREW-REVIEW", timestamp: str | None = None) -> list[dict]:
    if not str(alert_id).startswith("obs_") or not str(actor_code).strip():
        raise ValueError("A valid observation ID and pseudonymous actor code are required")
    history = validate_events(events)
    current = current_status(alert_id, history)
    if next_status not in ALLOWED_NEXT[current]:
        raise ValueError(f"Unsupported status transition: {current} -> {next_status}")
    date = timestamp or datetime.now(timezone.utc).isoformat()
    new = {
        "event_id": uuid4().hex,
        "alert_id": alert_id,
        "from_status": current,
        "to_status": next_status,
        "timestamp_utc": date,
        "actor_code": actor_code.strip(),
    }
    return validate_events([*history, new])


def join_review_state(alerts: pd.DataFrame, events: Sequence[dict]) -> pd.DataFrame:
    checked = validate_events(events)
    if "alert_id" not in alerts:
        raise ValueError("Alerts require an alert_id column")
    states = {}
    for e in checked:
        states[e["alert_id"]] = e["to_status"]
    out = alerts.copy()
    out["review_status"] = out.alert_id.map(lambda a: states.get(a, UNREVIEWED))
    out["review_event_count"] = out.alert_id.map(lambda a: sum(e["alert_id"] == a for e in checked))
    return out


def export_review_json(events: Sequence[dict]) -> str:
    checked = validate_events(events)
    return json.dumps({
        "schema_version": WORKFLOW_SCHEMA_VERSION,
        "purpose": "PHYSIOGRAPH demonstration review actions; not a clinical record",
        "events": checked,
    }, indent=2, ensure_ascii=False)


def import_review_json(content: str | bytes) -> list[dict]:
    if isinstance(content, bytes):
        content = content.decode("utf-8")
    payload = json.loads(content)
    if not isinstance(payload, dict) or payload.get("schema_version") != WORKFLOW_SCHEMA_VERSION:
        raise ValueError("Unsupported review state format")
    if not isinstance(payload.get("events"), list):
        raise ValueError("Review state must contain event list")
    return validate_events(payload["events"])
