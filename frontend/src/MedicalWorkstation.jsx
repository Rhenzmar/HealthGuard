import React, {useEffect,useState} from 'react';
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
// These are visualization groups, not independent medical risk assessments.
// Only groups with a linked simulator channel display a current measurement.
const REGIONS=[
 {id:'brain',name:'Neural & sensory',short:'Brain',icon:'activity',side:'left',
  description:'Explore the brain and visual pathways. No direct neurological, cognitive, or ocular sensor is connected to HealthGuard.',
  keys:[]},
 {id:'cardiac',name:'Cardiovascular',short:'Heart',icon:'heart',side:'left',
  description:'Review heart rate, heart-rate variability, and separately scripted blood pressure estimates. These signals cannot independently diagnose cardiovascular disease.',
  keys:['heart_rate_bpm','hrv_rmssd_ms','systolic_bp_mmhg','diastolic_bp_mmhg']},
 {id:'renal',name:'Renal & fluids',short:'Kidneys',icon:'database',side:'left',
  description:'Explore kidney anatomy and spaceflight fluid-balance concepts. No renal biomarker or direct fluid-volume sensor is connected.',
  keys:[]},
 {id:'respiratory',name:'Breathing & oxygen',short:'Lungs',icon:'wind',side:'right',
  description:'Review simulated oxygen saturation and breathing rate. End-tidal CO₂ is a separately scripted estimate, not part of the core anomaly input.',
  keys:['spo2_percent','respiratory_rate_bpm','etco2_mmhg']},
 {id:'thermal',name:'Thermal regulation',short:'Core temperature',icon:'thermometer',side:'right',
  description:'Review the core-temperature simulator and a separately scripted peripheral-temperature estimate. No physical thermometer is connected.',
  keys:['core_temp_c','peripheral_temp_c']}
];
const AUX=[
 {key:'systolic_bp_mmhg',label:'Systolic blood pressure',short:'SYSTOLIC BP',unit:'mmHg',digits:1},
 {key:'diastolic_bp_mmhg',label:'Diastolic blood pressure',short:'DIASTOLIC BP',unit:'mmHg',digits:1},
 {key:'etco2_mmhg',label:'End-tidal CO₂',short:'ETCO₂',unit:'mmHg',digits:1},
 {key:'peripheral_temp_c',label:'Peripheral temperature',short:'PERIPHERAL TEMP',unit:'°C',digits:1}
];
const ALL=[...METRICS,...AUX];
const metricFor=key=>ALL.find(m=>m.key===key);
const isCore=key=>METRICS.some(m=>m.key===key);
const LAYERS=[['skin','Outline'],['skeleton','Skeleton'],['organs','Organs'],['vessels','Vessels'],['muscles','Muscles'],['nerves','Nerves']];

