import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE, METRICS, readApi, websocketUrl, researchParams, formatValue, friendlyStatus, statusTone, timelineLabel, lastSamples } from './api.js';
import { Icon, MiniTrend, VitalChart, ResearchDotChart } from './viz.jsx';
import { ENVIRONMENTS, EnvironmentPicker, CrewBodyMini, BodyExplorer } from './HealthGuardPages.jsx';
import MissionGame from './MissionGame.jsx';
import MissionDashboard from './MissionDashboardV2.jsx';
import MissionControl from './MissionControl.jsx';
import MissionVisorHUD from './MissionVisorHUD.jsx';
import useScenarioPlayback from './useScenarioPlayback.js';
import MedicalWorkstation from './MedicalWorkstation.jsx';
import HealthLibrary from './HealthLibrary.jsx';
import {liveVoiceAnnouncement,scenarioVoiceAnnouncement} from './healthguardVoice.js';
import {playScenarioAlarm} from './scenarioAlarm.js';
import {verifiedScenarioFrame} from './scenarioAnatomy.js';
import ScenarioPickerModal from './ScenarioPickerModal.jsx';
import GuidedTour from './GuidedTour.jsx';
import {TOUR_STEPS,TOUR_SEEN_KEY} from './tourConfig.js';
import {SCENARIOS} from './scenarioSimulator.js';
import {resolveScenarioNavigation} from './scenarioNavigation.js';
import {unlockScenarioAlarm} from './scenarioAlarm.js';
import SpaceBackgroundPicker from './SpaceBackgroundPicker.jsx';
import {BACKGROUND_KEY,normalizeBackground,WORKSPACE_BACKGROUND_PAGES} from './spaceBackgroundThemes.js';
import './spaceBackgroundThemes.css';

const NAV = [
  { id: 'dashboard', name: 'Mission Dashboard', caption: 'Mission health overview', icon: 'grid' },
  { id: 'telemetry', name: 'Crew Telemetry', caption: 'Detailed physiological measurements and model evidence', icon: 'activity' },
  { id: 'body', name: 'Body Explorer', caption: 'Interactive anatomy', icon: 'heart' },
  { id: 'routine', name: 'Health Routine', caption: 'Daily mission check-ins', icon: 'check' },
  { id: 'research', name: 'Health Library', caption: 'Space health learning and NASA research', icon: 'book' },
  { id: 'mission', name: 'Mission Control', caption: 'Spacecraft and engineering systems', icon: 'satellite' },
  { id: 'hud', name: 'Mission HUD', caption: 'Immersive monitoring', icon: 'radio' },
  { id: 'scenario', name: 'Scenario Lab', caption: 'Scripted training popup', icon: 'activity' },
];
const DASHBOARD_VIEWS = new Set(['dashboard','telemetry','scenario']);

function Tag({ children, tone = 'default', dot = false, className = '' }) {
  return <span className={`tag tag-${tone} ${className}`}>{dot && <span className="tag-dot" />}{children}</span>;
}
function SectionTitle({ eyebrow, title, sub, trailing }) {
  return <div className="section-header"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2>{sub && <p className="muted section-sub">{sub}</p>}</div>{trailing}</div>;
}
function Loader({ text = 'Connecting to backend' }) {
  return <div className="loading-state"><span className="spinning"/>{text}</div>;
}
function Placeholder({ message }) {
  return <div className="placeholder"><Icon name="radio" size={23}/><p>{message}</p></div>;
}
function MissionVisual() {
  return <div className="mission-visual" aria-hidden="true">
    <span className="star s1"/><span className="star s2"/><span className="star s3"/><span className="star s4"/><span className="star s5"/>
    <div className="radial-orbit orbit-a"/><div className="radial-orbit orbit-b"/><div className="radial-orbit orbit-c"/>
    <div className="mission-schematic">
      <svg viewBox="0 0 270 270" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs><linearGradient id="helmet" x1="35" y1="30" x2="230" y2="230"><stop stopColor="#5de7e6" stopOpacity=".35"/><stop offset="1" stopColor="#387d94" stopOpacity=".08"/></linearGradient><radialGradient id="visor"><stop stopColor="#78e6e5" stopOpacity=".25"/><stop offset="1" stopColor="#0a2638" stopOpacity=".96"/></radialGradient></defs>
        <circle cx="135" cy="135" r="106" stroke="#64c6d5" strokeOpacity=".17" strokeDasharray="3 8"/>
        <path d="M67 234c6-34 21-47 43-52m90 52c-6-34-21-47-43-52" stroke="#74c7d2" strokeOpacity=".7" strokeWidth="2"/>
        <path d="M91 197c-7-13-17-41-17-67 0-44 25-77 61-77s61 33 61 77c0 26-10 54-17 67" fill="url(#helmet)" stroke="#a5f5ef" strokeWidth="2.4"/>
        <path d="M91 116c-1-32 18-50 44-50s45 18 44 50l-6 31c-7 24-18 36-38 36s-31-12-38-36l-6-31Z" fill="url(#visor)" stroke="#7dcfd6" strokeWidth="2"/>
        <path d="M99 99c18-25 45-32 70-11" stroke="#caefea" strokeWidth="4" strokeLinecap="round" strokeOpacity=".3"/>
        <path d="M112 184v15c9 9 36 9 46 0v-15" stroke="#a5f5ef" strokeWidth="2"/>
        <path d="M88 196c21 25 73 27 94 0M80 209c26 35 85 37 110 0" stroke="#8cd9dc" strokeOpacity=".6" strokeWidth="2"/>
        <path d="M131 221h9m-4.5-4v9" stroke="#d0ffff" strokeWidth="2"/>
        <circle cx="201" cy="78" r="4" fill="#62e3da"/><circle cx="70" cy="180" r="3" fill="#62e3da"/>
      </svg>
    </div>
    <span className="visual-label top">VITALS // SIMULATION</span><span className="visual-label bottom">NO REAL CREW DATA</span>
  </div>;
}

