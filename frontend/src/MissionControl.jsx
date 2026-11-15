import React, { useEffect, useState } from 'react';
import { ENVIRONMENTS } from './HealthGuardPages.jsx';
import { METRICS, formatValue, friendlyStatus, readApi } from './api.js';
import { Icon } from './viz.jsx';
import MissionEnvironment3D from './MissionEnvironment3D.jsx';
import './missionControl.css';

const CREW = [
  { id: 'SIM_CREW_01', name: 'Cmdr. Elena Park', role: 'Commander', image: '/crew/elena.svg' },
  { id: 'SIM_CREW_02', name: 'Dr. Marcus Reed', role: 'Medical officer', image: '/crew/marcus.svg' },
  { id: 'SIM_CREW_03', name: 'Lt. Aisha Khan', role: 'Systems engineer', image: '/crew/aisha.svg' },
  { id: 'SIM_CREW_04', name: 'Spc. Daniel Cho', role: 'Mission specialist', image: '/crew/daniel.svg' }
];

const SCENES = {
  spacecraft: { icon: 'satellite', label: 'TRANSIT', title: 'Deep-space transit', subtitle: 'Spacecraft cabin', detail: 'In-transit operations and daily crew checks' },
  station: { icon: 'radio', label: 'ORBIT', title: 'Orbital station', subtitle: 'Space station', detail: 'Long-duration orbital operations' },
  rover: { icon: 'layers', label: 'EXCURSION', title: 'Surface exploration', subtitle: 'Surface rover', detail: 'Mobile expedition and crew check-ins' },
  lunar_base: { icon: 'satellite', label: 'LUNAR', title: 'Moon surface habitat', subtitle: 'Lunar base', detail: 'Lunar surface operations and EVA context' },
  mars_base: { icon: 'layers', label: 'MARTIAN', title: 'Mars surface habitat', subtitle: 'Mars habitat', detail: 'Long-duration surface operations' }
};

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

function EnvironmentScene({environment}) {
  const info=SCENES[environment]||SCENES.lunar_base;
  return <div className={'hgc-scene hgc-scene-'+environment} aria-label={info.title+' illustrative mission context'}>
    <div className="hgc-scene-stars" aria-hidden="true"/>
    {['mars_base','lunar_base','rover'].includes(environment)
      ? <div className="hgc-scene-model"><MissionEnvironment3D environment={environment}/></div>
      : <div className="hgc-orbit-art" aria-hidden="true">
          <span className="hgc-orbit-planet"/><span className="hgc-orbit-ring one"/><span className="hgc-orbit-ring two"/>
          <span className="hgc-orbit-craft"><Icon name="satellite" size={60}/></span>
        </div>}
    <div className="hgc-scene-head"><span>MISSION ENVIRONMENT</span><strong>{info.label} / SIMULATED</strong></div>
    <div className="hgc-scene-bottom"><div><small>{info.subtitle}</small><strong>{info.title}</strong></div><span>ILLUSTRATIVE 3D / CONCEPT</span></div>
  </div>;
}

