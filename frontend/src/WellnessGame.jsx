import React,{useEffect,useRef,useState} from 'react';
import {Icon} from './viz.jsx';
import {localDayKey,ROUTINE_CREW} from './questLogic.js';
import {WELLNESS_CHALLENGES,readWellnessStore,saveWellnessStore,getWellnessDay,
  updateWellnessDay,wellnessDaySummary,wellnessLifetimeXp,wellnessMilestones,
  remainingSeconds,stepIndexForElapsed,breathingCue} from './wellnessGameLogic.js';
import './wellnessGame.css';

export default function WellnessGame({crewId='SIM_CREW_01',crewName='Crew member'}){
  const [store,setStore]=useState(()=>readWellnessStore());
  const [day,setDay]=useState(()=>localDayKey());
  const [active,setActive]=useState('warmup');
  const [mode,setMode]=useState('seated');
  const [stage,setStage]=useState('ready'); // ready, running, paused, confirm, complete
  const [elapsed,setElapsed]=useState(0);
  const [ack,setAck]=useState(false);
  const [feedback,setFeedback]=useState('');
  const elapsedRef=useRef(0);
  const mountedCrew=ROUTINE_CREW.includes(crewId)?crewId:'SIM_CREW_01';
  const item=WELLNESS_CHALLENGES.find(c=>c.id===active)||WELLNESS_CHALLENGES[0];
  const saved=getWellnessDay(store,day,mountedCrew);
  const progress=wellnessDaySummary(store,day,mountedCrew);
  const xp=wellnessLifetimeXp(store,mountedCrew);
  const medals=wellnessMilestones(store,day,mountedCrew);
  const remaining=remainingSeconds(item.seconds,elapsed);
  const progressPercent=Math.min(100,Math.round(elapsed/(item.seconds*1000)*100));
  const step=stepIndexForElapsed(item.seconds,elapsed);
  const breathing=breathingCue(elapsed);

  // Use a monotonic elapsed interval; a hidden tab pauses rather than
  // silently awarding activity while the user is away.
  useEffect(()=>{
    if(stage!=='running')return;
    let last=performance.now();
    const timer=window.setInterval(()=>{
      const now=performance.now();
      const dt=Math.max(0,Math.min(250,now-last));
      last=now;
      if(document.visibilityState==='hidden')return;
      elapsedRef.current=Math.min(item.seconds*1000,elapsedRef.current+dt);
      const next=elapsedRef.current;
      setElapsed(next);
      if(next>=item.seconds*1000)setStage('confirm');
    },100);
    const pause=()=>{
      if(document.visibilityState==='hidden')setStage(s=>s==='running'?'paused':s);
    };
    document.addEventListener('visibilitychange',pause);
    return()=>{window.clearInterval(timer);document.removeEventListener('visibilitychange',pause)};
  },[stage,item.seconds]);

  useEffect(()=>{
    const refresh=()=>{setDay(localDayKey());setStore(readWellnessStore())};
    window.addEventListener('storage',refresh);
    window.addEventListener('focus',refresh);
    const timer=window.setInterval(()=>setDay(localDayKey()),60_000);
    return()=>{window.removeEventListener('storage',refresh);window.removeEventListener('focus',refresh);window.clearInterval(timer)};
  },[]);

  // Switching fictional astronauts returns to the first activity; the saved
  // record for each astronaut remains independent.
  useEffect(()=>{setActive('warmup');},[mountedCrew]);

  useEffect(()=>{
    setStage('ready');setElapsed(0);elapsedRef.current=0;
    setAck(false);setFeedback('');setMode('seated');
  },[active,mountedCrew,day]);

  function save(action){
    const next=updateWellnessDay(store,day,mountedCrew,active,action,mode);
    setStore(next);
    saveWellnessStore(next);
    window.dispatchEvent(new CustomEvent('healthguard-wellness-updated',{detail:{crewId:mountedCrew,day}}));
    if(action==='complete'){setStage('complete');setFeedback('Activity logged by you. HealthGuard did not measure or verify the activity.');}
    else{setStage('ready');setFeedback(action==='skip'?'Challenge skipped. No XP penalty.':'Challenge reset.' );}
    elapsedRef.current=0;setElapsed(0);
  }
  function choose(next){
    if(stage==='running'||stage==='paused')setFeedback('Timer stopped because you selected another challenge.');
    setActive(next);
    setStage('ready');elapsedRef.current=0;setElapsed(0);setAck(false);
  }
  function start(){
    if(saved.challenges[active]?.status==='complete')return;
    setFeedback('');setAck(false);
    if(stage==='confirm')return;
    setStage('running');
  }
  return <div className="wg-root">
    <section className="wg-top">
      <div><span className="wg-eyebrow"><Icon name="activity" size={15}/> MISSION QUEST / WELLNESS EXPEDITION</span>
        <h2>TRAIN YOUR <span>CREW</span></h2>
        <p>Short optional activity challenges to make the crew routine more interactive. Choose a comfortable alternative and log only what you actually did.</p>
        <div className="wg-top-chips"><span><Icon name="timer" size={14}/> 20–35 second activities</span><span><Icon name="shield-check" size={14}/> Safe seated options</span><span><Icon name="zap" size={14}/> Self-reported XP</span></div>
      </div>
      <div className="wg-today"><span>DAILY EXPEDITION</span><strong>{progress.done}<small> / {WELLNESS_CHALLENGES.length}</small></strong><div className="wg-meter"><i style={{width:progress.percent+'%'}}/></div><p>{progress.xp} XP today · {xp} XP total</p></div>
    </section>
    <div className="wg-safety"><Icon name="info" size={17}/><p>This is a voluntary, educational activity game for the fictional crew profile <strong>{crewName}</strong>. It does not track motion, breathing, water intake, fitness, or compliance. Use activities suitable for you and follow medical or authorized mission restrictions. Skip freely.</p></div>
    <div className="wg-layout">
      <section className="wg-mission-select" aria-label="Wellness challenge list">
        <div className="wg-section-title"><Icon name="list" size={17}/> ACTIVITY MISSIONS <span>CHOOSE ANY</span></div>
        {WELLNESS_CHALLENGES.map((challenge,index)=>{
          const status=saved.challenges[challenge.id]?.status;
          return <button type="button" key={challenge.id} onClick={()=>choose(challenge.id)} aria-pressed={active===challenge.id}
            className={'wg-mission '+(active===challenge.id?'is-active ':'')+(status==='complete'?'is-done ':'')}>
            <span className={'wg-icon wg-'+challenge.accent}><Icon name={status==='complete'?'check':challenge.icon} size={21}/></span>
            <span className="wg-mission-text"><small>MISSION {String(index+1).padStart(2,'0')} · {challenge.category}</small><strong>{challenge.title}</strong><em>{challenge.seconds} seconds · +{challenge.xp} XP</em></span>
            <span className="wg-mission-status">{status==='complete'?'CLEARED':status==='skipped'?'SKIPPED':active===challenge.id?'ACTIVE':'PLAY'}</span>
          </button>;
        })}
      </section>
      <section className="wg-play" aria-label="Wellness activity challenge">
        <div className="wg-play-header"><div><span>{item.callSign} · {item.category}</span><h3>{item.title}</h3><p>{item.intro}</p></div><span className="wg-play-xp"><Icon name="zap" size={14}/> +{item.xp} XP</span></div>
        {saved.challenges[active]?.status==='complete'?
          <div className="wg-cleared" role="status"><Icon name="badge-check" size={42}/><h4>MISSION COMPLETE</h4><p>This activity is logged for today. Completion is self-reported and not verified by sensors.</p><button type="button" onClick={()=>save('reset')}>Replay challenge</button></div>:
        <>
          <div className="wg-modes" role="group" aria-label="Choose activity adaptation">
            <button type="button" aria-pressed={mode==='seated'} disabled={stage!=='ready'} onClick={()=>setMode('seated')}><Icon name="armchair" size={17}/> Seated / gentle</button>
            <button type="button" aria-pressed={mode==='standing'} disabled={stage!=='ready'} onClick={()=>setMode('standing')}><Icon name="footprints" size={17}/> Standing / mobile</button>
          </div>
          <div className="wg-session">
            <div className="wg-clock-wrap">
              <svg viewBox="0 0 220 220" role="img" aria-label={remaining+' seconds remaining'}><circle className="wg-clock-track" cx="110" cy="110" r="91"/><circle className="wg-clock-progress" cx="110" cy="110" r="91" pathLength="100" strokeDasharray="100" strokeDashoffset={100-progressPercent} transform="rotate(-90 110 110)"/></svg>
              <div className="wg-clock-inner"><span>{stage==='running'?'IN PROGRESS':stage==='paused'?'PAUSED':stage==='confirm'?'TIMER COMPLETE':'READY FOR LAUNCH'}</span><strong>{String(Math.floor(remaining/60)).padStart(2,'0')}:{String(remaining%60).padStart(2,'0')}</strong><small>{item.seconds}-second mission</small></div>
            </div>
            {active==='breathing'&&stage==='running'?
              <div className={'wg-breathe '+breathing.phase} aria-live="off"><span className="wg-breathe-orb"/><strong>{breathing.label}</strong><small>Gentle cue only · never hold your breath</small></div>
              :<div className="wg-stage"><span>STEP {step+1} / 3</span><strong>{(mode==='seated'?item.seated:item.standing)[step]}</strong><p>{item.goal}</p></div>}
          </div>
          <div className="wg-actions">
            {stage==='ready'&&<button className="wg-primary" type="button" onClick={start}><Icon name="play" size={18}/> Begin challenge</button>}
            {stage==='running'&&<button className="wg-primary" type="button" onClick={()=>setStage('paused')}><Icon name="pause" size={17}/> Pause challenge</button>}
            {stage==='paused'&&<button className="wg-primary" type="button" onClick={start}><Icon name="play" size={18}/> Resume challenge</button>}
            {['running','paused'].includes(stage)&&<button className="wg-secondary" type="button" onClick={()=>{setStage('ready');elapsedRef.current=0;setElapsed(0)}}>Restart timer</button>}
            {stage==='confirm'&&<div className="wg-confirm"><div><Icon name="check-circle" size={19}/><strong>Timer finished. Did you actually complete the activity?</strong></div>
              <label><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/> I completed this optional activity at my own pace.</label>
              <button className="wg-primary" type="button" disabled={!ack} onClick={()=>save('complete')}>Log completion · +{item.xp} XP</button>
              <button className="wg-secondary" type="button" onClick={()=>save('skip')}>Not completed</button>
            </div>}
            {stage==='ready'&&<button className="wg-secondary" type="button" onClick={()=>save('skip')}>Skip challenge</button>}
          </div>
          {feedback&&<p className="wg-feedback" role="status">{feedback}</p>}
          <div className="wg-caution"><Icon name="shield" size={16}/>{item.safety}</div>
        </>}
      </section>
      <aside className="wg-rewards">
        <div className="wg-section-title"><Icon name="trophy" size={18}/> WELLNESS BADGES <span>{medals.filter(m=>m.earned).length}/{medals.length}</span></div>
        <div className="wg-medal-grid">{medals.map(m=><div className={'wg-medal '+(m.earned?'earned':'')} key={m.id}><span><Icon name={m.earned?m.icon:'lock'} size={22}/></span><strong>{m.name}</strong><small>{m.description}</small></div>)}</div>
        <div className="wg-reward-footer"><Icon name="heart-handshake" size={21}/><strong>No penalties for rest or skipping</strong><p>The aim is to encourage safe habits, not to pressure anyone into exercise. Knowledge Quest XP and Wellness Expedition XP are tracked separately.</p></div>
      </aside>
    </div>
  </div>;
}
