import React, { useEffect, useRef, useState } from 'react';
import { METRICS, formatValue, readApi } from './api.js';
import { Icon } from './viz.jsx';
import MissionEnvironment3D from './MissionEnvironment3D.jsx';
import './missionVisorHUD.css';

// A first-person concept of HealthGuard inside an EVA suit.
// Photographs and 3D objects are scenery, not live cameras or navigation data.
const CREW = [
  ['SIM_CREW_01', 'Cmdr. Elena Park'],
  ['SIM_CREW_02', 'Dr. Marcus Reed'],
  ['SIM_CREW_03', 'Lt. Aisha Khan'],
  ['SIM_CREW_04', 'Spc. Daniel Cho']
];

const LOCATIONS = {
  mars_base: {
    tab: 'Mars suit',
    title: 'MARS / SURFACE EVA',
    caption: 'Mars habitat approach',
    background: 'https://assets.science.nasa.gov/dynamicimage/assets/science/psd/photojournal/pia/pia23/pia23727/PIA23727.jpg?crop=faces%2Cfocalpoint&fit=clip&h=1500&w=2500',
    credit: 'NASA/JPL-Caltech/ASU/MSSS',
    source: 'https://science.nasa.gov/photojournal/perseverances-mastcam-z-first-high-resolution-panorama/'
  },
  lunar_base: {
    tab: 'Moon suit',
    title: 'MOON / SURFACE EVA',
    caption: 'Lunar habitat approach',
    background: 'https://assets.science.nasa.gov/content/dam/science/missions/hubble/releases/2005/10/STScI-01EVVM9G0CWEZJSKM1YBTQDZ76.tif/jcr%3Acontent/renditions/4196x2085.jpg',
    credit: 'NASA / Apollo 17 lunar reference',
    source: 'https://science.nasa.gov/asset/hubble/apollo-17-astronauts-snapshot-of-taurus-littrow-valley/'
  }
};

const SUIT_SYSTEMS = [
  { key:'suit_o2_remaining_percent',label:'O₂ reserve',digits:1,unit:'%',kind:'scripted',icon:'wind' },
  { key:'suit_pressure',label:'Suit pressure',digits:1,unit:'',kind:'unconnected',icon:'activity' },
  { key:'suit_battery',label:'Suit battery',digits:0,unit:'',kind:'unconnected',icon:'pulse' },
  { key:'radiation_rate_usv_h',label:'Radiation rate',digits:3,unit:'µSv/h',kind:'scripted',icon:'shield' },
  { key:'cabin_co2_ppm',label:'Habitat CO₂',digits:0,unit:'ppm',kind:'remote',icon:'wind' }
];

