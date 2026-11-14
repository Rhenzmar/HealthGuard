"""Train and evaluate a new 17-channel two-branch CNN on explicitly synthetic data.

NOT a NASA-trained or clinically validated model. NASA OSD-569/575
historical laboratory biomarker observations are analyzed separately.
Existing frozen five-channel model is not changed or overwritten.

Run:
    python -m tools.train_17ch_candidate
"""
from __future__ import annotations

import argparse
import hashlib
import json
import random
from copy import deepcopy
from pathlib import Path

import numpy as np
import torch

from .generate_17ch_dataset import SEED, EVENTS, generate, load_schema, sha256
from physiograph.candidate_17ch import (
    CHECKPOINT, VERSION, SCHEMA, create_network, schema_digest,
    score_reconstruction, verify_checkpoint
)

ROOT=Path(__file__).resolve().parent.parent


def source_array(path:Path, feature_order:list[str], *, expected_label:str) -> np.ndarray:
    with np.load(path,allow_pickle=False) as f:
        x=np.asarray(f['X'],dtype=np.float32)
        names=f['feature_names'].tolist()
        labels=f['labels'].tolist()
    if names!=feature_order or x.ndim!=3 or x.shape[1:]!=(17,60):
        raise ValueError(f'Feature mismatch in {path}')
    if not np.isfinite(x).all() or not labels or set(labels)!={expected_label}:
        raise ValueError(f'Unexpected labels/NaN in {path}')
    return x


def evaluate(model, dataset:Path, feature_order:list[str], threshold:float) -> dict:
    normal=source_array(dataset/'test_normal.npz',feature_order,expected_label='NORMAL')
    normal_scores=score_reconstruction(model,normal)
    evaluated={}
    positive=[]
    for scenario in EVENTS:
        abnormal=source_array(dataset/f'test_{scenario}.npz',feature_order,
                              expected_label=scenario)
        scores=score_reconstruction(model,abnormal)
        positive.append(scores['overall'])
        evaluated[scenario]={
            'n':len(abnormal),
            'overall_flag_rate_at_fixed_calibration_threshold':
                float(np.mean(scores['overall']>threshold)),
            'physiological_mean_error':float(scores['physiological'].mean()),
            'engineering_mean_error':float(scores['engineering'].mean()),
            'overall_mean_error':float(scores['overall'].mean()),
        }
    normal_e=normal_scores['overall']
    abnormal_e=np.concatenate(positive)
    # Exact Mann-Whitney ROC-AUC on disjoint synthetic test episodes.
    wins=(abnormal_e[:,None]>normal_e[None,:]).sum()
    ties=(abnormal_e[:,None]==normal_e[None,:]).sum()
    auc=float((wins+.5*ties)/(len(normal_e)*len(abnormal_e)))
    return {
        'synthetic_roc_auc_overall':auc,
        'normal_test_n':len(normal),
        'abnormal_test_n':len(abnormal_e),
        'normal_test_false_flag_rate':float(np.mean(normal_e>threshold)),
        'normal_mean_error':float(normal_e.mean()),
        'abnormal_mean_error':float(abnormal_e.mean()),
        'by_scripted_scenario':evaluated,
        'synthetic_only':True,'clinical_validation':False,
        'caution':'ROC-AUC here reflects seven synthetic perturbations created by the same generator family as training. It is not clinical or astronaut-health performance.',
    }


