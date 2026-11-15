import React,{useEffect,useMemo,useState} from 'react';
import {Icon} from './viz.jsx';
import {METRICS,formatValue,readApi} from './api.js';
import './telemetryBiomarkerHub.css';

/**
 * Source-separated overview. Fictional continuous streams and real historical
 * NASA laboratory records must never be equated, cross-linked by subject ID,
 * or silently converted to clinical severities.
 */
const GROUPS=[
  {id:'cardio',title:'Cardiovascular',icon:'heart',desc:'Fictional continuous heart-rate and HRV signals',keys:['heart_rate_bpm','hrv_rmssd_ms'],source:'SIMULATED'},
  {id:'pulmonary',title:'Pulmonary & respiratory',icon:'wind',desc:'Fictional SpO₂ and respiratory rate',keys:['spo2_percent','respiratory_rate_bpm'],source:'SIMULATED'},
  {id:'thermal',title:'Thermoregulation',icon:'thermometer',desc:'Fictional core temperature signal',keys:['core_temp_c'],source:'SIMULATED'},
  {id:'cmp',title:'Metabolic & chemistry',icon:'flask',desc:'19 CMP biomarkers from historical NASA OSD-575',assay:'CMP',source:'HISTORICAL'},
  {id:'immune',title:'Alamar protein panel',icon:'shield',desc:'203 relative protein markers from NASA OSD-575',assay:'ALAMAR_NPQ',source:'HISTORICAL'},
  {id:'eveImmune',title:'Eve immune proteins',icon:'shield',desc:'71 immune analytes from NASA OSD-575',assay:'EVE_IMMUNE',source:'HISTORICAL'},
  {id:'eveCardio',title:'Eve cardiovascular',icon:'heart',desc:'9 cardiovascular proteins from NASA OSD-575',assay:'EVE_CARDIOVASCULAR',source:'HISTORICAL'},
  {id:'cbc',title:'Hematology / CBC',icon:'activity',desc:'20 source-verified CBC biomarkers from NASA OSD-569, including QC-flagged values',assay:'CBC',source:'HISTORICAL'},
  {id:'fluid',title:'Cardiovascular & fluid shifts',icon:'pulse',desc:'NASA research context, not live jugular or ocular measurements',source:'CONTEXT'},
  {id:'sans',title:'Neuro-ocular / SANS',icon:'user',desc:'NASA SANS risk research, no connected ocular measurements',source:'CONTEXT'},
  {id:'radiation',title:'Radiation & suit environment',icon:'satellite',desc:'No connected radiation, pressure, or cabin-atmosphere sensors',source:'PENDING'}
];
const CATALOG_LINKS={
  cbc:'https://osdr.nasa.gov/bio/repo/data/studies/OSD-569',
  fluid:'https://www.nasa.gov/directorates/esdmd/hhp/cardiovascular-and-vision/',
  sans:'https://www.nasa.gov/reference/risk-of-spaceflight-associated-neuro-ocular-syndrome-sans/'
};
const TIERS=['OPTIMAL','CHECK','WARNING','CRITICAL'];
function statusOf(group,training){
  if(!group.keys)return null;
  if(!training)return 'SIMULATED'; // Live monitor is model-reviewed separately.
  const ranks={OPTIMAL:0,CHECK:1,WARNING:2,CRITICAL:3};
  let tier='OPTIMAL';
  for(const key of group.keys){
    const value=training.metric_levels?.[key]||'OPTIMAL';
    if(ranks[value]>ranks[tier])tier=value;
  }
  return tier;
}
function HistoricalBrowser({assay,subject,setSubject}){
  const [query,setQuery]=useState('');
  const [results,setResults]=useState(null);
  const [loading,setLoading]=useState(false),[error,setError]=useState('');
  const [page,setPage]=useState(0);
  useEffect(()=>{setPage(0);},[subject,assay,query]);
  useEffect(()=>{
    let cancelled=false;setLoading(true);setError('');
    const params=new URLSearchParams({subject_id:subject,assay,limit:'18',offset:String(page*18)});
    if(query.trim())params.set('search',query.trim());
    readApi('/api/research/biomarker-panel?'+params.toString()).then(data=>{
      if(!cancelled)setResults(data);
    }).catch(err=>{if(!cancelled){setResults(null);setError(err.message||'API unavailable');}})
    .finally(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true};
  },[subject,assay,query,page]);
  return <div className="hg-bio-lab">
    <div className="hg-bio-lab-tools">
      <label>Historical NASA participant<select value={subject} onChange={e=>setSubject(e.target.value)}>
        {['C001','C002','C003','C004'].map(id=><option value={id} key={id}>{id}</option>)}
      </select></label>
      <label>Find biomarker<input value={query} onChange={e=>setQuery(e.target.value)} placeholder="e.g. GLUCOSE or IL6"/></label>
    </div>
    <p className="hg-bio-disclosure">These are <strong>discrete historical research samples</strong> from {assay==='CBC'?'verified NASA OSD-569':'verified NASA OSD-575'}, not readings from {subject==='C001'?'Elena Park or the fictional crew':'any fictional HealthGuard astronaut'}. The most recent available sample within the study is shown, not a current health state. {assay==='CBC'?'The C003 L-92 sample is retained with quality-review flags, not silently corrected.':'NPQ log2 values are relative protein measurements, not concentrations in pg/mL.'}</p>
    {error?<p role="alert" className="hg-bio-error">Unable to load historical measurements: {error}</p>:
    loading?<p className="hg-bio-wait">Loading historical NASA records…</p>:
    <><div className="hg-bio-count">{results?.total_biomarkers??0} available biomarker types · {assay==='CMP'?'Chemistry panel':assay==='CBC'?'CBC panel':assay==='EVE_CARDIOVASCULAR'?'Cardiovascular proteins':'Immune protein panel'} · No severity assigned</div>
      <div className="hg-bio-scroll"><table><thead><tr><th>Biomarker</th><th>Last observed</th><th>Flight timepoint</th><th>Source sample</th><th>Source status</th></tr></thead>
      <tbody>{(results?.biomarkers||[]).map(item=><tr key={item.assay+item.name+item.unit}>
        <td><strong>{item.name}</strong><small>{item.observations} observations</small></td>
        <td>{typeof item.latest?.value==='number'?Number(item.latest.value).toLocaleString(undefined,{maximumFractionDigits:3}):'—'} <small>{item.unit}</small></td>
        <td>{item.latest?.timepoint||'—'} <small>{item.latest?.phase||''}</small></td>
        <td>{item.latest?.sample_id||'—'}</td>
        <td><span className="hg-bio-not-evaluated">NOT CLASSIFIED</span></td>
      </tr>)}
      {!results?.biomarkers?.length&&<tr><td colSpan="5">No matching source observations.</td></tr>}</tbody></table></div>
      <div className="hg-bio-pagination"><span>Rows {results?.total_biomarkers? page*18+1:0}–{Math.min((page+1)*18,results?.total_biomarkers||0)} of {results?.total_biomarkers||0}</span><div><button type="button" disabled={!page} onClick={()=>setPage(x=>Math.max(0,x-1))}>Previous</button><button type="button" disabled={(page+1)*18>=(results?.total_biomarkers||0)} onClick={()=>setPage(x=>x+1)}>Next</button></div></div>
    </>}
    <a href={assay==='CBC'?'https://osdr.nasa.gov/bio/repo/data/studies/OSD-569':'https://osdr.nasa.gov/bio/repo/data/studies/OSD-575'} rel="noreferrer" target="_blank">View official {assay==='CBC'?'OSD-569':'OSD-575'} study information</a>
  </div>;
}
export default function TelemetryBiomarkerHub({person,latest,training,compact=false}){
  const [opened,setOpened]=useState(false);
  const [filter,setFilter]=useState('all');
  const [group,setGroup]=useState('cmp');
  const [subject,setSubject]=useState('C001');
  const selected=useMemo(()=>GROUPS.find(x=>x.id===group)||GROUPS[0],[group]);
  if(compact){
    const catalog=GROUPS.filter(item=>!item.keys);
    const chosen=catalog.find(item=>item.id===group)||catalog[0];
    return <section className="hg-bio-hub hg-bio-compact" aria-label="Additional NASA research datasets">
      <div className="hg-bio-heading">
        <div><span className="hg-bio-overline">VERIFIED RESEARCH SOURCES</span>
          <h2>Additional NASA datasets</h2>
          <p>Browse one source at a time. These historical records are separate from the fictional crew simulator.</p>
        </div>
      </div>
      <label className="hg-bio-compact-selector">Research dataset
        <select value={chosen.id} onChange={event=>setGroup(event.target.value)}>
          {catalog.map(item=><option key={item.id} value={item.id}>{item.title} · {item.assay?'Historical measurements':item.source==='PENDING'?'Unconnected':'Reference only'}</option>)}
        </select>
      </label>
      <div className="hg-bio-compact-detail">
        <div className="hg-bio-expanded-heading">
          <h3>{chosen.title}</h3>
          <span className="hg-bio-label">{chosen.assay?'NASA LAB':chosen.source==='PENDING'?'NO FEED':'RESEARCH'}</span>
        </div>
        {chosen.assay?<HistoricalBrowser assay={chosen.assay} subject={subject} setSubject={setSubject}/>:
          <div className="hg-bio-description">
            <p>{chosen.desc}. No measured, per-astronaut numerical time series is attached to this source.</p>
            {CATALOG_LINKS[chosen.id]&&<a target="_blank" rel="noreferrer" href={CATALOG_LINKS[chosen.id]}>Open official NASA reference</a>}
          </div>}
      </div>
      <p className="hg-bio-foot">Source boundary: NASA OSD-575 and OSD-569 laboratory records describe historical participants, not HealthGuard's four fictional astronaut profiles. They are not streamed or assigned AI severity levels.</p>
    </section>;
  }

  const filters=[
    {id:'all',label:'All subsystems'},
    {id:'simulated',label:'Live simulator'},
    {id:'historical',label:'NASA lab'},
    {id:'context',label:'Research context'}
  ];
  const filteredGroups=GROUPS.filter(item=>{
    if(filter==='all')return true;
    if(filter==='simulated')return Boolean(item.keys);
    if(filter==='historical')return item.source==='HISTORICAL';
    return item.source==='CONTEXT'||item.source==='PENDING';
  });
  const countFor=key=>GROUPS.filter(item=>key==='all'||(key==='simulated'&&item.keys)||(key==='historical'&&item.source==='HISTORICAL')||(key==='context'&&(item.source==='CONTEXT'||item.source==='PENDING'))).length;
  return <section className="hg-bio-hub hg-bio-refined" aria-label="Subsystems and research biomarkers">
    <div className="hg-bio-heading">
      <div><span className="hg-bio-overline">MONITORING / NASA RESEARCH</span>
        <h2>Extended monitoring and NASA research</h2>
        <p>Explore current simulated systems and verified historical NASA laboratory evidence.</p>
      </div>
      <span className="hg-bio-source-summary">11 SUBSYSTEMS · 3 DATA TYPES</span>
    </div>
    <div className="hg-bio-filterbar" role="group" aria-label="Filter research subsystems">
      {filters.map(item=><button type="button" key={item.id} aria-pressed={filter===item.id}
        className={filter===item.id?'active':''} onClick={()=>{setFilter(item.id);setOpened(false);}}>
        {item.label}<span>{countFor(item.id)}</span>
      </button>)}
    </div>
    <div className="hg-bio-group-grid">
      {filteredGroups.map(item=>{
        const tier=statusOf(item,training);
        const isActive=group===item.id&&opened;
        return <button type="button" key={item.id} aria-pressed={isActive}
          className={'hg-bio-group '+(isActive?'hg-bio-group-active':'')+' hg-bio-group-'+item.source.toLowerCase()}
          onClick={()=>{if(isActive){setOpened(false);}else{setGroup(item.id);setOpened(true);}}}>
          <div className="hg-bio-card-top"><Icon name={item.icon} size={17}/><strong>{item.title}</strong>
            <span className={'hg-bio-label hg-bio-label-'+(tier||item.source).toLowerCase()}>
              {tier|| (item.source==='HISTORICAL'?'NASA LAB':item.source==='PENDING'?'NO FEED':'RESEARCH')}
            </span>
          </div>
          {item.keys?<div className="hg-bio-signal-rows">{item.keys.map(key=>{
            const m=METRICS.find(x=>x.key===key);
            return <div key={key}><span>{m?.label||key}</span><strong>{formatValue(latest?.values?.[key],m?.digits??1)} <small>{m?.unit||''}</small></strong></div>;
          })}</div>:<p>{item.desc}</p>}
          <span className="hg-bio-card-footer"><small className="hg-bio-source">
            {item.keys?(training?'SCRIPTED TRAINING':'SIMULATED DATA'):item.source==='HISTORICAL'?'HISTORICAL NASA LAB':item.source==='PENDING'?'NOT CONNECTED':'RESEARCH REFERENCE'}
          </small><Icon name="arrow" size={14}/></span>
        </button>;
      })}
    </div>
    {opened&&<div className="hg-bio-expanded">
      <div className="hg-bio-expanded-heading"><h3>{selected.title}</h3><button type="button" onClick={()=>setOpened(false)}>Close <Icon name="x" size={14}/></button></div>
      {selected.assay?<HistoricalBrowser assay={selected.assay} subject={subject} setSubject={setSubject}/>:
        selected.keys?<div className="hg-bio-description"><p>{selected.desc}. These are independent fictional simulation values for <strong>{person.name}</strong>. {training?'Training tiers describe only the scripted scenario.':'The live PhysioAlert results are experimental pattern reviews; these five readings have no medically validated severity classifications.'}</p>
          {selected.keys.map(key=><div className="hg-bio-single" key={key}><span>{METRICS.find(m=>m.key===key)?.label||key}</span><strong>{formatValue(latest?.values?.[key],METRICS.find(m=>m.key===key)?.digits??1)}</strong><span>{training?(training.metric_levels?.[key]||'OPTIMAL'):'Simulated, unclassified'}</span></div>)}
        </div>:<div className="hg-bio-description"><p>{selected.desc}. No measured, per-astronaut numerical series is currently attached to this subsystem. Its presence here is a <strong>data-source roadmap</strong>, not evidence of live measurements or clinical status.</p>{CATALOG_LINKS[selected.id]&&<a target="_blank" rel="noreferrer" href={CATALOG_LINKS[selected.id]}>Open official NASA reference</a>}</div>}
    </div>}
    <details className="hg-bio-provenance"><summary><Icon name="shield" size={15}/> Data sources and limitations <Icon name="chevron" size={14}/></summary>
      <p>NASA OSD-575 participants C001–C004 are not the four fictional dashboard astronauts. Historical CBC, CMP, Eve and Alamar records are not streamed, interpolated or classified as Optimal/Check/Warning/Critical. Source hashes are verified. C003 CBC outliers remain flagged for scientific review; scenario tiers are demonstration-only.</p>
    </details>
  </section>;
}
