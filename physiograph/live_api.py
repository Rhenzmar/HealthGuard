"""PhysioGraph v1.5 experimental live monitoring and read-only public demo API.

Start: python -m uvicorn physiograph.live_api:app --host 127.0.0.1 --port 8000
No identity, authentication, TLS, clinical alerting, or real sensor integration.
A pretrained synthetic-only CNN and non-neural comparator are exposed separately.
Do not bind this demonstration write API to a publicly accessible interface.
"""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
import hmac
import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, ConfigDict, Field

from physiograph.deep_learning import load_monitor, DEFAULT_CHECKPOINT
from physiograph.baseline_monitor import load_baseline, DEFAULT_BASELINE
from physiograph.live_review import build_live_review
from physiograph.research_api import router as research_router
from physiograph.engineering_sim import engineering_snapshot, SIGNALS as ENGINEERING_SIGNALS, CREW_IDS as ENGINEERING_CREW_IDS
from physiograph.biomarker_detection import evaluate_engineering, combined_live_review, scripted_environment_review
from physiograph.candidate_17ch_numpy import load_candidate_monitor
from physiograph.physioalert_unified import UnifiedReviewMonitor
from physiograph.context_monitor import LiveQualityMonitor, ContextReviewMonitor, CHECK_INTERVAL_S
from physiograph.live_telemetry import (
    LiveStore, METRICS, SOURCE, TelemetryError, ConflictError, validate_sample,
)


