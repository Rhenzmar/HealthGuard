import React, { useEffect, useMemo, useRef, useState } from 'react';
import { METRICS, formatValue, friendlyStatus, readApi } from './api.js';
import { Icon } from './viz.jsx';
import MissionEnvironment3D from './MissionEnvironment3D.jsx';
import './missionVisorHUD.css';

// All live physiological readings and engineering estimates come from the existing
// backend. The landscape, habitat silhouettes, reticle and compass are visual props.
const CREW = [
  ['SIM_CREW_01', 'Cmdr. Elena Park'],
  ['SIM_CREW_02', 'Dr. Marcus Reed'],
  ['SIM_CREW_03', 'Lt. Aisha Khan'],
  ['SIM_CREW_04', 'Spc. Daniel Cho'],
];
const SCENES = [
  ['spacecraft', 'SPACECRAFT / TRANSIT'],
  ['station', 'ORBITAL STATION'],
  ['rover', 'MARS / SURFACE ROVER'],
  ['lunar_base', 'MOON / SURFACE BASE'],
  ['mars_base', 'MARS / SURFACE BASE'],
];
const SCENE_PHOTOS = {
  mars_base: {url:'https://assets.science.nasa.gov/dynamicimage/assets/science/psd/photojournal/pia/pia23/pia23727/PIA23727.jpg?crop=faces%2Cfocalpoint&fit=clip&h=1500&w=2500', credit:'Mars: Perseverance Mastcam-Z / NASA-JPL-Caltech-ASU-MSSS', source:'https://science.nasa.gov/photojournal/perseverances-mastcam-z-first-high-resolution-panorama/'},
  rover: {url:'https://assets.science.nasa.gov/dynamicimage/assets/science/psd/photojournal/pia/pia21/pia21723/PIA21723.jpg?crop=faces%2Cfocalpoint&fit=clip&h=1061&w=7000', credit:'Mars rover terrain: Opportunity / NASA-JPL-Caltech-Cornell-ASU', source:'https://science.nasa.gov/photojournal/panorama-above-perseverance-valley-on-mars/'},
  lunar_base: {url:'https://assets.science.nasa.gov/content/dam/science/missions/hubble/releases/2005/10/STScI-01EVVM9G0CWEZJSKM1YBTQDZ76.tif/jcr%3Acontent/renditions/4196x2085.jpg', credit:'Moon: Apollo 17 Taurus-Littrow / NASA', source:'https://science.nasa.gov/asset/hubble/apollo-17-astronauts-snapshot-of-taurus-littrow-valley/'},
  spacecraft: {url:'https://assets.science.nasa.gov/dynamicimage/assets/science/psd/mars/downloadable_items/3/8/38302_orion-spacecraft-earth-nasatv-camera.jpg?crop=faces%2Cfocalpoint&fit=clip&h=670&w=946', credit:'Orion Earth view / NASA Television', source:'https://science.nasa.gov/resource/view-of-earth-from-orion-spacecraft/'},
  station: {url:'https://www.esa.int/var/esa/storage/images/esa_multimedia/images/2012/03/windows_for_manned_spacecraft/10218393-2-eng-GB/Windows_for_manned_spacecraft.jpg', credit:'ISS Cupola: Windows for Manned Spacecraft / ESA', source:'https://www.esa.int/ESA_Multimedia/Images/2012/03/Windows_for_manned_spacecraft'},
};
const SUIT_METRICS = [
  { key: 'suit_o2_remaining_percent', label: 'O₂ RESERVE', unit: '%', digits: 1, icon: 'wind' },
  { key: 'cabin_o2_percent', label: 'CABIN O₂', unit: '%', digits: 2, icon: 'wind' },
  { key: 'cabin_pressure_kpa', label: 'CABIN PRESSURE', unit: 'kPa', digits: 1, icon: 'activity' },
  { key: 'radiation_rate_usv_h', label: 'RADIATION RATE', unit: 'µSv/h', digits: 3, icon: 'shield' },
];

