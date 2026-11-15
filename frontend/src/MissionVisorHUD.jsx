import React, { useEffect, useMemo, useRef, useState } from 'react';
import { METRICS, formatValue, readApi } from './api.js';
import { Icon } from './viz.jsx';
import MissionEnvironment3D from './MissionEnvironment3D.jsx';
import './missionVisorHUD.css';

const CREW = [
  ['SIM_CREW_01', 'Cmdr. Elena Park'], ['SIM_CREW_02', 'Dr. Marcus Reed'],
  ['SIM_CREW_03', 'Lt. Aisha Khan'], ['SIM_CREW_04', 'Spc. Daniel Cho']
];
const SCENES = [
  {id:'spacecraft',name:'Spacecraft',subtitle:'In-transit vehicle'},
  {id:'station',name:'Space station',subtitle:'Orbital environment'},
  {id:'rover',name:'Surface rover',subtitle:'Mars exploration'},
  {id:'lunar_base',name:'Lunar base',subtitle:'Moon surface habitat'},
  {id:'mars_base',name:'Mars habitat',subtitle:'Mars surface habitat'}
];
// Reference imagery is scenery only; not a live camera or position feed.
const PHOTOS = {
  mars_base:{url:'https://assets.science.nasa.gov/dynamicimage/assets/science/psd/photojournal/pia/pia23/pia23727/PIA23727.jpg?crop=faces%2Cfocalpoint&fit=clip&h=1500&w=2500',source:'https://science.nasa.gov/photojournal/perseverances-mastcam-z-first-high-resolution-panorama/',credit:'NASA/JPL-Caltech/ASU/MSSS'},
  rover:{url:'https://assets.science.nasa.gov/dynamicimage/assets/science/psd/photojournal/pia/pia21/pia21723/PIA21723.jpg?crop=faces%2Cfocalpoint&fit=clip&h=1061&w=7000',source:'https://science.nasa.gov/photojournal/panorama-above-perseverance-valley-on-mars/',credit:'NASA/JPL-Caltech/Cornell/ASU'},
  lunar_base:{url:'https://assets.science.nasa.gov/content/dam/science/missions/hubble/releases/2005/10/STScI-01EVVM9G0CWEZJSKM1YBTQDZ76.tif/jcr%3Acontent/renditions/4196x2085.jpg',source:'https://science.nasa.gov/asset/hubble/apollo-17-astronauts-snapshot-of-taurus-littrow-valley/',credit:'NASA · lunar reference'},
  spacecraft:{url:'https://assets.science.nasa.gov/dynamicimage/assets/science/psd/mars/downloadable_items/3/8/38302_orion-spacecraft-earth-nasatv-camera.jpg?crop=faces%2Cfocalpoint&fit=clip&h=670&w=946',source:'https://science.nasa.gov/resource/view-of-earth-from-orion-spacecraft/',credit:'NASA · Orion Earth view'},
  station:{url:'https://www.esa.int/var/esa/storage/images/esa_multimedia/images/2012/03/windows_for_manned_spacecraft/10218393-2-eng-GB/Windows_for_manned_spacecraft.jpg',source:'https://www.esa.int/ESA_Multimedia/Images/2012/03/Windows_for_manned_spacecraft',credit:'ESA · ISS Cupola reference'}
};
const ENGINEERING = [
  {key:'suit_o2_remaining_percent',label:'Illustrated suit O₂ reserve',unit:'%',digits:1},
  {key:'cabin_o2_percent',label:'Cabin oxygen estimate',unit:'%',digits:2},
  {key:'cabin_pressure_kpa',label:'Cabin pressure estimate',unit:'kPa',digits:1},
  {key:'radiation_rate_usv_h',label:'Radiation illustration',unit:'µSv/h',digits:3}
];
function CompactTrace({samples,metric}) {
  const values = samples.slice(-48).map(x=>x?.values?.[metric.key]).filter(Number.isFinite);
  if(values.length<2) return <span className="hgv-chart-empty">Collecting valid samples</span>;
  const min=Math.min(...values),max=Math.max(...values),span=Math.max(max-min,Math.abs(max)*.012,.15);
  const points=values.map((v,i)=>`${3+i*394/(values.length-1)},${57-(v-(min-span*.24))/(span*1.48)*49}`).join(' ');
  return <svg viewBox="0 0 400 62" role="img" aria-label={`Recent fictional ${metric.label} trend`} preserveAspectRatio="none">
    <line x1="0" x2="400" y1="55" y2="55" stroke="#3a6472" strokeDasharray="4 7" opacity=".45"/>
    <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}