class PacketIn(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    subject_id: str
    sequence: int
    timestamp: str
    source: str = SOURCE
    values: dict[str, float] = Field(min_length=1, max_length=len(METRICS))
    context: dict[str, str] | None = None


class BroadcastHub:
    """Nonblocking fan-out; old messages drop before congesting the ingester."""
    def __init__(self):
        self.listeners: set[asyncio.Queue] = set()

    async def publish(self, message: dict[str, Any]):
        for q in tuple(self.listeners):
            if q.full():
                try: q.get_nowait()
                except asyncio.QueueEmpty: pass
            q.put_nowait(message)


def build_app(*, max_per_subject: int = 600, checkpoint_path=None, baseline_path=None) -> FastAPI:
    # This public demo task generates *fictional* telemetry only. No client may
    # restart it or inject measurements over HTTP without a private server key.
    # Sample timestamps advance at one fictional second per sample even if the
    # public demonstration is accelerated. They are NOT actual measurement times.
    auto_demo = os.getenv("PHYSIOGRAPH_AUTO_DEMO", "0").strip() == "1"
    try:
        auto_speed = float(os.getenv("PHYSIOGRAPH_AUTO_DEMO_SPEED", "10"))
    except ValueError as exc:
        raise ValueError("PHYSIOGRAPH_AUTO_DEMO_SPEED must be numeric") from exc
    if not 0.5 <= auto_speed <= 20:
        raise ValueError("PHYSIOGRAPH_AUTO_DEMO_SPEED must be between 0.5 and 20")

    @asynccontextmanager
    async def lifespan(instance: FastAPI):
        task = asyncio.create_task(run_internal_demo()) if auto_demo else None
        try:
            yield
        finally:
            if task:
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

    api = FastAPI(title="PhysioGraph simulated live telemetry", version="1.5.0", lifespan=lifespan)
    # Restrict browser CORS to operator-configured exact origins. The frontend
    # may use a same-origin reverse proxy instead, requiring no CORS setup.
    allowed_origins = [x.strip() for x in os.getenv("PHYSIOGRAPH_CORS_ORIGINS", "").split(",") if x.strip()]
    if any(x == "*" for x in allowed_origins):
        raise ValueError("Wildcard CORS origins are forbidden for the demo API")
    if allowed_origins:
        api.add_middleware(CORSMiddleware, allow_origins=allowed_origins,
                           allow_credentials=False, allow_methods=["GET", "POST"],
                           allow_headers=["Content-Type", "X-PhysioGraph-Ingest-Key"])

    api.include_router(research_router)
    api.state.store = LiveStore(max_per_subject=max_per_subject)
    api.state.hub = BroadcastHub()
    api.state.deep_learning = load_monitor(DEFAULT_CHECKPOINT if checkpoint_path is None else checkpoint_path)
    api.state.candidate_17 = load_candidate_monitor()
    api.state.comparison = load_baseline(DEFAULT_BASELINE if baseline_path is None else baseline_path)
    api.state.latest_review: dict[str, dict] = {}
    api.state.multisystem_latest: dict[str, dict] = {}
    api.state.unified = UnifiedReviewMonitor()
    api.state.quality = LiveQualityMonitor()
    api.state.context = ContextReviewMonitor()
    public_mode = os.getenv('PHYSIOGRAPH_PUBLIC_MODE','0').strip() == '1'
    ingest_key = os.getenv('PHYSIOGRAPH_INGEST_API_KEY','')
    api.state.public_mode = public_mode
    api.state.has_ingest_key = bool(ingest_key)
    api.state.auto_demo = auto_demo
    api.state.auto_demo_speed = auto_speed

    @api.get("/live", response_class=HTMLResponse)
    def live_monitor_page():
        path=Path(__file__).resolve().parent.parent / "web" / "live_monitor.html"
        return HTMLResponse(path.read_text(encoding="utf-8"))

    @api.get("/api/live/health")
    def health():
        return {"service": "PHYSIOGRAPH_LIVE", "status": "READY",
                "mode": "SIMULATION_ONLY", "analysis_status": "NOT_EVALUATED",
                "deep_learning":api.state.deep_learning.model_status(),
                 "candidate_17ch": api.state.candidate_17.model_status(),
                "comparison": api.state.comparison.model_status(),
                "context_monitor": 'ENABLED',
                "auto_demo": auto_demo,
                "auto_demo_error":getattr(api.state,"auto_demo_error",None),
                "auto_demo_speed": auto_speed if auto_demo else None,
                "demo_crew_subjects": ["SIM_CREW_01", "SIM_CREW_02", "SIM_CREW_03", "SIM_CREW_04"] if auto_demo else [],
                "public_mode": public_mode,
                "public_ingest": 'API_KEY_REQUIRED' if public_mode and ingest_key else
                                 'DISABLED' if public_mode else 'LOCAL_DEVELOPMENT_ONLY'}

    @api.get("/api/system/readiness")
    def readiness():
        cnn = api.state.deep_learning.model_status()
        stat = api.state.comparison.model_status()
        return {
            "release": "v1.5", "mode": "SIMULATION_ONLY",
            "backend_operational": True,
            "models_loaded": bool(cnn.get("status") == "LOADED" and stat.get("status") == "LOADED"),
            "cnn": cnn, "statistical_detector": stat,
            "live_review": "DETERMINISTIC_CONTEXT_AWARE_REVIEW",
            "historical_apdra": "SEPARATE_UNMODIFIED_RESEARCH_PIPELINE",
            "external_deployed_model_validation": "NOT_PERFORMED",
            "clinical_validation": False,
            "security": "READ_ONLY_INGEST" if public_mode and not ingest_key else
                        "SHARED_SECRET_INGEST" if public_mode else "LOCAL_ONLY",
            "internal_simulated_demo": auto_demo,
        }

    @api.get("/api/mission/status")
    def mission_status():
        # Do not silently turn fictional vitals into suit radiation or oxygen readings.
        return {"mission_mode": "SIMULATED_DEMONSTRATION", "live_data_source": SOURCE,
                "spacesuit_oxygen_reserves": {"status": "NOT_CONNECTED", "value": None},
                "suit_pressure": {"status": "NOT_CONNECTED", "value": None},
                "radiation_dose": {"status": "NOT_CONNECTED", "value": None},
                "earth_communication_delay": {"status": "NOT_IMPLEMENTED", "value": None},
                "navigation": {"status": "NOT_IMPLEMENTED", "value": None},
                "medical_diagnosis_supported": False}

    @api.get("/api/live/voice/{subject_id}")
    def voice_advisory(subject_id: str):
        # Browser speech synthesis can speak this deterministic, nonclinical
        # script later; no LLM or text-to-speech server is implied.
        review = api.state.context.latest(subject_id)
        if review is None:
            raise HTTPException(404, "No simulated telemetry for this subject")
        return {"subject_id":subject_id,"source":SOURCE,
                "sequence":review.get("sequence"),"status":review.get("status"),
                "text":review.get("voice_ready_script", ""),
                "generation":"DETERMINISTIC_TEMPLATE_NOT_LLM", "clinical_validation":False}

    @api.get("/api/live/metrics")
    def metrics():
        return {"source": SOURCE, "metrics": {k: {"min":a,"max":b,"unit":c,
                "range_type":"TECHNICAL_INPUT_VALIDATION_NOT_CLINICAL"}
                for k,(a,b,c) in METRICS.items()}}

    @api.get("/api/simulation/engineering/channels")
    def engineering_channels():
        return {"source":"FICTIONAL_ENGINEERING_SIMULATOR",
                "channels":ENGINEERING_SIGNALS,
                "crew_ids":list(ENGINEERING_CREW_IDS),
                "data_kind":"SYNTHETIC_NOT_MEASURED",
                "warning":"These 12 channels are scripted estimates, not actual spacecraft or astronaut sensor measurements."}

    @api.get("/api/simulation/engineering/{subject_id}")
    def engineering_subject(subject_id: str):
        if subject_id not in ENGINEERING_CREW_IDS:
            raise HTTPException(404,"No engineering demonstration for this subject")
        latest=api.state.store.latest(subject_id)
        if latest is None:
            raise HTTPException(404,"This fictional crew has not received a physiological simulator packet")
        return engineering_snapshot(subject_id,latest["sequence"])

    @api.get("/api/live/candidate17/{subject_id}")
    def candidate_17_latest(subject_id: str):
        if subject_id not in ENGINEERING_CREW_IDS:
            raise HTTPException(404, "Unknown fictional astronaut")
        result=api.state.candidate_17.latest(subject_id)
        if result is None:
            raise HTTPException(404,"No 17-channel candidate analysis received")
        return result

    @api.get("/api/live/physioalert-unified/{subject_id}")
    def unified_latest(subject_id: str):
        if subject_id not in ENGINEERING_CREW_IDS:
            raise HTTPException(404, "Unknown fictional crew subject")
        result = api.state.unified.latest(subject_id)
        if result is None:
            raise HTTPException(404, "No unified simulated PhysioAlert review for this crew member")
        return result

    @api.get("/api/live/physioalert-unified/voice/{subject_id}")
    def unified_voice(subject_id: str):
        if subject_id not in ENGINEERING_CREW_IDS:
            raise HTTPException(404, "Unknown fictional crew subject")
        review=api.state.unified.latest(subject_id)
        if review is None:
            raise HTTPException(404, "No unified simulated review for this crew member")
        return {
            "subject_id":subject_id, "sequence":review["sequence"],
            "status":review["status"],
            "text":review["voice_ready_script"],
            "source":review["source"],
            "generation":"DETERMINISTIC_TEMPLATE_NOT_LLM",
            "clinical_validation":False,
            "audio_requires_browser_permission":True,
        }

    @api.get("/api/live/physioalert-unified/history/{subject_id}")
    def unified_history(subject_id: str, limit: int = Query(120,ge=1,le=300)):
        if subject_id not in ENGINEERING_CREW_IDS:
            raise HTTPException(404, "Unknown fictional crew subject")
        return {"subject_id": subject_id, "source": "SIMULATED_PHYSIOALERT_COMBINED",
                "results": api.state.unified.history(subject_id,limit)}

    @api.get("/api/live/multisystem/{subject_id}")
    def multisystem(subject_id: str):
        if subject_id not in ENGINEERING_CREW_IDS:
            raise HTTPException(404, "Unknown fictional demo crew member")
        result=api.state.multisystem_latest.get(subject_id)
        if result is None:
            raise HTTPException(404, "Waiting for simulated telemetry for this crew member")
        return result

    @api.get("/api/simulation/scenario-review/{subject_id}/{scenario_id}")
    def scenario_review(subject_id: str, scenario_id: str,
                        second: int = Query(0,ge=0,le=64)):
        try:
            return scripted_environment_review(subject_id,scenario_id,second)
        except ValueError as exc:
            raise HTTPException(422,str(exc)) from exc

    @api.get("/api/live/snapshot")
    def snapshot():
        return api.state.store.snapshot()

    @api.get("/api/live/dl/model")
    def deep_learning_model():
        return api.state.deep_learning.model_status()

    @api.get("/api/live/comparison/model")
    def comparison_model():
        return api.state.comparison.model_status()

    @api.get("/api/live/comparison/{subject_id}")
    def comparison_status(subject_id: str):
        result=api.state.comparison.latest(subject_id)
        if result is None: raise HTTPException(404,"No simulated telemetry for this subject")
        return result

    @api.get('/api/live/context/config')
    def context_config():
        return {'source':SOURCE,'activity_states':['REST','ACTIVE','UNKNOWN'],
                'context_bases':['SIMULATOR_DECLARED','OPERATOR_DECLARED'],
                'review_interval_seconds':CHECK_INTERVAL_S,
                'clinical_validation':False,
                'note':'Context is declared, not objectively measured. Checkpoints share overlapping model windows.'}

    @api.get('/api/live/context-review/{subject_id}')
    def context_review(subject_id: str):
        result=api.state.context.latest(subject_id)
        if result is None: raise HTTPException(404,'No simulated telemetry for this subject')
        return result

    @api.get('/api/live/context-history/{subject_id}')
    def context_history(subject_id: str, limit: int = Query(120,ge=1,le=300)):
        return {'source':SOURCE, 'subject_id':subject_id,
                'results':api.state.context.history(subject_id,limit=limit)}

    @api.get("/api/live/review/{subject_id}")
    def live_review(subject_id: str):
        result=api.state.latest_review.get(subject_id)
        if result is None: raise HTTPException(404,"No simulated telemetry for this subject")
        return result

    @api.get("/api/live/dl/history/{subject_id}")
    def deep_learning_history(subject_id: str, limit: int = Query(120, ge=1, le=300)):
        return {"subject_id":subject_id,"source":SOURCE,
                "results":api.state.deep_learning.history(subject_id,limit)}

    @api.get("/api/live/dl/{subject_id}")
    def deep_learning_status(subject_id: str):
        status=api.state.deep_learning.latest(subject_id)
        if status is None:
            raise HTTPException(404,"No simulated telemetry received for this subject")
        return status

    @api.get("/api/live/history/{subject_id}")
    def history(subject_id: str, limit: int = Query(120,ge=1,le=max_per_subject)):
        try: return {"subject_id":subject_id,"source":SOURCE,"samples":api.state.store.history(subject_id,limit=limit)}
        except TelemetryError as exc: raise HTTPException(422,str(exc)) from exc

    async def process_packet(packet: PacketIn):
        """Shared private processing pipeline, never exposed without write authorization."""
        try:
            result = api.state.store.ingest(packet.model_dump())
        except ConflictError as exc:
            raise HTTPException(409,str(exc)) from exc
        except TelemetryError as exc:
            raise HTTPException(422,str(exc)) from exc
        # DL operates on its own explicitly simulated stream. Any model error
        # degrades to an explainable no-inference status; ingestion is retained.
        # Use exactly the accepted packet, never a subsequent packet for the
        # same crew member if a future multi-threaded producer is introduced.
        sample = validate_sample({k:v for k,v in result["packet"].items() if k!="analysis_status"})
        try:
            analysis = api.state.deep_learning.process(sample)
        except Exception as exc:
            analysis={"subject_id":sample.subject_id,"sequence":sample.sequence,
                      "status":"MODEL_ERROR", "source":SOURCE,
                      "clinical_validation":False,
                      "reason":f"No CNN inference; model failure: {type(exc).__name__}"}
        try:
            comparison = api.state.comparison.process(sample)
        except Exception as exc:
            comparison={"subject_id":sample.subject_id,"sequence":sample.sequence,
                        "status":"MODEL_ERROR","source":SOURCE,
                        "clinical_validation":False,
                        "reason":f"No statistical inference; model failure: {type(exc).__name__}"}
        review = build_live_review(sample, analysis, comparison)
        quality = api.state.quality.process(sample)
        context_review = api.state.context.process(sample,analysis,comparison,review,quality)
        review['contextual_decision'] = context_review['status']
        api.state.latest_review[sample.subject_id]=review
        if sample.subject_id in ENGINEERING_CREW_IDS:
            engineering=evaluate_engineering(sample.subject_id,sample.sequence)
            combined=combined_live_review(sample.subject_id,result["packet"],
                                          analysis,comparison,context_review,engineering)
            api.state.multisystem_latest[sample.subject_id]=combined
            result["multisystem"]=combined
        try:
            candidate17=api.state.candidate_17.process(sample)
        except Exception as exc:
            candidate17={
                "subject_id":sample.subject_id,"sequence":sample.sequence,
                "status":"MODEL_ERROR","clinical_validation":False,
                "model_role":"PARALLEL_CANDIDATE_NOT_CLINICAL_TRIAGE",
                "reason":type(exc).__name__
            }
        if sample.subject_id in ENGINEERING_CREW_IDS:
            try:
                unified=api.state.unified.process(
                    sample.subject_id, sample.sequence, result["packet"],
                    analysis, comparison, context_review, candidate17,
                    engineering
                )
            except Exception as exc:
                unified={
                    "subject_id":sample.subject_id,"sequence":sample.sequence,
                    "source":"SIMULATED_PHYSIOALERT_COMBINED",
                    "status":"EVIDENCE_UNAVAILABLE","clinical_validation":False,
                    "reason":f"Unified review unavailable: {type(exc).__name__}"
                }
            result["physioalert_unified"]=unified
            if result.get("multisystem") is not None:
                result["multisystem"]["physioalert_unified"]=unified
        result["candidate_17ch"]=candidate17
        if result.get("multisystem") is not None:
            result["multisystem"]["candidate_17ch"]=candidate17
        result["deep_learning"]=analysis
        result["comparison"]=comparison
        result["live_review"]=review
        result['context_review']=context_review
        await api.state.hub.publish({"type":"telemetry", "packet":result["packet"],
                                     "deep_learning":analysis,
                                     "comparison":comparison,"live_review":review,
                                     'context_review':context_review,
                                      'multisystem':result.get('multisystem'),
                                      'candidate_17ch':result.get('candidate_17ch'),
                                      'physioalert_unified':result.get('physioalert_unified')})
        return result

    @api.post("/api/live/ingest", status_code=201)
    async def ingest(packet: PacketIn, x_physiograph_ingest_key: str | None = Header(default=None)):
        if public_mode:
            if not ingest_key:
                raise HTTPException(503, "Public ingestion disabled: configure an ingest key")
            if not hmac.compare_digest(x_physiograph_ingest_key or "", ingest_key):
                raise HTTPException(403, "Invalid ingest key")
        return await process_packet(packet)

    async def run_internal_demo():
        """Four independent fictional sources, each with its own sequence and clock.

        Keep total simulation throughput at auto_speed packets/second rather
        than multiplying CPU-heavy model inference by four. Each astronaut gets
        an update every 4/auto_speed seconds, with one simulated second elapsed.
        """
        from tools.replay_live_demo import CREW_PROFILES, generate_packets

        origin = datetime.now(timezone.utc).replace(microsecond=0)
        crew_ids = tuple(CREW_PROFILES)
        scenario_modes = (
            ("normal", "activity", "excursion", "artifact"),
            ("normal", "normal", "activity", "excursion"),
            ("normal", "excursion", "activity", "normal"),
            ("normal", "artifact", "excursion", "activity"),
        )
        tick = 0
        try:
            while True:
                for crew_index, subject_id in enumerate(crew_ids):
                    # Every stream has distinct baseline/phase, declared
                    # activity scenario, ordering and model history.
                    cycle, segment = divmod(tick, 180)
                    mode = scenario_modes[crew_index][cycle % len(scenario_modes[crew_index])]
                    # Generate just this sequence's sample deterministically by
                    # using the same 180-point scenario as the legacy replay.
                    packet = next(p for i, p in enumerate(generate_packets(
                        subject=subject_id, count=180,
                        start=origin + timedelta(seconds=cycle * 180),
                        mode=mode,
                    )) if i == segment)
                    packet["sequence"] = tick
                    await process_packet(PacketIn.model_validate(packet))
                    await asyncio.sleep(1.0 / auto_speed)
                tick += 1
        except asyncio.CancelledError:
            raise
        except Exception:
            api.state.auto_demo_error = "INTERNAL_DEMO_STOPPED"
            raise

    @api.websocket("/api/live/ws")
    async def stream(ws: WebSocket):
        await ws.accept()
        q: asyncio.Queue = asyncio.Queue(maxsize=120)
        api.state.hub.listeners.add(q)
        try:
            await ws.send_json({"type":"snapshot", "data":api.state.store.snapshot()})
            while True:
                try:
                    outgoing = await asyncio.wait_for(q.get(), timeout=15)
                except asyncio.TimeoutError:
                    outgoing = {"type": "heartbeat", "mode": "SIMULATION_ONLY"}
                await ws.send_json(outgoing)
        except (WebSocketDisconnect, RuntimeError):
            pass
        finally:
            api.state.hub.listeners.discard(q)

    return api

app = build_app()
