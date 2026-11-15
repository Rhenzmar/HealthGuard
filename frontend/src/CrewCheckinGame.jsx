import React,{useEffect,useMemo,useState} from 'react';
import {Icon} from './viz.jsx';
import {localDayKey,ROUTINE_CREW} from './questLogic.js';
import {CHECKIN_STAGES,CHECKIN_REGIONS,MOODS,MANUAL_FIELDS,
  readCheckinStore,saveCheckinStore,getCheckinDay,updateCheckinDay,
  checkinSummary,checkinLifetimeXp,getCheckinHistory,removeCheckinDay,
  checkinBadges} from './checkinGameLogic.js';
import './crewCheckinGame.css';

const INITIAL={
  sleep:{hours:7.5,rest:7},
  mind:{fatigue:4,mood:'okay',workload:40},
  body:{none:false,regions:{},note:''},
  manual:{}
};
const copy=v=>JSON.parse(JSON.stringify(v));
function Scale({label,unit='',value,min,max,step=1,onChange,left,right}){
  return <div className="cg-scale">
    <div className="cg-scale-top"><label>{label}</label><strong>{value} {unit}</strong></div>
    <input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={e=>onChange(Number(e.target.value))}/>
    <div className="cg-scale-ticks"><small>{left||min}</small><small>{right||max}</small></div>
  </div>;
}
function BodyMap({regions,onRegion}){
  return <div className="cg-anatomy" role="group" aria-label="Select a body region">
    <svg className="cg-body-outline" viewBox="0 0 120 245" aria-hidden="true">
      <circle cx="60" cy="29" r="18"/><path d="M49 47v10L31 70l-17 59 8 7 23-49 2 63-8 65 10 10 13-64 13 64 10-10-8-65 2-63 23 49 8-7-17-59-18-13V47" fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"/>
      <path d="M39 80h42M47 111h26M48 140h24" stroke="currentColor" strokeWidth="1" opacity=".35"/>
    </svg>
    {CHECKIN_REGIONS.map((r,index)=><button type="button" key={r.id} style={{left:r.x+'%',top:r.y+'%'}}
      className={'cg-body-pin '+(regions[r.id]?'selected':'')} aria-label={'Select '+r.name}
      aria-pressed={Boolean(regions[r.id])} onClick={()=>onRegion(r.id)} title={r.name}>{index+1}</button>)}
  </div>;
}
const phaseInitial=(entry,id)=>entry[id]===null?copy(INITIAL[id]):{
  ...copy(INITIAL[id]),...(entry[id]||{})
};
export default function CrewCheckinGame({crewId='SIM_CREW_01',crewName='Crew member'}){
  const id=ROUTINE_CREW.includes(crewId)?crewId:'SIM_CREW_01';
  const [store,setStore]=useState(()=>readCheckinStore());
  const [day,setDay]=useState(()=>localDayKey());
  const [stepIndex,setStepIndex]=useState(0);
  const [draft,setDraft]=useState(()=>copy(INITIAL.sleep));
  const [notice,setNotice]=useState('');
  const [showHistory,setShowHistory]=useState(false);
  const [confirmDelete,setConfirmDelete]=useState(false);
  const current=CHECKIN_STAGES[stepIndex];
  const record=getCheckinDay(store,day,id);
  const summary=checkinSummary(store,day,id);
  const points=checkinLifetimeXp(store,id);
  const history=getCheckinHistory(store,id);
  const badges=checkinBadges(store,day,id);
  const status=record.stamps[current.id];
  const completedCount=summary.done;

  useEffect(()=>{
    const refresh=()=>{setStore(readCheckinStore());setDay(localDayKey())};
    window.addEventListener('focus',refresh);
    window.addEventListener('storage',refresh);
    const timer=setInterval(()=>setDay(localDayKey()),60_000);
    return()=>{window.removeEventListener('focus',refresh);window.removeEventListener('storage',refresh);clearInterval(timer)};
  },[]);
  useEffect(()=>{
    const entry=getCheckinDay(store,day,id);
    setDraft(phaseInitial(entry,CHECKIN_STAGES[stepIndex].id));
    setNotice('');
    setConfirmDelete(false);
  },[id,day,stepIndex]);

  const update=(field,value)=>setDraft(v=>({...v,[field]:value}));
  function selectStep(next){
    setStepIndex(next);setNotice('');
    setDraft(phaseInitial(getCheckinDay(store,day,id),CHECKIN_STAGES[next].id));
  }
  function commit(skip=false){
    const outcome=updateCheckinDay(store,day,id,current.id,draft,{skip});
    if(!outcome.ok){setNotice(outcome.message);return}
    setStore(outcome.store);
    saveCheckinStore(outcome.store);
    setNotice(outcome.message);
    if(stepIndex<CHECKIN_STAGES.length-1){
      window.setTimeout(()=>selectStep(stepIndex+1),0);
    }else{setShowHistory(true)}
  }
  function clearDay(){
    const next=removeCheckinDay(store,day,id);
    setStore(next);saveCheckinStore(next);
    setStepIndex(0);setDraft(copy(INITIAL.sleep));
    setShowHistory(false);setConfirmDelete(false);
    setNotice('Today’s entries for this crew member were cleared from this browser.');
  }
  function toggleRegion(region){
    setDraft(v=>{
      const selected={...(v.regions||{})};
      if(selected[region])delete selected[region];
      else selected[region]=1;
      return {...v,none:false,regions:selected};
    });
  }
  return <div className="cg-root">
    <section className="cg-banner">
      <div><span className="cg-eyebrow"><Icon name="clipboard-list" size={15}/> CREW CHECK-IN / DAILY MISSION</span>
        <h2>DAILY <span>HEALTH LOG</span></h2>
        <p>A personal reflection game for fictional astronauts. Complete or skip each checkpoint to collect mission stamps. HealthGuard does not diagnose, score fitness, or validate the responses.</p></div>
      <div className="cg-status"><span>MISSION STAMPS</span><strong>{completedCount}<small> / 4</small></strong><div className="cg-progress"><i style={{width:summary.percent+'%'}}/></div><p>{points} lifetime XP · {summary.skipped} skipped today</p></div>
    </section>
    <div className="cg-privacy"><Icon name="lock" size={16}/><p><strong>Private, voluntary self-report.</strong> Entries stay in this browser for {crewName}. They are not uploaded, do not change live simulator vitals or PhysioAlert, and are not real NASA health records. Prefer not to answer is always available.</p></div>

    <nav className="cg-steps" aria-label="Crew Check-In checkpoints">
      {CHECKIN_STAGES.map((step,i)=><button key={step.id} type="button" onClick={()=>selectStep(i)} aria-current={stepIndex===i?'step':undefined} className={'cg-step '+(i===stepIndex?'active':'')}>
        <span className="cg-step-orb"><Icon name={record.stamps[step.id]==='logged'?'check':record.stamps[step.id]==='skipped'?'minus':step.icon} size={18}/></span>
        <span><small>CHECKPOINT {String(i+1).padStart(2,'0')}</small><strong>{step.subtitle}</strong><em>{record.stamps[step.id]==='logged'?'STAMP EARNED':record.stamps[step.id]==='skipped'?'SKIPPED':'READY'}</em></span>
      </button>)}
      <button type="button" onClick={()=>setShowHistory(v=>!v)} className={'cg-step cg-history-tab '+(showHistory?'active':'')}><span className="cg-step-orb"><Icon name="history" size={18}/></span><span><small>YOUR MISSION RECORDS</small><strong>History</strong><em>{history.length} recorded days</em></span></button>
    </nav>

    <div className="cg-content">
      <section className="cg-panel" aria-label="Daily self-check-in challenge">
        {showHistory?<div className="cg-history">
          <div className="cg-panel-title"><span><Icon name="history" size={20}/> PERSONAL MISSION ARCHIVE</span><button type="button" className="cg-ghost" onClick={()=>setShowHistory(false)}>Back to check-in</button></div>
          <p>All saved dates are local to this browser and the selected fictional crew profile. Records are descriptive only.</p>
          {history.length===0?<div className="cg-empty">No check-in records yet. Complete or skip a checkpoint to add one.</div>:
            <div className="cg-history-list">{history.map(h=><div className="cg-history-row" key={h.day}>
              <div><strong>{h.day}</strong><small>{h.done}/4 checkpoints · {h.xp} XP</small></div>
              <div className="cg-history-pills">
                {h.sleep&&<span>Sleep {h.sleep.hours}h</span>}
                {h.mind&&<span>Fatigue {h.mind.fatigue}/10</span>}
                {h.body&&<span>{h.body.none?'No discomfort noted':Object.keys(h.body.regions||{}).length+' regions noted'}</span>}
                {h.hasManualReadings&&<span>Optional readings logged</span>}
                {h.skipped>0&&<span>{h.skipped} skipped</span>}
              </div>
            </div>)}</div>}
        </div>:<>
          <div className="cg-panel-title"><span><Icon name={current.icon} size={21}/> {current.title.toUpperCase()}</span><strong className="cg-reward"><Icon name="zap" size={14}/> +{current.xp} XP</strong></div>
          <p className="cg-description">{current.id==='sleep'?'Record how long the fictional crew member slept and how rested they feel. This is a subjective report, not a sleep sensor.':current.id==='mind'?'Choose the crew member’s perceived fatigue, mood, and mental demand. These are personal reflections, not a clinical test.':current.id==='body'?'Explore the body map. Mark an area only if you want to describe discomfort. You may choose no discomfort or skip.':'Optional measurements may be typed manually, with their original units. Leave fields blank when unknown; nothing will be inferred or copied from simulated readings.'}</p>

          {current.id==='sleep'&&<div className="cg-slider-grid">
            <Scale label="Hours of sleep" unit="hours" value={draft.hours??7.5} min={0} max={12} step={0.5} left="0 hours" right="12 hours" onChange={v=>update('hours',v)}/>
            <Scale label="How rested do you feel?" unit="/ 10" value={draft.rest??7} min={1} max={10} left="Not rested" right="Very rested" onChange={v=>update('rest',v)}/>
            <div className="cg-note-wide"><Icon name="info" size={16}/> There is no right answer. Sleep amount alone does not determine an astronaut’s health or readiness.</div>
          </div>}
          {current.id==='mind'&&<div className="cg-mind">
            <div className="cg-slider-grid"><Scale label="Perceived fatigue" unit="/ 10" value={draft.fatigue??4} min={1} max={10} left="Low fatigue" right="High fatigue" onChange={v=>update('fatigue',v)}/>
              <Scale label="Perceived mental workload" unit="/ 100" value={draft.workload??40} min={0} max={100} step={5} left="Low demand" right="High demand" onChange={v=>update('workload',v)}/></div>
            <div className="cg-mood"><strong>How does the crew member feel?</strong><div role="group" aria-label="Select a mood">{MOODS.map(m=><button type="button" key={m.id} aria-pressed={draft.mood===m.id} onClick={()=>update('mood',m.id)}><Icon name={m.icon} size={19}/>{m.label}</button>)}</div></div>
            <div className="cg-note-wide">Workload is a single subjective slider, not an official NASA-TLX assessment or a validated mental-health screening score.</div>
          </div>}
          {current.id==='body'&&<div className="cg-body-screen">
            <BodyMap regions={draft.regions||{}} onRegion={toggleRegion}/>
            <div className="cg-body-controls"><strong>Body comfort map</strong><small>Select an area to describe discomfort. No diagnosis is made.</small>
              <label className="cg-none"><input type="checkbox" checked={Boolean(draft.none)} onChange={e=>setDraft(v=>({...v,none:e.target.checked,regions:e.target.checked?{}:v.regions}))}/> No discomfort to report</label>
              {CHECKIN_REGIONS.map(r=>draft.regions?.[r.id]&&!draft.none?<div className="cg-region-entry" key={r.id}><label>{r.name}</label><select aria-label={r.name+' discomfort level'} value={draft.regions[r.id]} onChange={e=>setDraft(v=>({...v,regions:{...v.regions,[r.id]:Number(e.target.value)}}))}>
                <option value={1}>Mild</option><option value={2}>Moderate</option><option value={3}>Strong</option></select><button type="button" onClick={()=>toggleRegion(r.id)} aria-label={'Remove '+r.name}><Icon name="x" size={16}/></button></div>:null)}
              <label className="cg-small-label" htmlFor="cg-body-note">Optional personal note</label>
              <textarea id="cg-body-note" value={draft.note||''} maxLength={250} rows={3} onChange={e=>update('note',e.target.value)} placeholder="Describe a discomfort or leave blank."/>
            </div>
          </div>}
          {current.id==='manual'&&<div className="cg-manual"><div className="cg-manual-info"><Icon name="shield-check" size={18}/> Use measured numbers only if you actually have them. Do not copy the simulated live feed as personal readings. All six fields can stay blank.</div>
            <div className="cg-manual-grid">{MANUAL_FIELDS.map(f=><label key={f.id}>{f.name}<span><input type="number" inputMode="decimal" value={draft[f.id]??''} min={f.min} max={f.max} step={f.step} onChange={e=>update(f.id,e.target.value)} placeholder="Optional" aria-label={f.name}/><small>{f.unit}</small></span></label>)}</div>
          </div>}
          {notice&&<div className="cg-feedback" role="status">{notice}</div>}
          <div className="cg-actions"><button type="button" className="cg-continue" onClick={()=>commit(false)}><Icon name="check-circle" size={18}/> {status?'Update checkpoint':'Save checkpoint'} <Icon name="arrow-right" size={17}/></button>
            <button type="button" className="cg-skip" onClick={()=>commit(true)}>Prefer not to answer · collect stamp</button>
            {stepIndex>0&&<button type="button" className="cg-back" onClick={()=>selectStep(stepIndex-1)}>Previous</button>}</div>
          <p className="cg-safe"><Icon name="heart-handshake" size={15}/> You receive the checkpoint stamp whether you answer or skip. No health value improves or reduces XP. For actual symptoms, seek appropriate professional or mission medical guidance.</p>
        </>}
      </section>
      <aside className="cg-side">
        <div className="cg-side-panel"><div className="cg-panel-title"><span><Icon name="trophy" size={18}/> CREW CHECK-IN BADGES</span><small>{badges.filter(b=>b.earned).length}/{badges.length}</small></div>
          <div className="cg-badges">{badges.map(b=><div className={b.earned?'earned':''} key={b.name}><Icon name={b.earned?b.icon:'lock'} size={21}/><strong>{b.name}</strong></div>)}</div></div>
        <div className="cg-side-panel"><div className="cg-panel-title"><span><Icon name="calendar" size={18}/> TODAY’S CHECK-IN</span></div>
          <div className="cg-today-row"><span>Recorded checkpoints</span><strong>{summary.logged}</strong></div>
          <div className="cg-today-row"><span>Preferred not to answer</span><strong>{summary.skipped}</strong></div>
          <div className="cg-today-row"><span>Check-in XP</span><strong>{summary.xp}</strong></div>
          <div className="cg-today-row"><span>Overall progress</span><strong>{summary.percent}%</strong></div>
          <div className="cg-progress"><i style={{width:summary.percent+'%'}}/></div>
          {summary.finished&&<div className="cg-complete"><Icon name="award" size={20}/> Daily mission complete. All four checkpoints received a stamp.</div>}
        </div>
        <div className="cg-side-panel"><div className="cg-panel-title"><span><Icon name="lock-keyhole" size={18}/> DATA CONTROLS</span></div><p>Check-in notes stay in this browser. To clear today's entry for {crewName}, choose below.</p>
          {!confirmDelete?<button type="button" className="cg-danger" onClick={()=>setConfirmDelete(true)}>Clear today's entries</button>:<div className="cg-confirm-delete"><strong>Clear today for {crewName}?</strong><button type="button" onClick={clearDay}>Yes, clear today</button><button type="button" onClick={()=>setConfirmDelete(false)}>Cancel</button></div>}</div>
      </aside>
    </div>
  </div>;
}