def train(output:Path=CHECKPOINT, data_dir:Path|None=None, *,
          epochs:int=32, batch_size:int=64, seed:int=SEED)->dict:
    schema=load_schema()
    if not 1<=epochs<=200 or not 8<=batch_size<=512:
        raise ValueError('Training epochs/batch size out of supported range')
    torch.set_num_threads(2)
    torch.manual_seed(seed); random.seed(seed); np.random.seed(seed)
    torch.use_deterministic_algorithms(True)
    if data_dir is None:
        data_dir=output.parent/'generated'
    data_dir=Path(data_dir)
    report_path=data_dir/'dataset_report.json'
    if not report_path.is_file():
        generate(data_dir,seed=seed)
    report=json.loads(report_path.read_text(encoding='utf-8'))
    if (report['features']!=schema['feature_order'] or
        report['data_provenance']!='FULLY_SYNTHETIC_17_CHANNELS' or
        report['seed']!=seed or
        report['anomaly_event_labels_restricted_to_test'] is not True):
        raise ValueError('Training dataset provenance/feature order mismatch')
    for group in ('train','calibration','test_normal'):
        if not (data_dir/f'{group}.npz').is_file():
            raise ValueError(f'Missing required split {group}')
    for name in EVENTS:
        if not (data_dir/f'test_{name}.npz').is_file():
            raise ValueError(f'Missing held-out scenario {name}')
    train_x=source_array(data_dir/'train.npz',schema['feature_order'],expected_label='NORMAL')
    calib_x=source_array(data_dir/'calibration.npz',schema['feature_order'],expected_label='NORMAL')
    if len(train_x)<2 or len(calib_x)<2:
        raise ValueError('Insufficient normal calibration/training episodes')
    model=create_network()
    optimizer=torch.optim.AdamW(model.parameters(),lr=0.002,weight_decay=1e-5)
    best_loss=float('inf')
    best_state=None
    best_epoch=0
    bad_epochs=0
    history=[]
    rng=np.random.default_rng(seed+616)
    for epoch in range(epochs):
        model.train()
        permutation=rng.permutation(len(train_x))
        losses=[]
        for indexes in np.array_split(permutation,max(1,int(np.ceil(len(permutation)/batch_size)))):
            clean=torch.from_numpy(train_x[indexes])
            # Denoising makes the model reconstruct clean synthetic reference.
            noise=torch.randn_like(clean)*0.03
            decoded=model(clean+noise)
            # Both branches contribute to overall objective without
            # inventing a clinical importance weighting between channels.
            mse=(decoded-clean).square()
            loss=(mse[:,:9,:].mean()+mse[:,9:,:].mean())/2
            optimizer.zero_grad(set_to_none=True)
            loss.backward()
            optimizer.step()
            losses.append(float(loss.item()))
        cv=score_reconstruction(model,calib_x)
        validation_error=float(cv['overall'].mean())
        history.append({'epoch':epoch+1,'training_loss':float(np.mean(losses)),
                        'calibration_mean_error_for_early_stopping':validation_error})
        if validation_error<best_loss-1e-5:
            best_loss=validation_error;best_state=deepcopy(model.state_dict())
            best_epoch=epoch+1;bad_epochs=0
        else:
            bad_epochs+=1
            if bad_epochs>=7:break
    if best_state is None:
        raise RuntimeError('No valid model state trained')
    model.load_state_dict(best_state)
    calibration_scores=score_reconstruction(model,calib_x)
    threshold=float(np.quantile(calibration_scores['overall'],.95))
    if not np.isfinite(threshold) or threshold<=0:
        raise ValueError('Bad calibration threshold')
    results=evaluate(model,data_dir,schema['feature_order'],threshold)
    metadata={
        'version':VERSION,'schema_version':schema['schema_version'],
        'schema_sha256':schema_digest(),
        'feature_order':schema['feature_order'],
        'branches':schema['branches'],
        'reference_points':45,'window_points':60,'cadence_hz':1,
        'seed':seed,'calibration_threshold':threshold,
        'threshold_source':'95TH_PERCENTILE_DISJOINT_SYNTHETIC_NORMAL_CALIBRATION',
        'training_domain':'FULLY_SYNTHETIC_NORMAL_ONLY',
        'training_episodes':len(train_x),'calibration_episodes':len(calib_x),
        'best_epoch':best_epoch,'epochs_run':len(history),
        'model_input_shape':[17,60],
        'NASA_OSD569_575_used_for_continuous_training':False,
        'clinical_validation':False,
        'deployment_status':'CANDIDATE_NOT_ACTIVATED',
    }
    output=Path(output)
    output.parent.mkdir(parents=True,exist_ok=True)
    torch.save({'state_dict':best_state,'metadata':metadata},output)
    assert verify_checkpoint(output)['version']==VERSION
    output_sha256=sha256(output)
    results_json={
        'model_metadata':metadata,'checkpoint_sha256':output_sha256,
        'dataset_manifest':json.loads((data_dir/'split_manifest.json').read_text(encoding='utf-8')),
        'evaluation':results,'training_history':history,
        'comparison_note':'Existing 5-channel frozen CNN preserved, with no direct comparable 17-channel real-world benchmark.',
    }
    (output.parent/'evaluation.json').write_text(
        json.dumps(results_json,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({
        'checkpoint':str(output),'checkpoint_sha256':output_sha256,
        'best_epoch':best_epoch,'epochs_run':len(history),
        'threshold':threshold,'roc_auc_synthetic':results['synthetic_roc_auc_overall'],
        'normal_false_flag_rate':results['normal_test_false_flag_rate'],
        'scenario_flag_rates':{
            name:row['overall_flag_rate_at_fixed_calibration_threshold']
            for name,row in results['by_scripted_scenario'].items()},
        'model_deployed':False,
    },indent=2),flush=True)
    return results_json


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--output',type=Path,default=CHECKPOINT)
    parser.add_argument('--data-dir',type=Path)
    parser.add_argument('--epochs',type=int,default=32)
    parser.add_argument('--batch-size',type=int,default=64)
    parser.add_argument('--seed',type=int,default=SEED)
    args=parser.parse_args()
    train(args.output,args.data_dir,epochs=args.epochs,
          batch_size=args.batch_size,seed=args.seed)


if __name__=='__main__':
    main()