function StatusPanel({ review, cnn, comparison, voice, onSpeak, speaking }) {
  const status = review?.status || 'AWAITING_DATA';
  const quality = review?.quality;
  const cnnFlag = cnn?.status || review?.raw_detector_statuses?.cnn;
  const covFlag = comparison?.status || review?.raw_detector_statuses?.covariance;
  return <div className="panel review-panel">
    <div className="panel-head"><div><p className="eyebrow">CONTEXT-AWARE ANALYSIS</p><h3>PhysioAlert <span className="subtle">/ Live review</span></h3></div><span className="round-icon"><Icon name="shield"/></span></div>
    <div className={`review-headline review-${statusTone(status)}`}><span className="review-symbol"><Icon name={statusTone(status)==='mint'?'check':'pulse'} size={20}/></span><div><span className="tiny-label">CURRENT REVIEW STATE</span><strong>{friendlyStatus(status)}</strong></div></div>
    <p className="review-reason">{review?.reason || 'Collecting valid simulated samples. A review becomes available after telemetry arrives.'}</p>
    <div className="fine-divider"/>
    <div className="detector-head"><strong>Model comparison</strong><span>Independent outputs</span></div>
    <div className="detector-row"><div className="detector-icon"><Icon name="pulse" size={17}/></div><div><strong>1D CNN Autoencoder</strong><small>{cnn?.error !== undefined && cnn?.error !== null ? `Reconstruction error: ${formatValue(cnn.error,5)}` : (cnn?.reason || 'Synthetic-trained model')}</small></div><Tag tone={statusTone(cnnFlag)}>{friendlyStatus(cnnFlag)}</Tag></div>
    <div className="detector-row"><div className="detector-icon"><Icon name="activity" size={17}/></div><div><strong>Covariance detector</strong><small>{comparison?.score !== undefined && comparison?.score !== null ? `Novelty score: ${formatValue(comparison.score,4)}` : (comparison?.reason || 'Statistical comparison')}</small></div><Tag tone={statusTone(covFlag)}>{friendlyStatus(covFlag)}</Tag></div>
    <div className="fine-divider"/>
    <div className="review-detail"><span>Measurement quality</span><strong>{friendlyStatus(quality?.status || 'NOT_EVALUATED')}</strong></div>
    <div className="review-detail"><span>Activity declaration</span><strong>{review?.activity_state || 'UNKNOWN'} <small>({review?.activity_basis ? 'declared' : 'unavailable'})</small></strong></div>
    <div className="review-detail"><span>Model clinical validation</span><strong className="warning-text">Not established</strong></div>
    <button className="voice-btn" onClick={onSpeak} disabled={!voice?.text} type="button"><Icon name={speaking?'mute':'volume'} size={17}/>{speaking?'Stop explanation':'Speak explanation'}<Icon name="arrow" size={17}/></button>
    <p className="fine-print">Deterministic explanation. Browser speech synthesis, not a medical AI or diagnosis.</p>
  </div>;
}

