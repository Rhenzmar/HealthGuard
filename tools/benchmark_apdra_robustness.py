"""Additional independent reproducibility audit for sparse-baseline screens.

This script provides numerical synthetic stress tests, NOT clinical ground truth.
Uses held-out synthetic cases with thresholds calibrated only on independent
calibration cases. It explicitly includes two-baseline case as in OSD-575.
"""
from __future__ import annotations
from pathlib import Path
import json
import numpy as np
import pandas as pd
from scipy.stats import rankdata

CFG = {
  'low_noise': (5.,5.,0.),
  'moderate_noise': (10.,10.,0.),
  'baseline_outliers': (10.,10.,.15),
  'high_noise': (20.,20.,.10),
}

def generate(rng, n, baseline_n, cfg, shift=45):
    bsd, fsd, outprob=cfg
    y=np.arange(n)%2 == 1
    rng.shuffle(y)
    base=100+rng.normal(0,bsd,(n,baseline_n))
    disturbed=rng.random(n)<outprob
    ix=np.flatnonzero(disturbed)
    cols=rng.integers(0,baseline_n,size=len(ix))
    base[ix,cols]+=rng.choice([-1,1],size=len(ix))*50.
    post=100+rng.normal(0,fsd,n)+y*rng.choice([-1,1],size=n)*shift
    return base,post,y

def scores(base, post):
    center=np.median(base,axis=1)
    leave=np.stack([np.median(np.delete(base,i,axis=1),axis=1) for i in range(base.shape[1])],axis=1)
    eps=1e-8
    score_simple=100*np.abs(post-center)/np.maximum(np.abs(center),eps)
    dd=post[:,None]-leave
    loo_score=100*np.abs(dd)/np.maximum(np.abs(leave),eps)
    same=(np.all(dd>0,axis=1)|np.all(dd<0,axis=1))
    score_loo=np.where(same,loo_score.min(axis=1),0.)
    return {'median_only':score_simple,'apdra_loo_consistent':score_loo}

def auc(y,s):
    p=np.asarray(y,dtype=bool)
    ranks=rankdata(s)
    n1=int(p.sum());n0=len(p)-n1
    return float((ranks[p].sum()-n1*(n1+1)/2)/(n1*n0))

def evaluate(seed,scenario,baseline_n,scale_shift=45,n_cal=3000,n_test=3000):
    rng=np.random.default_rng(seed)
    b0,v0,y0=generate(rng,n_cal,baseline_n,CFG[scenario],scale_shift)
    b1,v1,y1=generate(rng,n_test,baseline_n,CFG[scenario],scale_shift)
    c=scores(b0,v0);t=scores(b1,v1)
    rows=[]
    for method in c:
        cutoff=float(np.quantile(c[method][~y0],.95))
        guess=t[method]>=cutoff
        rows.append({'seed':seed,'scenario':scenario,'baseline_n':baseline_n,
           'method':method,'threshold':cutoff,
           'sensitivity':float(guess[y1].mean()),
           'false_screen_rate':float(guess[~y1].mean()),
           'AUC':auc(y1,t[method])})
    return rows

def run():
    out=[]
    for b in (2,3):
        for name in CFG:
            for seed in range(1729,1741):
                out.extend(evaluate(seed,name,b))
    runs=pd.DataFrame(out)
    summary=runs.groupby(['baseline_n','scenario','method'],as_index=False).agg(
        sensitivity=('sensitivity','mean'),false_screen_rate=('false_screen_rate','mean'),
        AUC=('AUC','mean'),n_runs=('seed','size'))
    summary[['sensitivity','false_screen_rate','AUC']]=summary[['sensitivity','false_screen_rate','AUC']].round(4)
    p=runs.pivot(index=['baseline_n','scenario','seed'],columns='method',values=['sensitivity','false_screen_rate','AUC'])
    deltas=pd.DataFrame({
        'sensitivity_delta_APDRA_minus_median':p['sensitivity']['apdra_loo_consistent']-p['sensitivity']['median_only'],
        'false_screen_delta_APDRA_minus_median':p['false_screen_rate']['apdra_loo_consistent']-p['false_screen_rate']['median_only'],
        'AUC_delta_APDRA_minus_median':p['AUC']['apdra_loo_consistent']-p['AUC']['median_only'],
    }).reset_index()
    intervals=[]
    for (n,scenario),g in deltas.groupby(['baseline_n','scenario']):
        arr=g['sensitivity_delta_APDRA_minus_median'].to_numpy()
        intervals.append({'baseline_n':int(n),'scenario':scenario,'mean_sensitivity_delta':float(arr.mean()),
                          'sim_seed_delta_95pct_range':[float(np.quantile(arr,.025)),float(np.quantile(arr,.975))]})
    d=Path('research/apdra_v05_robustness_audit')
    d.mkdir(parents=True,exist_ok=True)
    runs.to_csv(d/'runs.csv',index=False)
    summary.to_csv(d/'summary.csv',index=False)
    deltas.to_csv(d/'paired_differences.csv',index=False)
    (d/'report.json').write_text(json.dumps({'n_per_split':3000,'n_seeds':12,'scenarios':CFG,'baseline_counts':[2,3], 'summary':summary.to_dict(orient='records'), 'differences':intervals,
       'disclaimer':'Synthetic known numerical shifts only. Not clinical sensitivity or evidence of astronaut health outcomes.'},indent=2))
    return summary, deltas

if __name__=='__main__':
    summary,deltas=run()
    print(summary.to_string(index=False))
    print('\nPaired sensitivity delta APDRA minus median:\n',deltas.groupby(['baseline_n','scenario'])['sensitivity_delta_APDRA_minus_median'].agg(['mean','min','max']).to_string())