function Trace({ packets, metric }) {
  const values = packets.slice(-44).map(p => p?.values?.[metric.key]).filter(Number.isFinite);
  if (values.length < 2) return <span className="hgv-trace-empty">Collecting samples</span>;
  let low = Math.min(...values), high = Math.max(...values);
  const span = Math.max(high - low, Math.abs(high) * 0.015, 0.15);
  const points = values.map((v,i) => `${(i / (values.length - 1) * 158).toFixed(1)},${(42 - ((v - low + span*.22) / (high - low + span*.44)) * 38).toFixed(1)}`).join(' ');
  return <svg className="hgv-trace" viewBox="0 0 160 44" aria-label={`Recent simulated ${metric.label} readings`} role="img"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

function Habitat() {
  return <div className="hgv-habitat" aria-hidden="true"><div className="hgv-platform"/>{[0,1,2,3,4].map(n=><span key={n} className={`hgv-hab-unit hgv-hab-unit-${n}`}><i/><b/></span>)}</div>;
}

function RoverIllustration() {
  return <svg className="hgv-rover-prop" viewBox="0 0 400 190" aria-hidden="true">
    <defs><linearGradient id="hgv-rover-metal" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#b4a089"/><stop offset=".42" stopColor="#675f52"/><stop offset="1" stopColor="#211b19"/></linearGradient></defs>
    <path d="M55 107 L98 48 H285 L334 106 L343 131 H45Z" fill="url(#hgv-rover-metal)" stroke="#c9b59a" strokeWidth="4"/>
    <path d="M115 54 H271 L298 103 H80 Z" fill="#10191a" stroke="#95a6a4" strokeWidth="4"/>
    <path d="M147 56 L132 102 M223 55 L236 102" stroke="#879c99" strokeWidth="7"/>
    <path d="M40 128 H359 L353 152 H39 Z" fill="#302a27" stroke="#b0a092" strokeWidth="4"/>
    {[80,183,306].map(x=><g key={x}><circle cx={x} cy="152" r="34" fill="#1b1d1b" stroke="#898276" strokeWidth="7"/><circle cx={x} cy="152" r="15" fill="#66665e" stroke="#aaa89b" strokeWidth="3"/></g>)}
    <path d="M305 44 L305 13 L356 13" fill="none" stroke="#a9b2ab" strokeWidth="5"/><circle cx="361" cy="13" r="6" fill="#a2e5da"/>
  </svg>;
}
function EvaFigure() {
  return <svg className="hgv-eva-figure" viewBox="0 0 140 300" aria-hidden="true">
    <g fill="#18384199" stroke="#86ecea" strokeWidth="2.3" strokeLinejoin="round">
      <rect x="44" y="16" width="55" height="67" rx="23"/><rect x="47" y="27" width="49" height="40" rx="17" fill="#0c2027bb"/>
      <path d="M47 78 Q27 81 31 115 L39 163 L45 180 L94 180 L104 130 Q113 84 94 78 Z"/>
      <rect x="17" y="98" width="23" height="90" rx="11" transform="rotate(12 25 100)"/>
      <rect x="101" y="101" width="21" height="88" rx="11" transform="rotate(-9 105 100)"/>
      <path d="M45 175 L72 177 L64 257 L40 257Z"/><path d="M74 178 L95 175 L106 255 L82 259Z"/>
      <rect x="34" y="249" width="34" height="19" rx="6"/><rect x="82" y="249" width="35" height="19" rx="6"/>
      <rect x="94" y="87" width="25" height="59" rx="7"/>
      <path d="M47 107 L94 107 M45 146 L98 146 M59 192 L87 192" stroke="#d3f8f1" fill="none"/>
    </g>
    <path d="M55 44 Q63 28 85 32" fill="none" stroke="#bafefe" strokeWidth="3" opacity=".6"/>
  </svg>;
}
function Reticle() {
  return <div className="hgv-reticle" aria-hidden="true"><div className="hgv-reticle-circle"><i/><b/></div><span className="hgv-reticle-vertical"/><span className="hgv-reticle-horizontal"/></div>;
}

export default function MissionVisorHUD({
  snapshot, selected, onSelectCrew, samples = [], review, unified, connection,
  environment, onEnvironment, onExit
}) {
  const root = useRef(null);
  const [engineering, setEngineering] = useState(null);
  const [engineeringError, setEngineeringError] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState('heart_rate_bpm');
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const latest = snapshot?.subjects?.[selected]?.latest || samples.at(-1) || null;
  const crewName = CREW.find(c => c[0] === selected)?.[1] || 'Selected crew';
  const sceneName = SCENES.find(s => s[0] === environment)?.[1] || 'MISSION ENVIRONMENT';
  const scenePhoto = SCENE_PHOTOS[environment] || SCENE_PHOTOS.mars_base;
  const showMars = environment === 'mars_base' || environment === 'rover';
  const status = unified?.classification_domain === 'FICTIONAL_MISSION_TRAINING_ONLY'
    && (!unified.subject_id || unified.subject_id === selected) ? unified.status : null;
  const severity = ['CRITICAL','WARNING','CHECK','OPTIMAL'].includes(status) ? status : 'UNASSESSED';
  const critical = severity === 'CRITICAL';
  const metric = METRICS.find(m => m.key === selectedMetric) || METRICS[0];
  const engineeringValues = engineering?.values || {};
  const hasReading = value => typeof value === 'number' && Number.isFinite(value);
  const dataSource = connection === 'connected' ? 'SIMULATOR CONNECTED' : 'AWAITING SIMULATOR';

  useEffect(() => {
    let cancelled = false;
    setEngineering(null);
    setEngineeringError(false);
    const load = () => readApi('/api/simulation/engineering/' + encodeURIComponent(selected))
      .then(value => { if (!cancelled) { setEngineering(value); setEngineeringError(false); } })
      .catch(() => { if (!cancelled) { setEngineering(null); setEngineeringError(true); } });
    load();
    const interval = setInterval(load, 5000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [selected]);

  useEffect(() => {
    const update = () => setIsFullscreen(document.fullscreenElement === root.current);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);

  useEffect(() => {
    if (!voiceEnabled || !critical || typeof window === 'undefined' || !window.speechSynthesis) return;
    let cancelled = false, timeout;
    const message = typeof unified?.voice_ready_script === 'string' && unified.voice_ready_script.trim()
      ? unified.voice_ready_script
      : 'HealthGuard critical training alert. Review the simulated physiological readings and verify measurement quality.';
    const speak = () => {
      if (cancelled) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.lang = 'en-US';
      utterance.rate = 0.92;
      utterance.onend = () => { if (!cancelled) timeout = setTimeout(speak, 5000); };
      utterance.onerror = () => { if (!cancelled) timeout = setTimeout(speak, 5000); };
      window.speechSynthesis.speak(utterance);
    };
    speak();
    return () => { cancelled = true; clearTimeout(timeout); window.speechSynthesis.cancel(); };
  }, [voiceEnabled, critical, selected, unified?.voice_ready_script]);

  async function toggleFullscreen() {
    if (!root.current) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await root.current.requestFullscreen();
    } catch { setIsFullscreen(false); }
  }

  const note = useMemo(() => {
    if (critical) return unified?.reason || 'Critical numerical training pattern. Verify readings and mission context.';
    if (severity === 'WARNING' || severity === 'CHECK') return unified?.reason || 'Numerical pattern requires review.';
    if (severity === 'OPTIMAL') return 'No current training pattern flag.';
    return review?.reason || 'Waiting for classification evidence.';
  }, [critical, review?.reason, severity, unified?.reason]);

  return <section ref={root} className={`hgv-screen hgv-env-${environment} ${isFullscreen ? 'hgv-fullscreen' : ''}`} aria-label="Immersive HealthGuard mission HUD">
    <div className="hgv-command">
      <div className="hgv-command-left">
        <span className="hgv-brand"><Icon name="shield" size={17}/> HEALTHGUARD <small>MISSION HUD</small></span>
        <label className="hgv-select"><span className="sr-only">Crew member</span><select value={selected} onChange={e => onSelectCrew(e.target.value)}>{CREW.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
        <label className="hgv-select"><span className="sr-only">Mission environment</span><select value={environment} onChange={e => onEnvironment(e.target.value)}>{SCENES.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
      </div>
      <div className="hgv-command-right">
        <span className={`hgv-connection ${connection === 'connected' ? 'connected' : ''}`}>{dataSource}</span>
        <button type="button" className={`hgv-command-btn ${voiceEnabled ? 'is-on' : ''}`} onClick={() => setVoiceEnabled(v => !v)} aria-pressed={voiceEnabled} title="Turn critical-alert voice on or off"><Icon name={voiceEnabled ? 'volume' : 'mute'} size={16}/><span>{voiceEnabled ? 'VOICE ON' : 'VOICE OFF'}</span></button>
        <button type="button" className="hgv-command-btn" onClick={toggleFullscreen} aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}><span>{isFullscreen ? 'EXIT FULLSCREEN' : 'FULLSCREEN'}</span></button>
        <button type="button" className="hgv-command-btn hgv-exit" onClick={onExit}><Icon name="x" size={15}/><span>EXIT HUD</span></button>
      </div>
    </div>
    <div className="hgv-visor-shell">
      <div className="hgv-visor-glass">
        <div className="hgv-landscape" aria-hidden="true">
          <img className="hgv-photo-scene" key={environment} src={scenePhoto.url} alt="" loading="eager" referrerPolicy="no-referrer" onError={event=>{event.currentTarget.style.display='none';}}/>
          
          
          
          <span className="hgv-ground"/><span className="hgv-ground-near"/>
        </div>
        <MissionEnvironment3D environment={environment}/>
        <div className="hgv-glass-tint" aria-hidden="true"/>
        <div className="hgv-dial hgv-dial-left" aria-hidden="true"/>
        <div className="hgv-dial hgv-dial-right" aria-hidden="true"/>
        <div className="hgv-glass-head">
          <div className="hgv-mission-clock"><span>MISSION CONTEXT</span><strong>{sceneName}</strong><small>VISUAL DEMONSTRATION</small></div>
          <div className={`hgv-alert hgv-alert-${severity.toLowerCase()}`} role="status" aria-live="polite">
            <span className="hgv-alert-icon"><Icon name={critical ? 'alert' : severity === 'OPTIMAL' ? 'check' : 'shield'} size={17}/></span>
            <span><strong>PHYSIOALERT <i>/</i> {severity === 'UNASSESSED' ? 'AWAITING REVIEW' : severity}</strong><small>{severity === 'UNASSESSED' ? 'NO SEVERITY INFERRED' : 'SIMULATED TRAINING CLASSIFICATION'}</small></span>
          </div>
          <div className="hgv-sim-badge"><span>SIMULATED TELEMETRY</span><strong>{latest?.sequence != null ? `SAMPLE #${latest.sequence}` : 'NO LIVE PACKET'}</strong></div>
        </div>
        <div className="hgv-visor-content">
          <aside className="hgv-readings" aria-label="Simulated crew vital signs">
            <div className="hgv-side-title">BIOMETRICS <span>01 / 05</span></div>
            {METRICS.map(m => <button type="button" key={m.key} onClick={() => { setSelectedMetric(m.key); setDetailOpen(true); }} className={`hgv-vital ${detailOpen && selectedMetric === m.key ? 'hgv-vital-active' : ''}`} aria-label={`Inspect ${m.label} trend`}>
              <span className="hgv-vital-icon"><Icon name={m.glyph} size={24}/></span>
              <span className="hgv-vital-reading"><small>{m.short}</small><strong>{formatValue(latest?.values?.[m.key], m.digits)} <em>{m.unit}</em></strong></span>
              {m.key === 'heart_rate_bpm' && <Trace packets={samples} metric={m}/>}
            </button>)}
          </aside>
          <div className="hgv-scene-focus">
            <p className="hgv-focus-label">ENVIRONMENTAL VIEW <small>· VISUAL ONLY</small></p>
            <Reticle/>
            <div className="hgv-focus-caption"><span>{showMars ? 'ILLUSTRATIVE HABITAT SILHOUETTE' : 'MISSION ENVIRONMENT VIEW'}</span><strong>NO POSITION OR RANGE FEED</strong></div>
          </div>
          <aside className="hgv-systems" aria-label="Simulated engineering estimates">
            <div className="hgv-side-title">LIFE SUPPORT <span>DEMO</span></div>
            {SUIT_METRICS.map(m => <div key={m.key} className="hgv-system">
              <span className="hgv-system-icon"><Icon name={m.icon} size={22}/></span>
              <span className="hgv-system-reading"><small>{m.label}</small><strong>{formatValue(engineeringValues[m.key], m.digits)} <em>{m.unit}</em></strong></span>
              {m.key === 'suit_o2_remaining_percent' && hasReading(engineeringValues[m.key]) && <span className="hgv-o2-bar"><i style={{width: Math.min(100, Math.max(0, engineeringValues[m.key]))+'%'}}/></span>}
            </div>)}
            <div className="hgv-system-foot">{engineeringError ? 'ENGINEERING SOURCE UNAVAILABLE' : engineering ? 'SCRIPTED ENGINEERING ESTIMATES' : 'AWAITING ENGINEERING SIMULATOR'}</div>
          </aside>
        </div>
        <div className="hgv-visor-bottom">
          {detailOpen && <div className="hgv-detail" role="region" aria-label={metric.label + ' detail'}><div><span>SELECTED TREND / SIMULATION</span><button onClick={() => setDetailOpen(false)} type="button" aria-label="Close trend"><Icon name="x" size={13}/></button></div><strong>{metric.label}</strong><Trace packets={samples} metric={metric}/></div>}
          <div className="hgv-bottom-center"><span className="hgv-north">N</span><div className="hgv-ruler"/><strong>REFERENCE VIEW / NOT NAVIGATION</strong><small>NO LIVE POSITION · NO SUIT HARDWARE CONNECTED</small></div>
          <div className="hgv-review"><span>{critical ? 'CRITICAL TRAINING FLAG' : 'PHYSIOALERT SUMMARY'}</span><p>{note}</p></div>
        </div>
      </div>
    </div>
    <div className="hgv-footer"><span>Research prototype · fictional crew and engineering simulations · not a medical or EVA safety instrument</span><span><a href={scenePhoto.source} target="_blank" rel="noreferrer">{scenePhoto.credit}</a> · 3D habitat and rover models are original illustrations; HUD and backgrounds are illustrative</span></div>
  </section>;
}
