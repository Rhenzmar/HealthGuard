import React,{useEffect,useMemo,useState} from 'react';
import {Icon} from './viz.jsx';
import {QUESTS,ROUTINE_CREW,localDayKey,readRoutineStore,saveRoutineStore,getCrewRoutine,
  updateCrewRoutine,summarizeCrewRoutine} from './questLogic.js';
import {MISSION_TRIALS,getCrewLifetimeXp,getMissionRank,getMissionStreak,
  missionAchievements,isMissionUnlocked,evaluateTrial} from './missionGameLogic.js';
import WellnessGame from './WellnessGame.jsx';
import './missionGame.css';

const CREW=[
  {id:'SIM_CREW_01',name:'Elena Park',role:'Commander',portrait:'/crew/elena.svg'},
  {id:'SIM_CREW_02',name:'Marcus Reed',role:'Medical Officer',portrait:'/crew/marcus.svg'},
  {id:'SIM_CREW_03',name:'Aisha Khan',role:'Systems Engineer',portrait:'/crew/aisha.svg'},
  {id:'SIM_CREW_04',name:'Daniel Cho',role:'Mission Specialist',portrait:'/crew/daniel.svg'}
];
const ICONS=['heart','shield','activity','book','check'];
const SKILLS=['01 / SENSOR LINK','02 / INTEGRITY CHECK','03 / CREW CONTEXT','04 / HUMAN SYSTEMS','05 / CAPTAIN’S LOG'];

function CrewChooser({crewId,onChange}){
  return <div className="mg-crew-chooser" role="group" aria-label="Select game crew member">
    {CREW.map(p=><button key={p.id} type="button" aria-pressed={crewId===p.id} aria-label={'Play as '+p.name} onClick={()=>onChange(p.id)} className={'mg-crew-avatar '+(crewId===p.id?'selected':'')}>
      <img src={p.portrait} alt=""/>
      <span>{p.name.split(' ')[0]}</span>
    </button>)}
  </div>;
}

function MissionMap({state,active,onSelect}){
  return <div className="mg-map" aria-label="Mission progression map">
    <div className="mg-map-title"><span><Icon name="map" size={16}/> MISSION PATH</span><small>Five stages · each crew member has independent progress</small></div>
    <div className="mg-map-track">
      {QUESTS.map((task,i)=>{
        const status=state.tasks[task.id];
        const locked=!isMissionUnlocked(state,i);
        return <button key={task.id} type="button" className={'mg-map-node '+(active===task.id?'active ':'')+(status==='complete'?'done ':status==='deferred'?'deferred ':locked?'locked ':'ready ')} disabled={locked} onClick={()=>onSelect(task.id)} aria-pressed={active===task.id}>
          <span className="mg-map-orb"><Icon name={status==='complete'?'check':locked?'lock':ICONS[i]} size={21}/></span>
          <b>{String(i+1).padStart(2,'0')}</b>
          <span>{MISSION_TRIALS[task.id].callSign}</span>
          <small>{status==='complete'?'CLEARED':status==='deferred'?'DEFERRED':locked?'LOCKED':'PLAY'}</small>
        </button>;
      })}
    </div>
  </div>;
}

