import React,{useEffect,useMemo,useState} from 'react';
import { AnatomyScene } from './HealthGuardPages.jsx';
import { METRICS,formatValue,friendlyStatus,readApi } from './api.js';
import { Icon,MiniTrend } from './viz.jsx';
import './medicalWorkstation.css';

const CREW=[
  {id:'SIM_CREW_01',name:'Cmdr. Elena Park',role:'Commander',image:'/crew/elena.svg'},
  {id:'SIM_CREW_02',name:'Dr. Marcus Reed',role:'Medical officer',image:'/crew/marcus.svg'},
  {id:'SIM_CREW_03',name:'Lt. Aisha Khan',role:'Systems engineer',image:'/crew/aisha.svg'},
  {id:'SIM_CREW_04',name:'Spc. Daniel Cho',role:'Mission specialist',image:'/crew/daniel.svg'},
];
const REGIONS=[
  {id:'brain',name:'Brain & ocular',text:'No connected neurological or ocular sensor; educational structure only.',keys:[]},
  {id:'respiratory',name:'Lungs & pulmonary',text:'Simulated oxygen saturation, respiratory rate, and a separate scripted capnography estimate.',keys:['spo2_percent','respiratory_rate_bpm','etco2_mmhg']},
  {id:'cardiac',name:'Heart & cardiac',text:'Simulated heart rate and HRV with independently scripted blood pressure estimates.',keys:['heart_rate_bpm','hrv_rmssd_ms','systolic_bp_mmhg','diastolic_bp_mmhg']},
  {id:'thermal',name:'Thermal regulation',text:'Simulated core temperature and separately scripted peripheral temperature.',keys:['core_temp_c','peripheral_temp_c']},
  {id:'movement',name:'Skeletal & movement',text:'The current simulator does not measure bone density, muscle strength, or motion.',keys:[]},
];
const ENGINEERING=[
 {key:'systolic_bp_mmhg',label:'Systolic BP',unit:'mmHg',digits:1},
 {key:'diastolic_bp_mmhg',label:'Diastolic BP',unit:'mmHg',digits:1},
 {key:'etco2_mmhg',label:'End-tidal CO₂',unit:'mmHg',digits:1},
 {key:'peripheral_temp_c',label:'Peripheral temp.',unit:'°C',digits:1},
];
const findMetric=key=>METRICS.find(x=>x.key===key)||ENGINEERING.find(x=>x.key===key);
export default function MedicalWorkstation({selected,onSelectCrew,snapshot,samples=[],review,unified,connection,onTelemetry,onMission}) {
 const [region,setRegion]=useState('cardiac');
 const [engineering,setEngineering]=useState(null);
 const [error,setError]=useState('');
 const [view,setView]=useState('anatomy');
 const [metricKey,setMetricKey]=useState('heart_rate_bpm');
 const subject=CREW.find(x=>x.id===selected)||CREW[0];
 const latest=snapshot?.subjects?.[selected]?.latest||samples.at(-1)||null;
 const candidates=REGIONS.find(x=>x.id===region)||REGIONS[0];
 const values=latest?.values||{};
 const estimateValues=engineering?.values||{};
 const metric=findMetric(metricKey)||METRICS[0];
 const summaryStatus=unified?.subject_id===selected && unified?.classification_domain==='FICTIONAL_MISSION_TRAINING_ONLY' ? unified?.status : null;
 const severity=['OPTIMAL','CHECK','WARNING','CRITICAL'].includes(summaryStatus)?summaryStatus:'UNASSESSED';
 const online=connection==='connected' && Boolean(latest);
 useEffect(()=>{let cancelled=false;setEngineering(null);setError('');
  const load=()=>readApi('/api/simulation/engineering/'+encodeURIComponent(selected))
    .then(r=>{if(!cancelled){setEngineering(r);setError('');}})
    .catch(()=>{if(!cancelled){setEngineering(null);setError('Engineering estimates unavailable');}});
  load();let timer=setInterval(load,5000);return()=>{cancelled=true;clearInterval(timer)};
 },[selected]);
 useEffect(()=>{const r=REGIONS.find(x=>x.id===region);setMetricKey(r?.keys.find(k=>METRICS.some(m=>m.key===k))||'heart_rate_bpm')},[region]);
 const getValue=k=>METRICS.some(m=>m.key===k)?values[k]:estimateValues[k];
 const metricRows=useMemo(()=>[...METRICS,...ENGINEERING],[ ]);
 return <main className="hgm-workstation" aria-label="HealthGuard crew medical workstation">
   <div className="hgm-head">
     <div><span className="hgm-kicker">HEALTHGUARD / MEDICAL WORKSTATION</span><h1>Crew physiological explorer</h1><p>Interactive anatomy and numerical monitoring for four fictional astronaut simulations</p></div>
     <div className="hgm-head-actions"><span className={'hgm-link-status '+(connection==='connected'?'online':'')}>{connection==='connected'?'SIMULATOR STREAMING':'CONNECTING'}</span><button type="button" onClick={onMission}>Mission systems <Icon name="arrow" size={15}/></button></div>
   </div>
   <div className="hgm-shell">
     <aside className="hgm-crew" aria-label="Crew manifest">
       <div className="hgm-panel-head"><span>CREW MANIFEST</span><strong>ALL 4</strong></div>
       {CREW.map((p,i)=>{
         const snap=snapshot?.subjects?.[p.id]?.latest, live=connection==='connected'&&Boolean(snap);
         return <button type="button" className={'hgm-crew-card '+(selected===p.id?'active':'')} onClick={()=>onSelectCrew(p.id)} aria-pressed={selected===p.id} key={p.id}>
           <img src={p.image} alt={'Fictional astronaut portrait of '+p.name}/>
           <span className="hgm-crew-card-info"><strong>{p.name}</strong><small>CREW 0{i+1} · {p.role}</small><em className={live?'online':''}>{live?'SIMULATOR ONLINE':'AWAITING DATA'}</em></span>
           <span className="hgm-crew-quick">{METRICS.slice(0,2).map(m=><span key={m.key}>{m.short}: <b>{formatValue(snap?.values?.[m.key],m.digits)}</b></span>)}</span>
         </button>
       })}
       <div className="hgm-crew-footer"><Icon name="radio" size={16}/> Four independent fictional streams, not actual astronauts</div>
     </aside>
     <section className="hgm-anatomy" aria-label="Interactive anatomical view">
       <div className="hgm-panel-head"><span>HOLOGRAPHIC BODY VIEW / CREW {String(CREW.findIndex(x=>x.id===selected)+1).padStart(2,'0')}</span><strong>{subject.name}</strong></div>
       <div className="hgm-view-controls">
         <button type="button" className={view==='anatomy'?'active':''} onClick={()=>setView('anatomy')}>3D body</button>
         <button type="button" className={view==='signals'?'active':''} onClick={()=>setView('signals')}>Signal evidence</button>
       </div>
       {view==='anatomy'?<div className="hgm-stage">
         <div className="hgm-stage-figure"><AnatomyScene selected={region} onSelect={setRegion}/></div>
         <div className="hgm-region-left">
           {REGIONS.slice(0,3).map(z=><button key={z.id} className={region===z.id?'selected':''} type="button" onClick={()=>setRegion(z.id)}>{z.name}<small>{z.keys.length?'SIMULATED DATA':'EDUCATIONAL ONLY'}</small></button>)}
         </div>
         <div className="hgm-region-right">
           {REGIONS.slice(3).map(z=><button key={z.id} className={region===z.id?'selected':''} type="button" onClick={()=>setRegion(z.id)}>{z.name}<small>{z.keys.length?'SIMULATED DATA':'EDUCATIONAL ONLY'}</small></button>)}
         </div>
       </div>:<div className="hgm-signal-evidence"><div className="hgm-signal-chart"><MiniTrend data={samples} metric={metricKey} color="#71e5e5"/></div><h3>{metric.label||metric.short}</h3><p>Recent fictional telemetry samples are plotted without clinical interpretation. Scripted estimates do not have a live trend feed.</p><button type="button" onClick={onTelemetry}>Open detailed crew telemetry <Icon name="arrow" size={15}/></button></div>}
       <div className="hgm-regions">{REGIONS.map(z=><button type="button" key={z.id} className={region===z.id?'selected':''} onClick={()=>{setRegion(z.id);setView('anatomy')}}>{z.name}</button>)}</div>
       <div className="hgm-selected-region"><span>SELECTED BODY SYSTEM</span><strong>{candidates.name}</strong><p>{candidates.text}</p><div className="hgm-region-measures">{candidates.keys.length?candidates.keys.map(k=>{const m=findMetric(k);return <button key={k} type="button" onClick={()=>{setMetricKey(k);setView('signals')}}><span>{m?.label||m?.short}</span><b>{formatValue(getValue(k),m?.digits||1)} <small>{m?.unit}</small></b></button>}):<span className="hgm-no-data">No direct sensor or physiological model for this region</span>}</div></div>
     </section>
     <aside className="hgm-measurements" aria-label="Physiological monitoring matrix">
       <div className="hgm-panel-head"><span>LIVE PHYSIOLOGICAL MATRIX</span><strong>{online?'SIMULATED LIVE':'AWAITING STREAM'}</strong></div>
       <div className="hgm-metric-grid">{metricRows.map(m=><button type="button" className={metricKey===m.key?'selected':''} key={m.key} onClick={()=>{setMetricKey(m.key);setView('signals')}}><span>{m.short||m.label}</span><strong>{formatValue(getValue(m.key),m.digits)} <small>{m.unit}</small></strong><em>{METRICS.some(x=>x.key===m.key)?'CORE SIMULATOR':'SCRIPTED ESTIMATE'}</em></button>)}</div>
       <div className={'hgm-physioalert hgm-state-'+severity.toLowerCase()}>
         <span><Icon name="shield" size={17}/> PHYSIOALERT</span><strong>{severity==='UNASSESSED'?'Awaiting unified review':severity+' · Training only'}</strong>
         <p>{summaryStatus?unified?.reason:review?.reason||'Collecting simulated measurements and model evidence.'}</p>
       </div>
       <div className="hgm-system-caption">{error||'Core physiological stream and separately scripted engineering estimates are displayed without treating either as clinical measurements.'}</div>
       <button className="hgm-open-telemetry" type="button" onClick={onTelemetry}>Open full model and telemetry evidence <Icon name="arrow" size={15}/></button>
     </aside>
   </div>
   <p className="hgm-boundary">All crew and live data are fictional. The 3D body is an interactive educational illustration, not a medical scan. Regional selections do not assert organ disease, injury, fitness or clinical severity. Historical NASA data is separate.</p>
 </main>;
}