export default function MissionVisorHUD({snapshot,selected,onSelectCrew,samples=[],review,unified,connection,environment,onEnvironment,onExit}) {
  const root=useRef(null);
  const [engineering,setEngineering]=useState(null);
  const [engineeringError,setEngineeringError]=useState(false);
  const [metricKey,setMetricKey]=useState('heart_rate_bpm');
  const [voiceEnabled,setVoiceEnabled]=useState(false);
  const [fullscreen,setFullscreen]=useState(false);
  const [photoFailed,setPhotoFailed]=useState(false);
  const latest=snapshot?.subjects?.[selected]?.latest || samples.at(-1) || null;
  const crewName=CREW.find(x=>x[0]===selected)?.[1] || 'Selected crew';
  const scene=SCENES.find(x=>x.id===environment)||SCENES[3];
  const photo=PHOTOS[environment]||PHOTOS.lunar_base;
  const metric=METRICS.find(m=>m.key===metricKey)||METRICS[0];
  const classified=unified?.classification_domain==='FICTIONAL_MISSION_TRAINING_ONLY' &&
    (!unified.subject_id || unified.subject_id===selected) ? unified : null;
  const level=['OPTIMAL','CHECK','WARNING','CRITICAL'].includes(classified?.status)?classified.status:'UNASSESSED';
  const critical=level==='CRITICAL';
  const summary=classified?.reason||review?.reason||'Awaiting model and context evidence from the simulator.';
  const sampleNumber=latest?.sequence != null ? '#'+latest.sequence : 'Waiting for stream';

  useEffect(()=>{setPhotoFailed(false)},[environment]);
  useEffect(()=>{
    let cancelled=false;
    setEngineering(null);setEngineeringError(false);
    function load(){readApi('/api/simulation/engineering/'+encodeURIComponent(selected)).then(r=>{if(!cancelled){setEngineering(r);setEngineeringError(false)}}).catch(()=>{if(!cancelled){setEngineering(null);setEngineeringError(true)}})}
    load();const timer=setInterval(load,5000);
    return()=>{cancelled=true;clearInterval(timer)};
  },[selected]);
  useEffect(()=>{
    const sync=()=>setFullscreen(document.fullscreenElement===root.current);
    document.addEventListener('fullscreenchange',sync);
    return()=>document.removeEventListener('fullscreenchange',sync);
  },[]);
  useEffect(()=>{
    if(!voiceEnabled||!critical||typeof window==='undefined'||!window.speechSynthesis)return;
    let cancelled=false,timeout;
    const line=classified?.voice_ready_script||'HealthGuard training alert. Review the simulated crew readings, activity, and measurement quality.';
    const speak=()=>{
      if(cancelled)return;
      window.speechSynthesis.cancel();
      const u=new SpeechSynthesisUtterance(line);u.lang='en-US';u.rate=.93;
      const again=()=>{if(!cancelled)timeout=setTimeout(speak,5000)};
      u.onend=again;u.onerror=again;
      window.speechSynthesis.speak(u);
    };
    speak();
    return()=>{cancelled=true;clearTimeout(timeout);window.speechSynthesis.cancel()};
  },[voiceEnabled,critical,classified?.voice_ready_script,selected]);
  async function toggleFullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else await root.current?.requestFullscreen()}catch{}}
  const engineeringReadings=engineering?.values||{};
  const isLive=connection==='connected'&&Boolean(latest);
  const statusLabel=level==='UNASSESSED'?'Awaiting review':level==='OPTIMAL'?'No training flag':level+' · Training';
  const displayLevel=level.toLowerCase();

  return <section ref={root} className={'hgv-screen hgv-env-'+environment} aria-label="HealthGuard environment monitor">
    <header className="hgv-header">
      <div className="hgv-heading"><span className="hgv-kicker"><Icon name="shield" size={15}/> HEALTHGUARD / MISSION SYSTEMS</span><h1>Mission HUD<span className="hgv-dot">.</span></h1><p>Immersive scene viewer with simulated crew and mission-system telemetry.</p></div>
      <div className="hgv-toolbar">
        <label><span>CREW</span><select value={selected} onChange={e=>onSelectCrew(e.target.value)}>{CREW.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
        <button type="button" className={voiceEnabled?'hgv-on':''} aria-pressed={voiceEnabled} onClick={()=>setVoiceEnabled(x=>!x)} title="Opt-in critical voice guidance"><Icon name={voiceEnabled?'volume':'mute'} size={16}/> Critical voice {voiceEnabled?'on':'off'}</button>
        <button type="button" onClick={toggleFullscreen}>{fullscreen?'Exit full view':'Full view'}</button>
        <button type="button" onClick={onExit}>Dashboard <Icon name="arrow" size={15}/></button>
      </div>
    </header>

    <nav className="hgv-scenes" aria-label="Select demonstration environment">
      {SCENES.map(s=><button key={s.id} type="button" aria-pressed={environment===s.id} className={environment===s.id?'active':''} onClick={()=>onEnvironment(s.id)}><span>{s.name}</span><small>{s.subtitle}</small></button>)}
    </nav>

    <div className="hgv-layout">
      <section className="hgv-visual" aria-label={scene.name+' visual scene'}>
        <div className="hgv-visual-top"><div><span>MISSION ENVIRONMENT / VISUAL DEMO</span><strong>{scene.name}</strong></div><span className="hgv-visual-tag">SCENE · NOT LIVE VIDEO</span></div>
        <div className="hgv-scene-surface">
          {!photoFailed&&<img src={photo.url} alt="" className="hgv-photo-scene" key={environment} onError={()=>setPhotoFailed(true)} loading="eager" referrerPolicy="no-referrer"/>}
          <div className="hgv-scene-shade" aria-hidden="true"/>
          <MissionEnvironment3D environment={environment}/>
          <div className="hgv-scene-corner"><span>HEALTHGUARD ENVIRONMENT VIEW</span><strong>{scene.subtitle}</strong><small>3D models are illustrative. Drag to rotate where available.</small></div>
        </div>
        <div className="hgv-scene-foot"><span>Mission context changes the display, not the detection models.</span><a href={photo.source} target="_blank" rel="noreferrer">Image reference: {photo.credit}</a></div>
      </section>
      <aside className="hgv-intelligence" aria-label="HealthGuard contextual monitoring">
        <div className="hgv-panel-top"><div><span>PHYSIOALERT / CONTEXT REVIEW</span><h2>Monitor summary</h2></div><span className={'hgv-level hgv-level-'+displayLevel}>{statusLabel}</span></div>
        <div className={'hgv-summary hgv-summary-'+displayLevel}><Icon name={critical?'alert':'shield'} size={22}/><div><strong>{level==='UNASSESSED'?'Classification not yet available':'Simulated numerical pattern review'}</strong><p>{summary}</p></div></div>
        <div className="hgv-context">
          <div><span>Selected crew</span><strong>{crewName}</strong></div>
          <div><span>Source</span><strong>{isLive?'Fictional live simulator':'Awaiting simulator'}</strong></div>
          <div><span>Latest sample</span><strong>{sampleNumber}</strong></div>
          <div><span>NASA APDRA</span><strong>Historical research only</strong></div>
        </div>
        <div className="hgv-evidence"><strong><Icon name="activity" size={16}/> Evidence boundary</strong><p>PhysioAlert reviews the simulated stream. APDRA analyses separate historical NASA laboratory observations and is not applied to these live fictional astronauts.</p></div>
      </aside>
    </div>
    <div className="hgv-data-layout">
      <section className="hgv-vitals" aria-label="Live fictional physiological channels">
        <div className="hgv-section-head"><div><span>01 / BIOMETRICS</span><h2>Live crew vitals</h2></div><small>5 core simulated channels · click a reading for its trend</small></div>
        <div className="hgv-vital-cards">{METRICS.map(m=><button type="button" key={m.key} className={metricKey===m.key?'selected':''} aria-pressed={metricKey===m.key} onClick={()=>setMetricKey(m.key)}><span className="hgv-vital-name"><Icon name={m.glyph} size={17}/>{m.label}</span><strong>{formatValue(latest?.values?.[m.key],m.digits)} <small>{m.unit}</small></strong><span className="hgv-vital-source">CORE SIMULATOR</span></button>)}</div>
        <div className="hgv-trend"><div><strong>{metric.label} trend</strong><span>Recent simulator samples · no clinical interpretation</span></div><CompactTrace samples={samples} metric={metric}/></div>
      </section>
      <section className="hgv-engineering" aria-label="Separately scripted engineering estimates">
        <div className="hgv-section-head"><div><span>02 / MISSION SYSTEMS</span><h2>Environment estimates</h2></div><small>Not connected hardware</small></div>
        <div className="hgv-engineering-rows">{ENGINEERING.map(m=><div key={m.key}><span>{m.label}</span><strong>{formatValue(engineeringReadings[m.key],m.digits)} <small>{m.unit}</small></strong></div>)}</div>
        <p className="hgv-engineering-note">{engineeringError?'Engineering simulator unavailable. No replacement measurements are shown.':'Independent scripted estimates only; not inputs to the five-channel physiological model.'}</p>
      </section>
    </div>
    <p className="hgv-footer">HealthGuard is a research demonstration. Crew identities, vital signs and engineering estimates are fictional; the environment viewer is not a medical device, mission camera, or navigation instrument.</p>
  </section>;
}