function Trial({task,status,choice,setChoice,note,setNote,feedback,onSubmit,onDefer,onReplay,onOpenPage,unlocked}){
  const trial=MISSION_TRIALS[task.id],finished=status==='complete',deferred=status==='deferred';
  return <section className="mg-trial" aria-label="Selected mission challenge">
    <div className="mg-trial-upper">
      <div className="mg-trial-icon"><Icon name={task.icon} size={26}/></div>
      <div className="mg-trial-label">
        <span>{task.category} / {trial.callSign}</span>
        <h2>{task.name}</h2>
        <p>{trial.flavor}</p>
      </div>
      <span className="mg-trial-reward"><Icon name="zap" size={14}/> +{task.xp} XP</span>
    </div>
    {!unlocked?<div className="mg-trial-locked"><Icon name="lock" size={22}/><strong>Mission locked</strong><p>Clear or defer the previous mission to reach this chapter.</p></div>:<>
      <div className="mg-trial-scene"><span className="mg-scene-marker"><Icon name="radio" size={14}/> INCOMING CREW BRIEF</span><p>{trial.scene}</p></div>
      {finished?<div className="mg-success-banner" role="status"><Icon name="check-circle" size={22}/><div><strong>MISSION CLEARED</strong><span>+{task.xp} XP banked for this fictional crew member</span></div><button type="button" onClick={onReplay}>Replay</button></div>:<>
        <h3>{trial.question}</h3>
        {task.id==='evening'?<div className="mg-notebook"><label htmlFor="mg-log">Mission log</label><textarea id="mg-log" value={note} onChange={e=>setNote(e.target.value.slice(0,800))} maxLength={800} rows={5} placeholder="Example: We verified the data source, compared the simulated readings with the activity context, and noted an uncertain sensor signal."/><span>{note.trim().length} characters / minimum 12</span></div>:
          <div className="mg-options" role="group" aria-label="Choose your mission response">
            {trial.options.map((opt,i)=><button type="button" key={opt.id} aria-pressed={choice===opt.id} className={'mg-option '+(choice===opt.id?'selected':'')} onClick={()=>setChoice(opt.id)}><span>{String.fromCharCode(65+i)}</span><strong>{opt.label}</strong><Icon name={choice===opt.id?'check-circle':'circle'} size={17}/></button>)}
          </div>
        }
        {feedback&&<div className={'mg-feedback '+(feedback.correct?'mg-feedback-success':'mg-feedback-error')} role="status"><Icon name={feedback.correct?'check-circle':'info'} size={18}/><span>{feedback.message}</span></div>}
        <div className="mg-trial-actions">
          <button type="button" className="mg-main-btn" onClick={onSubmit} disabled={task.id==='evening'?note.trim().length<12:!choice}><Icon name="target" size={17}/>{task.id==='evening'?'File mission log':'Submit decision'}</button>
          <button type="button" className="mg-secondary-btn" onClick={onOpenPage}><Icon name="external-link" size={15}/> {task.action}</button>
          <button type="button" className="mg-text-btn" onClick={onDefer}>{deferred?'Resume mission':'Defer safely'}</button>
        </div>
      </>}
      <div className="mg-trial-tip"><Icon name="shield" size={15}/>{task.caution}</div>
    </>}
  </section>;
}

