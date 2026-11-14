"""PhysioAlert Live: deterministic *measurement review* for simulated streams.

This is not the historical APDRA review queue, clinical triage, AI diagnosis,
or a trained disease classifier. It never turns a novelty score into risk.
"""
from __future__ import annotations
from typing import Any
from .live_telemetry import LiveSample, SOURCE


def build_live_review(sample: LiveSample, cnn: dict[str, Any], baseline: dict[str, Any]) -> dict[str, Any]:
    if sample.source != SOURCE: raise ValueError('Live review requires SIMULATED_LIVE provenance')
    if cnn.get('source') != SOURCE or baseline.get('source') != SOURCE:
        raise ValueError('All live monitoring evidence must be simulated')
    for result in (cnn,baseline):
        if result.get('subject_id')!=sample.subject_id or result.get('sequence')!=sample.sequence:
            raise ValueError('Evidence belongs to another telemetry packet')
    a,b=cnn.get('status'),baseline.get('status')
    ready={'MODEL_FLAG','NO_MODEL_FLAG'}
    evidence=[]
    if a in ready:
        evidence.append({'method':'CNN_AUTOENCODER','flag':a=='MODEL_FLAG',
                         'score':cnn.get('reconstruction_error'),
                         'threshold':cnn.get('calibration_threshold')})
    if b in ready:
        evidence.append({'method':'COVARIANCE_BASELINE','flag':b=='MODEL_FLAG',
                         'score':baseline.get('novelty_score'),
                         'threshold':baseline.get('calibration_threshold')})
    if a in ('IRREGULAR_CADENCE','INCOMPLETE_METRICS') or b in ('IRREGULAR_CADENCE','INCOMPLETE_METRICS'):
        status='CHECK_DATA_QUALITY';reason='Sampling gap or missing channel prevented valid sequence inference.'
    elif not (a in ready and b in ready):
        status='EVIDENCE_INCOMPLETE';reason='Two-model comparison unavailable until both methods can score a complete simulated window.'
    elif a=='MODEL_FLAG' and b=='MODEL_FLAG':
        status='BOTH_MODELS_FLAG';reason='Both experimental detectors found unusual numerical patterns in this window.'
    elif a=='MODEL_FLAG' or b=='MODEL_FLAG':
        status='MODELS_DISAGREE';reason='Only one detector flagged the pattern; the methods do not agree.'
    else:
        status='NO_MODEL_FLAG';reason='Neither experimental detector flagged this window; absence of a flag is not evidence of health.'
    actions=['Confirm the stream source and timestamp order','Inspect the five recorded measurements and recent trend']
    if status in ('BOTH_MODELS_FLAG','MODELS_DISAGREE'):
        actions.append('Check for sensor artifacts, exercise, or other measurement context')
        actions.append('Repeat or verify measurements under authorized procedures')
    else:
        actions.append('Collect more observations when evidence is incomplete or inconclusive')
    return {'subject_id':sample.subject_id,'sequence':sample.sequence,'source':SOURCE,
            'status':status,'reason':reason,'cnn_status':a,'comparison_status':b,
            'evidence':evidence,'verification_actions':actions,
            'origin':'DETERMINISTIC_EXPERIMENTAL_PHYSIOALERT_LIVE',
            'apdra_applied':False, 'clinical_validation':False,
            'interpretation_limit':'Synthetic pattern-review only; not a diagnosis, health classification, medical warning, or emergency triage.'}