export default function MissionControl({
  environment='lunar_base', onEnvironment=()=>{}, selected='SIM_CREW_01',
  onSelectCrew=()=>{}, snapshot, connection, readiness, unified, mission,
  onTelemetry=()=>{}, onScenario=()=>{}, onHUD=()=>{}
}) {
  const [engineering,setEngineering]=useState(null);
  const [engineeringError,setEngineeringError]=useState('');
  const [group,setGroup]=useState('All systems');
  const location=SCENES[environment]||SCENES.lunar_base;
  const person=CREW.find(c=>c.id===selected)||CREW[0];
  const last=snapshot?.subjects?.[selected]?.latest;
  const packet=last&&(!last.subject_id||last.subject_id===selected)?last:null;
  const availableCrew=CREW.filter(c=>Boolean(snapshot?.subjects?.[c.id]?.latest)).length;
  const connected=connection==='connected';
  const values=engineering?.values||{};
  const channels=engineering?.channels||{};
  const envAvailable=ENGINEERING.filter(m=>Number.isFinite(values[m.key])).length;
  const showHUD=environment==='mars_base'||environment==='lunar_base';
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
        <p>Explore mission settings, switch between astronauts, review simulated systems, and launch a training scenario.</p>
      </div>
      <div className="hgc-header-flags">
        <span className={connected?'hgc-flag is-on':'hgc-flag'}><i/>{connected?'SIMULATOR LINK ACTIVE':'SIMULATOR RECONNECTING'}</span>
        <span className={readiness?.models_loaded?'hgc-flag is-on':'hgc-flag'}><Icon name="shield" size={13}/>{readiness?.models_loaded?'MODELS LOADED':'MODEL STATUS UNKNOWN'}</span>
      </div>
    </header>

    <section className="hgc-environments" aria-label="Choose a fictional mission environment">
      <div className="hgc-section-title"><div><small>01 / MISSION CONTEXT</small><h2>Select an environment</h2></div><span>Changing this view never changes the physiological model or measurements.</span></div>
      <div className="hgc-environment-grid">{ENVIRONMENTS.map(e=>{
        const item=SCENES[e.id];
        return <button key={e.id} type="button" className={'hgc-environment '+(environment===e.id?'selected':'')} aria-pressed={environment===e.id} onClick={()=>onEnvironment(e.id)}>
          <span className="hgc-environment-icon"><Icon name={item.icon} size={20}/></span>
          <strong>{e.name}</strong><small>{item.label}</small>
          <span className="hgc-environment-check"><Icon name={environment===e.id?'check':'arrow'} size={14}/></span>
        </button>;
      })}</div>
    </section>

    <div className="hgc-primary-grid">
      <div className="hgc-main-column">
        <EnvironmentScene environment={environment}/>
        <div className="hgc-action-strip" aria-label="Mission tools">
          <div><span>ACTIVE MISSION</span><strong>{location.subtitle}</strong><small>{location.detail}</small></div>
          <button type="button" onClick={onScenario}><Icon name="activity" size={16}/> Scenario Lab</button>
          <button type="button" onClick={onTelemetry}><Icon name="pulse" size={16}/> Crew telemetry</button>
          {showHUD&&<button type="button" className="hgc-action-primary" onClick={onHUD}><Icon name="radio" size={16}/> Enter suit HUD</button>}
        </div>
      </div>

      <section className="hgc-crew-panel">
        <div className="hgc-panel-heading"><div><small>02 / CREW OPERATIONS</small><h2>Active crew</h2></div><span>{availableCrew} / 4 with packets</span></div>
        <div className="hgc-crew-choices">{CREW.map(c=>{
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
        </div>
      </section>
    </div>

    <section className="hgc-engineering">
      <div className="hgc-section-title"><div><small>03 / SYSTEM TELEMETRY</small><h2>Engineering and environment</h2></div><span>{envAvailable} of 8 fictional engineering channels reporting for {person.name}</span></div>
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

    <section className="hgc-bottom-grid">
      <div className="hgc-boundary-panel"><div className="hgc-panel-heading"><div><small>04 / CONNECTION BOUNDARIES</small><h2>Not connected to flight hardware</h2></div><Icon name="shield" size={19}/></div>
        <p>No real suit-pressure, suit-battery, navigation, communications-delay, or mission dosimeter feed is connected. Illustrative engineering values must not be treated as measured flight conditions.</p>
        <div className="hgc-unconnected">{['Suit pressure sensor','Suit battery telemetry','Navigation and position','Communications delay','Real spacecraft data'].map(s=><span key={s}><i/>{s}<b>UNCONNECTED</b></span>)}</div>
      </div>
      <div className="hgc-next-panel"><small>MISSION WORKFLOW</small><h2>Ready to test a scenario?</h2><p>Choose one of seven scripted training events in Scenario Lab, then examine the backend's CNN, covariance, and PhysioAlert evidence for the selected fictional astronaut.</p>
        <button type="button" onClick={onScenario}>Open Scenario Lab <Icon name="arrow" size={17}/></button>
        <span>Scenario playback is isolated from the live crew telemetry stream.</span>
      </div>
    </section>
    <p className="hgc-disclaimer">Research prototype. All live physiological and engineering values here are fictional. NASA historical research data is accessed separately in the Health Library.</p>
  </div>;
}
