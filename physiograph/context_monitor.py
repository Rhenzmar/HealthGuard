"""v1.4: deterministic context-aware *measurement verification*, not medical triage.

Activity is a DECLARATION in simulated telemetry, never inferred from vitals.
Quality checks only mark suspected measurement concerns; they never prove an
artifact. Persistence is an engineering review heuristic, not independent
statistical replication of overlapping 60-second windows.
"""
from __future__ import annotations

from collections import deque
from datetime import datetime
from threading import RLock
from typing import Any

from .live_telemetry import LiveSample, METRICS, SOURCE
from .deep_learning import FEATURE_SCALES, FEATURES, WINDOW_POINTS

# Predeclared demonstration heuristics, NOT clinically established thresholds.
CHECK_INTERVAL_S = 15
POST_ACTIVITY_OBSERVATION_SECONDS = 60
CONFIRMATIONS_REQUIRED = 2
FROZEN_SAMPLE_COUNT = 8
IMPACT_MULTIPLIER = 3.0
REBOUND_TOLERANCE = 0.75


class LiveQualityMonitor:
    """Per-crew signal integrity hints; no hidden interpolation or model override."""

    def __init__(self):
        self._states: dict[str, dict] = {}
        self._lock = RLock()

    def process(self, sample: LiveSample) -> dict[str, Any]:
        if sample.source != SOURCE:
            raise ValueError('SIMULATED_LIVE is required')
        with self._lock:
            sid = sample.subject_id
            state = self._states.setdefault(sid, {
                'prev': None, 'prev2': None, 'same': 0,
                'hold_until': None, 'last_time': None,
            })
            issues: list[str] = []
            old = state['prev']
            old2 = state['prev2']
            gap = (state['last_time'] is not None
                   and abs((sample.timestamp - state['last_time']).total_seconds() - 1.0) > .15)
            complete = set(sample.values) == set(FEATURES)
            if gap:
                issues.append('IRREGULAR_CADENCE')
                # No comparing measurements across a discontinuous signal.
                state['prev2'] = None
                state['prev'] = None
                state['same'] = 0
                state['hold_until'] = None
                old = old2 = None
            if not complete:
                issues.append('MISSING_CHANNELS')
                state['prev2'] = None
                state['prev'] = None
                state['same'] = 0
                state['hold_until'] = None
                old = old2 = None
            if complete and old is not None:
                if all(abs(sample.values[k]-old.values[k]) < 1e-8 for k in FEATURES):
                    state['same'] += 1
                else:
                    state['same'] = 0
                if state['same'] + 1 >= FROZEN_SAMPLE_COUNT:
                    issues.append('ALL_CHANNELS_UNCHANGED')
                abrupt = [k for j,k in enumerate(FEATURES) if
                          abs(sample.values[k]-old.values[k]) > IMPACT_MULTIPLIER * float(FEATURE_SCALES[j])]
                if abrupt:
                    issues.append('ABRUPT_CHANGE_REQUIRES_VERIFICATION')
                if old2 is not None:
                    rebound = [k for j,k in enumerate(FEATURES) if
                               abs(old.values[k]-old2.values[k]) > IMPACT_MULTIPLIER * float(FEATURE_SCALES[j])
                               and abs(old.values[k]-sample.values[k]) > IMPACT_MULTIPLIER * float(FEATURE_SCALES[j])
                               and abs(old2.values[k]-sample.values[k]) < REBOUND_TOLERANCE * float(FEATURE_SCALES[j])]
                    if rebound:
                        issues.append('SPIKE_REBOUND_PATTERN')
                        # The prior spike remains within the 60-second model input.
                        state['hold_until'] = sample.sequence + WINDOW_POINTS - 1
            if state['hold_until'] is not None and sample.sequence <= state['hold_until']:
                issues.append('RECENT_SPIKE_MAY_REMAIN_IN_WINDOW')
            if complete:
                state['prev2'] = old
                state['prev'] = sample
            state['last_time'] = sample.timestamp
            # Explicitly do not call these channel-quality checks clinical safety limits.
            return {
                'subject_id': sid, 'sequence': sample.sequence, 'source': SOURCE,
                'status': 'VERIFY_MEASUREMENT' if issues else 'NO_QUALITY_ISSUE_DETECTED',
                'issues': list(dict.fromkeys(issues)),
                'basis': 'HEURISTIC_TELEMETRY_INTEGRITY_CHECKS',
                'calibration_domain': 'ENGINEERING_DEMONSTRATION_ONLY',
                'quality_assured': False,
                'note': 'No quality flag does not certify sensor accuracy or physiological safety.',
            }


