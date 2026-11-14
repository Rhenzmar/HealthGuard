"""Candidate 17-channel dataset integrity, leakage and reproducibility tests."""
import numpy as np
import pytest
from tools.generate_17ch_dataset import (
    EVENTS, SEED, episode, generate, load_schema, normalized, profiles,
)


def test_schema_and_frozen_original_feature_order():
    schema = load_schema()
    assert schema['feature_count'] == 17
    assert schema['feature_order'][:5] == [
        'heart_rate_bpm', 'spo2_percent', 'respiratory_rate_bpm',
        'core_temp_c', 'hrv_rmssd_ms',
    ]
    assert schema['branches']['physiological'] == list(range(9))
    assert schema['branches']['engineering'] == list(range(9,17))


def test_partition_profiles_do_not_overlap():
    people = profiles(SEED)
    ids = [set(people[group]) for group in ('train','calibration','test')]
    assert all(a.isdisjoint(b) for i,a in enumerate(ids) for b in ids[i+1:])
    assert [len(v) for v in people.values()] == [12,4,4]


def test_episode_reproducibility_baseline_and_signal_consistency():
    schema = load_schema()
    center = next(iter(profiles(SEED)['test'].values()))
    raw = episode(center, np.random.default_rng(7))
    assert np.array_equal(raw,episode(center,np.random.default_rng(7)))
    assert raw.shape == (105,17)
    assert np.isfinite(raw).all()
    assert np.all(raw[:,5] > raw[:,6])
    assert np.all((raw[:,1] >= 50) & (raw[:,1] <= 100))
    assert np.all(np.diff(raw[:,15]) >= -1e-7)
    assert np.allclose(raw[:,15],np.cumsum(raw[:,14])/3600,atol=1e-4)
    w,ref=normalized(raw,schema)
    assert w.shape==(17,60) and ref.shape==(17,)
    assert np.allclose(ref,np.median(raw[:45],axis=0))


@pytest.mark.parametrize('scenario,channel,direction',[
    ('oxygenation',1,-1), ('exertion',0,1),
    ('thermal',3,1), ('sensor',1,-1),
    ('co2',9,1), ('cabin_leak',11,-1), ('radiation',14,1),
])
def test_test_only_events_do_not_alter_initial_45_sample_baseline(
    scenario, channel, direction
):
    center=next(iter(profiles(SEED)['test'].values()))
    normal=episode(center,np.random.default_rng(983))
    abnormal=episode(center,np.random.default_rng(983),scenario)
    assert np.array_equal(normal[:45],abnormal[:45])
    assert (abnormal[-1,channel]-normal[-1,channel])*direction>1
    if scenario=='radiation':
        assert np.array_equal(normal[:,0],abnormal[:,0])


def test_splits_and_episode_identifiers_are_unique(tmp_path):
    report=generate(tmp_path,train_episodes=12,calibration_episodes=6,
                    normal_test_episodes=6,event_episodes=3)
    assert report['total_episodes']==45
    partitions={}; identifiers=[]
    for path in sorted(tmp_path.glob('*.npz')):
        with np.load(path,allow_pickle=False) as z:
            assert z['X'].shape[1:]==(17,60)
            assert z['X'].dtype==np.float32
            assert np.isfinite(z['X']).all()
            assert z['reference'].shape==(len(z['X']),17)
            identifiers.extend(z['episode_ids'].tolist())
            partition=('train' if path.stem=='train'
                       else 'calibration' if path.stem=='calibration'
                       else 'test')
            partitions.setdefault(partition,set()).update(z['profile_ids'].tolist())
            if path.stem in {'train','calibration','test_normal'}:
                assert set(z['labels'])=={'NORMAL'}
            else:
                assert set(z['labels'])=={path.stem.removeprefix('test_')}
    assert len(identifiers)==len(set(identifiers))
    assert partitions['train'].isdisjoint(partitions['calibration'])
    assert partitions['train'].isdisjoint(partitions['test'])
    assert partitions['calibration'].isdisjoint(partitions['test'])


def test_same_seed_produces_byte_identical_npz(tmp_path):
    from tools.generate_17ch_dataset import sha256
    for name in ('run_a','run_b'):
        generate(tmp_path/name,train_episodes=2,calibration_episodes=1,
                 normal_test_episodes=1,event_episodes=1)
    for a in (tmp_path/'run_a').glob('*.npz'):
        assert sha256(a)==sha256(tmp_path/'run_b'/a.name)


def test_unknown_scenario_is_not_accepted():
    center=next(iter(profiles(SEED)['test'].values()))
    with pytest.raises(ValueError,match='Unknown synthetic test scenario'):
        episode(center,np.random.default_rng(0),'fake_disease')
