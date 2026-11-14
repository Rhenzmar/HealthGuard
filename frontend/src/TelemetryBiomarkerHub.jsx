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
  {id:'immune',title:'Immune & protein markers',icon:'shield',desc:'203 NULISA proteins from historical NASA OSD-575',assay:'NULISA',source:'HISTORICAL'},
  {id:'cbc',title:'Hematology / CBC',icon:'activity',desc:'20 CBC biomarker types from an OSD-569-labelled public mirror; one source record quarantined',assay:'CBC',source:'MIRROR'},
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
    <p className="hg-bio-disclosure">These are <strong>discrete historical research samples</strong> from {assay==='CBC'?'an OSD-569-labelled public mirror that awaits independent NASA verification':'OSD-575'}, not readings from {subject==='C001'?'Elena Park or the fictional crew':'any fictional HealthGuard astronaut'}. The most recent available sample within the study is shown, not a current health state. {assay==='CBC'?'The malformed C003 L-92 record is quarantined, not silently corrected.':'NPQ log2 values are relative protein measurements, not concentrations in pg/mL.'}</p>
    {error?<p role="alert" className="hg-bio-error">Unable to load historical measurements: {error}</p>:
    loading?<p className="hg-bio-wait">Loading historical NASA records…</p>:
    <><div className="hg-bio-count">{results?.total_biomarkers??0} available biomarker types · {assay==='CMP'?'Chemistry panel':assay==='CBC'?'CBC panel (mirror)':'Protein panel'} · No severity assigned</div>
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
export default function TelemetryBiomarkerHub({person,latest,training}){
  const [opened,setOpened]=useState(false);
  const [group,setGroup]=useState('cmp');
  const [subject,setSubject]=useState('C001');
  const selected=useMemo(()=>GROUPS.find(x=>x.id===group)||GROUPS[0],[group]);
  return <section className="hg-bio-hub" aria-label="Subsystems and research biomarkers">
    <div className="hg-bio-heading">
      <div><span className="hg-bio-overline">SUBSYSTEMS & BIOMARKERS</span><h2>Extended monitoring and NASA research</h2><p>5 fictional physiological signals · 222 OSD-575 historical biomarkers · 20 CBC markers from unverified OSD-569 mirror</p></div>
      <button type="button" onClick={()=>setOpened(x=>!x)} aria-expanded={opened}>{opened?'Collapse biomarker explorer':'Explore all subsystems'} <Icon name="chevron" size={16}/></button>
    </div>
    <div className="hg-bio-group-grid">
      {GROUPS.map(item=>{
        const tier=statusOf(item,training);
        return <button type="button" key={item.id} className={'hg-bio-group '+(group===item.id&&opened?'hg-bio-group-active':'')} onClick={()=>{setGroup(item.id);setOpened(true);}}>
          <div className="hg-bio-card-top"><Icon name={item.icon} size={18}/><strong>{item.title}</strong><span className={'hg-bio-label hg-bio-label-'+(tier||item.source).toLowerCase()}>{tier|| (item.source==='HISTORICAL'?'NASA LAB':item.source==='MIRROR'?'MIRRORED CBC':item.source==='PENDING'?'NO FEED':'RESEARCH')}</span></div>
          {item.keys?<div className="hg-bio-signal-rows">{item.keys.map(key=>{
            const m=METRICS.find(x=>x.key===key);
            return <div key={key}><span>{m?.label||key}</span><strong>{formatValue(latest?.values?.[key],m?.digits??1)} <small>{m?.unit||''}</small></strong></div>;
          })}</div>:<p>{item.desc}</p>}
          <small className="hg-bio-source">{item.keys?(training?'SCRIPTED TRAINING':'FICTIONAL CONTINUOUS STREAM'):item.source==='HISTORICAL'?'DISCRETE LAB SAMPLES':item.source==='MIRROR'?'THIRD-PARTY HISTORICAL MIRROR · QC PENDING':item.source==='PENDING'?'NOT CONNECTED':'BACKGROUND RESEARCH'}</small>
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
    <p className="hg-bio-foot">Data provenance: NASA OSD-575 historical research participants C001–C004 are not the four fictional dashboard astronauts. Historical protein, chemistry and mirrored CBC records are not streamed, interpolated, or classified as Optimal/Check/Warning/Critical. OSD-569 CBC mirror needs independent NASA file verification, with one sample excluded for reported integrity problems. Scenario tiers are demonstration-only.</p>
  </section>;
}
