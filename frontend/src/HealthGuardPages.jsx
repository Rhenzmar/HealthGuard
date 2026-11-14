import React, { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { METRICS, formatValue, friendlyStatus } from './api.js';
import { Icon, VitalChart } from './viz.jsx';
import { QUESTS, getQuestPoints, getQuestCompletion } from './questLogic.js';

export const ENVIRONMENTS = [
  { id:'spacecraft', name:'Spacecraft', detail:'In-transit vehicle', summary:'Cabin operations and compact daily routines' },
  { id:'station', name:'Space station', detail:'Orbital operations', summary:'Long-duration orbit and scheduled monitoring' },
  { id:'rover', name:'Surface rover', detail:'Planetary excursion', summary:'Mobility and check-in scenario' },
  { id:'lunar_base', name:'Lunar base', detail:'Moon surface habitat', summary:'Surface mission routine and communication context' },
  { id:'mars_base', name:'Mars habitat', detail:'Mars surface base', summary:'Extended-duration isolation and remote support' }
];

const CREW_NAMES = {
  SIM_CREW_01:'Cmdr. Elena Park',
  SIM_CREW_02:'Dr. Marcus Reed',
  SIM_CREW_03:'Lt. Aisha Khan',
  SIM_CREW_04:'Spc. Daniel Cho'
};
const crewNumber = id => String(Object.keys(CREW_NAMES).indexOf(id)+1).padStart(2,'0');

const ZONES = [
  { id:'cardiac', name:'Cardiovascular', tag:'Heart', keys:['heart_rate_bpm','hrv_rmssd_ms'], description:'Heart rate and HRV are the two monitored signals most directly relevant to this region. They do not assess cardiac disease or determine cardiovascular fitness.', guidance:'Confirm the wearable has a stable signal, review trends, and compare with the stated activity context.' },
  { id:'respiratory', name:'Respiratory', tag:'Lungs', keys:['spo2_percent','respiratory_rate_bpm'], description:'Oxygen saturation and respiratory rate are available as simulated physiological measurements. These alone cannot diagnose a respiratory disorder.', guidance:'Verify sensor placement and review the trend over time before drawing any conclusion.' },
  { id:'thermal', name:'Thermoregulation', tag:'Core', keys:['core_temp_c'], description:'The simulator supplies estimated core temperature for numerical-pattern monitoring. No real thermometer or thermal sensor is connected.', guidance:'Check the source, timestamp and measurement quality. Do not treat the simulated value as a clinical temperature.' },
  { id:'brain', name:'Neurological', tag:'Brain', keys:[], description:'The current five-channel telemetry stream does not measure brain activity, cognition or neurological function.', guidance:'Educational reference only. No neurological status can be inferred from the available channels.' },
  { id:'movement', name:'Musculoskeletal', tag:'Movement', keys:[], description:'There are no connected motion-capture, strength, bone-density or joint sensors. The anatomical figure is an educational interaction.', guidance:'An activity log can be recorded as a routine task, but it is not independently verified by a physical sensor.' }
];

export function EnvironmentPicker({value,onChange,compact=false}) {
  return <label className={compact?'hg-env hg-env-compact':'hg-env'}>
    <span>MISSION ENVIRONMENT</span>
    <select aria-label="Select simulated mission environment" value={value} onChange={e=>onChange(e.target.value)}>
      {ENVIRONMENTS.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
    </select>
    <small>Scenario context only · no model recalibration</small>
  </label>;
}

function Part({position,scale,rotation,kind='sphere',zone,color,selected,onSelect}) {
  return <mesh position={position} rotation={rotation||[0,0,0]} scale={scale} onClick={event=>{event.stopPropagation();onSelect(zone)}} castShadow>
    {kind==='cylinder'?<cylinderGeometry args={[1,1,1,20]}/>:kind==='capsule'?<capsuleGeometry args={[.62,1.15,8,16]}/>:<sphereGeometry args={[1,28,22]}/>}
    <meshStandardMaterial color={selected===zone?'#54ece3':color||'#31566d'} transparent opacity={selected===zone?0.98:0.87} roughness={0.39} metalness={0.17} emissive={selected===zone?'#1a655e':'#04121e'} emissiveIntensity={selected===zone?.46:.09}/>
  </mesh>;
}

function Figure({selected,onSelect}) {
  return <group position={[0,-.16,0]} rotation={[0,.16,0]}>
    <Part zone="brain" selected={selected} onSelect={onSelect} position={[0,1.69,0]} scale={[.33,.38,.29]} color="#3f7690"/>
    <Part zone="thermal" selected={selected} onSelect={onSelect} kind="capsule" position={[0,.34,0]} scale={[.73,.79,.63]} color="#315a73"/>
    <Part zone="movement" selected={selected} onSelect={onSelect} kind="cylinder" position={[-.77,.35,0]} scale={[.145,.69,.15]} rotation={[0,0,-.23]} color="#35617a"/>
    <Part zone="movement" selected={selected} onSelect={onSelect} kind="cylinder" position={[.77,.35,0]} scale={[.145,.69,.15]} rotation={[0,0,.23]} color="#35617a"/>
    <Part zone="movement" selected={selected} onSelect={onSelect} kind="cylinder" position={[-.28,-1.09,0]} scale={[.23,.87,.22]} rotation={[0,0,-.05]} color="#31566f"/>
    <Part zone="movement" selected={selected} onSelect={onSelect} kind="cylinder" position={[.28,-1.09,0]} scale={[.23,.87,.22]} rotation={[0,0,.05]} color="#31566f"/>
    <Part zone="respiratory" selected={selected} onSelect={onSelect} position={[-.225,.63,.47]} scale={[.23,.36,.12]} color="#40a7b4"/>
    <Part zone="respiratory" selected={selected} onSelect={onSelect} position={[.225,.63,.47]} scale={[.23,.36,.12]} color="#40a7b4"/>
    <Part zone="cardiac" selected={selected} onSelect={onSelect} position={[.055,.56,.61]} scale={[.135,.16,.11]} color="#ec8f99"/>
  </group>;
}
export function AnatomyScene({selected='cardiac',onSelect=()=>{}}) {
  return <div className="hg-three-shell">
    <div className="hg-three-crosshair" aria-hidden="true"/>
    <Canvas camera={{position:[0,0.35,6.25],fov:38}} dpr={[1,1.75]} gl={{alpha:true,antialias:true}} fallback={<div className="hg-canvas-fallback">3D display unavailable. Use the region controls below.</div>}>
      <ambientLight intensity={1.3}/>
      <directionalLight position={[3,5,5]} intensity={2.2}/>
      <pointLight position={[-3,1,3]} color="#39cddd" intensity={2.5}/>
      <pointLight position={[2,-1,-3]} color="#206cc9" intensity={2}/>
      <Figure selected={selected} onSelect={onSelect}/>
      <OrbitControls makeDefault enablePan={false} enableZoom minDistance={4.4} maxDistance={8.5} minPolarAngle={.4} maxPolarAngle={Math.PI-.4} target={[0,.05,0]}/>
    </Canvas>
    <div className="hg-three-caption">DRAG TO ROTATE · SCROLL TO ZOOM · SELECT ANATOMY</div>
  </div>;
}
export function CrewBodyMini({onOpen}) {
  const [zone,setZone]=useState('cardiac');
  return <div className="hg-mini-body">
    <AnatomyScene selected={zone} onSelect={z=>{setZone(z);onOpen();}}/>
    <button className="hg-mini-body-link" type="button" onClick={onOpen}>Open 3D Body Explorer <Icon name="arrow" size={14}/></button>
  </div>;
}

function ChannelRow({metric,last}) {
  return <div className="hg-channel-row"><span className="hg-channel-dot" style={{background:metric.color}}/><div><strong>{metric.short}</strong><small>{metric.label}</small></div><b>{formatValue(last?.values?.[metric.key],metric.digits)} <small>{metric.unit}</small></b></div>;
}

export function BodyExplorer({samples=[],snapshot,selected='SIM_CREW_01',review,environment='lunar_base',onEnvironment}) {
  const [zoneId,setZoneId]=useState('cardiac');
  const zone=ZONES.find(x=>x.id===zoneId)||ZONES[0];
  const last=snapshot?.subjects?.[selected]?.latest||samples.at(-1)||null;
  const channels=METRICS.filter(m=>zone.keys.includes(m.key));
  const [graphKey,setGraphKey]=useState('heart_rate_bpm');
  useEffect(()=>{setGraphKey(zone.keys[0]||'')},[zoneId]);
  const graphMetric=METRICS.find(m=>m.key===graphKey);
  return <div className="hg-page">
    <div className="hg-heading"><div><p className="hg-overline">HEALTHGUARD / INTERACTIVE ANATOMY</p><h1>Explore the body<span className="accent-punct">.</span></h1><p>Selected fictional astronaut: <strong>{CREW_NAMES[selected]||selected}</strong>. Explore related physiological signals without inferring organ health from unvalidated models.</p></div><EnvironmentPicker value={environment} onChange={onEnvironment} compact/></div>
    <div className="hg-anatomy-grid">
      <section className="hg-surface hg-3d-panel">
        <div className="hg-panel-top"><div><span className="hg-eyebrow">INTERACTIVE CREW MODEL</span><h2>Human systems explorer · Crew {crewNumber(selected)}</h2></div><span className="hg-pill">3D EDUCATIONAL MODEL</span></div>
        <AnatomyScene selected={zoneId} onSelect={setZoneId}/>
        <div className="hg-zone-tabs" aria-label="Anatomical regions">{ZONES.map(z=><button key={z.id} type="button" aria-pressed={zoneId===z.id} className={zoneId===z.id?'active':''} onClick={()=>setZoneId(z.id)}>{z.tag}</button>)}</div>
      </section>
      <section className="hg-surface hg-detail-panel">
        <p className="hg-eyebrow">SELECTED BODY SYSTEM</p>
        <h2>{zone.name}</h2>
        <p className="hg-explainer">{zone.description}</p>
        <div className="hg-detail-divider"/>
        <p className="hg-eyebrow">CONNECTED MEASUREMENTS</p>
        {channels.length?<div className="hg-channel-list">{channels.map(m=><ChannelRow key={m.key} metric={m} last={last}/>)}</div>:<div className="hg-empty-sensors"><Icon name="alert" size={21}/><strong>No direct measurement available</strong><p>No sensor should be inferred for this body system.</p></div>}
        <div className="hg-advice"><span>MEASUREMENT GUIDANCE</span><p>{zone.guidance}</p></div>
        <div className="hg-evidence-tag"><Icon name="shield" size={16}/> Model flags are numerical novelty, not diagnoses.</div>
      </section>
    </div>
    {graphMetric&&<div className="hg-surface hg-anatomy-trend"><div className="hg-panel-top"><div><span className="hg-eyebrow">RELATED SIMULATED SIGNAL</span><h2>{graphMetric.label} trend</h2></div><select aria-label="Select related signal" value={graphKey} onChange={e=>setGraphKey(e.target.value)}>{channels.map(m=><option value={m.key} key={m.key}>{m.label}</option>)}</select></div><VitalChart data={samples} metric={graphMetric}/></div>}
    <p className="hg-boundary">All live values originate from the fictional telemetry generator. The 3D figure is educational and does not represent a medically assessed patient. NASA laboratory records are accessed separately in NASA Research.</p>
  </div>;
}

const STORAGE_KEY='healthguard-mission-quest-v1';
function readRoutine() {
  try {
    const v=JSON.parse(window.localStorage.getItem(STORAGE_KEY)||'{}');
    return v&&typeof v==='object'&&!Array.isArray(v)?v:{};
  } catch { return {}; }
}
export function HealthRoutine() {
  const [record,setRecord]=useState(readRoutine);
  const [opened,setOpened]=useState('morning');
  const day=new Date().toISOString().slice(0,10);
  const state=record[day]||{};
  const completedIds=Object.keys(state).filter(k=>state[k]==='complete');
  const completion=getQuestCompletion(completedIds);
  const xp=getQuestPoints(completedIds);
  useEffect(()=>{try{window.localStorage.setItem(STORAGE_KEY,JSON.stringify(record))}catch{}},[record]);
  const update=(id,value)=>setRecord(old=>({...old,[day]:{...(old[day]||{}),[id]:value}}));
  return <div className="hg-page">
    <div className="hg-heading"><div><p className="hg-overline">HEALTHGUARD / MISSION QUEST</p><h1>Health routine<span className="accent-punct">.</span></h1><p>A guided, gamified routine for a fictional astronaut. Tasks are manually reported, not verified by sensors.</p></div><span className="hg-pill">MISSION DAY / {day}</span></div>
    <div className="hg-routine-summary">
      <div className="hg-surface hg-score"><p className="hg-eyebrow">DAILY PROGRESS</p><div className="hg-score-big">{completion}%</div><div className="hg-progress-track"><div style={{width:completion+'%'}}/></div><small>{completedIds.length} of {QUESTS.length} tasks recorded complete</small></div>
      <div className="hg-surface hg-score"><p className="hg-eyebrow">MISSION XP</p><div className="hg-score-big">{xp}<small> XP</small></div><p>Earn XP for completing and documenting routines, never for achieving specific physiological values.</p></div>
      <div className="hg-surface hg-score"><p className="hg-eyebrow">MISSION BADGE</p><div className="hg-badge-icon"><Icon name={completion===100?'check':'shield'} size={28}/></div><strong>{completion===100?'Daily Mission Completed':'Routine in Progress'}</strong><p>No penalty for deferring a task when it cannot be completed safely.</p></div>
    </div>
    <div className="hg-routine-list">{QUESTS.map((task,i)=><section className="hg-surface hg-quest" key={task.id}>
      <div className="hg-quest-header"><span className="hg-quest-number">{String(i+1).padStart(2,'0')}</span><div><span className="hg-eyebrow">{task.category}</span><h3>{task.name}</h3><p>{task.summary}</p></div><span className="hg-quest-xp">+{task.xp} XP</span></div>
      {opened===task.id&&<div className="hg-quest-instructions"><strong>How to complete</strong><p>{task.instructions}</p><p className="hg-quest-caution">{task.caution}</p></div>}
      <div className="hg-quest-controls"><button type="button" className="hg-ghost-btn" onClick={()=>setOpened(opened===task.id?'':task.id)}>{opened===task.id?'Hide instructions':'View instructions'}</button><button type="button" className="hg-ghost-btn" onClick={()=>update(task.id,'deferred')} aria-pressed={state[task.id]==='deferred'}>Defer / not available</button><button type="button" className={state[task.id]==='complete'?'hg-task-done':'hg-task-complete'} onClick={()=>update(task.id,state[task.id]==='complete'?null:'complete')} aria-pressed={state[task.id]==='complete'}>{state[task.id]==='complete'?'Recorded complete':'Mark complete'}</button></div>
      {state[task.id]==='deferred'&&<p className="hg-deferred">Deferred. No penalty. Resume when appropriate.</p>}
    </section>)}</div>
    <p className="hg-boundary">Mission Quest progress is stored only in this browser. It is not a medical record, treatment plan, certified completion log or real-time task notification service.</p>
  </div>;
}

export function MissionHUD({snapshot,selected,samples,review,connection,environment,onEnvironment,onExit}) {
  const last=snapshot?.subjects?.[selected]?.latest||samples.at(-1)||null;
  const env=ENVIRONMENTS.find(e=>e.id===environment)||ENVIRONMENTS[3];
  const [metricKey,setMetricKey]=useState(METRICS[0].key);
  const metric=METRICS.find(x=>x.key===metricKey)||METRICS[0];
  return <div className="hg-hud hg-page">
    <div className="hg-hud-top"><div><p className="hg-overline">HEALTHGUARD / FULL-SCREEN DISPLAY</p><h1>Mission HUD</h1><p>{env.name} · {CREW_NAMES[selected]||selected} · Fictional crew telemetry simulation</p></div><div className="hg-hud-actions"><EnvironmentPicker value={environment} onChange={onEnvironment} compact/><button className="hg-ghost-btn" type="button" onClick={onExit}>Back to dashboard</button></div></div>
    <div className="hg-hud-grid"><div className="hg-surface hg-hud-body"><div className="hg-panel-top"><h2>CREW / {crewNumber(selected)}</h2><span className="hg-pill">{CREW_NAMES[selected]||selected} · SIMULATED SUBJECT</span></div><AnatomyScene selected="cardiac" onSelect={()=>{}}/><div className="hg-hud-label">ROTATABLE EDUCATIONAL MODEL · NOT A MEDICAL SCAN</div></div><div className="hg-hud-right"><div className="hg-hud-vitals">{METRICS.map(m=><button type="button" key={m.key} className={metricKey===m.key?'active':''} onClick={()=>setMetricKey(m.key)}><span>{m.short}</span><strong>{formatValue(last?.values?.[m.key],m.digits)} <small>{m.unit}</small></strong></button>)}</div><div className="hg-surface hg-hud-chart"><div className="hg-panel-top"><h2>{metric.label}</h2><span className="hg-pill">{connection==='connected'?'STREAM CONNECTED':'RECONNECTING'}</span></div><VitalChart data={samples} metric={metric}/></div><div className="hg-surface hg-hud-review"><span className="hg-eyebrow">PHYSIOALERT / CURRENT REVIEW</span><h2>{friendlyStatus(review?.status)}</h2><p>{review?.reason||'Collecting simulated evidence.'}</p></div></div></div>
    <p className="hg-boundary">HUD demonstration only. No spacesuit, rover navigation, radiation or environmental sensor connection exists.</p>
  </div>;
}
