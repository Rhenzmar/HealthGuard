import React, { useEffect, useState } from 'react';
import { METRICS, formatValue, friendlyStatus, readApi } from './api.js';
import { Icon } from './viz.jsx';
import './missionControl.css';

const CREW = [
  { id: 'SIM_CREW_01', name: 'Cmdr. Elena Park', role: 'Commander', image: '/crew/elena.svg' },
  { id: 'SIM_CREW_02', name: 'Dr. Marcus Reed', role: 'Medical officer', image: '/crew/marcus.svg' },
  { id: 'SIM_CREW_03', name: 'Lt. Aisha Khan', role: 'Systems engineer', image: '/crew/aisha.svg' },
  { id: 'SIM_CREW_04', name: 'Spc. Daniel Cho', role: 'Mission specialist', image: '/crew/daniel.svg' }
];

const ENGINEERING = [
  {key:'cabin_co2_ppm', label:'Cabin CO₂', unit:'ppm', digits:0, icon:'wind', group:'Atmosphere'},
  {key:'cabin_o2_percent', label:'Cabin oxygen', unit:'%', digits:1, icon:'wind', group:'Atmosphere'},
  {key:'cabin_pressure_kpa', label:'Cabin pressure', unit:'kPa', digits:1, icon:'activity', group:'Atmosphere'},
  {key:'cabin_temp_c', label:'Cabin temperature', unit:'°C', digits:1, icon:'thermometer', group:'Atmosphere'},
  {key:'cabin_humidity_percent', label:'Cabin humidity', unit:'%', digits:1, icon:'wind', group:'Atmosphere'},
  {key:'radiation_rate_usv_h', label:'Radiation rate', unit:'µSv/h', digits:3, icon:'shield', group:'Radiation'},
  {key:'cumulative_dose_usv', label:'Accumulated dose', unit:'µSv', digits:3, icon:'shield', group:'Radiation'},
  {key:'suit_o2_remaining_percent', label:'Suit O₂ reserve', unit:'%', digits:1, icon:'wind', group:'Suit'}
];

const ESTIMATES = [
  {key:'systolic_bp_mmhg', label:'Systolic BP', unit:'mmHg', digits:0},
  {key:'diastolic_bp_mmhg', label:'Diastolic BP', unit:'mmHg', digits:0},
  {key:'etco2_mmhg', label:'End-tidal CO₂', unit:'mmHg', digits:1},
  {key:'peripheral_temp_c', label:'Peripheral temperature', unit:'°C', digits:1}
];

function SourceTag({available}) {
  return <span className={'hgc-source ' + (available?'hgc-source-sim':'hgc-source-off')}>
    {available?'SIMULATED':'NO DATA'}
  </span>;
}

