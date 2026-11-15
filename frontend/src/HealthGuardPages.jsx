import React, { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { AnatomyViewer } from 'open-anatomy-3d-react';
import { ANATOMY_STRUCTURES } from 'open-anatomy-3d';
import 'open-anatomy-3d-react/styles.css';
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


const SYSTEM_COLORS = {
  cardiac:'#ff8e9c', respiratory:'#6ee3ed', thermal:'#f6c28c',
  brain:'#b7a4ff', renal:'#f1c17c', movement:'#73d9ce'
};

function HoloPart({position,scale,rotation=[0,0,0],kind='sphere',zone,color='#54bfcf',
  selected,onSelect,opacity=.35,wire=false}) {
  const highlighted=Boolean(zone&&zone===selected);
  const clickable=Boolean(zone&&onSelect);
  return <mesh position={position} rotation={rotation} scale={scale}
    onClick={clickable?(e=>{e.stopPropagation();onSelect(zone)}):undefined}>
    {kind==='capsule'?<capsuleGeometry args={[.62,1.1,8,18]}/>:
      kind==='cylinder'?<cylinderGeometry args={[1,1,1,16]}/>:
      kind==='torus'?<torusGeometry args={[1,.012,6,56]}/>:
      <sphereGeometry args={[1,28,22]}/>}
    <meshStandardMaterial color={highlighted?SYSTEM_COLORS[zone]:color}
      transparent opacity={highlighted?.92:opacity} roughness={.36}
      metalness={.25} wireframe={wire} depthWrite={false}
      emissive={highlighted?SYSTEM_COLORS[zone]:'#061b2a'}
      emissiveIntensity={highlighted?.34:.07} side={2}/>
  </mesh>;
}
function Figure({selected,onSelect}) {
  const shell=[
    [[0,1.64,0],[.3,.35,.29],null,'brain'],
    [[0,1.19,0],[.125,.17,.125],null,'thermal'],
    [[0,.48,0],[.6,.79,.36],null,'thermal'],
    [[0,-.4,0],[.47,.33,.32],null,'thermal'],
    [[-.68,.57,0],[.17,.47,.17],[0,0,-.35],'movement'],
    [[.68,.57,0],[.17,.47,.17],[0,0,.35],'movement'],
    [[-.92,-.09,0],[.135,.43,.14],[0,0,-.19],'movement'],
    [[.92,-.09,0],[.135,.43,.14],[0,0,.19],'movement'],
    [[-.99,-.53,.02],[.13,.17,.12],null,'movement'],
    [[.99,-.53,.02],[.13,.17,.12],null,'movement'],
    [[-.27,-1.01,0],[.23,.57,.23],[0,0,-.06],'movement'],
    [[.27,-1.01,0],[.23,.57,.23],[0,0,.06],'movement'],
    [[-.28,-1.69,0],[.17,.45,.17],null,'movement'],
    [[.28,-1.69,0],[.17,.45,.17],null,'movement'],
    [[-.29,-2.07,.14],[.21,.12,.37],null,'movement'],
    [[.29,-2.07,.14],[.21,.12,.37],null,'movement']
  ];
  return <group position={[0,.10,0]}>
    {shell.map(([position,scale,rotation,zone],i)=><React.Fragment key={'shell-'+i}>
      <HoloPart position={position} scale={scale} rotation={rotation||[0,0,0]} zone={zone}
        onSelect={onSelect} selected={selected} color="#26748b" opacity={.12}/>
      <HoloPart position={position} scale={scale.map(s=>s*1.014)} rotation={rotation||[0,0,0]}
        color="#5cbbcd" opacity={.16} wire/>
    </React.Fragment>)}
    <HoloPart position={[0,1.71,.10]} scale={[.23,.19,.18]} zone="brain"
      onSelect={onSelect} selected={selected} color="#8076c0" opacity={.72}/>
    <HoloPart position={[0,1.67,.29]} scale={[.18,.085,.022]} color="#a9a0e9" opacity={.28} wire/>
    {[-.215,.215].map((x,i)=><HoloPart key={'lung-'+i} position={[x,.62,.23]}
      scale={[.21,.34,.145]} zone="respiratory" onSelect={onSelect} selected={selected}
      color="#3c9bad" opacity={.77}/>)}
    <HoloPart position={[.066,.53,.38]} rotation={[0,0,-.24]} scale={[.15,.185,.13]}
      zone="cardiac" onSelect={onSelect} selected={selected} color="#d86f83" opacity={.9}/>
    {[-.29,.29].map((x,i)=><HoloPart key={'kidney-'+i} position={[x,-.17,.235]}
      rotation={[0,0,x<0?-.22:.22]} scale={[.12,.16,.10]}
      zone="renal" onSelect={onSelect} selected={selected} color="#cf9464" opacity={.85}/>)}
    {Array.from({length:12},(_,i)=><HoloPart key={'spine-'+i}
      position={[0,.95-i*.17,.075]} scale={[.085,.071,.075]} color="#91cbd2" opacity={.52}/>)}
    {Array.from({length:5},(_,i)=><HoloPart key={'rib-'+i}
      kind="torus" position={[0,.82-i*.15,.07]} rotation={[Math.PI/2,0,0]}
      scale={[.33+i*.028,.29,1]} color="#69a8b8" opacity={.4}/>)}
    <HoloPart kind="torus" position={[0,-2.28,0]} rotation={[Math.PI/2,0,0]}
      scale={[1.03,.78,1]} color="#3ad4de" opacity={.5}/>
    <HoloPart kind="torus" position={[0,-2.28,0]} rotation={[Math.PI/2,0,0]}
      scale={[.72,.48,1]} color="#3ad4de" opacity={.23}/>
  </group>;
}

const HG_ANATOMY_LAYERS = Object.freeze({
  skin:true, skeleton:true, joints:false, muscles:false, organs:true, vessels:true, nerves:false,
});
const HG_ANATOMY_KEYS = {
  cardiac: ['Cardiovascular'],
  respiratory: ['Respiratory'],
  brain: ['Neurological','Eye / Sensory'],
  renal: ['Renal / Urinary'],
  movement: ['Musculoskeletal'],
  thermal: ['Skin','Endocrine']
};
export function AnatomyScene({selected='cardiac',onSelect=()=>{},sex='male',
  layers=HG_ANATOMY_LAYERS,onLayersChange}) {
  const keys=useMemo(()=>ANATOMY_STRUCTURES
    .filter(s=>(HG_ANATOMY_KEYS[selected]||[]).includes(s.category))
    .map(s=>s.key),[selected]);
  const handleStructure=(key,structure)=>{
    const category=structure?.category||'';
    const zone=Object.entries(HG_ANATOMY_KEYS).find(([,categories])=>categories.includes(category))?.[0];
    if(zone)onSelect(zone);
  };
  return <div className="hg-three-shell hg-real-anatomy">
    <div className="hg-three-crosshair" aria-hidden="true"/>
    <AnatomyViewer
      sex={sex} layers={layers} onLayersChange={onLayersChange}
      modelUrls={{male:'/models/anatomy-male.glb',female:'/models/anatomy-female.glb'}}
      highlightedKeys={keys} onStructureClick={handleStructure}
      showSexToggle={false} showLayerToggles={false} showRotateControl={false}
      showZoomControls={true} hoverColor="#75dfe9" highlightColor="#60d6df"
      hoverHint="Click to explore this system" className="hg-anatomy-viewer"
    />
    <div className="hg-three-caption">DRAG TO ROTATE · ZOOM WITH + / − · SELECT ANATOMY</div>
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
