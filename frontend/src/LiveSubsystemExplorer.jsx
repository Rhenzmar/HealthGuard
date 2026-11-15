import React,{useEffect,useState} from 'react';
import {Icon} from './viz.jsx';
import {formatValue} from './api.js';
import {SUBSYSTEMS,CHANNEL_KEYS,subsystemValues} from './liveSubsystemCatalog.js';
import './liveSubsystemExplorer.css';

/**
 * Live Crew Telemetry only. Historical NASA OSDR records are deliberately
 * absent from this catalog and remain available in Health Library.
 */
export default function LiveSubsystemExplorer({person,latest,engineering,training,engineeringIssue=false}){
  const [filter,setFilter]=useState('all');
  const [opened,setOpened]=useState(null);
  useEffect(()=>{setOpened(null);},[person?.subjectId]);
  const groups=SUBSYSTEMS.filter(group=>filter==='all'||group.branch===filter);
  const live=training?.values||latest?.values||{};
  const engineeringValues={...(engineering?.values||{}),...(training?.engineering_values||{})};
  const rowsFor=group=>subsystemValues(group,live,engineeringValues);
  const selected=SUBSYSTEMS.find(item=>item.id===opened);
  const totalAvailable=CHANNEL_KEYS.filter(key=>{
    const entry=rowsFor(SUBSYSTEMS.find(item=>item.keys.includes(key))).find(item=>item.key===key);
    return entry?.value!==null;
  }).length;
  return <section className="hg-subsystems" aria-label="17-channel HealthGuard simulator subsystem explorer">
    <header className="hg-subsystems-head">
      <div><span className="hg-subsystems-eyebrow">HEALTHGUARD / SIMULATED MONITORING</span>
        <h2>Physiological and engineering systems</h2>
        <p>17 experimental model inputs, grouped by the systems they represent.</p></div>
      <div className="hg-subsystems-total"><strong>{totalAvailable}/17</strong><span>VALUES AVAILABLE</span></div>
    </header>
    <div className="hg-subsystems-filters" role="group" aria-label="Filter monitored systems">
      {[{id:'all',name:'All systems',count:17},{id:'physiological',name:'Physiological',count:9},{id:'engineering',name:'Engineering',count:8}].map(option=>
        <button key={option.id} type="button" aria-pressed={filter===option.id} className={filter===option.id?'active':''}
          onClick={()=>{setFilter(option.id);setOpened(null);}}>{option.name}<span>{option.count}</span></button>)}
    </div>
    <div className="hg-subsystems-grid">
      {groups.map(group=>{
        const rows=rowsFor(group);
        const count=rows.filter(row=>row.value!==null).length;
        const isOpen=opened===group.id;
        return <button key={group.id} type="button" className={'hg-subsystem-card '+(isOpen?'active':'')}
          aria-pressed={isOpen} aria-controls="hg-subsystem-detail" aria-expanded={isOpen}
          onClick={()=>setOpened(previous=>previous===group.id?null:group.id)}>
          <div className="hg-subsystem-card-head"><Icon name={group.icon} size={19}/><strong>{group.title}</strong>
            <span>{group.branch==='physiological'?'PHYSIOLOGICAL':'ENGINEERING'}</span></div>
          <p>{group.description}</p>
          <div className="hg-subsystem-card-readings">
            {rows.map(row=><div key={row.key}><span>{row.label}{row.origin==='estimate'?' · est.':''}</span>
              <strong>{formatValue(row.value,row.digits)} <small>{row.unit}</small></strong>
            </div>)}
          </div>
          <div className="hg-subsystem-card-count"><b>{count}/{group.keys.length}</b> available <span>{isOpen?'Hide details':'View details'}</span><Icon name="arrow" size={15}/></div>
        </button>;
      })}
    </div>
    {selected&&groups.some(item=>item.id===selected.id)&&<div className="hg-subsystems-detail" id="hg-subsystem-detail">
      <div className="hg-subsystems-detail-head"><div><span>SELECTED SYSTEM</span><h3>{selected.title}</h3></div>
        <button type="button" onClick={()=>setOpened(null)} aria-label="Close selected system details"><Icon name="x" size={17}/></button></div>
      <div className="hg-subsystems-readings">
        {rowsFor(selected).map(row=><div key={row.key} className="hg-subsystems-reading">
          <span>{row.label}{row.origin==='estimate'&&<small> scripted estimate</small>}</span>
          <strong>{formatValue(row.value,row.digits)} <small>{row.unit}</small></strong>
        </div>)}
      </div>
      <p>{selected.branch==='physiological'?'Five channels use the fictional physiological stream; blood pressure, peripheral temperature and end-tidal CO₂ are separate scripted estimates.':
        'These values come from the independent fictional engineering simulator, not connected spacecraft instruments.'}
        {engineeringIssue?' The engineering simulator is currently unavailable.':''}</p>
    </div>}
    <footer className="hg-subsystems-foot"><Icon name="shield" size={15}/>
      Experimental 17-channel model inputs are synthetic, not astronaut sensor measurements or clinical diagnoses. Historical NASA laboratory records remain in Health Library.
    </footer>
  </section>;
}
