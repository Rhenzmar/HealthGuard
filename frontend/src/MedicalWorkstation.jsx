import React,{useEffect,useState} from 'react';
import {AnatomyScene} from './HealthGuardPages.jsx';
import {METRICS,formatValue,readApi} from './api.js';
import {Icon,VitalChart} from './viz.jsx';
import './medicalWorkstation.css';

const CREW=[
 {id:'SIM_CREW_01',name:'Cmdr. Elena Park',role:'Flight commander',image:'/crew/elena.svg'},
 {id:'SIM_CREW_02',name:'Dr. Marcus Reed',role:'Medical officer',image:'/crew/marcus.svg'},
 {id:'SIM_CREW_03',name:'Lt. Aisha Khan',role:'Systems engineer',image:'/crew/aisha.svg'},
 {id:'SIM_CREW_04',name:'Spc. Daniel Cho',role:'Mission specialist',image:'/crew/daniel.svg'}
];
const REGIONS=[
 {id:'cardiac',name:'Cardiovascular',short:'Heart',description:'Review the heart rate and heart-rate variability measurements. These cannot independently identify cardiac disease.',keys:['heart_rate_bpm','hrv_rmssd_ms','systolic_bp_mmhg','diastolic_bp_mmhg']},
 {id:'respiratory',name:'Respiratory',short:'Lungs',description:'Review oxygen saturation and breathing rate, with a separately scripted end-tidal CO₂ estimate.',keys:['spo2_percent','respiratory_rate_bpm','etco2_mmhg']},
 {id:'thermal',name:'Thermoregulation',short:'Temperature',description:'Review simulated core temperature and a separately scripted peripheral-temperature estimate.',keys:['core_temp_c','peripheral_temp_c']},
 {id:'brain',name:'Neurological',short:'Brain',description:'Explore the brain and nervous system. HealthGuard has no direct neurological, cognition, or vision sensor. Any relationship with other signals is contextual, not diagnostic.',keys:[]},
 {id:'renal',name:'Renal & fluid balance',short:'Kidneys',description:'Understand how fluid balance may change during spaceflight. No kidney function, fluid volume, or biochemical sensor is connected.',keys:[]},
 {id:'movement',name:'Musculoskeletal',short:'Movement',description:'No bone-density, muscle-strength or motion capture feed is connected.',keys:[]}
];
const AUX=[
 {key:'systolic_bp_mmhg',label:'Systolic blood pressure',short:'SYSTOLIC BP',unit:'mmHg',digits:1},
 {key:'diastolic_bp_mmhg',label:'Diastolic blood pressure',short:'DIASTOLIC BP',unit:'mmHg',digits:1},
 {key:'etco2_mmhg',label:'End-tidal CO₂',short:'ETCO₂',unit:'mmHg',digits:1},
 {key:'peripheral_temp_c',label:'Peripheral temperature',short:'PERIPH. TEMP',unit:'°C',digits:1}
];
const ALL=[...METRICS,...AUX];
const metricFor=k=>ALL.find(m=>m.key===k);
const isCore=k=>METRICS.some(m=>m.key===k);

