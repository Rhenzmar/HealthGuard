import React,{useEffect,useMemo,useState} from 'react';
import {readApi,formatValue} from './api.js';
import {Icon} from './viz.jsx';
import './engineeringTelemetry.css';

const DIVISIONS=[
  {id:'cardiovascular',title:'Cardiovascular estimates',keys:['systolic_bp_mmhg','diastolic_bp_mmhg']},
  {id:'pulmonary',title:'Pulmonary estimate',keys:['etco2_mmhg']},
  {id:'thermal',title:'Peripheral thermal estimate',keys:['peripheral_temp_c']},
  {id:'environment',title:'Cabin atmosphere',keys:['cabin_co2_ppm','cabin_o2_percent','cabin_pressure_kpa','cabin_temp_c','cabin_humidity_percent']},
  {id:'radiation',title:'Radiation illustration',keys:['radiation_rate_usv_h','cumulative_dose_usv']},
  {id:'suit',title:'Suit reserve illustration',keys:['suit_o2_remaining_percent']}
];
export default function EngineeringTelemetry({subjectId,personName,training}){
  const [result,setResult]=useState(null),[issue,setIssue]=useState('');
  const [expanded,setExpanded]=useState(true);
  useEffect(()=>{
    let inactive=false;
    setResult(null);setIssue('');
    const load=()=>readApi('/api/simulation/engineering/'+encodeURIComponent(subjectId))
      .then(res=>{if(!inactive){setResult(res);setIssue('');}})
      .catch(error=>{if(!inactive)setIssue(error.message||'No simulator data');});
    load();
    const timer=setInterval(load,4200);
    return()=>{inactive=true;clearInterval(timer);};
  },[subjectId]);
  const values={...(result?.values||{}),...(training?.engineering_values||{})};
  const channels=result?.channels||{};
  const groups=useMemo(()=>DIVISIONS,[ ]);
  return <section className="hg-eng-panel" aria-label="Fictional engineering telemetry">
    <div className="hg-eng-heading">
      <div><span className="hg-eng-overline">FICTIONAL MISSION SYSTEMS</span><h2>Engineering and environmental simulator</h2>
        <p>12 independently scripted illustration channels for {personName}. No actual sensor, cabin system or NASA spacecraft feed is connected.</p></div>
      <button type="button" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?'Collapse estimates':'Show estimates'} <Icon name="chevron" size={15}/></button>
    </div>
    {expanded&&<>
      <div className="hg-eng-cards">
      {groups.map(group=><article key={group.id} className="hg-eng-group">
        <h3>{group.title}</h3>
        {group.keys.map(key=><div key={key} className="hg-eng-item">
          <span>{channels[key]?.label||key}</span>
          <strong className={training?.engineering_flags?.[key]?'hg-eng-flagged':''}>{formatValue(values[key],key==='cumulative_dose_usv'?4:key==='radiation_rate_usv_h'?3:key==='cabin_o2_percent'||key==='suit_o2_remaining_percent'||key==='cabin_pressure_kpa'?2:1)} <small>{channels[key]?.unit||''}</small></strong>
        </div>)}
        <div className="hg-eng-status">{training?.engineering_values?.[group.keys[0]]!==undefined?'SCRIPTED SCENARIO · NOT MEASURED':result?'SYNTHETIC · NOT MEASURED':'WAITING FOR SIMULATOR'}</div>
      </article>)}
      </div>
      {issue&&<p className="hg-eng-issue">Engineering API not available: {issue}. No substitute readings shown.</p>}
      <div className="hg-eng-footer"><Icon name="shield" size={15}/><p>All values in this section come from a separate deterministic engineering simulator, not from blood pressure cuffs, capnographs, a spacecraft atmosphere monitor, a dosimeter, or an actual suit. They are not fed into the frozen five-channel physiological AI. Radiation and accumulated-dose numbers are illustrative, not exposure estimates. Scenario lab can overlay separately scripted environmental disturbances while the source simulator continues independently. None of these channels feeds the frozen physiological AI.</p></div>
    </>}
  </section>;
}
