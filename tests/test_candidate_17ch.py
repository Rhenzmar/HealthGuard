"""Candidate neural detector tests, with no edits to frozen five-channel model."""
import json
import numpy as np
import pytest

from physiograph.candidate_17ch import (
    create_network, load_schema, score_reconstruction, verify_checkpoint,
)
from tools.generate_17ch_dataset import generate
from tools.train_17ch_candidate import train


def test_two_branch_model_reconstructs_17_channels():
    import torch
    network=create_network()
    test=torch.zeros(3,17,60,dtype=torch.float32)
    with torch.no_grad():
        output=network(test)
    assert output.shape==(3,17,60)
    scores=score_reconstruction(network,np.zeros((3,17,60),np.float32))
    assert all(x.shape==(3,) for name,x in scores.items() if name!='per_channel')
    assert scores['per_channel'].shape==(3,17)
    assert np.isfinite(scores['overall']).all()
    with pytest.raises(ValueError,match='17x60'):
        score_reconstruction(network,np.ones((3,5,60),dtype=np.float32))


def test_reject_modified_schema_and_bad_checkpoint(tmp_path):
    import torch
    schema=load_schema()
    network=create_network()
    checkpoint=tmp_path/'wrong.pt'
    torch.save({'metadata':{
        'feature_order':list(reversed(schema['feature_order'])),
        'schema_sha256':'not-real','version':'candidate-17ch-two-branch-v1',
        'training_domain':'FULLY_SYNTHETIC_NORMAL_ONLY'
    },'state_dict':network.state_dict()},checkpoint)
    with pytest.raises(ValueError,match='schema mismatch'):
        verify_checkpoint(checkpoint)


def test_train_small_candidate_preserves_old_checkpoint(tmp_path):
    data=tmp_path/'dataset'
    generate(data,train_episodes=8,calibration_episodes=4,
             normal_test_episodes=4,event_episodes=2)
    checkpoint=tmp_path/'candidate'/'model.pt'
    result=train(checkpoint,data,epochs=2,batch_size=8)
    assert checkpoint.is_file()
    assert result['model_metadata']['training_episodes']==8
    assert result['model_metadata']['model_input_shape']==[17,60]
    assert result['model_metadata']['deployment_status']=='CANDIDATE_NOT_ACTIVATED'
    assert result['model_metadata']['NASA_OSD569_575_used_for_continuous_training'] is False
    assert 0 <= result['evaluation']['synthetic_roc_auc_overall'] <= 1
    assert set(result['evaluation']['by_scripted_scenario']) == {
        'oxygenation','exertion','thermal','sensor',
        'co2','cabin_leak','radiation'}
    assert verify_checkpoint(checkpoint)['schema_version']==load_schema()['schema_version']
    assert (checkpoint.parent/'evaluation.json').is_file()
