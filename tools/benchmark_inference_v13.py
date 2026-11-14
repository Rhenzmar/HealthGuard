"""Measure existing CPU inference and process RSS; not a cloud hosting guarantee."""
import json
import time
from pathlib import Path
import numpy as np

from physiograph.deep_learning import CNNAnomalyModel
from physiograph.baseline_monitor import StatisticalBaselineModel

ROOT=Path(__file__).resolve().parent.parent

def run(repeats=250):
    import psutil
    import torch
    torch.set_num_threads(2)
    proc=psutil.Process()
    rss_before=proc.memory_info().rss
    t0=time.perf_counter()
    cnn=CNNAnomalyModel();comparison=StatisticalBaselineModel()
    init_ms=(time.perf_counter()-t0)*1000
    a=np.zeros((60,5),dtype=np.float32)
    reference=np.array([70.,98.,15.,36.7,60.],dtype=np.float32)
    from physiograph.deep_learning import normalize_window
    z=normalize_window(a+reference,reference)
    for _ in range(20):cnn.score(a+reference,reference);comparison.score(z)
    c=[]; s=[]
    for _ in range(repeats):
        t=time.perf_counter();cnn.score(a+reference,reference);c.append((time.perf_counter()-t)*1000)
        t=time.perf_counter();comparison.score(z);s.append((time.perf_counter()-t)*1000)
    result={'measurement':'local CPU process only, not Railway/Render production',
            'torch_version':torch.__version__,'torch_initialization_and_load_ms':init_ms,
            'rss_before_model_load_mib':rss_before/2**20,
            'rss_after_warmup_mib':proc.memory_info().rss/2**20,
            'cnn_inference_p50_ms':float(np.median(c)),
            'cnn_inference_p95_ms':float(np.quantile(c,.95)),
            'covariance_p50_ms':float(np.median(s)),
            'covariance_p95_ms':float(np.quantile(s,.95)),
            'checkpoint_bytes':cnn.path.stat().st_size,
            'statistical_artifact_bytes':comparison.path.stat().st_size,
            'caveat':'Memory and latency change with hosting, Python version, concurrency and traffic.'}
    dest=ROOT/'research'/'live_model_v13_audit'/'cpu_benchmark.json'
    dest.parent.mkdir(parents=True,exist_ok=True)
    dest.write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps(result,indent=2));return result

if __name__=='__main__':run()