export default function MedicalWorkstation({selected,onSelectCrew,snapshot,samples=[],review,unified,connection,onTelemetry,onMission}) {
 const [regionId,setRegionId]=useState('cardiac');
 const [metricKey,setMetricKey]=useState('heart_rate_bpm');
 const [engineering,setEngineering]=useState(null);
 const [issue,setIssue]=useState('');
 const [showAll,setShowAll]=useState(true);
 const [view,setView]=useState('front');
 const selectedCrew=CREW.find(x=>x.id===selected)||CREW[0];
 const region=REGIONS.find(x=>x.id===regionId)||REGIONS[0];
 const metric=metricFor(metricKey)||METRICS[0];
 const last=snapshot?.subjects?.[selected]?.latest||samples.at(-1)||null;
 const values=last?.values||{};
 const estimates=engineering?.values||{};
 const valueFor=k=>isCore(k)?values[k]:estimates[k];
 const online=connection==='connected'&&Boolean(last);
 const activeReview=unified?.classification_domain==='FICTIONAL_MISSION_TRAINING_ONLY' &&
  (!unified.subject_id||unified.subject_id===selected)?unified:null;
 const severity=['CRITICAL','WARNING','CHECK','OPTIMAL'].includes(activeReview?.status)?activeReview.status:'UNASSESSED';
 const apdra=unified?.subject_id===selected?unified?.explanation?.apdra_live:null;
 const apdraLabel=apdra?.status==='STABLE_DEVIATION'?'Consistent deviation':
   apdra?.status==='BASELINE_SENSITIVE'?'Baseline-sensitive change':
   apdra?.status==='NO_STABLE_DEVIATION'?'No persistent deviation':
   apdra?.status==='BASELINE_CALIBRATING'?'Building baseline':'Not yet available';
 const apdraChannels=Array.isArray(apdra?.stable_channels)?apdra.stable_channels:[];
 const regionAPDRA=apdraChannels.filter(ch=>region.keys.includes(typeof ch==='string'?ch:ch?.channel));
 useEffect(()=>{let cancelled=false;setEngineering(null);setIssue('');
  const load=()=>readApi('/api/simulation/engineering/'+encodeURIComponent(selected))
   .then(r=>{if(!cancelled){setEngineering(r);setIssue('')}})
   .catch(()=>{if(!cancelled){setEngineering(null);setIssue('Scripted estimates unavailable')}});
  load();const timer=setInterval(load,5000);return()=>{cancelled=true;clearInterval(timer)};
 },[selected]);
 const changeRegion=id=>{
  setRegionId(id);
  const match=REGIONS.find(r=>r.id===id);
  const core=match?.keys.find(isCore);
  if(core)setMetricKey(core);
 };
 const selectedReading=isCore(metricKey)?'CORE PHYSIOLOGICAL SIMULATOR':'SEPARATE SCRIPTED ESTIMATE';
 return <div className="hgm-workstation">
  <header className="hgm-heading">
   <div><span className="hgm-kicker"><Icon name="heart" size={15}/> HEALTHGUARD / BODY EXPLORER</span>
    <h1>Human systems explorer<span>.</span></h1>
    <p>Explore six body systems and see how the selected astronaut's simulated physiology connects to HealthGuard monitoring.</p>
   </div>
   <button type="button" className="hgm-telemetry-link" onClick={onTelemetry}>Open crew telemetry <Icon name="arrow" size={15}/></button>
  </header>

  <section className="hgm-crew-strip" aria-label="Select fictional astronaut">
   <div className="hgm-strip-title"><Icon name="users" size={17}/> CREW <span>4 INDEPENDENT SIMULATOR STREAMS</span></div>
   <div className="hgm-crew-grid">{CREW.map((crew,i)=>{
    const packet=snapshot?.subjects?.[crew.id]?.latest;
    const connected=connection==='connected'&&Boolean(packet);
    return <button type="button" key={crew.id} aria-pressed={selected===crew.id} onClick={()=>onSelectCrew(crew.id)} className={'hgm-crew-option '+(selected===crew.id?'selected':'')}>
     <img src={crew.image} alt={'Illustration of fictional astronaut '+crew.name}/>
     <span className="hgm-crew-name"><strong>{crew.name}</strong><small>{crew.role}</small><em>{connected?'SIMULATED STREAM':'AWAITING STREAM'}</em></span>
     <span className="hgm-crew-sample"><b>{formatValue(packet?.values?.heart_rate_bpm,0)}</b><small>BPM</small></span>
    </button>
   })}</div>
  </section>

  <div className="hgm-main-layout">
   <section className="hgm-anatomy-panel" aria-label="Three-dimensional anatomical explorer">
    <div className="hgm-panel-heading"><div><span>01 / INTERACTIVE ANATOMY</span><h2>{selectedCrew.name}</h2></div><span className="hgm-source-indicator">HOLOGRAPHIC MODEL</span></div>
    <div className="hgm-view-controls" aria-label="Anatomy camera view">{['front','side','back'].map(v=><button type="button" key={v} aria-pressed={view===v} onClick={()=>setView(v)}>{v.toUpperCase()}</button>)}<span>6 BODY SYSTEMS</span></div>
    <div className="hgm-figure">
      <div className="hgm-figure-watermark">HEALTHGUARD / ANATOMICAL OVERVIEW</div>
      <AnatomyScene selected={regionId} view={view} onSelect={changeRegion}/>
      <div className="hgm-figure-status"><span className="hgm-status-dot"/>{online?'SIMULATOR CONNECTED':'MODEL VIEW · OFFLINE'}</div>
    </div>
    <div className="hgm-region-pills">{REGIONS.map(r=><button type="button" key={r.id} aria-pressed={regionId===r.id} onClick={()=>changeRegion(r.id)} className={regionId===r.id?'selected':''}>{r.short}</button>)}</div>
    <div className="hgm-figure-hint"><Icon name="activity" size={15}/> Drag to rotate and select a body region. Selected systems are highlighted. Colors do not indicate medical risk.</div>
   </section>
   <section className="hgm-explanation" aria-label="Selected system and physiological evidence">
    <div className="hgm-panel-heading"><div><span>02 / BODY SYSTEM</span><h2>{region.name}</h2></div><span className="hgm-source-indicator">REGION REVIEW</span></div>
    <p className="hgm-region-description">{region.description}</p>
    <div className="hgm-region-context"><span>SELECTED SYSTEM</span><strong>{region.short}</strong><small>{region.keys.length?region.keys.length+' linked measurement'+(region.keys.length===1?'':'s'):'Educational view · no direct sensor'}</small></div>
    <div className="hgm-related-heading">RELATED SIMULATED MEASUREMENTS</div>
    <div className="hgm-related-grid">{region.keys.length?region.keys.map(key=>{
      const m=metricFor(key);
      return <button type="button" key={key} className={metricKey===key?'selected':''} onClick={()=>setMetricKey(key)}>
       <span>{m?.label||m?.short}</span><strong>{formatValue(valueFor(key),m?.digits??1)} <small>{m?.unit}</small></strong>
       <em>{isCore(key)?'CORE SIMULATOR':'SCRIPTED ESTIMATE'}</em>
      </button>;
    }):<p className="hgm-unavailable">No physiological measurement is connected to this region. The model is for anatomy exploration only.</p>}</div>
    <div className="hgm-apdra-card">
      <div className="hgm-apdra-title"><Icon name="activity" size={17}/><span>APDRA / PERSONAL BASELINE CHECK</span></div>
      <strong>{apdraLabel}</strong>
      <p>{apdra?regionAPDRA.length?regionAPDRA.length+' related signal(s) show persistent change against multiple baseline windows. This is a numerical flag, not an organ diagnosis.':'The current experimental baseline check has no stable-deviation flag directly mapped to this selected system.':'Live APDRA evidence is not available for this crew stream.'}</p>
      <small>EXPERIMENTAL · FICTIONAL CREW SIMULATION</small>
    </div>
    <div className="hgm-review-card">
     <div><Icon name="shield" size={18}/><span>PHYSIOALERT / {activeReview?'SIMULATED TRAINING':'CONTEXT REVIEW'}</span></div>
     <strong className={'hgm-severity-'+severity.toLowerCase()}>{severity==='UNASSESSED'?'Awaiting classification':severity==='OPTIMAL'?'No training flag':severity+' · Training only'}</strong>
     <p>{activeReview?.reason||review?.reason||'Awaiting sufficient simulated samples for model review.'}</p>
    </div>
    <div className="hgm-research-note"><Icon name="database" size={17}/><p><strong>Evidence distinction:</strong> The experimental live APDRA check works on fictional crew telemetry. The separate NASA historical APDRA study is available in the Health Library. Neither constitutes clinical validation.</p></div>
   </section>
  </div>

  <section className="hgm-monitor" aria-label="Crew measurement overview">
   <div className="hgm-panel-heading"><div><span>03 / MONITORING</span><h2>Physiological signals</h2></div><div className="hgm-monitor-actions"><span className={online?'online':''}>{online?'SIMULATOR CONNECTED':'AWAITING SIMULATOR'}</span><button type="button" onClick={()=>setShowAll(v=>!v)}>{showAll?'Compact view':'All 9 readings'}</button></div></div>
   <div className="hgm-measurements">{(showAll?ALL:ALL.filter(m=>region.keys.includes(m.key))).map(m=><button type="button" key={m.key} aria-pressed={metricKey===m.key} onClick={()=>setMetricKey(m.key)} className={metricKey===m.key?'selected':''}><span>{m.short||m.label}</span><strong>{formatValue(valueFor(m.key),m.digits)} <small>{m.unit}</small></strong><em>{isCore(m.key)?'CORE SIMULATOR':'SCRIPTED ESTIMATE'}</em></button>)}</div>
   <div className="hgm-chart-panel">
    <div className="hgm-chart-title"><div><span>SELECTED SIGNAL / {selectedReading}</span><h3>{metric.label}</h3></div><button type="button" onClick={onTelemetry}>Detailed telemetry <Icon name="arrow" size={15}/></button></div>
    {isCore(metricKey)?<VitalChart data={samples} metric={metric}/>:<div className="hgm-no-trend"><Icon name="activity" size={21}/><strong>Snapshot estimate only</strong><p>This independently scripted value has no verified historical trend. HealthGuard does not create an artificial one.</p></div>}
   </div>
   {issue&&<p className="hgm-warning">{issue}. Missing values are not replaced.</p>}
  </section>
  <p className="hgm-footer">All crew readings are simulated. This interactive model is educational, not a medical scan. PhysioAlert and APDRA flags describe numerical patterns, not diagnoses. Core simulator readings and separately scripted estimates are labeled distinctly.</p>
 </div>;
}
