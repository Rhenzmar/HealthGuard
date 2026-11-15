import React,{useEffect,useRef,useState} from 'react';
import {Icon} from './viz.jsx';
import {localDayKey,ROUTINE_CREW} from './questLogic.js';
import {readCheckinStore} from './checkinGameLogic.js';
import {COUNTERMEASURE_TASKS,SUPPLY_CHECKS,readCountermeasureStore,saveCountermeasureStore,
  countermeasureEntries,updateCountermeasure,countermeasureSummary,countermeasureLifetimeXp,
  countermeasureBadges,remainingCountermeasureSeconds,medianReactionMs} from './countermeasureLogic.js';
import './countermeasureGame.css';

const DRILLS={
  resistance:{title:'Resistance Preparation',seconds:25,summary:'A gentle mobility break, not an ARED workout.',
    seated:['Sit securely in a supported position.','Move your arms gently within a comfortable range.','Relax your shoulders and rest.'],
    standing:['Stand near stable support if needed.','Gently raise and lower your arms at your own pace.','Pause and let your shoulders relax.'],
    safety:'Not a workout prescription. Do not attempt weighted squats, deadlifts, or strenuous exercise for game points.'},
  aerobic:{title:'Aerobic Motion Drill',seconds:30,summary:'A light movement break, not a cycle ergometer protocol.',
    seated:['Find a comfortable seated position.','Try gentle seated steps or relaxed arm movements.','Slow down and rest when ready.'],
    standing:['Find a safe space free from obstacles.','Walk gently in place only if comfortable.','Slow down and return to rest.'],
    safety:'No prescribed heart rate or exertion. Stop for pain, dizziness, chest discomfort or unusual breathlessness.'}
};
function Meter({value,label}){
  return <div className="cm-meter" role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}><i style={{width:value+'%'}}/></div>;
}
function MovementDrill({task,status,onOutcome,crewId}){
  const detail=DRILLS[task];
  const [mode,setMode]=useState('seated'),[phase,setPhase]=useState('ready');
  const [elapsed,setElapsed]=useState(0),[confirmed,setConfirmed]=useState(false);
  const elapsedRef=useRef(0);
  useEffect(()=>{setMode('seated');setPhase('ready');setElapsed(0);setConfirmed(false);elapsedRef.current=0},[task,crewId]);
  useEffect(()=>{
    if(phase!=='running')return;
    let last=performance.now();
    const ticker=window.setInterval(()=>{
      const now=performance.now(),delta=Math.max(0,Math.min(250,now-last));last=now;
      if(document.visibilityState==='hidden')return;
      elapsedRef.current=Math.min(detail.seconds*1000,elapsedRef.current+delta);
      setElapsed(elapsedRef.current);
      if(elapsedRef.current>=detail.seconds*1000)setPhase('confirm');
    },100);
    const visibility=()=>{if(document.visibilityState==='hidden')setPhase(v=>v==='running'?'paused':v)};
    document.addEventListener('visibilitychange',visibility);
    return()=>{clearInterval(ticker);document.removeEventListener('visibilitychange',visibility)};
  },[phase,detail.seconds]);
  const sec=remainingCountermeasureSeconds(detail.seconds,elapsed);
  const step=Math.min(2,Math.floor(elapsed/(detail.seconds*1000/3)));
  return <section className="cm-panel cm-workout" aria-label="Movement challenge">
    <div className="cm-panel-heading"><span><Icon name="activity" size={18}/> MOVEMENT DRILL</span><small>OPTIONAL · SIMULATED</small></div>
    <div className="cm-workout-heading"><div><h3>{detail.title}</h3><p>{detail.summary}</p></div><span className="cm-points"><Icon name="zap" size={14}/> +20 XP</span></div>
    {status==='complete'?<div className="cm-stamped" role="status"><Icon name="check-circle" size={24}/><strong>Activity logged</strong><p>Completion was self-reported, not measured.</p><button type="button" onClick={()=>onOutcome(task,'reset')}>Replay activity</button></div>:<>
      <div className="cm-mode-choice" role="group" aria-label="Choose movement adaptation">
        <button type="button" disabled={phase!=='ready'} aria-pressed={mode==='seated'} onClick={()=>setMode('seated')}><Icon name="armchair" size={16}/> Seated / gentle</button>
        <button type="button" disabled={phase!=='ready'} aria-pressed={mode==='standing'} onClick={()=>setMode('standing')}><Icon name="footprints" size={16}/> Standing / mobile</button>
      </div>
      <div className="cm-exercise-stage">
        <div className="cm-clock"><small>{phase==='running'?'IN PROGRESS':phase==='paused'?'PAUSED':phase==='confirm'?'TIMER COMPLETE':'READY'}</small><strong>{String(Math.floor(sec/60)).padStart(2,'0')}:{String(sec%60).padStart(2,'0')}</strong><span>{detail.seconds}-second activity</span></div>
        <div className="cm-workout-guide"><small>STEP {step+1}/3</small><strong>{detail[mode][step]}</strong><p>{detail.safety}</p></div>
      </div>
      {phase==='confirm'?<div className="cm-verify"><label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> I actually completed this optional activity at my own pace.</label><button type="button" className="cm-primary" disabled={!confirmed} onClick={()=>onOutcome(task,'complete',{mode})}>Log activity · +20 XP</button></div>:
      <div className="cm-actions">
        {phase==='ready'&&<button className="cm-primary" type="button" onClick={()=>setPhase('running')}><Icon name="play" size={16}/> Start activity</button>}
        {phase==='running'&&<button className="cm-primary" type="button" onClick={()=>setPhase('paused')}><Icon name="pause" size={16}/> Pause</button>}
        {phase==='paused'&&<button className="cm-primary" type="button" onClick={()=>setPhase('running')}><Icon name="play" size={16}/> Resume</button>}
        {['running','paused'].includes(phase)&&<button className="cm-secondary" type="button" onClick={()=>{setPhase('ready');elapsedRef.current=0;setElapsed(0)}}>Restart timer</button>}
        <button className="cm-secondary" type="button" onClick={()=>onOutcome(task,'skipped')}>Skip without penalty</button>
      </div>}
    </>}
  </section>;
}
function FluidBay({status,onOutcome,crewId}){
  const [checks,setChecks]=useState({});
  useEffect(()=>{setChecks({})},[crewId,status]);
  const count=SUPPLY_CHECKS.filter(x=>checks[x.id]).length;
  return <section className="cm-panel cm-fluid" aria-label="Fluid supply game">
    <div className="cm-panel-heading"><span><Icon name="droplets" size={18}/> FLUID SUPPLY BAY</span><small>{count}/3 CHECKS</small></div>
    <p>Verify a fictional hydration supply kit. This is a logistics puzzle, not a drinking target.</p>
    <Meter value={Math.round(count/3*100)} label="Fictional fluid supply inspection progress"/>
    {status==='complete'?<div className="cm-stamped cm-mini-stamped"><Icon name="check-circle" size={20}/><strong>Supply bay secured</strong><button type="button" onClick={()=>onOutcome('fluid','reset')}>Reset puzzle</button></div>:<>
      <div className="cm-supply-tasks">{SUPPLY_CHECKS.map(c=><button key={c.id} type="button" aria-pressed={Boolean(checks[c.id])} className={checks[c.id]?'selected':''} onClick={()=>setChecks(v=>({...v,[c.id]:!v[c.id]}))}><Icon name={checks[c.id]?'check-circle':c.icon} size={17}/>{c.label}</button>)}</div>
      <div className="cm-actions"><button type="button" className="cm-primary" disabled={count!==3} onClick={()=>onOutcome('fluid','complete',{checks})}>Verify supply kit · +20 XP</button><button type="button" className="cm-secondary" onClick={()=>onOutcome('fluid','skipped')}>Skip</button></div>
    </>}
    <small className="cm-help">No water intake is measured. Actual hydration needs depend on personal or authorized mission guidance.</small>
  </section>;
}
function ReactionArcade({status,onOutcome,crewId}){
  const [r,setR]=useState({phase:'ready',times:[],falseStarts:0});
  const timeout=useRef(null),goAt=useRef(null);
  const cancel=()=>{if(timeout.current!==null)clearTimeout(timeout.current);timeout.current=null;goAt.current=null};
  useEffect(()=>()=>cancel(),[]);
  useEffect(()=>{cancel();setR({phase:'ready',times:[],falseStarts:0})},[crewId]);
  useEffect(()=>{
    const hidden=()=>{
      if(document.visibilityState==='hidden'){
        cancel();setR(v=>['waiting','go'].includes(v.phase)?{...v,phase:'paused'}:v);
      }
    };
    document.addEventListener('visibilitychange',hidden);
    return()=>document.removeEventListener('visibilitychange',hidden);
  },[]);
  const begin=()=>{
    cancel();setR(x=>({...x,phase:'waiting'}));
    timeout.current=setTimeout(()=>{timeout.current=null;goAt.current=performance.now();setR(x=>({...x,phase:'go'}))},1100+Math.floor(Math.random()*900));
  };
  const tap=()=>{
    if(r.phase==='waiting'){cancel();setR(x=>({...x,phase:'early',falseStarts:x.falseStarts+1}));return}
    if(r.phase!=='go'||goAt.current===null)return;
    const ms=Math.round(performance.now()-goAt.current);goAt.current=null;
    setR(x=>ms>10000?{...x,phase:'late'}:(()=>{const times=[...x.times,ms];return {...x,times,phase:times.length===3?'finished':'result'}})());
  };
  const n=r.times.length,finished=n===3;
  return <section className="cm-panel cm-reaction" aria-label="Reaction Arcade game">
    <div className="cm-panel-heading"><span><Icon name="brain" size={18}/> REACTION ARCADE</span><small>3 VISUAL SIGNALS</small></div>
    <p>Wait for the screen to change, then tap. This casual drill is not a validated NASA psychomotor vigilance test or fatigue assessment.</p>
    {status==='complete'?<div className="cm-stamped cm-mini-stamped"><Icon name="check-circle" size={20}/><strong>Reaction mission logged</strong><button type="button" onClick={()=>{setR({phase:'ready',times:[],falseStarts:0});onOutcome('reaction','reset')}}>Replay</button></div>:
      <div className="cm-reaction-box">
        <div className="cm-reaction-info"><span>ROUND {Math.min(n+1,3)}/3</span><span>{n?'MEDIAN '+medianReactionMs(r.times)+' ms':'NO TIMES YET'}</span></div>
        {r.phase==='ready'?<div className="cm-reaction-message"><Icon name="timer" size={29}/><strong>Reaction test ready</strong><small>Do not tap until the signal appears.</small><button type="button" className="cm-primary" onClick={begin}>Start reaction drill</button></div>:
          ['waiting','go'].includes(r.phase)?<button type="button" aria-label={r.phase==='waiting'?'Waiting for signal, avoid tapping':'Tap now'} onClick={tap}
            className={'cm-target '+(r.phase==='go'?'go':'waiting')}><strong>{r.phase==='go'?'TAP NOW':'WAIT FOR SIGNAL'}</strong><small>{r.phase==='go'?'Click immediately':'Do not click yet'}</small></button>:
          <div className="cm-reaction-message">
            <strong>{r.phase==='early'?'False start':r.phase==='paused'?'Drill paused':r.phase==='late'?'Signal timed out':finished?'Three rounds complete':'Recorded '+r.times.at(-1)+' ms'}</strong>
            <small>{r.phase==='early'?'No timing recorded. Retry when ready.':finished?'Game median: '+medianReactionMs(r.times)+' ms. No medical classification.':r.phase==='paused'?'The page was hidden. Retry this round.':'You can try the next round.'}</small>
            {finished?<button className="cm-primary" type="button" onClick={()=>onOutcome('reaction','complete',{times:r.times})}>Log results · +20 XP</button>:
              <button className="cm-primary" type="button" onClick={begin}>{n?'Next round':'Retry signal'}</button>}
          </div>}
        <div className="cm-reaction-footer"><span>VALID {n}/3</span><span>FALSE STARTS {r.falseStarts}</span></div>
        <button type="button" className="cm-quiet-skip" onClick={()=>{cancel();onOutcome('reaction','skipped')}}>Skip without penalty</button>
      </div>}
  </section>;
}
export default function CountermeasureGame({crewId='SIM_CREW_01',crewName='Crew member',telemetry=null,onOpenCheckin=()=>{}}){
  const id=ROUTINE_CREW.includes(crewId)?crewId:'SIM_CREW_01';
  const [store,setStore]=useState(()=>readCountermeasureStore());
  const [checkins,setCheckins]=useState(()=>readCheckinStore());
  const [day,setDay]=useState(()=>localDayKey());
  const [active,setActive]=useState('resistance'),[message,setMessage]=useState('');
  const entries=countermeasureEntries(store,day,id);
  const summary=countermeasureSummary(store,checkins,day,id);
  const lifetime=countermeasureLifetimeXp(store,checkins,id);
  const badges=countermeasureBadges(store,checkins,day,id);
  const values=telemetry?.values||{};
  const reading=(key,digits=0)=>Number.isFinite(values[key])?Number(values[key]).toFixed(digits):'—';
  useEffect(()=>{
    const refresh=()=>{setStore(readCountermeasureStore());setCheckins(readCheckinStore());setDay(localDayKey())};
    window.addEventListener('focus',refresh);window.addEventListener('storage',refresh);
    const timer=setInterval(()=>setDay(localDayKey()),60000);
    return()=>{window.removeEventListener('focus',refresh);window.removeEventListener('storage',refresh);clearInterval(timer)};
  },[]);
  useEffect(()=>{setActive('resistance');setMessage('')},[id,day]);
  function outcome(task,action,details={}){
    const next=updateCountermeasure(store,day,id,task,action,details);
    if(next===store){setMessage('Finish the game action before collecting this stamp, or choose Skip.');return}
    setStore(next);saveCountermeasureStore(next);
    setMessage(action==='skipped'?'Skipped safely. Your mission stamp was still awarded.':action==='reset'?'Task reset for replay.':'Mission stamp awarded. This is a fictional game record, not sensor verification.');
  }
  return <div className="cm-root">
    <section className="cm-banner">
      <div><span className="cm-kicker"><Icon name="shield-check" size={17}/> HEALTHGUARD / DAILY COUNTERMEASURE GAME</span><h2>COUNTERMEASURE <span>OPS</span></h2><p>Run through a fictional astronaut's shift: crew check-in, mobility drills, reaction signals and a spacecraft supply inspection.</p></div>
      <span className="cm-warning"><Icon name="radio" size={15}/> FICTIONAL TRAINING · NOT MEDICAL CLEARANCE</span>
    </section>
    <div className="cm-stats">
      <div className="cm-stat"><span>SELECTED CREW</span><strong>{crewName}</strong><small>Fictional astronaut profile</small></div>
      <div className="cm-stat"><span>LIVE SIMULATED FEED</span><strong>{reading('heart_rate_bpm')} <small>bpm · HR</small></strong><small>SpO₂ {reading('spo2_percent',1)}% · Simulator only</small></div>
      <div className="cm-stat"><span>TODAY'S MISSION PROGRESS</span><strong>{summary.stamped}/5 <small>stamps</small></strong><Meter value={summary.percent} label="Countermeasure task progress"/><small>{summary.skipped} skipped · {summary.pending} pending</small></div>
      <div className="cm-stat"><span>MISSION XP</span><strong>{lifetime} <small>XP</small></strong><small>{badges.filter(x=>x.earned).length}/{badges.length} badges unlocked</small></div>
    </div>
    <p className="cm-boundary"><Icon name="info" size={16}/> Participation in this game is optional. Skipping any task awards the same stamp and XP. No health metric is altered, and no real astronaut regimen is prescribed.</p>
    <div className="cm-columns">
      <div className="cm-left">
        <section className="cm-panel"><div className="cm-panel-heading"><span><Icon name="list-check" size={19}/> DAILY COUNTERMEASURE SCHEDULE</span><small>{summary.stamped}/5 GAME STAMPS</small></div><p>Choose a challenge to play. The status reflects game interaction, not confirmed adherence.</p>
          <div className="cm-task-list">{COUNTERMEASURE_TASKS.map(task=>{
            const status=summary.statuses[task.id];
            return <button key={task.id} type="button" className={'cm-task '+(active===task.id?'selected ':'')+(status!=='pending'?'stamped':'')} aria-pressed={active===task.id}
              onClick={()=>{setMessage('');if(task.id==='checkin')onOpenCheckin();else setActive(task.id)}}>
              <span className="cm-task-mark"><Icon name={status==='complete'?'check-circle':status==='skipped'?'minus':task.icon} size={22}/></span>
              <span className="cm-task-text"><strong>{task.label}</strong><small>{task.hint}</small></span>
              <span className="cm-task-meta"><em>{task.tag}</em><small>{status==='complete'?'STAMP EARNED':status==='skipped'?'SKIPPED · STAMP':task.id==='checkin'?String(summary.checkinStamps)+'/4 CHECK-IN':'PLAY'}</small></span>
            </button>;
          })}</div>
          {message&&<div className="cm-feedback" role="status">{message}</div>}
        </section>
        {['resistance','aerobic'].includes(active)?
          <MovementDrill key={active+'-'+id} task={active} status={entries[active]?.status} crewId={id} onOutcome={outcome}/>:
          <div className="cm-panel cm-hint-panel"><div className="cm-panel-heading"><span><Icon name="target" size={19}/> CURRENT MISSION</span></div><h3>{active==='reaction'?'Reaction Arcade':'Fluid Supply Challenge'}</h3><p>{active==='reaction'?'Use the randomized signal game to the right. A reaction result is only a personal game score.':'Inspect three fictional water-supply systems in the panel to the right.'}</p><button type="button" className="cm-secondary" onClick={()=>setActive('resistance')}>Return to movement drills</button></div>}
      </div>
      <aside className="cm-right">
        <FluidBay key={'fluid-'+id+'-'+day} status={entries.fluid?.status} onOutcome={outcome} crewId={id}/>
        <ReactionArcade key={'reaction-'+id+'-'+day} status={entries.reaction?.status} onOutcome={outcome} crewId={id}/>
        <section className="cm-panel cm-achievements"><div className="cm-panel-heading"><span><Icon name="trophy" size={18}/> MISSION ACHIEVEMENTS</span><small>{badges.filter(b=>b.earned).length}/{badges.length}</small></div>
          <div className="cm-badge-grid">{badges.map(b=><div key={b.id} className={b.earned?'earned':''}><Icon name={b.earned?b.icon:'lock'} size={19}/><span>{b.label}</span></div>)}</div>
        </section>
      </aside>
    </div>
  </div>;
}