class ContextReviewMonitor:
    """Interpret detector agreement with declaration, quality, temporal persistence.

    Both models score overlapping 60-point windows, so 15-second spaced review
    checks are NOT independent samples and produce no sensitivity or probability.
    """

    def __init__(self):
        self._states: dict[str, dict] = {}
        self._history: dict[str, deque] = {}
        self._latest: dict[str, dict] = {}
        self._lock = RLock()

    def latest(self, sid: str):
        with self._lock:
            return self._latest.get(sid)

    def history(self, sid: str, limit: int = 120):
        if not 1 <= limit <= 300:
            raise ValueError('limit must be 1-300')
        with self._lock:
            return list(self._history.get(sid, ()))[-limit:]

    def process(self, sample: LiveSample, cnn: dict, baseline: dict,
                base_review: dict, quality: dict) -> dict:
        if sample.source != SOURCE or any(d.get('source') != SOURCE for d in (cnn,baseline,base_review,quality)):
            raise ValueError('Context verification requires simulated and source-matched evidence')
        if any(d.get('subject_id') != sample.subject_id or d.get('sequence') != sample.sequence
               for d in (cnn,baseline,base_review,quality)):
            raise ValueError('Context verification received mismatched subject or sequence')
        with self._lock:
            sid,seq = sample.subject_id,sample.sequence
            s = self._states.setdefault(sid, {
                'last_sequence': -1, 'positive_checks':0, 'negative_checks':0,
                'last_positive_time':None, 'last_negative_time':None,
                'previous_context':'UNKNOWN', 'persistent':False, 'last_active_time':None,
            })
            if seq <= s['last_sequence']:
                raise ValueError('Context monitor requires increasing sequence numbers')
            s['last_sequence'] = seq
            context = sample.context or {}
            activity = context.get('activity_state','UNKNOWN')
            basis = context.get('basis','NOT_PROVIDED')
            a,b = cnn.get('status'),baseline.get('status')
            ready = a in ('MODEL_FLAG','NO_MODEL_FLAG') and b in ('MODEL_FLAG','NO_MODEL_FLAG')
            both = ready and a=='MODEL_FLAG' and b=='MODEL_FLAG'
            neither = ready and a=='NO_MODEL_FLAG' and b=='NO_MODEL_FLAG'
            quality_ok = quality['status']=='NO_QUALITY_ISSUE_DETECTED'
            context_changed = activity != s['previous_context']
            if context_changed:
                s['positive_checks'] = 0
                s['negative_checks'] = 0
                s['last_positive_time'] = None
                s['last_negative_time'] = None
                s['persistent'] = False
            s['previous_context'] = activity
            if activity == 'ACTIVE':
                s['last_active_time'] = sample.timestamp
            post_activity = (activity == 'REST' and s['last_active_time'] is not None and
                             (sample.timestamp-s['last_active_time']).total_seconds() < POST_ACTIVITY_OBSERVATION_SECONDS)
            if post_activity:
                s['positive_checks'] = 0
                s['negative_checks'] = 0
                s['last_positive_time'] = None
                s['last_negative_time'] = None
                s['persistent'] = False

            def elapsed(last: datetime|None) -> bool:
                return last is None or (sample.timestamp-last).total_seconds() >= CHECK_INTERVAL_S

            status = 'NEED_MORE_VALID_DATA'
            reason = 'Waiting for a complete, quality-reviewed pair of model outputs.'
            if not quality_ok:
                s['positive_checks'] = 0
                s['negative_checks'] = 0
                s['last_positive_time'] = None
                s['last_negative_time'] = None
                s['persistent'] = False
                status = 'VERIFY_MEASUREMENT_QUALITY'
                reason = 'One or more integrity heuristics raised a sensor or cadence concern. Confirm measurements before interpreting flags.'
            elif not ready:
                status = 'NEED_MORE_VALID_DATA'
                reason = 'A valid score from both models is not yet available.'
            elif post_activity and (both or not neither):
                status = 'POST_ACTIVITY_OBSERVATION'
                reason = 'Declared activity ended recently, so a continuing novelty flag may reflect residual activity. Verify observations without dismissing other concerns.'
            elif both:
                s['negative_checks'] = 0
                s['last_negative_time'] = None
                if elapsed(s['last_positive_time']):
                    s['positive_checks'] += 1
                    s['last_positive_time'] = sample.timestamp
                if s['positive_checks'] >= CONFIRMATIONS_REQUIRED:
                    s['persistent'] = True
                if activity == 'ACTIVE':
                    status='ACTIVITY_CONTEXT_REVIEW'
                    reason='Both detectors flag a pattern during declared activity. Confirm activity and repeat measurements in appropriate conditions.'
                elif activity == 'UNKNOWN':
                    status='ACTIVITY_CONTEXT_UNKNOWN'
                    reason='Both detectors flag a pattern, but activity is unknown. Confirm context before interpreting the alert.'
                elif s['persistent']:
                    status='PERSISTENT_PATTERN_REVIEW'
                    reason='Both detectors flag at spaced review checkpoints during declared rest. This is a measurement-review cue, not an emergency or diagnosis.'
                else:
                    status='OBSERVE_UNUSUAL_PATTERN'
                    reason='Both detectors flag the current rest-declared window; additional spaced observations are needed.'
            elif neither:
                s['positive_checks'] = 0
                s['last_positive_time'] = None
                if s['persistent']:
                    if elapsed(s['last_negative_time']):
                        s['negative_checks'] += 1
                        s['last_negative_time'] = sample.timestamp
                    if s['negative_checks'] >= CONFIRMATIONS_REQUIRED:
                        status='RETURN_TO_UNFLAGGED_PATTERN'
                        reason='After earlier persistent flags, both models stopped flagging at spaced review checkpoints. This is not medically verified recovery.'
                        s['persistent']=False
                        s['negative_checks']=0
                        s['last_negative_time']=None
                    else:
                        status='OBSERVE_RETURN_TREND'
                        reason='Models no longer flag, but repeated confirmation is needed before describing a return to an unflagged numerical pattern.'
                else:
                    status='NO_PATTERN_FLAG'
                    reason='Neither detector flags this window. Absence of flags does not establish health or sensor accuracy.'
            else:
                s['positive_checks'] = 0
                s['last_positive_time'] = None
                s['negative_checks'] = 0
                s['last_negative_time'] = None
                s['persistent'] = False
                status='DETECTORS_DISAGREE'
                reason='Only one of the experimental methods flags the window. Review the data without assigning disease risk.'
            advisory_text = {
                'VERIFY_MEASUREMENT_QUALITY': 'Simulated measurement verification needed. Inspect sensor integrity, timing, and repeat readings.',
                'NEED_MORE_VALID_DATA': 'Simulated monitoring: collecting sufficient valid measurements for comparison.',
                'ACTIVITY_CONTEXT_REVIEW': 'Simulated monitoring: unusual numerical patterns coincide with declared activity. Confirm context and review subsequent readings.',
                'ACTIVITY_CONTEXT_UNKNOWN': 'Simulated monitoring: unusual numerical patterns found. Activity is unknown; verify the context.',
                'PERSISTENT_PATTERN_REVIEW': 'Simulated monitoring: both detectors flag a sustained unusual pattern during declared rest. Verify measurements using approved procedures.',
                'POST_ACTIVITY_OBSERVATION': 'Simulated monitoring: unusual pattern follows recent activity. Continue observation and verify the context.',
                'OBSERVE_UNUSUAL_PATTERN': 'Simulated monitoring: both detectors flag a pattern. Additional observations are needed.',
                'OBSERVE_RETURN_TREND': 'Simulated monitoring: model flags have stopped, but the pattern needs further observation.',
                'RETURN_TO_UNFLAGGED_PATTERN': 'Simulated monitoring: both detectors no longer flag the recent pattern. This does not confirm medical recovery.',
                'NO_PATTERN_FLAG': 'Simulated monitoring: neither model flags the current window. This does not confirm medical health.',
                'DETECTORS_DISAGREE': 'Simulated monitoring: the detectors disagree. Review measurements and do not infer medical risk.',
            }[status]
            output = {
                'subject_id':sid, 'sequence':seq,'source':SOURCE,
                'status':status,'reason':reason,
                'activity_state':activity,'activity_basis':basis,
                'activity_verified':False, 'quality':quality,
                'raw_detector_statuses':{'cnn':a,'covariance':b},
                'raw_model_flags_preserved': True,
                'evidence': {
                    'values':dict(sample.values),
                    'cnn_reconstruction_error':cnn.get('reconstruction_error'),
                    'cnn_threshold':cnn.get('calibration_threshold'),
                    'covariance_score':baseline.get('novelty_score'),
                    'covariance_threshold':baseline.get('calibration_threshold'),
                    'quality_issues':quality['issues'],
                },
                'voice_ready_script':advisory_text,
                'speech_generation_mode':'DETERMINISTIC_TEMPLATE_NOT_LLM',
                'spaced_positive_checks':s['positive_checks'],
                'spaced_negative_checks':s['negative_checks'],
                'review_interval_seconds':CHECK_INTERVAL_S,
                'post_activity_observation_seconds':POST_ACTIVITY_OBSERVATION_SECONDS,
                'post_activity_observation_active':post_activity,
                'review_windows_overlap':True,
                'observed_persistent_pattern':s['persistent'],
                'provenance':'SIMULATED_STREAM_AND_EXPERIMENTAL_MODELS',
                'apdra_applied':False,'clinical_validation':False,
                'disclaimer':('Review heuristic only. Activity declarations are unverified; '
                              'model agreement, persistence, and inferred artifacts are not medical diagnoses, '
                              'emergency alerts, independent samples, or evidence of physiological recovery.'),
            }
            self._latest[sid] = output
            self._history.setdefault(sid,deque(maxlen=300)).append(output)
            return output