export default function MissionControl({
  selected='SIM_CREW_01', onSelectCrew=()=>{}, snapshot, connection,
  readiness, unified, onTelemetry=()=>{}, onScenario=()=>{}
}) {
  const [engineering,setEngineering]=useState(null);
  const [engineeringError,setEngineeringError]=useState('');
  const [group,setGroup]=useState('All systems');
  const person=CREW.find(c=>c.id===selected)||CREW[0];
  const last=snapshot?.subjects?.[selected]?.latest;
  const packet=last&&(!last.subject_id||last.subject_id===selected)?last:null;
  const availableCrew=CREW.filter(c=>Boolean(snapshot?.subjects?.[c.id]?.latest)).length;
  const connected=connection==='connected';
  const values=engineering?.values||{};
  const channels=engineering?.channels||{};
  const envAvailable=ENGINEERING.filter(m=>Number.isFinite(values[m.key])).length;
  const reviewStatus=unified?.subject_id===selected ? unified.status : null;

  useEffect(()=>{
    let cancelled=false;
    setEngineering(null);
    setEngineeringError('');
    const controller=new AbortController();
    async function load(){
      try{
        const data=await readApi('/api/simulation/engineering/'+encodeURIComponent(selected),controller.signal);
        if(!cancelled){setEngineering(data);setEngineeringError('');}
      }catch(error){
        if(!cancelled && error.name!=='AbortError')setEngineeringError('Engineering simulator unavailable. No readings are being substituted.');
      }
    }
    load();
    const timer=setInterval(load,4500);
    return()=>{cancelled=true;clearInterval(timer);controller.abort();};
  },[selected]);

  const shown=group==='All systems'?ENGINEERING:ENGINEERING.filter(m=>m.group===group);
  return <div className="hgc-page">
    <header className="hgc-header">
      <div><span className="hgc-kicker">HEALTHGUARD / FLIGHT OPERATIONS</span>
        <h1>Mission Control<span>.</span></h1>
        <p>Monitor the fictional crew and inspect simulated engineering systems. Mission environments and EVA visuals are available in Mission HUD.</p>
      </div>
      <div className="hgc-header-actions" aria-label="Mission Control tools">
        <button type="button" onClick={onScenario}><Icon name="activity" size={16}/> Open Scenario Lab</button>
        <button type="button" onClick={onTelemetry}><Icon name="pulse" size={16}/> Crew telemetry</button>
      </div>
    </header>

    <div className="hgc-topline">
      <span className={connected?'hgc-flag is-on':'hgc-flag'}><i/>{connected?'SIMULATOR LINK ACTIVE':'SIMULATOR RECONNECTING'}</span>
      <span className={readiness?.models_loaded?'hgc-flag is-on':'hgc-flag'}><Icon name="shield" size={13}/>{readiness?.models_loaded?'MODELS LOADED':'MODEL STATUS UNKNOWN'}</span>
    </div>

    <div className="hgc-primary-grid">
      <section className="hgc-crew-panel hgc-crew-panel-wide">
        <div className="hgc-panel-heading"><div><small>01 / CREW OPERATIONS</small><h2>Active crew</h2></div><span>{availableCrew} / 4 with packets</span></div>
        <div className="hgc-crew-overview"><div className="hgc-crew-choices">{CREW.map(c=>{
          const hasData=Boolean(snapshot?.subjects?.[c.id]?.latest);
          return <button type="button" key={c.id} className={'hgc-crew-choice '+(selected===c.id?'selected':'')} aria-pressed={selected===c.id} onClick={()=>onSelectCrew(c.id)}>
            <img src={c.image} alt=""/><span><strong>{c.name}</strong><small>{c.role}</small></span><span className={'hgc-crew-dot '+(hasData?'has-data':'')} title={hasData?'Fictional packet available':'Awaiting simulator packet'}/>
          </button>;
        })}</div>
        <div className="hgc-crew-reading">
          <div className="hgc-crew-reading-head"><strong>{person.name}</strong><SourceTag available={Boolean(packet)}/></div>
          <div className="hgc-vital-pairs">{METRICS.map(m=><div key={m.key}><span>{m.short}</span><strong>{formatValue(packet?.values?.[m.key],m.digits)} <small>{m.unit}</small></strong></div>)}</div>
          <div className="hgc-review"><Icon name="shield" size={16}/><span>PhysioAlert</span><strong>{reviewStatus?friendlyStatus(reviewStatus):'Awaiting review'}</strong></div>
          <p>Fictional crew only. Status flags are research/training indicators, not medical diagnoses.</p>
        </div></div>
      </section>
    </div>

    <section className="hgc-engineering">
      <div className="hgc-section-title"><div><small>02 / SYSTEM TELEMETRY</small><h2>Engineering and environment</h2></div><span>{envAvailable} of 8 fictional engineering channels reporting for {person.name}</span></div>
      <div className="hgc-engineering-toolbar"><p>Scripted simulator estimates, not spacecraft measurements. These values are separate from the physiological CNN.</p>
        <div role="group" aria-label="Filter mission system channels">{['All systems','Atmosphere','Radiation','Suit'].map(item=><button key={item} type="button" aria-pressed={group===item} onClick={()=>setGroup(item)} className={group===item?'selected':''}>{item}</button>)}</div>
      </div>
      {engineeringError&&<p className="hgc-data-error" role="status">{engineeringError}</p>}
      <div className="hgc-engineering-grid">{shown.map(m=><div className="hgc-system-tile" key={m.key}>
        <div className="hgc-tile-top"><Icon name={m.icon} size={19}/><SourceTag available={Number.isFinite(values[m.key])}/></div>
        <span>{channels[m.key]?.label||m.label}</span>
        <strong>{formatValue(values[m.key],m.digits)} <small>{channels[m.key]?.unit||m.unit}</small></strong>
        <small>{m.group} / synthetic estimate</small>
      </div>)}</div>
      <div className="hgc-estimates">
        <div><strong>Additional physiological estimates</strong><p>Four separate simulated estimates, not part of the original five-channel physiological stream.</p></div>
        <div className="hgc-estimate-grid">{ESTIMATES.map(m=><div key={m.key}><span>{channels[m.key]?.label||m.label}</span><strong>{formatValue(values[m.key],m.digits)} <small>{channels[m.key]?.unit||m.unit}</small></strong></div>)}</div>
      </div>
    </section>

    <section className="hgc-training-panel" aria-label="Mission scenario tools">
      <div className="hgc-training-identity">
        <span className="hgc-training-glyph"><Icon name="activity" size={23}/></span>
        <div className="hgc-training-copy">
          <span className="hgc-training-eyebrow">03 / TRAINING OPERATIONS</span>
          <h2>Scenario training</h2>
          <p>Rehearse simulated mission events and review CNN, covariance, and PhysioAlert responses. The live crew stream stays unchanged.</p>
        </div>
      </div>
      <div className="hgc-training-actions">
        <span className="hgc-training-count"><strong>07</strong> TRAINING SCENARIOS</span>
        <button type="button" onClick={onScenario}>Open Scenario Lab <Icon name="arrow" size={17}/></button>
      </div>
    </section>
    <p className="hgc-disclaimer">Research prototype. All live physiological and engineering values here are fictional. NASA historical research data is accessed separately in the Health Library.</p>
  </div>;
}
