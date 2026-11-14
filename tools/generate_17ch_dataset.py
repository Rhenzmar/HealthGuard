"""Reproducible 17-channel synthetic training dataset for HealthGuard.

Usage: python -m tools.generate_17ch_dataset

All signals are synthetic. NASA OSD-575/569 and BIDMC records are NOT silently
interpolated into the 17-channel tensor. Seven injected abnormal scenarios are
reserved exclusively for held-out testing, never for normal-model fitting.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SCHEMA_PATH = ROOT / 'data' / 'synthetic_17ch' / 'biomarker_schema.json'
SEED = 1729
EVENTS = ('oxygenation', 'exertion', 'thermal', 'sensor', 'co2', 'cabin_leak', 'radiation')
SPLIT_SUBJECTS = {'train': 12, 'calibration': 4, 'test': 4}
EVENT_EPISODES = 24


def load_schema(path: Path = SCHEMA_PATH) -> dict:
    s = json.loads(path.read_text(encoding='utf-8'))
    assert len(s['features']) == s['feature_count'] == 17
    assert s['feature_order'] == [f['key'] for f in s['features']]
    assert s['branches']['physiological'] == list(range(9))
    assert s['branches']['engineering'] == list(range(9, 17))
    assert len(set(s['feature_order'])) == 17
    assert s['reference_points'] == 45 and s['window_points'] == 60
    assert s['episode_points'] == 105 and s['cadence_hz'] == 1
    return s


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def profiles(seed: int = SEED) -> dict[str, dict[str, np.ndarray]]:
    """Keep person-specific nominal baselines in exactly one split."""
    result = {}
    centers = np.array([70, 98, 14, 36.8, 62, 114, 75, 33.8, 37,
                        650, 20.9, 101.2, 22.2, 43, 0.42, 0, 94], dtype=float)
    spreads = np.array([9, 0.55, 2.0, 0.18, 12, 8, 5, .45, 2,
                        0, 0, 0, 0, 0, 0, 0, 3], dtype=float)
    for group_idx, (partition, count) in enumerate(SPLIT_SUBJECTS.items()):
        subjects = {}
        for idx in range(count):
            rng = np.random.default_rng(np.random.SeedSequence([seed, 100, group_idx, idx]))
            center = centers + spreads * rng.normal(size=len(centers))
            center[1] = np.clip(center[1], 96.5, 99.1)
            center[4] = np.clip(center[4], 25, 110)
            center[6] = np.clip(center[6], 58, center[5] - 15)
            subjects[f'{partition.upper()}_P{idx:03d}'] = center
        result[partition] = subjects
    return result


def event_envelope() -> np.ndarray:
    """Controlled changes begin only after the first 45 baseline samples."""
    t = np.arange(105, dtype=float)
    ramp = np.clip((t - 51) / 28, 0, 1)
    return ramp**2 * (3 - 2*ramp)


def episode(center: np.ndarray, rng: np.random.Generator,
            scenario: str | None = None) -> np.ndarray:
    if scenario is not None and scenario not in EVENTS:
        raise ValueError(f'Unknown synthetic test scenario: {scenario}')
    n = 105
    t = np.arange(n, dtype=float)
    raw = np.repeat(np.asarray(center, dtype=float)[None, :], n, axis=0)
    shared = np.zeros(n, dtype=float)
    for j in range(1, n):
        shared[j] = .88*shared[j-1] + .25*rng.normal()
    effort = np.sin(t/rng.uniform(15,28)+rng.uniform(0,2*np.pi)) + .4*shared
    slow = np.sin(t/rng.uniform(26,54)+rng.uniform(0,2*np.pi))
    noise = rng.normal(size=(n,17))
    # Wider normal oscillator family: the original training profiles varied
    # too slowly for ordinary replay rhythms. These independent synthetic
    # benign fluctuations cover diverse phase/frequency combinations.
    fast_periods = rng.uniform(4.0,13.0,size=9)
    fast_phases = rng.uniform(0,2*np.pi,size=9)
    fast_amplitudes = rng.uniform(.4,1.0,size=9) * np.array(
        [3.4,.22,.85,.095,4.1,4.5,2.2,.35,1.8],dtype=float
    )
    fast_normal = (np.sin(t[:,None]/fast_periods[None,:]+fast_phases[None,:])
                   *fast_amplitudes[None,:])
    long_drift = (t/(n-1))[:,None] * (rng.normal(size=9)[None,:]
                  * np.array([2.6,.14,.48,.06,2.7,3.2,2.1,.22,1.2])[None,:])
    raw[:,:9] += fast_normal + long_drift
    # Existing five physiological channels, unchanged input ordering.
    raw[:,0] += 2.4*effort + 1.1*noise[:,0]
    raw[:,1] += -.06*effort + .08*noise[:,1]
    raw[:,2] += .55*effort + .3*noise[:,2]
    raw[:,3] += .04*slow + .02*noise[:,3]
    raw[:,4] += -2.8*effort + 1.0*noise[:,4]
    # Four added physiological *estimates*, not measurements.
    raw[:,5] += 3.1*effort + 1.8*noise[:,5]
    raw[:,6] += 1.1*effort + 1.4*noise[:,6]
    raw[:,7] += .22*slow + .09*noise[:,7] + .08*(raw[:,3]-center[3])
    raw[:,8] += 1.0*effort + .9*noise[:,8]
    # Independent fictional cabin environment trajectory within an episode.
    cabin = np.sin(t/30 + rng.uniform(0,2*np.pi))
    raw[:,9] = 650 + 38*cabin + 6*noise[:,9]
    raw[:,10] = 20.9 + .025*cabin + .009*noise[:,10]
    raw[:,11] = 101.2 + .08*cabin + .02*noise[:,11]
    raw[:,12] = 22.2 + .20*cabin + .045*noise[:,12]
    raw[:,13] = 43 + 1.2*cabin + .25*noise[:,13]
    raw[:,14] = .42 + .025*(1+cabin) + .007*np.abs(noise[:,14])
    raw[:,16] = center[16] - .0009*t + .025*noise[:,16]
    amp = event_envelope()
    if scenario == 'oxygenation':
        raw[:,0] += 20*amp; raw[:,1] -= 7.5*amp
        raw[:,2] += 7*amp; raw[:,4] -= 17*amp; raw[:,8] -= 2*amp
    elif scenario == 'exertion':
        raw[:,0] += 58*amp; raw[:,1] -= .6*amp
        raw[:,2] += 14*amp; raw[:,3] += .3*amp
        raw[:,4] -= 25*amp; raw[:,5] += 22*amp
        raw[:,6] += 9*amp; raw[:,8] += 7*amp
    elif scenario == 'thermal':
        raw[:,0] += 20*amp; raw[:,2] += 5*amp
        raw[:,3] += 1.7*amp; raw[:,7] += 1.5*amp; raw[:,12] += 4*amp
    elif scenario == 'sensor':
        raw[:,1] -= 12*amp  # oximeter artifact, not a diagnosed disease
    elif scenario == 'co2':
        raw[:,9] += 5200*amp; raw[:,8] += 13*amp
        raw[:,2] += 9*amp; raw[:,0] += 15*amp
    elif scenario == 'cabin_leak':
        raw[:,11] -= 28*amp; raw[:,1] -= 6*amp
        raw[:,0] += 22*amp; raw[:,2] += 12*amp
    elif scenario == 'radiation':
        raw[:,14] += 2100*amp
        # No invented immediate radiation-sickness physiology.
    # Accumulated illustrative dose follows the sampled dose rate.
    raw[:,15] = np.cumsum(raw[:,14])/3600
    raw[:,1] = np.clip(raw[:,1],50,100)
    raw[:,4] = np.maximum(raw[:,4],0)
    raw[:,6] = np.minimum(raw[:,6],raw[:,5]-5)
    raw[:,16] = np.clip(raw[:,16],0,100)
    return raw.astype(np.float32)


def normalized(raw: np.ndarray, schema: dict) -> tuple[np.ndarray,np.ndarray]:
    center = np.median(raw[:schema['reference_points']],axis=0)
    scale = np.array([f['normalization_scale'] for f in schema['features']],dtype=np.float32)
    out = (raw[schema['reference_points']:] - center[None,:])/scale[None,:]
    assert out.shape == (60,17)
    return out.T.astype(np.float32),center.astype(np.float32)


def generate(output: Path, schema_path: Path = SCHEMA_PATH, seed: int = SEED,
             train_episodes: int = 320, calibration_episodes: int = 96,
             normal_test_episodes: int = 96, event_episodes: int = EVENT_EPISODES) -> dict:
    schema = load_schema(schema_path)
    if min(train_episodes,calibration_episodes,normal_test_episodes,event_episodes)<1:
        raise ValueError('Each partition and abnormal scenario needs positive episodes')
    output = Path(output)
    output.mkdir(parents=True,exist_ok=True)
    pool = profiles(seed)
    manifest = {}
    files = {}
    specifications = [
        ('train','train',train_episodes,None),
        ('calibration','calibration',calibration_episodes,None),
        ('test_normal','test',normal_test_episodes,None),
    ] + [(f'test_{name}','test',event_episodes,name) for name in EVENTS]
    for task_idx,(file_stem,split,count,scenario) in enumerate(specifications):
        members = sorted(pool[split])
        waves,refs,labels,ids,identifiers = [],[],[],[],[]
        for i in range(count):
            person_id = members[i % len(members)]
            rng = np.random.default_rng(np.random.SeedSequence([seed,20261115,task_idx,i]))
            x = episode(pool[split][person_id],rng,scenario)
            w,ref = normalized(x,schema)
            if not np.isfinite(w).all() or not np.isfinite(ref).all():
                raise ValueError('Nonfinite dataset entry')
            waves.append(w); refs.append(ref)
            labels.append(scenario or 'NORMAL')
            ids.append(person_id)
            identifiers.append(f'{file_stem}_{i:05d}')
        path = output/f'{file_stem}.npz'
        np.savez_compressed(path,X=np.stack(waves),reference=np.stack(refs),
                            labels=np.asarray(labels),profile_ids=np.asarray(ids),
                            episode_ids=np.asarray(identifiers),
                            feature_names=np.asarray(schema['feature_order']),
                            cadence_hz=np.array(1))
        manifest[file_stem] = {
            'partition':split,'scenario':scenario or 'NORMAL',
            'episodes':count,'profile_ids':members,
            'tensor_shape':[count,17,60], 'sha256':sha256(path),'file':path.name
        }
        files[file_stem] = path
    assert set(pool['train']).isdisjoint(pool['calibration'])
    assert set(pool['train']).isdisjoint(pool['test'])
    assert set(pool['calibration']).isdisjoint(pool['test'])
    all_ids = [identifier for path in files.values()
               for identifier in np.load(path,allow_pickle=False)['episode_ids']]
    assert len(all_ids)==len(set(all_ids))
    manifest_data = {
        'seed':seed,'schema_version':schema['schema_version'],
        'profile_disjoint':True,'episode_disjoint':True,
        'source_kind':'FULLY_SYNTHETIC_GENERATED_NOT_MEASURED',
        'partitions':manifest,
    }
    (output/'split_manifest.json').write_text(
        json.dumps(manifest_data,indent=2)+'\n',encoding='utf-8')
    report = {
        'schema_version':schema['schema_version'],'seed':seed,
        'features':schema['feature_order'],'feature_count':17,
        'cadence_hz':1,'reference_points':45,'window_points':60,
        'training_normal_episodes':train_episodes,
        'calibration_normal_episodes':calibration_episodes,
        'test_normal_episodes':normal_test_episodes,
        'test_abnormal_episodes_per_scenario':event_episodes,
        'test_abnormal_total':event_episodes*len(EVENTS),
        'event_labels':list(EVENTS),
        'split_profile_counts':{key:len(value) for key,value in pool.items()},
        'total_episodes':train_episodes+calibration_episodes+normal_test_episodes+event_episodes*len(EVENTS),
        'tensor_layout':'episodes x features x 60 seconds',
        'training_labels':['NORMAL'],
        'anomaly_event_labels_restricted_to_test':True,
        'clinical_validation':False,
        'NASA_lab_samples_used_as_17ch_training_inputs':False,
        'BIDMC_real_records_used_as_17ch_training_inputs':False,
        'BIDMC_status':'OPTIONAL_THREE_CHANNEL_EXTERNAL_REFERENCE_NOT_DOWNLOADED',
        'data_provenance':'FULLY_SYNTHETIC_17_CHANNELS',
        'caveat':'Synthetic assumptions and event injections are NOT medically or operationally validated. BIDMC has only three matching numeric channels.',
    }
    (output/'dataset_report.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
    (output/'provenance.json').write_text(json.dumps({
        'source':'Local reproducible generator only',
        'BIDMC':{'url':'https://physionet.org/content/bidmc/1.0.0/',
                 'DOI':'10.13026/C2208R',
                 'status':'Not bundled. HR, RESP, SpO2 reference only if separately downloaded.'},
        'OSD575':{'url':'https://osdr.nasa.gov/bio/repo/data/studies/OSD-575',
                  'status':'Historical discrete lab assays; excluded from this tensor.'},
        'OSD569':{'url':'https://osdr.nasa.gov/bio/repo/data/studies/OSD-569',
                  'status':'Historical CBC; third-party mirror unverified and excluded.'},
        'source_substitution':False,
        'trained_model_created':False,
        'notes':'Synthetic episodes do not establish genuine clinical or astronaut anomaly sensitivity.',
    },indent=2)+'\n',encoding='utf-8')
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output',type=Path,default=ROOT/'data'/'synthetic_17ch'/'generated')
    parser.add_argument('--seed',type=int,default=SEED)
    parser.add_argument('--train',type=int,default=320)
    parser.add_argument('--calibration',type=int,default=96)
    parser.add_argument('--test-normal',type=int,default=96)
    parser.add_argument('--per-event',type=int,default=EVENT_EPISODES)
    args = parser.parse_args()
    print(json.dumps(generate(args.output,seed=args.seed,train_episodes=args.train,
                              calibration_episodes=args.calibration,
                              normal_test_episodes=args.test_normal,
                              event_episodes=args.per_event),indent=2))


if __name__ == '__main__':
    main()