export default function MedicalWorkstation({selected,onSelectCrew,snapshot,samples=[],review,unified,connection,onTelemetry}) {
 const [regionId,setRegionId]=useState('cardiac');
 const [metricKey,setMetricKey]=useState('heart_rate_bpm');
 const [bodySex,setBodySex]=useState('male');
 const [layersOpen,setLayersOpen]=useState(false);
 const [detailsOpen,setDetailsOpen]=useState(false);
 const [showAll,setShowAll]=useState(false);
 const [engineering,setEngineering]=useState(null);
 const [issue,setIssue]=useState('');
 const [layers,setLayers]=useState({skin:true,skeleton:true,joints:false,muscles:false,organs:true,vessels:false,nerves:false});
 const crew=CREW.find(x=>x.id===selected)||CREW[0];
 const region=REGIONS.find(x=>x.id===regionId)||REGIONS[1];
 const metric=metricFor(metricKey)||METRICS[0];
 const last=snapshot?.subjects?.[selected]?.latest||samples.at(-1)||null;
 const values=last?.values||{};
 const estimates=engineering?.values||{};
 const online=connection==='connected'&&Boolean(last);
 const valueFor=key=>isCore(key)?values[key]:estimates[key];
 const available=key=>typeof valueFor(key)==='number'&&Number.isFinite(valueFor(key));
 const readingFor=key=>{
   const m=metricFor(key);
   return m&&available(key)?formatValue(valueFor(key),m.digits)+' '+m.unit:'—';
 };
 const activeReview=unified?.classification_domain==='FICTIONAL_MISSION_TRAINING_ONLY' &&
   (!unified.subject_id||unified.subject_id===selected)?unified:null;
 const severity=['CRITICAL','WARNING','CHECK','OPTIMAL'].includes(activeReview?.status)?activeReview.status:'UNASSESSED';
 const apdra=unified?.subject_id===selected?unified?.explanation?.apdra_live:null;
 const apdraLabel=apdra?.status==='STABLE_DEVIATION'?'Consistent deviation':
   apdra?.status==='BASELINE_SENSITIVE'?'Baseline-sensitive change':
   apdra?.status==='NO_STABLE_DEVIATION'?'No persistent deviation':
   apdra?.status==='BASELINE_CALIBRATING'?'Building baseline':'Not available';
 const apdraChannels=Array.isArray(apdra?.stable_channels)?apdra.stable_channels:[];
 const relatedAPDRA=apdraChannels.filter(ch=>region.keys.includes(typeof ch==='string'?ch:ch?.channel));
 useEffect(()=>{
   let cancelled=false;
   setEngineering(null);setIssue('');
   const load=()=>readApi('/api/simulation/engineering/'+encodeURIComponent(selected))
     .then(r=>{if(!cancelled){setEngineering(r);setIssue('')}})
     .catch(()=>{if(!cancelled){setEngineering(null);setIssue('Scripted estimates unavailable')}});
   load();
   const timer=setInterval(load,5000);
   return ()=>{cancelled=true;clearInterval(timer)};
 },[selected]);
 const chooseRegion=id=>{
   setRegionId(id);
   const next=REGIONS.find(r=>r.id===id);
   const related=next?.keys.find(isCore)||next?.keys[0];
   if(related)setMetricKey(related);
 };
 const renderSection=r=>{
   const key=r.keys.find(isCore)||r.keys[0];
   const hasDirect=Boolean(key&&isCore(key));
   const showsReading=Boolean(key&&available(key)&&(!isCore(key)||online));
   return <button type="button" key={r.id}
     className={'hgm-section-card '+(regionId===r.id?'is-selected':'')}
     aria-pressed={regionId===r.id} onClick={()=>chooseRegion(r.id)}>
     <span className="hgm-section-icon"><Icon name={r.icon} size={20}/></span>
     <span className="hgm-section-copy">
       <strong>{r.name}</strong>
       <small>{showsReading?readingFor(key):hasDirect?'Awaiting simulated signal':'Anatomical reference'}</small>
     </span>
     <span className={'hgm-section-source '+(hasDirect&&online?'is-live':'')}>
       {hasDirect&&online?'SIMULATED':hasDirect?'AWAITING':'NO SENSOR'}
     </span>
   </button>;
 };
 const selectReading=key=>{setMetricKey(key);setDetailsOpen(true)};
 const selectedReading=isCore(metricKey)?'CORE PHYSIOLOGICAL SIMULATOR':'SEPARATE SCRIPTED ESTIMATE';
 return <div className="hgm-workstation hgm-sections-workstation">
   <header className="hgm-heading hgm-heading-compact">
     <div>
       <span className="hgm-kicker"><Icon name="heart" size={15}/> HEALTHGUARD / BODY EXPLORER</span>
       <h1>Explore human systems<span>.</span></h1>
       <p>Five body systems, one interactive astronaut health overview.</p>
     </div>
     <button type="button" className="hgm-telemetry-link" onClick={onTelemetry}>Crew telemetry <Icon name="arrow" size={15}/></button>
   </header>

   <section className="hgm-crew-strip hgm-crew-compact" aria-label="Select simulated astronaut">
     <div className="hgm-strip-title"><Icon name="users" size={15}/> SELECT CREW <span>FOUR INDEPENDENT SIMULATED STREAMS</span></div>
     <div className="hgm-crew-grid">{CREW.map(person=>{
       const packet=snapshot?.subjects?.[person.id]?.latest;
       const connected=connection==='connected'&&Boolean(packet);
       return <button type="button" key={person.id} className={'hgm-crew-option '+(selected===person.id?'selected':'')}
         aria-pressed={selected===person.id} onClick={()=>onSelectCrew(person.id)}>
         <img src={person.image} alt={'Illustration of '+person.name}/>
         <span className="hgm-crew-name"><strong>{person.name}</strong><small>{person.role}</small></span>
         <span className="hgm-crew-sample"><b>{connected?formatValue(packet?.values?.heart_rate_bpm,0):'—'}</b><small>bpm</small></span>
       </button>;
     })}</div>
   </section>

   <section className="hgm-systems-stage" aria-label="Body systems section explorer">
     <div className="hgm-stage-top">
       <div><span>INTERACTIVE ANATOMY</span><h2>{crew.name}</h2></div>
       <div className="hgm-stage-status"><span className={online?'is-online':''}/>
         {online?'SIMULATOR CONNECTED':'AWAITING SIMULATOR'}</div>
     </div>
     <div className="hgm-systems-grid">
       <div className="hgm-systems-side hgm-systems-left" aria-label="Left system sections">
         {REGIONS.filter(r=>r.side==='left').map(renderSection)}
       </div>
       <div className="hgm-stage-model">
         <div className="hgm-figure hgm-figure-stage">
           <div className="hgm-model-overline">HEALTHGUARD / SECTION VIEW</div>
           <AnatomyScene selected={regionId} sex={bodySex} layers={layers} onLayersChange={setLayers} onSelect={chooseRegion}/>
           <span className="hgm-figure-footnote">Educational 3D anatomy · not a medical scan</span>
         </div>
       </div>
       <div className="hgm-systems-side hgm-systems-right" aria-label="Right system sections">
         {REGIONS.filter(r=>r.side==='right').map(renderSection)}
       </div>
     </div>
     <div className="hgm-stage-footer">
       <div className="hgm-stage-legend"><span className="hgm-legend-mark"/> SELECTED: <strong>{region.name}</strong>
         <small>Click any section or organ to explore</small></div>
       <div className="hgm-stage-tools">
         <div role="group" aria-label="Anatomical model choice" className="hgm-body-choice">
           <button type="button" aria-pressed={bodySex==='male'} onClick={()=>setBodySex('male')}>Body A</button>
           <button type="button" aria-pressed={bodySex==='female'} onClick={()=>setBodySex('female')}>Body B</button>
         </div>
         <button type="button" className="hgm-layer-toggle" aria-expanded={layersOpen} aria-controls="hgm-section-layer-controls" onClick={()=>setLayersOpen(v=>!v)}>
           <Icon name="layers" size={15}/> {layersOpen?'Hide layers':'Anatomy layers'}
         </button>
       </div>
     </div>
     {layersOpen&&<div className="hgm-anatomy-layer-controls hgm-stage-layer-controls" id="hgm-section-layer-controls" aria-label="Anatomy layers">
       {LAYERS.map(([key,label])=><button type="button" key={key} aria-pressed={Boolean(layers[key])}
         onClick={()=>setLayers(old=>({...old,[key]:!old[key]}))}>{label}</button>)}
     </div>}
   </section>

   <section className="hgm-section-summary" aria-label="Selected body system">
     <div className="hgm-summary-main">
       <div className="hgm-summary-icon"><Icon name={region.icon} size={22}/></div>
       <div><span>SELECTED BODY SYSTEM</span><h3>{region.name}</h3><p>{region.description}</p></div>
     </div>
     <button type="button" className="hgm-expand-details" aria-expanded={detailsOpen} onClick={()=>setDetailsOpen(v=>!v)}>
       {detailsOpen?'Close evidence':'View measurements & evidence'} <Icon name="chevron" size={16}/>
     </button>
   </section>

   <div className="hgm-quick-vitals" aria-label="Current core simulated readings">
     {METRICS.map(m=><button type="button" key={m.key} onClick={()=>selectReading(m.key)}
       className={'hgm-quick-reading '+(metricKey===m.key?'selected':'')}>
       <span>{m.label}</span>
       <strong>{online?readingFor(m.key):'—'}</strong>
     </button>)}
   </div>

   {detailsOpen&&<div className="hgm-expanded-evidence">
     <section className="hgm-explanation" aria-label="Region measurement context">
       <div className="hgm-panel-heading"><div><span>SELECTED SYSTEM</span><h2>{region.name}</h2></div><span className="hgm-source-indicator">SIMULATED DATA</span></div>
       <p className="hgm-region-description">{region.description}</p>
       <div className="hgm-related-heading">RELATED MEASUREMENTS</div>
       <div className="hgm-related-grid">{region.keys.length?region.keys.map(key=>{
         const m=metricFor(key);
         return <button type="button" key={key} className={metricKey===key?'selected':''} onClick={()=>setMetricKey(key)}>
           <span>{m?.label}</span><strong>{readingFor(key)}</strong>
           <em>{isCore(key)?'CORE SIMULATOR':'SCRIPTED ESTIMATE'}</em>
         </button>;
       }):<p className="hgm-unavailable">This region has no directly connected physiological sensor.</p>}</div>
     </section>
     <section className="hgm-evidence-review" aria-label="Crew-wide model context">
       <div className="hgm-apdra-card">
         <div className="hgm-apdra-title"><Icon name="activity" size={17}/><span>APDRA / PERSONAL BASELINE</span></div>
         <strong>{apdraLabel}</strong>
         <p>{apdra?(relatedAPDRA.length?relatedAPDRA.length+' related signal(s) were flagged across baseline windows.':'No stable-deviation flag mapped to this selected system.'):'Live APDRA evidence is not available for this crew stream.'}</p>
         <small>EXPERIMENTAL · SIMULATED CREW</small>
       </div>
       <div className="hgm-review-card">
         <div><Icon name="shield" size={18}/><span>PHYSIOALERT / CREW-WIDE REVIEW</span></div>
         <strong className={'hgm-severity-'+severity.toLowerCase()}>{severity==='UNASSESSED'?'Awaiting classification':severity==='OPTIMAL'?'No training flag':severity+' · Training only'}</strong>
         <p>{activeReview?.reason||review?.reason||'Awaiting sufficient samples for model review.'}</p>
       </div>
     </section>
     <section className="hgm-monitor" aria-label="Physiological monitoring">
       <div className="hgm-panel-heading"><div><span>TELEMETRY</span><h2>Physiological signals</h2></div>
         <div className="hgm-monitor-actions"><span className={online?'online':''}>{online?'SIMULATOR CONNECTED':'AWAITING SIMULATOR'}</span>
           <button type="button" onClick={()=>setShowAll(v=>!v)}>{showAll?'Selected section only':'Show all 9 readings'}</button>
         </div>
       </div>
       <div className="hgm-measurements">{(showAll?ALL:ALL.filter(m=>region.keys.includes(m.key))).map(m=>
         <button type="button" key={m.key} aria-pressed={metricKey===m.key} className={metricKey===m.key?'selected':''} onClick={()=>setMetricKey(m.key)}>
           <span>{m.short||m.label}</span><strong>{readingFor(m.key)}</strong>
           <em>{isCore(m.key)?'CORE SIMULATOR':'SCRIPTED ESTIMATE'}</em>
         </button>)}
         {!showAll&&!region.keys.length&&<p className="hgm-unavailable">No connected measurements for this section. Choose another section or show all nine readings.</p>}
       </div>
       <div className="hgm-chart-panel">
         <div className="hgm-chart-title"><div><span>SELECTED SIGNAL / {selectedReading}</span><h3>{metric.label}</h3></div>
           <button type="button" onClick={onTelemetry}>Detailed telemetry <Icon name="arrow" size={15}/></button>
         </div>
         {isCore(metricKey)?<VitalChart data={samples} metric={metric}/>:<div className="hgm-no-trend">
           <strong>Snapshot estimate only</strong><p>This separately scripted value has no verified trend history.</p></div>}
       </div>
       {issue&&<p className="hgm-warning">{issue}. Missing values are not replaced.</p>}
     </section>
   </div>}
   <p className="hgm-footer">This is a simulated educational interface, not clinical monitoring or diagnosis. Section highlights indicate anatomy rather than health or risk. Anatomical assets: BodyParts3D © DBCLS (CC BY 4.0); HuBMAP (CC BY 4.0); MakeHuman (CC0); adapted by <a href="https://github.com/MervinR07/open-anatomy-3d" target="_blank" rel="noreferrer">open-anatomy-3d</a> (CC BY 4.0).</p>
 </div>;
}
