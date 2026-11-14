"""Read-only cloud deployment smoke test for PHYSIOGRAPH 1.5.

Usage: python tools/render_smoke_test.py https://your-name.onrender.com
Requires only Python standard library. Does not send telemetry or private data.
"""
from __future__ import annotations
import argparse
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any


def fetch(base: str, path: str, *, timeout: int = 100) -> dict[str, Any]:
    with urllib.request.urlopen(base.rstrip('/') + path, timeout=timeout) as response:
        if response.status != 200:
            raise AssertionError(f"{path}: HTTP {response.status}")
        return json.load(response)


def smoke(base: str, *, seconds: int = 12) -> None:
    if not base.startswith('https://') and not base.startswith('http://127.0.0.1'):
        raise ValueError('Use an HTTPS Render URL or localhost')

    ready = fetch(base, '/api/system/readiness')
    assert ready['release'] == 'v1.5', ready
    assert ready['mode'] == 'SIMULATION_ONLY', ready
    assert ready['models_loaded'] is True, ready
    assert ready['clinical_validation'] is False, ready
    assert ready['internal_simulated_demo'] is True, ready
    print('PASS model readiness and simulation-only mode')

    health = fetch(base, '/api/live/health')
    assert health['status'] == 'READY' and health['auto_demo'] is True, health
    assert health['public_mode'] is True, health
    assert health['public_ingest'] == 'DISABLED', health
    print('PASS public read-only health status')

    research = fetch(base, '/api/research/overview')
    s = json.dumps(research)
    assert '5990' in s or '5,990' in s, research
    print('PASS historical NASA research endpoint (5,990 observations)')

    mission = fetch(base, '/api/mission/status')
    assert mission['medical_diagnosis_supported'] is False, mission
    for key in ['spacesuit_oxygen_reserves', 'suit_pressure', 'radiation_dose']:
        assert mission[key]['status'] == 'NOT_CONNECTED', mission[key]
        assert mission[key]['value'] is None, mission[key]
    print('PASS absent mission sensor feeds disclosed')

    snapshot = fetch(base, '/api/live/snapshot')
    print('PASS telemetry snapshot endpoint')
    time.sleep(seconds)
    snapshot2 = fetch(base, '/api/live/snapshot')
    assert snapshot != snapshot2, 'Internal simulator did not advance over the observation interval'
    print('PASS simulated telemetry advances without external producer')

    # Send a schema-valid fictional packet to check fail-closed public ingestion;
    # rejects must occur BEFORE data processing.
    packet = json.dumps({
        'subject_id': 'SIM_CREW_01', 'sequence': 99999999,
        'timestamp': '2035-01-01T00:00:00+00:00',
        'source': 'SIMULATED_LIVE',
        'values': {'heart_rate_bpm': 72.0}
    }).encode('utf-8')
    req = urllib.request.Request(base.rstrip('/') + '/api/live/ingest', data=packet,
        headers={'Content-Type': 'application/json'}, method='POST')
    try:
        urllib.request.urlopen(req, timeout=20)
    except urllib.error.HTTPError as e:
        assert e.code in (401, 403, 503), f'Unexpected ingest response: {e.code}'
        print(f'PASS anonymous public ingestion blocked ({e.code})')
    else:
        raise AssertionError('SECURITY FAILURE: anonymous public ingestion accepted')

    print('\nPASS all deployment smoke checks. WebSocket reconnect still needs browser testing.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('base_url', help='https://SERVICE.onrender.com')
    parser.add_argument('--seconds', type=int, default=12)
    args = parser.parse_args()
    try:
        smoke(args.base_url, seconds=args.seconds)
    except Exception as exc:
        print(f'FAIL: {type(exc).__name__}: {exc}', file=sys.stderr)
        raise SystemExit(1)