function Dashboard({ loading, error, readiness, snapshot, selected, setSelected, samples, review, cnn, comparison, voice, speaking, speak, connection, contextHistory, onResearch,onBody,onRoutine,environment }) {
  const last = snapshot?.subjects?.[selected]?.latest || samples.at(-1) || null;
  const subjects = Object.keys(snapshot?.subjects || {});
  const [activeMetric, setActiveMetric] = useState(METRICS[0].key);
  const metric = METRICS.find(m => m.key === activeMetric) || METRICS[0];
  return <div className="page-content dashboard-page mission-console">
    <div className="console-titlebar">
      <div>
        <div className="console-kicker"><span className="console-kicker-line"/> FLIGHT OPERATIONS <span className="console-kicker-divider">/</span> PHYSIOLOGICAL SYSTEMS <span className="console-kicker-divider">/</span> 01</div>
        <h1>Crew health <span>console</span><span className="accent-punct">.</span></h1>
        <p>Live physiological signal review for a fictional mission crew member.</p>
      </div>
      <div className="console-session">
        <div className="session-ring"><Icon name="satellite" size={19}/></div>
        <div><span>MISSION ENVIRONMENT</span><strong>{(ENVIRONMENTS.find(x=>x.id===environment)||ENVIRONMENTS[3]).name.toUpperCase()}</strong></div>
        <Tag tone={connection==='connected'?'mint':'amber'} dot>{connection==='connected'?'LINK ACTIVE':'RECONNECTING'}</Tag>
      </div>
    </div>
    {error && <div className="notice notice-warning"><Icon name="alert" size={18}/><span>Backend request issue: {error}. Retrying automatically. Missing values are not replaced with estimates.</span></div>}
    <div className="console-statusbar">
      <div className="statusbar-live"><span className="live-led"/> LIVE <strong>SIMULATED DATA</strong><span className="statusbar-mini-dots"><i/><i/><i/><i/></span></div>
      <div><span>MISSION SUBJECT</span><strong>{selected.replaceAll('_',' ')}</strong></div>
      <div><span>LATEST PACKET</span><strong>#{last?.sequence ?? '—'}</strong></div>
      <div><span>SIMULATED TIMESTAMP</span><strong>{timelineLabel(last?.timestamp)}</strong></div>
      <div><span>MODEL ENGINE</span><strong>{readiness?.models_loaded?'READY':'AWAITING STATUS'}</strong></div>
    </div>
    <div className="hg-dashboard-actions">
      <button type="button" onClick={onBody}><Icon name="heart" size={20}/><span><strong>Explore human systems</strong><small>Interactive 3D anatomical viewer</small></span><Icon name="arrow" size={17}/></button>
      <button type="button" onClick={onRoutine}><Icon name="check" size={20}/><span><strong>Open Mission Quest</strong><small>Guided health routine and progress</small></span><Icon name="arrow" size={17}/></button>
      <span className="hg-sim-banner"><Icon name="shield" size={18}/> All live telemetry is fictional, not sensor input.</span>
    </div>
    <div className="console-section-heading"><div><span className="section-index">01</span><div><p className="eyebrow">CONTINUOUS SIGNAL TELEMETRY</p><h2>Five physiological channels</h2></div></div><span className="section-aside">SELECT A CHANNEL TO INSPECT ITS SIGNAL</span></div>
    <div className="console-metrics">
      {METRICS.map((m,i)=><button key={m.key} type="button" aria-pressed={activeMetric===m.key} onClick={()=>setActiveMetric(m.key)} className={`console-metric ${activeMetric===m.key?'selected':''}`} style={{'--signal':m.color}}>
        <div className="console-metric-top"><span className="console-signal-index">0{i+1}</span><span className="metric-glyph"><Icon name={m.glyph} size={18}/></span></div>
        <span className="console-metric-label">{m.label}</span>
        <div className="console-metric-value"><strong>{formatValue(last?.values?.[m.key],m.digits)}</strong><small>{m.unit}</small></div>
        <div className="console-metric-footer"><MiniTrend data={samples} metric={m.key} color={m.color}/><span>SIM FEED</span></div>
      </button>)}
    </div>
    <div className="console-section-heading second-heading"><div><span className="section-index">02</span><div><p className="eyebrow">INTEGRATED SIGNAL WORKSPACE</p><h2>Observe, compare, review</h2></div></div><Tag tone="cyan">NO DIAGNOSTIC INFERENCE</Tag></div>
    <div className="console-grid">
      <div className="console-person-panel panel">
        <div className="console-panel-label"><span>ACTIVE CREW PROFILE</span><Icon name="radio" size={17}/></div>
        <div className="console-person-visual hg-crew-preview"><CrewBodyMini onOpen={onBody}/></div>
        <div className="console-person-details">
          <div className="crew-identity"><div className="crew-avatar">01</div><div><span>SIMULATED SUBJECT</span><strong>{selected.replaceAll('_',' ')}</strong></div></div>
          <label htmlFor="console-subject-select">SELECT DATA SOURCE</label>
          <select id="console-subject-select" className="crew-select" value={selected} onChange={e=>setSelected(e.target.value)}>{(subjects.length?subjects:['SIM_CREW_01']).map(id=><option key={id} value={id}>{id}</option>)}</select>
          <div className="crew-details-grid"><div><span>SOURCE</span><strong>Simulator</strong></div><div><span>CADENCE</span><strong>1 Hz fictional</strong></div></div>
        </div>
        <div className="console-panel-foot"><Icon name="shield" size={15}/> Not a real astronaut profile</div>
      </div>
      <div className="console-trend-column">
        <div className="panel console-trend-panel">
          <div className="console-panel-head"><div><p className="eyebrow">PRIMARY SIGNAL / LIVE INSPECTOR</p><h3>{metric.label}<span> / {metric.unit}</span></h3></div><Tag tone="cyan" dot>STREAMING</Tag></div>
          <VitalChart data={samples} metric={metric}/>
          <div className="console-trend-foot"><span><i style={{background:metric.color}}/> Raw fictional signal</span><span>{samples.length} samples retained</span></div>
        </div>
        <div className="panel console-method-strip">
          <div className="console-panel-label"><span>COMPUTATIONAL WORKFLOW</span><Tag tone={readiness?.models_loaded?'mint':'amber'}>{readiness?.models_loaded?'MODELS LOADED':'CHECKING'}</Tag></div>
          <div className="method-strip-track"><div><Icon name="radio" size={17}/><strong>Telemetry</strong><small>5 channels</small></div><Icon name="arrow" size={16}/><div><Icon name="pulse" size={17}/><strong>Novelty</strong><small>CNN + covariance</small></div><Icon name="arrow" size={16}/><div><Icon name="shield" size={17}/><strong>PhysioAlert</strong><small>Context + quality</small></div></div>
          <p>APDRA operates separately on historical NASA laboratory records.</p>
        </div>
      </div>
      <div className="console-review-column">
        <StatusPanel review={review} cnn={cnn} comparison={comparison} unified={unified} voice={voice} speaking={speaking} onSpeak={speak}/>
      </div>
    </div>
    <div className="console-bottom-row">
      <div className="panel console-events"><div className="console-panel-head"><div><p className="eyebrow">CONTEXT REVIEW / LOG</p><h3>Recent events</h3></div><Icon name="clock" size={19}/></div>{contextHistory.length?<div className="console-events-list">{contextHistory.slice(-4).reverse().map((e,i)=><div className="console-event" key={`${e.sequence}-${i}`}><span className={`event-point event-${statusTone(e.status)}`}/><div><strong>{friendlyStatus(e.status)}</strong><small>Sequence #{e.sequence} · {e.activity_state||'UNKNOWN'} declared activity</small></div><span className="console-event-code">{String(i+1).padStart(2,'0')}</span></div>)}</div>:<Placeholder message="Review events will appear when simulated windows have been processed."/>}</div>
      <div className="panel console-research-teaser"><div className="console-panel-head"><div><p className="eyebrow">RESEARCH TRACK / NASA OSD-575</p><h3>Historical evidence library</h3></div><Icon name="database" size={19}/></div><p>Independent preflight and postflight laboratory measurements with APDRA baseline-sensitivity analysis.</p><button className="console-research-link" type="button" onClick={onResearch}>Explore NASA data <Icon name="arrow" size={16}/></button><span>Real records, separate from simulated streaming</span></div>
    </div>
    <div className="source-note console-boundary"><Icon name="shield" size={16}/><span>RESEARCH PROTOTYPE: All live measurements are simulated. Anomaly flags indicate numerical novelty, not disease, medical risk, or emergency triage. This application is not intended for clinical decision-making.</span></div>
  </div>;
}

function Research({ overview, method, selectedCrew, setSelectedCrew, assay, setAssay, biomarker, setBiomarker, biomarkers, measurements, reviews, loading, error }) {
  const [search, setSearch] = useState('');
  const [detailsOpen,setDetailsOpen] = useState(false);
  const filtered = useMemo(()=>biomarkers.filter(b=>b.name.toLowerCase().includes(search.toLowerCase())),[biomarkers,search]);
  const selectedMeta = biomarkers.find(x=>x.name===biomarker);
  const rows=measurements?.rows||[], reviewRows=reviews?.rows||[];
  return <div className="page-content research-page">
    <div className="page-intro"><div><p className="eyebrow">LEARN ABOUT HEALTH IN SPACE</p><h1>Health library<span className="accent-punct">.</span></h1><p className="page-desc">Understand how researchers study the human body in space, then explore real measurements collected around spaceflight.</p></div><div className="intro-tags"><Tag tone="blue">HISTORICAL NASA LAB DATA</Tag></div></div>
    {error && <div className="notice notice-warning"><Icon name="alert" size={18}/>{error}</div>}
    <div className="hg-library-guide">
      <div><Icon name="book" size={21}/><strong>How to use this page</strong></div>
      <p>A biomarker is something measured in a laboratory, such as blood glucose. Choose a participant, test group, and measurement below to see the original results. These are historical research records, not live measurements from the fictional crew.</p>
      <p><strong>APDRA</strong> checks whether a research screening flag changes when a small part of the preflight reference data is left out. It does not diagnose a medical condition.</p>
    </div>
    <div className="research-hero"><div><span className="eyebrow">NASA OPEN SCIENCE DATA REPOSITORY</span><h2>Inspiration4 / OSD-575</h2><p>A small historical cohort of four pseudonymous participants. Research records are separate from our fictional real-time telemetry.</p><a href={overview?.study_url||'https://osdr.nasa.gov/bio/repo/data/studies/OSD-575'} target="_blank" rel="noreferrer">View NASA source <Icon name="external" size={14}/></a></div><div className="research-stats"><div><span>OBSERVATIONS</span><strong>{overview?.observations?.toLocaleString()??'—'}</strong></div><div><span>PARTICIPANTS</span><strong>{overview?.astronauts??'—'}</strong></div><div><span>ASSAY TYPES</span><strong>{Object.keys(overview?.assays||{}).length||'—'}</strong></div></div></div>
    <div className="section-flex"><SectionTitle eyebrow="02 / RESEARCH EXPLORER" title="Historical measurements" sub="Select a crew code, assay and biomarker to inspect the source records."/><Tag tone="blue">NO INTERPOLATION</Tag></div>
    <div className="panel research-filter-panel"><div className="filter-grid"><label>RESEARCH PARTICIPANT<select value={selectedCrew} onChange={e=>setSelectedCrew(e.target.value)}>{(overview?.subject_ids||['C001','C002','C003','C004']).map(s=><option value={s} key={s}>{s}</option>)}</select></label><label>TEST GROUP<select value={assay} onChange={e=>{setAssay(e.target.value);setBiomarker('');setSearch('');}}><option value="CMP">Comprehensive metabolic panel (CMP)</option><option value="NULISA">NULISA</option></select></label><label>MEASUREMENT<select value={biomarker} onChange={e=>setBiomarker(e.target.value)} disabled={!biomarkers.length}><option value="" disabled>Select biomarker</option>{filtered.map(x=><option value={x.name} key={`${x.assay}-${x.name}`}>{x.name} ({x.unit})</option>)}{biomarker && !filtered.some(x=>x.name===biomarker)&&<option value={biomarker}>{biomarker}</option>}</select></label><label>SEARCH MEASUREMENTS<div className="search-field"><Icon name="search" size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search name..." aria-label="Filter biomarker names"/></div></label></div></div>
    <div className="research-visual-grid"><div className="panel historical-panel"><div className="panel-head"><div><p className="eyebrow">DISCRETE LABORATORY MEASUREMENTS</p><h3>{biomarker || 'Select a biomarker'} <span className="subtle">{selectedMeta?.unit ? `· ${selectedMeta.unit}`:''}</span></h3></div><Tag tone="blue">{measurements?.total ?? '—'} DRAW(S)</Tag></div>{loading?<Loader text="Fetching NASA source rows"/>:<ResearchDotChart rows={rows} unit={selectedMeta?.unit||''}/>}<div className="historical-footer"><Icon name="database" size={16}/> Preflight and postflight sample draws are not continuous physiological monitoring.</div></div><div className="panel apdra-panel"><div className="panel-head"><div><p className="eyebrow">APDRA v0.7 / FROZEN RESEARCH</p><h3>How stable are screening flags?</h3></div><Icon name="flask" size={22}/></div><div className="big-stat">{method?.headline_exploratory_observation?.percent ?? '34.87'}<span>%</span></div><p>of <strong>195</strong> median-only screening flags were baseline-sensitive under leave-one-preflight-measurement-out checks (<strong>68 observations</strong>).</p><div className="notice-inline"><Icon name="alert" size={16}/><span>Not 68 proven false positives. APDRA does not diagnose disease and does not analyze the fictional live stream.</span></div></div></div>
    <div className="panel table-panel"><div className="panel-head"><div><p className="eyebrow">SOURCE PRESERVATION</p><h3>Measurement records</h3></div><button type="button" className="subtle-btn" onClick={()=>setDetailsOpen(v=>!v)}>{detailsOpen?'Compact view':'Detailed view'}<Icon name="chevron" size={16}/></button></div><div className="table-scroll"><table><thead><tr><th>TIMEPOINT</th><th>PHASE</th><th>VALUE</th><th>UNIT</th><th>SAMPLE ID</th>{detailsOpen&&<th>SOURCE / QC NOTE</th>}</tr></thead><tbody>{rows.length?rows.map((r,i)=><tr key={`${r.sample_id}-${i}`}><td className="mono">{r.timepoint}</td><td><Tag tone={r.phase==='preflight'?'cyan':'amber'}>{r.phase?.toUpperCase()}</Tag></td><td className="value-cell">{formatValue(r.value,3)}</td><td>{r.unit||'—'}</td><td className="mono">{r.sample_id}</td>{detailsOpen&&<td>{r.source}<br/><small>{r.qc_note}</small></td>}</tr>):<tr><td colSpan={detailsOpen?6:5} className="table-empty">No source measurements returned for this selection.</td></tr>}</tbody></table></div><div className="table-foot">Showing {rows.length} of {measurements?.total??0} source records; first 200 records per query. No re-estimation or imputation.</div></div>
    <div className="panel reviews-table"><div className="panel-head"><div><p className="eyebrow">HISTORICAL EVIDENCE REVIEW</p><h3>APDRA review queue <span className="subtle">({reviews?.total??0})</span></h3></div><Tag tone="amber">REVIEW PROMPTS, NOT DIAGNOSES</Tag></div>{reviewRows.length ? <div className="research-review-list">{reviewRows.slice(0,8).map((r,i)=><div className="research-review" key={`${r.biomarker}-${r.timepoint}-${i}`}><span className="review-ordinal">{String(i+1).padStart(2,'0')}</span><div><strong>{r.biomarker} · {r.timepoint}</strong><small>{r.screening_stability} · Reference n={r.baseline_n??'—'}</small><p>{r.reason}</p></div><Tag tone="amber">{r.review_category||'Review'}</Tag></div>)}</div> : <Placeholder message="No frozen APDRA review rows for this exact assay and biomarker selection."/>}</div>
    <div className="source-note"><Icon name="database" size={16}/><span>Source: NASA OSD-575 (Inspiration4). Measurements, assay units, timepoint labels and original sample IDs are preserved. These four participants are not the fictional simulated crew member.</span></div>
  </div>;
}

function Method({ readiness }) {
  const steps=[['01','Data source','A fictional 1 Hz stream containing five physiological variables. Simulator-declared activity is not verified by an external sensor.'],['02','Personal reference','Initial 45 simulated samples establish a personal comparison context; subsequent 60-point windows are evaluated.'],['03','Two detectors','A frozen synthetic-trained 1D CNN autoencoder and a separate shrunk-covariance statistical novelty detector.'],['04','Contextual review','Deterministic rules consider detector agreement, spaced observations, declared activity and engineering-only data-quality checks.'],['05','Evidence only','Outputs prompt review of numerical patterns. They are not clinical risk scores, disease diagnoses or emergency classifications.']];
  return <div className="page-content method-page"><div className="page-intro"><div><p className="eyebrow">TRANSPARENCY / SCIENTIFIC BASIS</p><h1>Methods & limitations<span className="accent-punct">.</span></h1><p className="page-desc">How HealthGuard processes evidence, and what the system deliberately does not claim.</p></div><Tag tone="blue">RESEARCH PROTOTYPE</Tag></div><div className="method-columns"><div className="panel method-panel"><div className="panel-head"><div><p className="eyebrow">PIPELINE A / SIMULATED STREAM</p><h3>Live novelty monitoring</h3></div><Icon name="pulse"/></div><div className="method-steps">{steps.map(([index,title,body])=><div className="method-step" key={index}><span>{index}</span><div><strong>{title}</strong><p>{body}</p></div></div>)}</div></div><div className="panel method-panel"><div className="panel-head"><div><p className="eyebrow">PIPELINE B / NASA OSD-575</p><h3>Historical APDRA analysis</h3></div><Icon name="flask"/></div><div className="method-steps"><div className="method-step"><span>01</span><div><strong>Independent historical input</strong><p>Separate preflight and postflight serum laboratory observations from four NASA OSD-575 participants.</p></div></div><div className="method-step"><span>02</span><div><strong>Sparse-reference stability</strong><p>APDRA v0.7 checks how screening interpretations change when individual preflight reference measurements are omitted.</p></div></div><div className="method-step"><span>03</span><div><strong>Research finding</strong><p>68 of 195 median-only flagged observations (34.87%) were baseline-sensitive, not established false alarms.</p></div></div><div className="method-step"><span>04</span><div><strong>Scientific boundary</strong><p>Frozen retrospective laboratory analysis. Not applied to the simulated live stream or validated as an astronaut diagnosis.</p></div></div></div></div></div>
    <div className="panel validation-panel"><div><p className="eyebrow">MODEL & SYSTEM STATUS</p><h3>Experimental validation scope</h3><p>Our frontend reads these states from the backend rather than declaring validation itself.</p></div><div className="validation-grid"><div><span>Backend</span><strong>{readiness?.backend_operational?'Operational':'Unconfirmed'}</strong></div><div><span>Models loaded</span><strong>{readiness?.models_loaded?'Yes':'Unconfirmed'}</strong></div><div><span>Clinical validation</span><strong className="warning-text">Not established</strong></div><div><span>External deployed-model validation</span><strong>{readiness?.external_deployed_model_validation?.replaceAll('_',' ')||'Not performed'}</strong></div></div></div>
    <div className="panel validation-panel" style={{marginTop:16,display:'block'}}><div><p className="eyebrow">VISUAL ASSETS / ATTRIBUTION</p><h3>Credits and sources</h3><p>Earth photograph: NASA/JSC, ISS046-E-5378. Anatomical visualization: BodyParts3D © The Database Center for Life Science (CC BY 4.0); Human Reference Atlas reference organs, HuBMAP (CC BY 4.0); MakeHuman (CC0), adapted by open-anatomy-3d (CC BY 4.0). Crew portraits are fictional visual assets, not photographs of actual astronauts.</p><p><a href="https://eol.jsc.nasa.gov/SearchPhotos/photo.pl?frame=5378&mission=ISS046&roll=E" target="_blank" rel="noreferrer">NASA Earth photograph</a> · <a href="https://github.com/MervinR07/open-anatomy-3d" target="_blank" rel="noreferrer">Open Anatomy 3D and full licensing information</a></p></div></div>
    <div className="source-note"><Icon name="alert" size={16}/><span>HealthGuard is a research and software demonstration. Use of a biomedical label does not make a model a medical device or clinically validated detector.</span></div></div>;
}

export default function App() {
  const [page,setPage]=useState('dashboard');
  const [scenarioOpen,setScenarioOpen]=useState(false);
  const [backgroundTheme,setBackgroundTheme]=useState(()=>{
    try{return normalizeBackground(window.localStorage.getItem(BACKGROUND_KEY));}
    catch{return 'glow';}
  });
  useEffect(()=>{
    try{window.localStorage.setItem(BACKGROUND_KEY,backgroundTheme);}catch{/* Storage may be disabled. */}
  },[backgroundTheme]);

  const [environment,setEnvironment]=useState('lunar_base');
  const [sidebarOpen,setSidebarOpen]=useState(false);
  const [tour,setTour]=useState(()=>{
    try{return new URLSearchParams(window.location.search).get('tour')==='1'?0:-1;}
    catch{return -1;}
  });
  const tourReturnPageRef=useRef('dashboard');
  const startGuidedTour=()=>{
    tourReturnPageRef.current=page;
    setScenarioOpen(false);
    setSidebarOpen(false);
    setTour(0);
    setPage(TOUR_STEPS[0].page);
    window.scrollTo({top:0,behavior:'instant'});
  };
  const stopGuidedTour=()=>{
    setTour(-1);
    setPage(tourReturnPageRef.current);
    try{window.localStorage.setItem(TOUR_SEEN_KEY,'1');}catch{/* Storage disabled */}
    window.scrollTo({top:0,behavior:'instant'});
  };
  const moveGuidedTour=stepIndex=>{
    if(stepIndex>=TOUR_STEPS.length){stopGuidedTour();return;}
    const next=Math.max(0,stepIndex);
    setTour(next);
    setPage(TOUR_STEPS[next].page);
    window.scrollTo({top:0,behavior:'instant'});
  };
  const [readiness,setReadiness]=useState(null),[mission,setMission]=useState(null),[overview,setOverview]=useState(null),[method,setMethod]=useState(null);
  const [snapshot,setSnapshot]=useState(null),[selected,setSelected]=useState('SIM_CREW_01'),[samples,setSamples]=useState([]);
  const scenario=useScenarioPlayback(selected);
  const scenarioCritical=Boolean(scenario.running&&scenario.soundEnabled&&
    verifiedScenarioFrame(scenario,selected)?.severity==='CRITICAL');
  const criticalAnnounceRef=useRef('');
  const criticalAlarmStartedRef=useRef(false);
  criticalAnnounceRef.current=scenario.id?
    scenarioVoiceAnnouncement(scenario.id,'CRITICAL'):'';
  // One alert source across Scenario Lab, Body Explorer and HUD.
  // The short tone plays once on entry, and speech tries every five seconds.
  useEffect(()=>{
    if(!scenarioCritical){
      criticalAlarmStartedRef.current=false;
      return;
    }
    if(!criticalAlarmStartedRef.current){
      playScenarioAlarm();
      criticalAlarmStartedRef.current=true;
    }
    if(typeof window==='undefined'||!window.speechSynthesis)return;
    const speech=window.speechSynthesis;
    const announce=()=>{
      if(speech.speaking||speech.pending)return;
      const phrase=criticalAnnounceRef.current;
      if(!phrase)return;
      const utterance=new SpeechSynthesisUtterance(phrase);
      utterance.lang='en-US';utterance.rate=.95;
      speech.speak(utterance);
    };
    announce();
    const timer=window.setInterval(announce,5000);
    return()=>{window.clearInterval(timer);speech.cancel();};
  },[scenarioCritical,selected,scenario.id]);

  const [review,setReview]=useState(null),[cnn,setCnn]=useState(null),[comparison,setComparison]=useState(null),[unified,setUnified]=useState(null),[voice,setVoice]=useState(null),[contextHistory,setContextHistory]=useState([]);
  const [connection,setConnection]=useState('connecting'),[error,setError]=useState(''),[speaking,setSpeaking]=useState(false);
  const [selectedCrew,setSelectedCrew]=useState('C001'),[assay,setAssay]=useState('CMP'),[biomarker,setBiomarker]=useState('GLUCOSE');
  const [biomarkers,setBiomarkers]=useState([]),[measurements,setMeasurements]=useState(null),[reviews,setReviews]=useState(null),[researchBusy,setResearchBusy]=useState(false),[researchError,setResearchError]=useState('');
  const subjectRef=useRef(selected), wsRef=useRef(null);
  // Change the routing ref immediately so new websocket packets follow the selection.
  const selectSubject=useCallback(id=>{subjectRef.current=id;setSelected(id);setSamples([]);setReview(null);setCnn(null);setComparison(null);setUnified(null);setVoice(null);setContextHistory([]);},[]);
  useEffect(()=>{ subjectRef.current=selected; },[selected]);

  useEffect(()=>{
    let cancelled=false;
    async function initialize(){
      const results=await Promise.allSettled([readApi('/api/system/readiness'),readApi('/api/mission/status'),readApi('/api/research/overview'),readApi('/api/research/method')]);
      if(cancelled)return;
      const handlers=[setReadiness,setMission,setOverview,setMethod];
      results.forEach((r,i)=>{if(r.status==='fulfilled')handlers[i](r.value);});
      if(results.every(r=>r.status==='rejected'))setError('Service did not respond; cold start or CORS setup may be in progress');
    }
    initialize();return()=>{cancelled=true};
  },[]);

  useEffect(()=>{
    let cancelled=false;
    const load=async()=>{
      try{
        const r=await readApi('/api/live/snapshot');
        if(cancelled)return;
        setSnapshot(r);setError('');
        const last=r?.subjects?.[subjectRef.current]?.latest;
        if(last)setSamples(prev=>lastSamples(prev.filter(x=>x.subject_id===last.subject_id),last));
      }catch(e){if(!cancelled)setError(e.message || 'Unable to fetch live telemetry');}
    };
    load();const t=setInterval(load,8000);return()=>{cancelled=true;clearInterval(t)};
  },[]);

  useEffect(()=>{
    let closed=false, reconnectTimer=null, socket=null;
    function connect(){
      if(closed)return;
      setConnection('connecting');
      try{socket=new WebSocket(websocketUrl());wsRef.current=socket;
        socket.onopen=()=>{if(!closed)setConnection('connected')};
        socket.onmessage=e=>{
          let msg;try{msg=JSON.parse(e.data)}catch{return}
          if(msg.type==='snapshot' && msg.data){setSnapshot(msg.data);const last=msg.data?.subjects?.[subjectRef.current]?.latest;if(last)setSamples(prev=>lastSamples(prev.filter(x=>x.subject_id===last.subject_id),last));}
          if(msg.type==='telemetry' && msg.packet){
            const packet=msg.packet;
            setSnapshot(prev=>({...(prev||{}),mode:'SIMULATION_ONLY',subjects:{...(prev?.subjects||{}),[packet.subject_id]:{latest:packet,retained:((prev?.subjects||{})[packet.subject_id]?.retained||0)+1}}}));
            if(packet.subject_id===subjectRef.current){setSamples(prev=>lastSamples(prev.filter(x=>x.subject_id===packet.subject_id),packet));if(msg.context_review)setReview(msg.context_review);if(msg.deep_learning)setCnn(msg.deep_learning);if(msg.comparison)setComparison(msg.comparison);if(msg.physioalert_unified)setUnified(msg.physioalert_unified);if(msg.physioalert_unified?.voice_ready_script)setVoice({text:msg.physioalert_unified.voice_ready_script,status:msg.physioalert_unified.status});else if(msg.context_review?.voice_ready_script)setVoice({text:msg.context_review.voice_ready_script,status:msg.context_review.status});}
          }
        };
        socket.onerror=()=>{if(!closed)setConnection('reconnecting')};
        socket.onclose=()=>{if(!closed){setConnection('reconnecting');reconnectTimer=setTimeout(connect,3500);}};
      }catch{if(!closed){setConnection('reconnecting');reconnectTimer=setTimeout(connect,4500);}}
    }
    connect();return()=>{closed=true;if(reconnectTimer)clearTimeout(reconnectTimer);socket?.close();wsRef.current=null};
  },[]);

  useEffect(()=>{
    let cancelled=false;
    setSamples([]);setReview(null);setCnn(null);setComparison(null);setUnified(null);setVoice(null);setContextHistory([]);
    const load=async()=>{
      const reqs=[`/api/live/history/${encodeURIComponent(selected)}?limit=160`,`/api/live/context-review/${encodeURIComponent(selected)}`,`/api/live/dl/${encodeURIComponent(selected)}`,`/api/live/comparison/${encodeURIComponent(selected)}`,`/api/live/physioalert-unified/voice/${encodeURIComponent(selected)}`,`/api/live/context-history/${encodeURIComponent(selected)}?limit=30`,`/api/live/physioalert-unified/${encodeURIComponent(selected)}`];
      const results=await Promise.allSettled(reqs.map(x=>readApi(x)));
      if(cancelled)return;
      const setters=[r=>setSamples(prev=>{
        const merged=[...(r.samples||[]),...prev.filter(x=>x.subject_id===selected)].sort((a,b)=>a.sequence-b.sequence);
        return [...new Map(merged.map(x=>[x.sequence,x])).values()].sort((a,b)=>a.sequence-b.sequence).slice(-160);
      }),setReview,setCnn,setComparison,setVoice,r=>setContextHistory(r.results||[]),setUnified];
      results.forEach((r,i)=>{if(r.status==='fulfilled')setters[i](r.value)});
    };
    load();const id=setInterval(load,17000);return()=>{cancelled=true;clearInterval(id)};
  },[selected]);

  useEffect(()=>{
    let cancelled=false;
    readApi(`/api/research/biomarkers${researchParams({assay})}`).then(r=>{
      if(cancelled)return;setBiomarkers(r.biomarkers||[]);setBiomarker(current=>current && r.biomarkers?.some(x=>x.name===current)?current:(r.biomarkers?.find(x=>x.name==='GLUCOSE')?.name||r.biomarkers?.[0]?.name||''));setResearchError('');
    }).catch(e=>{if(!cancelled)setResearchError('Could not load NASA biomarker list: '+e.message)});
    return()=>{cancelled=true};
  },[assay]);

  useEffect(()=>{
    if(!biomarker)return;
    let cancelled=false;setResearchBusy(true);setMeasurements(null);setReviews(null);setResearchError('');
    const args=researchParams({subject_id:selectedCrew,assay,biomarker,limit:200});
    Promise.allSettled([readApi('/api/research/measurements'+args),readApi('/api/research/review'+args)]).then(results=>{
      if(cancelled)return;
      if(results[0].status==='fulfilled')setMeasurements(results[0].value);else setResearchError('NASA measurements unavailable: '+results[0].reason.message);
      if(results[1].status==='fulfilled')setReviews(results[1].value);
      setResearchBusy(false);
    });
    return()=>{cancelled=true};
  },[selectedCrew,assay,biomarker]);

  const speak=useCallback(()=>{
    if(typeof window==='undefined'||!window.speechSynthesis)return;
    if(speaking){window.speechSynthesis.cancel();setSpeaking(false);return;}
    if(!voice?.text)return;
    const speechText=liveVoiceAnnouncement(unified);
    window.speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(speechText);utterance.lang='en-US';utterance.rate=.93;utterance.pitch=1;utterance.onend=()=>setSpeaking(false);utterance.onerror=()=>setSpeaking(false);window.speechSynthesis.speak(utterance);setSpeaking(true);
  },[speaking,voice,unified]);
  useEffect(()=>()=>{if(typeof window!=='undefined'&&window.speechSynthesis)window.speechSynthesis.cancel()},[]);
  const navTo=id=>{
    const next=resolveScenarioNavigation(page,id);
    if(next.scenarioOpen){
      setScenarioOpen(true);
    }else{
      setScenarioOpen(false);
      setPage(next.page);
    }
    setSidebarOpen(false);
    if(next.scroll)window.scrollTo({top:0,behavior:'smooth'});
  };
  const closeScenario=()=>setScenarioOpen(false);
  const selectScenarioDestination=destination=>{
    setScenarioOpen(false);
    if(destination!==page)navTo(destination);
  };
  const speakScenarioGuidance=()=>{
    if(!scenario.id||typeof window==='undefined'||!window.speechSynthesis)return;
    const utterance=new SpeechSynthesisUtterance(scenarioVoiceAnnouncement(scenario.id,scenario.latest?.severity||'CHECK','guidance'));
    utterance.lang='en-US';utterance.rate=.95;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };
  const selectedName=NAV.find(x=>x.id===page)?.name||'Overview';
  return <div className="app-shell">
    <aside className={`sidebar ${sidebarOpen?'sidebar-open':''}`}><div className="side-logo"><span className="brand-mark"><img src="/healthguard-logo-transparent.svg?v=official-20261115" alt="" /></span><div><strong>Health<span>Guard</span></strong><small>ASTRONAUT HEALTH MONITOR</small></div><button type="button" className="sidebar-close" aria-label="Close menu" onClick={()=>setSidebarOpen(false)}><Icon name="x"/></button></div>
      <div className="nav-wrapper"><span className="nav-heading">WORKSPACE</span><nav aria-label="Primary navigation">{NAV.map(item=><button type="button" key={item.id} data-tour-anchor={item.id} title={item.caption} className={`nav-item ${item.id===page?'nav-active':''}`} onClick={()=>navTo(item.id)} aria-current={item.id===page?'page':undefined}><span className="nav-icon"><Icon name={item.icon} size={17}/></span><span><strong>{item.name}</strong><small>{item.caption}</small></span>{item.id===page&&<span className="nav-indicator"/>}</button>)}</nav></div>
      <div className="hg-nav-tour-slot">
        <button type="button" className="hg-nav-tour-button" onClick={startGuidedTour}
          title="Start the interactive HealthGuard tutorial" aria-label="Start guided tour">
          <Icon name="help" size={17}/><span>Take a tour</span>
        </button>
      </div>
    </aside>
    {sidebarOpen&&<button className="mobile-scrim" aria-label="Close menu" onClick={()=>setSidebarOpen(false)}/>}
    <div className="work-area"><header className="topbar"><div className="topbar-start"><button type="button" className="menu-toggle" onClick={()=>setSidebarOpen(true)} aria-label="Open navigation"><Icon name="menu"/></button><span>MISSION CONTROL</span><Icon name="chevron" size={13}/><strong>{selectedName}</strong></div><div className="topbar-end"><span className="topbar-clock"><Icon name="clock" size={15}/>{new Date().getUTCFullYear()} · RESEARCH ENVIRONMENT</span><span className={`header-connection conn-${connection}`}><span/>{connection==='connected'?'BACKEND CONNECTED':'BACKEND CONNECTING'}</span><span className="topbar-avatar">HG</span></div></header>
      <main id="main-content" data-bg-theme={WORKSPACE_BACKGROUND_PAGES.includes(page)?backgroundTheme:undefined} className={WORKSPACE_BACKGROUND_PAGES.includes(page)?'hg-background-enabled':''}>
        {WORKSPACE_BACKGROUND_PAGES.includes(page)&&<div className="hg-scene-toolbar"><SpaceBackgroundPicker value={backgroundTheme} onChange={setBackgroundTheme}/></div>}
        {DASHBOARD_VIEWS.has(page)?<MissionDashboard scenario={scenario} view={page} onDashboard={()=>navTo('dashboard')} onTelemetryPage={()=>navTo('telemetry')} onScenarioPage={()=>navTo('scenario')} loading={!snapshot} error={error} readiness={readiness} snapshot={snapshot} selected={selected} setSelected={selectSubject} samples={samples.filter(x=>x.subject_id===selected)} review={review} cnn={cnn} comparison={comparison} unified={unified} voice={voice} speaking={speaking} speak={speak} connection={connection} contextHistory={contextHistory} onResearch={()=>navTo('research')} onBody={()=>navTo('body')} onRoutine={()=>navTo('routine')} onHUD={()=>navTo('hud')} onMission={()=>navTo('mission')} environment={environment} onEnvironment={setEnvironment}/>:page==='body'?<MedicalWorkstation scenario={scenario} selected={selected} onSelectCrew={selectSubject} snapshot={snapshot} samples={samples.filter(x=>x.subject_id===selected)} review={review} unified={unified} connection={connection} onTelemetry={()=>navTo('telemetry')} onMission={()=>navTo('mission')}/>:page==='routine'?<MissionGame selected={selected} onNavigate={navTo} snapshot={snapshot}/>:page==='hud'?<MissionVisorHUD scenario={scenario} onOpenScenario={()=>navTo('scenario')} selected={selected} onSelectCrew={selectSubject} snapshot={snapshot} samples={samples.filter(x=>x.subject_id===selected)} review={review} unified={unified} connection={connection} environment={environment} onEnvironment={setEnvironment} onExit={()=>navTo('dashboard')}/>:page==='research'?<HealthLibrary liveAPDRA={unified?.explanation?.apdra_live} liveCrew={selected} overview={overview} method={method} selectedCrew={selectedCrew} setSelectedCrew={setSelectedCrew} assay={assay} setAssay={setAssay} biomarker={biomarker} setBiomarker={setBiomarker} biomarkers={biomarkers} measurements={measurements} reviews={reviews} loading={researchBusy} error={researchError}/>:page==='mission'?<MissionControl environment={environment} onEnvironment={setEnvironment} selected={selected} onSelectCrew={selectSubject} snapshot={snapshot} connection={connection} readiness={readiness} unified={unified} mission={mission} onTelemetry={()=>navTo('telemetry')} onScenario={()=>navTo('scenario')} onHUD={()=>navTo('hud')}/>:<Method readiness={readiness}/>}</main>
      
    </div>
    {scenarioOpen&&<ScenarioPickerModal
      open
      onClose={closeScenario}
      onBody={()=>selectScenarioDestination('body')}
      onHUD={()=>selectScenarioDestination('hud')}
      person={{subjectId:selected}}
      scenarioId={scenario.id}
      onSelectScenario={scenario.select}
      onStart={()=>{if(scenario.soundEnabled)unlockScenarioAlarm();scenario.start();}}
      onPause={scenario.pause}
      onReset={scenario.reset}
      onExit={scenario.stop}
      running={scenario.running}
      elapsed={scenario.elapsed}
      sample={scenario.sample}
      latestFrame={scenario.latest}
      soundEnabled={scenario.soundEnabled}
      onToggleSound={scenario.toggleSound}
      onSpeak={speakScenarioGuidance}
      scenarioPending={scenario.pending}
      scenarioError={scenario.error}
    />}
    {tour>=0&&<GuidedTour index={tour} onNext={()=>moveGuidedTour(tour+1)} onBack={()=>moveGuidedTour(tour-1)} onExit={stopGuidedTour}/>}

  </div>;
}