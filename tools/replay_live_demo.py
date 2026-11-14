"""Transmit reproducible fictional vital signs to the local PhysioGraph API.

Example (in separate terminal):
  python -m tools.replay_live_demo --speed 20

The simulator generates *fictional* observations, NOT real NASA telemetry,
medical diagnoses, sensor-derived ECG, or a trained model's predictions.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
import math
import time



def generate_packets(*, subject: str = "SIM_CREW_01", count: int = 180,
                     start: datetime | None = None, hz: float = 1.0,
                     mode: str = "excursion"):
    if mode not in {"excursion", "normal", "activity", "artifact"}:
        raise ValueError("mode must be excursion, normal, activity, or artifact")
    if count < 1 or hz <= 0:
        raise ValueError("count and hz must be positive")
    origin = start or datetime.now(timezone.utc).replace(microsecond=0)
    for i in range(count):
        t = i / hz
        # Nominal trend, then deliberately injected abnormal-looking example,
        # then recovery. This is NOT a ground-truth medical condition.
        ramp = min(max((i - count*0.30)/(count*0.20),0.0),1.0)
        recovery = min(max((i-count*0.65)/(count*0.25),0.0),1.0)
        excursion = max(0.0, ramp*(1.0-recovery)) if mode in ("excursion", "activity") else 0.0
        values = {
            "heart_rate_bpm":round(70+2*math.sin(t/6)+38*excursion,2),
            "spo2_percent":round(98+0.15*math.sin(t/11)-4.2*excursion,2),
            "respiratory_rate_bpm":round(14+0.4*math.sin(t/8)+8*excursion,2),
            "core_temp_c":round(36.8+0.08*math.sin(t/17),2),
            "hrv_rmssd_ms":round(62+2*math.sin(t/7)-26*excursion,2),
        }
        if mode == "artifact" and i == int(count * 0.6):
            values['heart_rate_bpm'] += 50
        context = {'activity_state': 'ACTIVE' if mode=='activity' and excursion>0 else
                                     'REST' if mode in ('normal','activity','artifact') else 'UNKNOWN',
                   'basis':'SIMULATOR_DECLARED'}
        yield {"subject_id": subject, "sequence": i,
               "timestamp": (origin+timedelta(seconds=t)).isoformat(),
               "source": "SIMULATED_LIVE", "values":values, 'context':context}


def main():
    import requests  # Only needed by the Windows HTTP replay utility; not in lite server.
    p=argparse.ArgumentParser(description="Replay fictional telemetry into the local PhysioGraph API")
    p.add_argument('--url',default='http://127.0.0.1:8000')
    p.add_argument('--count',type=int,default=180)
    p.add_argument('--hz',type=float,default=1.0,help='Generated sample rate')
    p.add_argument('--speed',type=float,default=10.0,help='Replay multiplier; 0 means no sleeps')
    p.add_argument('--subject',default='SIM_CREW_01')
    p.add_argument('--mode',choices=['excursion','normal','activity','artifact'],default='excursion')
    args=p.parse_args()
    if args.speed < 0:
        p.error('--speed must be nonnegative')
    url=args.url.rstrip('/')+'/api/live/ingest'
    for i,packet in enumerate(generate_packets(subject=args.subject,count=args.count,hz=args.hz,mode=args.mode)):
        r=requests.post(url,json=packet,timeout=5)
        if r.status_code!=201:
            raise RuntimeError(f"Packet {i} rejected ({r.status_code}): {r.text}; restart API to reset history")
        if i%20==0 or i==args.count-1:
            print(f"{i+1}/{args.count} simulated packets sent; HR={packet['values']['heart_rate_bpm']} bpm")
        if args.speed>0 and i<args.count-1:
            time.sleep(1.0/(args.hz*args.speed))
    print("Replay complete. Source is SIMULATED_LIVE; any CNN flags are experimental pattern novelty, not diagnoses.")

if __name__=='__main__': main()