function Trace({samples,metric}) {
  const values=samples.slice(-45).map(x=>x?.values?.[metric.key]).filter(Number.isFinite);
  if(values.length<2) return <span className="hgv-trace-empty">Collecting</span>;
  const bottom=Math.min(...values),top=Math.max(...values);
  const amplitude=Math.max(top-bottom,Math.abs(top)*0.014,.2);
  const points=values.map((v,i)=>{
    const x=3+i*144/(values.length-1);
    const y=33-((v-bottom+amplitude*.2)/(Math.max(top-bottom,amplitude*.5)+amplitude*.4))*26;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return <svg className="hgv-trace" viewBox="0 0 150 38" aria-label={'Recent fictional '+metric.label+' samples'} role="img"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/></svg>;
}

function SignalRow({metric,value,samples,selected,onSelect}) {
  return <button type="button" className={'hgv-signal'+(selected?' active':'')} onClick={onSelect} aria-pressed={selected} title={'Inspect '+metric.label}>
    <span className="hgv-signal-glyph"><Icon name={metric.glyph} size={21}/></span>
    <span className="hgv-signal-copy"><small>{metric.short}</small><strong>{formatValue(value,metric.digits)} <em>{metric.unit}</em></strong></span>
    {metric.key==='heart_rate_bpm'&&<Trace samples={samples} metric={metric}/>}
  </button>;
}

function SystemRow({system,value}) {
  const available=system.kind!=='unconnected'&&typeof value==='number'&&Number.isFinite(value);
  return <div className="hgv-system-row">
    <span className="hgv-system-icon"><Icon name={system.icon} size={20}/></span>
    <span className="hgv-system-text"><small>{system.label}</small><strong>{available?formatValue(value,system.digits):'—'} <em>{available?system.unit:''}</em></strong></span>
    <span className="hgv-system-source">{system.kind==='unconnected'?'NO FEED':system.kind==='remote'?'HABITAT SIM':'SCRIPTED'}</span>
  </div>;
}

export default function MissionVisorHUD({
  snapshot, selected, onSelectCrew, samples=[], review, unified, connection,
  environment, onEnvironment, onExit
}) {
  const root=useRef(null);
  const [engineering,setEngineering]=useState(null);
  const [engineeringError,setEngineeringError]=useState(false);
  const [selectedMetric,setSelectedMetric]=useState('heart_rate_bpm');
  const [voiceEnabled,setVoiceEnabled]=useState(false);
  const [fullscreen,setFullscreen]=useState(false);
  const [sceneFailed,setSceneFailed]=useState(false);
  const current=environment==='mars_base'||environment==='rover'?'mars_base':'lunar_base';
  const location=LOCATIONS[current];
  const latest=snapshot?.subjects?.[selected]?.latest||samples.at(-1)||null;
  const metric=METRICS.find(m=>m.key===selectedMetric)||METRICS[0];
  const crew=CREW.find(c=>c[0]===selected)?.[1]||'Selected astronaut';
  const reviewForCrew=unified?.classification_domain==='FICTIONAL_MISSION_TRAINING_ONLY' &&
    (!unified?.subject_id||unified.subject_id===selected)?unified:null;
  const severity=['OPTIMAL','CHECK','WARNING','CRITICAL'].includes(reviewForCrew?.status)
    ?reviewForCrew.status:'UNASSESSED';
  const critical=severity==='CRITICAL';
  const systems=engineering?.values||{};
  const isConnected=connection==='connected'&&Boolean(latest);
  const statusText=severity==='OPTIMAL'?'No pattern flag':severity==='UNASSESSED'?'Awaiting review':severity+' · training';
  const explanation=reviewForCrew?.reason||review?.reason||'Collecting context and model evidence.';

  useEffect(()=>setSceneFailed(false),[current]);

  useEffect(()=>{
    let cancelled=false;
    setEngineering(null);
    setEngineeringError(false);
    const fetchEngineering=()=>readApi('/api/simulation/engineering/'+encodeURIComponent(selected))
      .then(result=>{if(!cancelled){setEngineering(result);setEngineeringError(false)}})
      .catch(()=>{if(!cancelled){setEngineering(null);setEngineeringError(true)}});
    fetchEngineering();
    const timer=setInterval(fetchEngineering,5000);
    return()=>{cancelled=true;clearInterval(timer)};
  },[selected]);

  useEffect(()=>{
    const sync=()=>setFullscreen(document.fullscreenElement===root.current);
    document.addEventListener('fullscreenchange',sync);
    return()=>document.removeEventListener('fullscreenchange',sync);
  },[]);

  useEffect(()=>{
    if(!critical||!voiceEnabled||typeof window==='undefined'||!window.speechSynthesis)return;
    let cancelled=false,timeout;
    const speech=reviewForCrew?.voice_ready_script||'HealthGuard critical training flag. Review simulated telemetry and verify the measurement context.';
    const announce=()=>{
      if(cancelled)return;
      window.speechSynthesis.cancel();
      const utterance=new SpeechSynthesisUtterance(speech);
      utterance.lang='en-US';utterance.rate=.93;
      const repeat=()=>{if(!cancelled)timeout=setTimeout(announce,5000)};
      utterance.onend=repeat;utterance.onerror=repeat;
      window.speechSynthesis.speak(utterance);
    };
    announce();
    return()=>{cancelled=true;clearTimeout(timeout);window.speechSynthesis.cancel()};
  },[critical,voiceEnabled,selected,reviewForCrew?.voice_ready_script]);

  async function toggleFullscreen(){
    try{if(document.fullscreenElement)await document.exitFullscreen();else await root.current?.requestFullscreen()}catch{}
  }

  return <section ref={root} className={'hgv-screen hgv-env-'+current} aria-label="HealthGuard first-person suit HUD demonstration">
    <div className="hgv-control-bar">
      <div className="hgv-control-title"><Icon name="shield" size={17}/><strong>HealthGuard</strong><span>Mission HUD / EVA suit simulation</span></div>
      <div className="hgv-control-actions">
        <div className="hgv-environment-tabs" role="group" aria-label="Suit HUD environment">
          {Object.entries(LOCATIONS).map(([id,config])=><button type="button" key={id} onClick={()=>onEnvironment(id)} aria-pressed={current===id} className={current===id?'active':''}>{config.tab}</button>)}
        </div>
        <label className="hgv-crew-picker"><span className="sr-only">Selected astronaut</span><select value={selected} onChange={e=>onSelectCrew(e.target.value)}>{CREW.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
        <button className={'hgv-tool-button'+(voiceEnabled?' active':'')} type="button" onClick={()=>setVoiceEnabled(v=>!v)} aria-pressed={voiceEnabled} title="Toggle critical training voice alerts"><Icon name={voiceEnabled?'volume':'mute'} size={16}/><span>Voice {voiceEnabled?'on':'off'}</span></button>
        <button className="hgv-tool-button" type="button" onClick={toggleFullscreen}>{fullscreen?'Exit full view':'Full screen'}</button>
        <button className="hgv-tool-button hgv-exit" type="button" onClick={onExit}><Icon name="x" size={15}/>Exit HUD</button>
      </div>
    </div>

    <div className="hgv-helmet" role="group" aria-label={location.tab+' visor view'}>
      <div className="hgv-visor">
        <div className="hgv-world" aria-hidden="true">
          {!sceneFailed&&<img className="hgv-landscape" key={current} src={location.background} alt="" onError={()=>setSceneFailed(true)} loading="eager"/>}
          <div className="hgv-world-shade"/>
          <MissionEnvironment3D environment={current} interactive={false}/>
        </div>
        <div className="hgv-visor-reflection" aria-hidden="true"/>
        <div className="hgv-overlay">
          <div className="hgv-topline">
            <div className="hgv-location"><span>EVA VIEW / SIMULATION</span><strong>{location.title}</strong><small>{crew}</small></div>
            <div className="hgv-brand">
              <div className="hgv-brand-name"><Icon name="shield" size={25}/><strong>HEALTH<span>GUARD</span></strong></div>
              <span>ASTRONAUT HEALTH MONITORING</span>
              <div className={'hgv-physioalert hgv-alert-'+severity.toLowerCase()} role="status" aria-live="polite"><Icon name={critical?'alert':severity==='OPTIMAL'?'check':'shield'} size={17}/><strong>PHYSIOALERT</strong><span>{statusText}</span></div>
            </div>
            <div className="hgv-telemetry"><span>{isConnected?'SIMULATOR CONNECTED':'AWAITING TELEMETRY'}</span><strong>{latest?.sequence!=null?'SAMPLE #'+latest.sequence:'NO LIVE PACKET'}</strong><small>NOT A REAL SPACESUIT FEED</small></div>
          </div>
          <div className="hgv-sides">
            <aside className="hgv-panel hgv-panel-left" aria-label="Fictional physiological signals">
              <div className="hgv-panel-heading"><Icon name="activity" size={16}/><strong>BIOMETRICS</strong><span>LIVE SIM</span></div>
              {METRICS.map(m=><SignalRow key={m.key} metric={m} value={latest?.values?.[m.key]} samples={samples} selected={selectedMetric===m.key} onSelect={()=>setSelectedMetric(m.key)}/>)}
            </aside>
            <div className="hgv-focus" aria-hidden="true">
              <div className="hgv-focus-marker"><span/><span/><span/><span/></div>
              <div className="hgv-focus-annotation"><strong>{location.caption}</strong><small>ILLUSTRATIVE ENVIRONMENT · NO NAVIGATION FIX</small></div>
            </div>
            <aside className="hgv-panel hgv-panel-right" aria-label="Fictional suit and environment telemetry">
              <div className="hgv-panel-heading"><Icon name="shield" size={16}/><strong>SUIT & LIFE SUPPORT</strong><span>DEMO</span></div>
              {SUIT_SYSTEMS.map(m=><SystemRow key={m.key} system={m} value={systems[m.key]}/>)}
              <small className="hgv-system-warning">{engineeringError?'ENGINEERING FEED UNAVAILABLE':'SUIT METRICS ARE SCRIPTED OR UNCONNECTED'}</small>
            </aside>
          </div>
          <div className="hgv-bottomline">
            <div className="hgv-trend-box"><span><Icon name="pulse" size={16}/>{metric.label.toUpperCase()} · SIMULATED TREND</span><Trace samples={samples} metric={metric}/></div>
            <div className="hgv-compass"><div className="hgv-ticks" aria-hidden="true"/><span>HEADING / RANGE UNAVAILABLE</span></div>
            <div className={'hgv-review-note'+(critical?' critical':'')}><span>MONITOR SUMMARY</span><p>{explanation}</p></div>
          </div>
        </div>
      </div>
      <div className="hgv-helmet-lower" aria-hidden="true"><div className="hgv-helmet-badge"><Icon name="shield" size={16}/></div></div>
    </div>
    <footer className="hgv-disclaimer"><span>First-person concept only. Fictional crew, synthetic physiology and separately scripted engineering estimates. Not an operational suit HUD, medical device or navigation display.</span><a href={location.source} target="_blank" rel="noreferrer">Landscape reference: {location.credit}</a></footer>
  </section>;
}