export default function MissionGame({selected='SIM_CREW_01',onNavigate=()=>{}}){
  const [store,setStore]=useState(()=>readRoutineStore());
  const [crewId,setCrewId]=useState(ROUTINE_CREW.includes(selected)?selected:'SIM_CREW_01');
  const [active,setActive]=useState('morning');
  const [choice,setChoice]=useState('');
  const [feedback,setFeedback]=useState(null);
  const [note,setNote]=useState('');
  const [gameDay,setGameDay]=useState(()=>localDayKey());
  const [reward,setReward]=useState(null);
  const [showRules,setShowRules]=useState(false);
  const [gameMode,setGameMode]=useState('knowledge');
  const state=getCrewRoutine(store,gameDay,crewId);
  const summary=summarizeCrewRoutine(store,gameDay,crewId);
  const lifetime=getCrewLifetimeXp(store,crewId);
  const rank=getMissionRank(lifetime);
  const streak=getMissionStreak(store,crewId);
  const badges=missionAchievements(store,gameDay,crewId);
  const task=QUESTS.find(t=>t.id===active)||QUESTS[0];
  const crew=CREW.find(x=>x.id===crewId)||CREW[0];
  const unlocked=isMissionUnlocked(state,QUESTS.findIndex(x=>x.id===task.id));

  useEffect(()=>{
    const refresh=()=>{setGameDay(localDayKey());setStore(readRoutineStore());};
    window.addEventListener('focus',refresh);
    window.addEventListener('storage',refresh);
    const interval=window.setInterval(()=>{
      const today=localDayKey();
      setGameDay(previous=>previous===today?previous:today);
    },60*1000);
    return()=>{window.removeEventListener('focus',refresh);window.removeEventListener('storage',refresh);window.clearInterval(interval)};
  },[]);
  useEffect(()=>{
    setCrewId(ROUTINE_CREW.includes(selected)?selected:'SIM_CREW_01');
  },[selected]);
  useEffect(()=>{
    setChoice('');setFeedback(null);
    setNote(getCrewRoutine(store,gameDay,crewId).note);
  },[active,crewId,gameDay]);

  function persist(next){
    setStore(next);
    const saved=saveRoutineStore(next);
    if(saved)window.dispatchEvent(new CustomEvent('healthguard-quest-updated',{detail:{crewId,day:gameDay}}));
    return saved;
  }
  function complete(){
    const verdict=evaluateTrial(task.id,choice,note);
    if(!verdict.correct){setFeedback(verdict);return;}
    const patch={taskId:task.id,status:'complete'};
    if(task.id==='evening')patch.note=note;
    const previous=state.tasks[task.id];
    const next=updateCrewRoutine(store,gameDay,crewId,patch);
    persist(next);
    setFeedback(verdict);
    if(previous!=='complete')setReward({id:task.id,name:task.name,xp:task.xp});
  }
  function defer(){
    const nextStatus=state.tasks[task.id]==='deferred'?null:'deferred';
    persist(updateCrewRoutine(store,gameDay,crewId,{taskId:task.id,status:nextStatus}));
    setFeedback(null);
  }
  function replay(){
    persist(updateCrewRoutine(store,gameDay,crewId,{taskId:task.id,status:null}));
    setChoice('');setFeedback(null);
  }
  function nextMission(){
    const index=QUESTS.findIndex(q=>q.id===active);
    const next=QUESTS.slice(index+1).find((q,j)=>isMissionUnlocked(state,index+j+1));
    if(next)setActive(next.id);
    setReward(null);
  }
  return <main className="mg-page">
    <div className="mg-stars" aria-hidden="true"/>
    <section className="mg-hero">
      <div className="mg-hero-copy"><span className="mg-eyebrow"><Icon name="satellite" size={15}/> HEALTHGUARD / CREW TRAINING ARCADE</span>
        <h1>MISSION <span>QUEST</span></h1>
        <p>Two ways to train: solve health-literacy missions or complete optional activity challenges. Earn progress in each game.</p>
        <div className="mg-hero-tags"><span><Icon name="shield-check" size={14}/> Simulation only</span><span><Icon name="gamepad-2" size={14}/> Two playable game modes</span><span><Icon name="award" size={14}/> Earn fictional XP</span></div>
      </div>
      <div className="mg-hero-crewmate"><span className="mg-hero-halo"/><img src={crew.portrait} alt={'Illustration of fictional astronaut '+crew.name}/><span className="mg-crew-callsign"><strong>{crew.name}</strong><small>{crew.role.toUpperCase()}</small></span></div>
    </section>

    <nav className="mg-game-modes" aria-label="Choose Health Routine game">
      <button type="button" className={gameMode==='knowledge'?'active':''} aria-current={gameMode==='knowledge'?'page':undefined} onClick={()=>setGameMode('knowledge')}>
        <Icon name="brain" size={22}/><span><strong>Knowledge Quest</strong><small>Learn about crew health through decisions and puzzles</small></span>
        <span className="mg-mode-label">5 MISSIONS</span>
      </button>
      <button type="button" className={gameMode==='wellness'?'active':''} aria-current={gameMode==='wellness'?'page':undefined} onClick={()=>setGameMode('wellness')}>
        <Icon name="activity" size={22}/><span><strong>Wellness Expedition</strong><small>Timed movement, mobility, calm, hydration and recovery</small></span>
        <span className="mg-mode-label">5 CHALLENGES</span>
      </button>
    </nav>
    <section className="mg-toolbar">
      <div><span className="mg-kicker">PLAY AS</span><CrewChooser crewId={crewId} onChange={id=>{setCrewId(id);setActive('morning');setReward(null)}}/></div>
      <div className="mg-toolbar-info"><span><Icon name="calendar" size={15}/> MISSION DAY {gameDay}</span><button type="button" onClick={()=>setShowRules(v=>!v)} aria-expanded={showRules}><Icon name="info" size={15}/> How to play</button></div>
    </section>
    {showRules&&<div className="mg-rules" role="note">Read the crew brief, select a decision, and submit. Correct decisions clear a chapter and award XP. Earlier chapters unlock later ones; a task can be deferred without losing points. All scores and streaks are fictional game achievements recorded in this browser, not verified wellness or medical outcomes.</div>}

    {gameMode==='wellness'?<WellnessGame crewId={crewId} crewName={crew.name}/>:
    <>
    <section className="mg-stats" aria-label="Mission game statistics">
      <div className="mg-stat"><div><Icon name="zap" size={19}/><span>TOTAL XP</span></div><strong>{lifetime}<small> XP</small></strong><p>Earned across recorded mission days</p></div>
      <div className="mg-stat"><div><Icon name="crown" size={19}/><span>CURRENT RANK</span></div><strong className="mg-rank-name">{rank.title}</strong><div className="mg-mini-progress" role="progressbar" aria-label="XP toward next rank" aria-valuenow={rank.percent} aria-valuemin={0} aria-valuemax={100}><i style={{width:rank.percent+'%'}}/></div><p>{rank.nextTitle?rank.nextXp-lifetime+' XP to '+rank.nextTitle:'Maximum rank unlocked'}</p></div>
      <div className="mg-stat"><div><Icon name="flame" size={19}/><span>MISSION STREAK</span></div><strong>{streak}<small> days</small></strong><p>Consecutive full mission days</p></div>
      <div className="mg-stat"><div><Icon name="target" size={19}/><span>TODAY'S PROGRESS</span></div><strong>{summary.done}<small> / {QUESTS.length}</small></strong><div className="mg-mini-progress" role="progressbar" aria-label="Today's mission completion" aria-valuenow={summary.percent} aria-valuemin={0} aria-valuemax={100}><i style={{width:summary.percent+'%'}}/></div><p>{summary.deferred} deferred · {summary.pending} remaining</p></div>
    </section>

    <section className="mg-content">
      <div className="mg-play-column">
        <MissionMap state={state} active={active} onSelect={id=>{setActive(id);setReward(null)}}/>
        <Trial task={task} status={state.tasks[task.id]} choice={choice} setChoice={setChoice} note={note}
          setNote={setNote} feedback={feedback} onSubmit={complete} onDefer={defer} onReplay={replay}
          onOpenPage={()=>onNavigate(MISSION_TRIALS[task.id].route)} unlocked={unlocked}/>
      </div>
      <aside className="mg-side">
        <section className="mg-side-panel">
          <div className="mg-panel-heading"><span><Icon name="trophy" size={18}/> ACHIEVEMENT CABINET</span><small>{badges.filter(b=>b.unlocked).length}/{badges.length}</small></div>
          <div className="mg-achievements">{badges.map(b=><div className={'mg-achievement '+(b.unlocked?'unlocked':'locked')} key={b.id}><span><Icon name={b.unlocked?b.icon:'lock'} size={21}/></span><div><strong>{b.name}</strong><small>{b.description}</small></div></div>)}</div>
        </section>
        <section className="mg-side-panel mg-crew-leaderboard">
          <div className="mg-panel-heading"><span><Icon name="users" size={18}/> CREW LEADERBOARD</span></div>
          {CREW.map((p,i)=>({...p,xp:getCrewLifetimeXp(store,p.id)})).sort((a,b)=>b.xp-a.xp||CREW.findIndex(p=>p.id===a.id)-CREW.findIndex(p=>p.id===b.id)).map((p,i)=><div key={p.id} className={'mg-leader '+(p.id===crewId?'current':'')}><span className="mg-leader-index">{String(i+1).padStart(2,'0')}</span><img src={p.portrait} alt=""/><strong>{p.name}</strong><b>{p.xp} XP</b></div>)}
          <p>Local, self-reported game scores. No real astronaut competition or health ranking.</p>
        </section>
        <section className="mg-side-panel mg-mission-status"><Icon name="shield-check" size={23}/><strong>TRAINING SIMULATOR</strong><p>Mission Quest is a game. Responses are educational, and challenge completion is not confirmed by sensors or NASA personnel. No task should override real mission safety procedures.</p></section>
      </aside>
    </section>
    </>}
    {reward&&<div className="mg-reward-backdrop" role="dialog" aria-modal="true" aria-labelledby="mg-reward-title"><div className="mg-reward-card"><span className="mg-reward-glow"/><div className="mg-reward-medal"><Icon name="award" size={44}/></div><p>MISSION SUCCESS</p><h2 id="mg-reward-title">{reward.name}</h2><strong>+{reward.xp} XP</strong><span>You cleared an educational training mission for {crew.name}.</span><button type="button" onClick={nextMission}>{summary.done===QUESTS.length?'Return to mission map':'Continue mission'} <Icon name="arrow-right" size={17}/></button></div></div>}
  </main>;
}
