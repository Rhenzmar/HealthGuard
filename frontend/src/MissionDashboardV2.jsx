
import React,{Suspense,useEffect,useRef,useState} from 'react';
import ScenarioConsole from './ScenarioConsole.jsx';
import TelemetryBiomarkerHub from './TelemetryBiomarkerHub.jsx';
import EngineeringTelemetry from './EngineeringTelemetry.jsx';
import {SCENARIOS,SCENARIO_LENGTH} from './scenarioSimulator.js';
import {METRICS,formatValue,friendlyStatus,statusTone,timelineLabel,readApi} from './api.js';
import {Icon,VitalChart} from './viz.jsx';
import {EnvironmentPicker,ENVIRONMENTS} from './HealthGuardPages.jsx';
import {QUESTS,getQuestPoints,getQuestCompletion} from './questLogic.js';
import {ATTRIBUTION} from 'open-anatomy-3d';
import 'open-anatomy-3d-react/styles.css';

const AnatomyViewer=React.lazy(()=>import('open-anatomy-3d-react').then(m=>({default:m.AnatomyViewer})));
const CREW=[
  {name:'Cmdr. Elena Park',role:'Flight commander',initials:'EP',portrait:'one',image:'/crew/elena.svg',stream:true,subjectId:'SIM_CREW_01'},
  {name:'Dr. Marcus Reed',role:'Medical officer',initials:'MR',portrait:'two',image:'/crew/marcus.svg',stream:true,subjectId:'SIM_CREW_02'},
  {name:'Lt. Aisha Khan',role:'Systems engineer',initials:'AK',portrait:'three',image:'/crew/aisha.svg',stream:true,subjectId:'SIM_CREW_03'},
  {name:'Spc. Daniel Cho',role:'Mission specialist',initials:'DC',portrait:'four',image:'/crew/daniel.svg',stream:true,subjectId:'SIM_CREW_04'}
];
const DATE_KEY=()=>new Date().toISOString().slice(0,10);
function getRoutine(){
  try{
    const data=JSON.parse(window.localStorage.getItem('healthguard-mission-quest-v1')||'{}');
    const statuses=data[DATE_KEY()]||{};
    const finished=QUESTS.filter(q=>statuses[q.id]==='complete').map(q=>q.id);
    return {done:finished.length,ids:finished,percent:getQuestCompletion(finished),xp:getQuestPoints(finished)};
  }catch{return {done:0,ids:[],percent:0,xp:0};}
}
function metricValue(packet,key,digits=0,unit=''){
  const raw=packet?.values?.[key];
  return <>{formatValue(raw,digits)}{unit&&<small> {unit}</small>}</>;
}
function Hero({environment,onEnvironment,connected,review,progress,subjects,hasTelemetry,training}){
  const env=ENVIRONMENTS.find(e=>e.id===environment)||ENVIRONMENTS[3];
  const summary=training?(training.alert?'Training alert':'Scenario playback'):!hasTelemetry?'Awaiting telemetry':review?.status?friendlyStatus(review.status):'Collecting data';
  return <section className="hg6-hero" aria-label="Mission overview">
    <div className="hg6-hero-copy">
      <p className="hg6-overline">MISSION OVERVIEW <span className="hg6-sim-note">· FICTIONAL SCENARIO</span></p>
      <h1>ARTEMIS IV <small>· DEMO</small></h1>
      <p>{env.name} scenario <span aria-hidden="true">·</span> Simulated crew health monitoring</p>
    </div>
    <div className="hg6-hero-statbar">
      <div><Icon name="satellite" size={20}/><span>DATA SOURCE<strong>Simulator</strong></span></div>
      <div><Icon name="users" size={20}/><span>CREW STREAMS<strong>{connected?subjects.length:0} <small>connected</small></strong></span></div>
      <div><Icon name="shield" size={20}/><span>PATTERN REVIEW<strong className="hg6-review-stat">{summary}</strong></span></div>
      <div><span className="hg6-ring hg6-ring-small" style={{'--pct':progress.percent}}><b>{progress.percent}%</b></span><span>DAILY ROUTINE<strong>{progress.done}/{QUESTS.length} tasks</strong></span></div>
    </div>
    <div className="hg6-hero-env"><EnvironmentPicker value={environment} onChange={onEnvironment} compact/></div>
  </section>;
}
function CrewStrip({activeCrewIndex,onSelect,connected,availableSubjects,onManage}){
  return <section className="hg6-strip">
    <div className="hg6-strip-heading">
      <div><Icon name="users" size={18}/><h2>Crew overview</h2><span className="hg6-outline-pill">4 fictional astronauts · 4 independent simulator streams</span></div>
      <button type="button" className="hg6-small-action" onClick={onManage}>Mission Control <Icon name="arrow" size={15}/></button>
    </div>
    <div className="hg6-crew-grid">
      {CREW.map((person,i)=><button key={person.initials} type="button" className={'hg6-crew-card '+(i===activeCrewIndex?'hg6-crew-selected':'')} aria-pressed={i===activeCrewIndex} aria-label={'Select '+person.name} onClick={()=>onSelect(i)}>
        <span className={'hg6-avatar hg6-avatar-'+person.portrait}><img src={person.image} alt={person.name+' fictional astronaut portrait'} loading="lazy"/><span className="hg6-fallback-initials">{person.initials}</span></span>
        <span className="hg6-crew-text"><strong>{person.name}</strong><small>{person.role} · fictional</small><em className={connected&&availableSubjects.includes(person.subjectId)?'hg6-stream-on':'hg6-stream-off'}><i/>{connected&&availableSubjects.includes(person.subjectId)?'Simulated stream live':'Stream reconnecting'}</em></span>
        <Icon name="arrow" size={17}/>
      </button>)}
    </div>
  </section>;
}
class ViewerBoundary extends React.Component{
  constructor(p){super(p);this.state={error:false};}
  static getDerivedStateFromError(){return {error:true};}
  render(){return this.state.error?<div className="hg6-body-placeholder"><Icon name="heart" size={29}/><span>Body preview unavailable</span></div>:this.props.children;}
}
function MiniAnatomy({onBody}){
  return <div className="hg6-anatomy-mini" data-theme="dark">
    <ViewerBoundary><Suspense fallback={<div className="hg6-body-placeholder"><span className="spinning"/><span>Loading body preview</span></div>}>
      <AnatomyViewer defaultSex="female" pins={[]} showSexToggle={false} showLayerToggles={false} showZoomControls={false} showRotateControl={false} hoverHint="Open Body Explorer" onStructureClick={onBody} className="hg6-anatomy-view"/>
    </Suspense></ViewerBoundary>
  </div>;
}
function RowSummary({glyph,label,children,note}){
  return <div className="hg6-summary-row"><Icon name={glyph} size={17}/><span>{label}</span><strong>{children}</strong><small>{note}</small></div>;
}
function SelectedCrew({person,hasTelemetry,latest,review,unified,connection,onTelemetry,onBody,onProfile,training}){

  if(!hasTelemetry)return <section className="hg6-card hg6-selected" aria-label={'Selected crew '+person.name}>
    <div className="hg6-card-heading"><h2><Icon name="user" size={19}/> Selected crew: {person.name}</h2><span className="hg6-quiet-badge">FICTIONAL CREW 0{CREW.indexOf(person)+1}</span></div>
    <div className="hg6-selected-body">
      <div className="hg6-small-human hg6-selected-portrait"><img src={person.image} alt={'Fictional astronaut '+person.name+' wearing a space suit'}/><button type="button" onClick={onProfile}>View crew profile <Icon name="arrow" size={13}/></button></div>
      <div className="hg6-health-summary hg6-unavailable-summary"><div className="hg6-crew-unavailable" role="status"><span className="hg6-crew-unavailable-icon"><Icon name="radio" size={26}/></span><h3>Awaiting simulator stream</h3><p>{person.name} has an independent fictional telemetry source assigned. Waiting for its first valid packet.</p><div className="hg6-crew-no-data"><span>Vital signs</span><strong>Not available</strong></div><div className="hg6-crew-no-data"><span>PhysioAlert</span><strong>Awaiting data</strong></div></div></div>
    </div>
    <div className="hg6-selected-foot"><span>Only the selected crew member’s simulator packets are displayed.</span><button type="button" onClick={onProfile}>View crew profile <Icon name="arrow" size={15}/></button></div>
  </section>;
  const status=review?.status||'AWAITING_DATA';
  const trainingAttention=unified?.classification_domain==='FICTIONAL_MISSION_TRAINING_ONLY'?unified.status:null;
  const quality=review?.quality?.status;
  return <section className={"hg6-card hg6-selected "+(training?"hg6-selected-training":"")}>
    <div className="hg6-card-heading"><h2><Icon name="user" size={19}/> Selected crew: {person.name}</h2><span className="hg6-quiet-badge">{training?"SCRIPTED TRAINING":"FICTIONAL CREW 0"+(CREW.indexOf(person)+1)}</span></div>
    <div className="hg6-selected-body">
      <div className="hg6-small-human hg6-selected-portrait"><img src={person.image} alt={"Illustration of fictional astronaut "+person.name+" wearing a space suit"}/><button type="button" onClick={onBody}>Open Body Explorer <Icon name="arrow" size={13}/></button></div>
      <div className="hg6-health-summary">
        <div className="hg6-summary-intro"><div><h3>Health monitoring summary</h3><p>{training?'17 scripted channels · Backend model inference':'17 simulated signals · Experimental pattern review'}</p></div><span className={'hg6-state '+(training?.alert?'hg6-state-danger':statusTone(status)==='mint'?'hg6-state-mint':'')}>{training?(training.alert?'Training alert':'Scenario playback'):trainingAttention?trainingAttention+' · Training':friendlyStatus(status)}</span></div>
        <RowSummary glyph="heart" label="Cardiovascular" note="Simulated"><span>HR {formatValue(latest?.values?.heart_rate_bpm,0)} bpm</span><span className="hg6-sep"> · </span><span>HRV {formatValue(latest?.values?.hrv_rmssd_ms,1)} ms</span></RowSummary>
        <RowSummary glyph="wind" label="Respiratory" note="Simulated"><span>SpO₂ {formatValue(latest?.values?.spo2_percent,1)}%</span><span className="hg6-sep"> · </span><span>RR {formatValue(latest?.values?.respiratory_rate_bpm,1)}/min</span></RowSummary>
        <RowSummary glyph="thermometer" label="Thermal" note="Simulated"><span>Core {formatValue(latest?.values?.core_temp_c,2)} °C</span></RowSummary>
        <RowSummary glyph="shield" label={training?"Scenario status":"Pattern review"} note={training?"Scripted":"Experimental"}>{training?(training.alert?"Training trigger active":training.stage):trainingAttention?trainingAttention+' · Training':friendlyStatus(status)}</RowSummary>
        <RowSummary glyph="activity" label="Signal quality" note={training?"Not evaluated":"Quality check"}>{training?"Not evaluated":friendlyStatus(quality||"NOT_EVALUATED")}</RowSummary>
      </div>
    </div>
    <div className="hg6-selected-foot"><span>{training?'Scripted scenario · No clinical diagnosis or actual sensor feed.':'Model status is not a clinical diagnosis.'}</span><button type="button" onClick={onTelemetry}>View detailed telemetry <Icon name="arrow" size={15}/></button></div>
  </section>;
}
function LiveVitals({hasTelemetry,latest,connection,onMetric,training}){
  if(!hasTelemetry)return <section className="hg6-card hg6-vitals"><div className="hg6-card-heading"><h2><Icon name="pulse" size={19}/> Live vitals</h2><span className="hg6-connection"><i/>Not connected</span></div><div className="hg6-empty-panel"><Icon name="radio" size={24}/><strong>No vital signs available</strong><p>Waiting for the selected crew member’s simulator data.</p></div></section>;
  return <section className="hg6-card hg6-vitals"><div className="hg6-card-heading"><h2><Icon name="pulse" size={19}/>{training?'Scenario vitals':'Live vitals'}</h2><span className={'hg6-connection '+(connection==='connected'?'connected':'')}><i/>{training?'Scripted playback':connection==='connected'?'Simulated stream':'Reconnecting'}</span></div>
    <div className="hg6-vital-lines">{METRICS.map(m=><button type="button" key={m.key} className={training?.flags?.[m.key]?"hg6-vital-flagged":""} onClick={()=>onMetric(m.key)} title={"View "+m.label+" trend"}>
      <span style={{color:m.color}}><Icon name={m.glyph} size={18}/></span><span>{m.label}</span><strong>{metricValue(latest,m.key,m.digits,m.unit)}</strong>
    </button>)}</div>
  </section>;
}
function PhysioAlert({hasTelemetry,review,unified,voice,speak,speaking,training,onTrainingSpeak,liveAlertsEnabled,onToggleLiveAlerts}){
  if(!hasTelemetry)return <section className="hg6-card hg6-alert"><div className="hg6-card-heading"><h2><Icon name="shield" size={19}/> PhysioAlert</h2><span className="hg6-quiet-badge">CONTEXTUAL REVIEW</span></div><div className="hg6-empty-panel hg6-empty-alert"><Icon name="shield" size={26}/><strong>Awaiting telemetry</strong><p>PhysioAlert is awaiting this crew member’s own valid measurements.</p></div><div className="hg6-alert-bottom"><small>No assessment available</small><small>Not a diagnosis</small></div></section>;
  const status=review?.status||'AWAITING_DATA';
  const isUnified=unified?.classification_domain==='FICTIONAL_MISSION_TRAINING_ONLY';
  const attention=training?.severity||(isUnified?unified.status:null);
  const tone=attention==='CRITICAL'?'red':attention==='WARNING'||attention==='CHECK'?'amber':attention==='OPTIMAL'?'mint':statusTone(status);
  return <section className="hg6-card hg6-alert"><div className="hg6-card-heading"><h2><Icon name="shield" size={19}/>{training?"Scenario response":"PhysioAlert"}</h2><span className="hg6-quiet-badge">{training?"SCRIPTED TRAINING":isUnified?"17-CHANNEL TRAINING REVIEW":"CONTEXTUAL REVIEW"}</span></div>
    <div className={"hg6-alert-state hg6-alert-"+tone+(training?.alert?" hg6-alert-training":"")}><span className="hg6-alert-symbol"><Icon name={tone==='mint'?'check':'activity'} size={23}/></span><div><strong>{training?(attention+" · Training"):isUnified?(attention+" · Training"):friendlyStatus(status)}</strong><p>{training?training.reason:isUnified?unified.reason:review?.reason||"Collecting valid measurements to review simulated physiological patterns."}</p></div></div>
    {!training&&isUnified&&<div className="hg6-unified-summary"><span>{unified.models_ready?'17-channel and original model evidence available':'Collecting complete model evidence'}</span>{unified.explanation?.candidate_17ch?.top_reconstruction_residuals?.length>0&&<small>Largest numerical residual: {unified.explanation.candidate_17ch.top_reconstruction_residuals[0].channel.replaceAll('_',' ')}</small>}<small>Training attention, not medical severity</small></div>}
    {!training&&isUnified&&<div className="hg6-live-alert-preference"><button type="button" aria-pressed={liveAlertsEnabled} onClick={onToggleLiveAlerts}><Icon name={liveAlertsEnabled?'volume':'mute'} size={13}/>{liveAlertsEnabled?'Live training sound enabled':'Enable training sound + voice'}</button><small>Opt-in · only Warning/Critical</small></div>}
    <div className="hg6-alert-bottom">{training?<button type="button" onClick={onTrainingSpeak}><Icon name="volume" size={15}/> Speak training guidance <Icon name="arrow" size={14}/></button>:voice?.text?<button type="button" onClick={speak}><Icon name={speaking?'mute':'volume'} size={15}/>{speaking?'Stop explanation':'Explain result'} <Icon name="arrow" size={14}/></button>:<span>Waiting for a review explanation</span>}<small>Not a diagnosis</small></div>
  </section>;
}
function Trend({hasTelemetry,samples,keyValue,onChange,training}){
  if(!hasTelemetry)return <section className="hg6-card hg6-trend" id="hg6-trend"><div className="hg6-card-heading"><h2><Icon name="activity" size={18}/> Live trend: <span>Unavailable</span></h2></div><div className="hg6-trend-empty"><Icon name="activity" size={24}/><span>No trend data for this crew member. Waiting for this crew member’s simulated measurements.</span></div></section>;
  const metric=METRICS.find(m=>m.key===keyValue)||METRICS[0];
  return <section className="hg6-card hg6-trend" id="hg6-trend"><div className="hg6-card-heading"><h2><Icon name="activity" size={18}/> {training?"Scenario trend: ":"Live trend: "}<span>{metric.label}</span></h2><label><span className="sr-only">Select chart measurement</span><select value={metric.key} onChange={e=>onChange(e.target.value)}>{METRICS.map(m=><option key={m.key} value={m.key}>{m.label}</option>)}</select></label></div>
    <div className="hg6-trend-plot"><VitalChart data={samples} metric={metric}/></div>
    <p className="hg6-trend-footer">{training?"Scripted playback":"Latest "+samples.length+" received simulator samples"} · Not a 24-hour recording</p>
  </section>;
}
function Routine({progress,onOpen}){
  const today=getRoutine();
  const shown=QUESTS.slice(0,4);
  return <section className="hg6-card hg6-routine"><div className="hg6-routine-label"><Icon name="check" size={24}/><div><h2>Mission routine</h2><p>Daily check-ins and learning tasks</p></div></div>
    <div className="hg6-donut" style={{'--pct':progress.percent}} role="progressbar" aria-label="Routine completion" aria-valuenow={progress.percent} aria-valuemin={0} aria-valuemax={100}><div><strong>{progress.percent}%</strong><small>Complete</small></div></div>
    <div className="hg6-routine-list">{shown.map(q=><div key={q.id} className={today.ids.includes(q.id)?'hg6-done':''}><Icon name={today.ids.includes(q.id)?'check':'circle'} size={15}/><span>{q.name}</span></div>)}</div>
    <button type="button" className="hg6-routine-link" onClick={onOpen}>Open routine <Icon name="arrow" size={17}/></button>
  </section>;
}
function CrewTelemetry({person,selected,latest,samples,review,cnn,comparison,onClose,onBody,training}){
  const [key,setKey]=useState(METRICS[0].key);
  const metric=METRICS.find(x=>x.key===key)||METRICS[0];
  return <section className="hg6-telemetry" aria-label="Detailed crew telemetry">
    <div className="hg6-telemetry-heading"><button type="button" onClick={onClose}><Icon name="arrow" size={15}/> Back to Mission Dashboard</button><div><p className="hg6-overline">{training?"CREW TELEMETRY · SCRIPTED TRAINING":"CREW TELEMETRY · SIMULATED STREAM"}</p><h1><img className="hg6-telemetry-avatar" src={person.image} alt={'Fictional astronaut '+person.name}/> {person.name} <span>· Crew {String(CREW.indexOf(person)+1).padStart(2,'0')}</span></h1><p>{training?"Synthetic training measurements evaluated by the trained CNN. Neither these measurements nor model flags are clinical diagnoses.":"Detailed numerical monitoring. No live medical sensors are connected."}</p></div></div>
    <div className="hg6-telemetry-metrics">{METRICS.map(m=><button type="button" key={m.key} className={key===m.key?'active':''} onClick={()=>setKey(m.key)}><span>{m.label}</span><strong>{metricValue(latest,m.key,m.digits,m.unit)}</strong></button>)}</div>
    <div className="hg6-telemetry-bottom"><div className="hg6-card"><div className="hg6-card-heading"><h2>{metric.label} · latest samples</h2></div><div className="hg6-large-graph"><VitalChart data={samples} metric={metric}/></div><p className="hg6-trend-footer">{samples.length} available simulator packets</p></div>
    <div className="hg6-card hg6-telemetry-review"><div className="hg6-card-heading"><h2>{training?"Scenario review":"Model comparison"}</h2></div>{training?<><p><span>Training scenario</span><strong>{training.scenario_id}</strong></p><p><span>Illustrative trigger</span><strong>{training.alert?"Active":"Not active"}</strong></p><p><span>17-channel CNN</span><strong>{friendlyStatus(training.model_evidence?.candidate_17ch?.status)}</strong></p><p><span>Five-channel CNN</span><strong>{friendlyStatus(training.model_evidence?.five_channel_cnn?.status)}</strong></p><p><span>Statistical detector</span><strong>{friendlyStatus(training.model_evidence?.statistical_comparator?.status)}</strong></p><p><span>Unified review</span><strong>{training.model_evidence?.unified?.status||"Unavailable"} · Training</strong></p></>:<><p><span>PhysioAlert</span><strong>{friendlyStatus(review?.status)}</strong></p><p><span>CNN autoencoder</span><strong>{friendlyStatus(cnn?.status)}</strong></p><p><span>Statistical detector</span><strong>{friendlyStatus(comparison?.status)}</strong></p><p><span>Measurement quality</span><strong>{friendlyStatus(review?.quality?.status)}</strong></p></>}<button type="button" onClick={onBody}>Open Body Explorer <Icon name="arrow" size={16}/></button></div></div>
  </section>;
}

function CrewProfile({person,onClose,onMission,latest,training}){
  return <section className="hg6-profile" aria-label={person.name+' astronaut profile'}>
    <button type="button" className="hg6-profile-back" onClick={onClose}><Icon name="arrow" size={17}/> Back to crew overview</button>
    <div className="hg6-profile-grid">
      <div className="hg6-profile-photo">
        <img src={person.image} alt={'Portrait of fictional astronaut '+person.name+' in a spacecraft and space suit'}/>
        <span className="hg6-profile-label">FICTIONAL MISSION CREW</span>
      </div>
      <div className="hg6-profile-information">
        <p className="hg6-overline">HEALTHGUARD · CREW PROFILE</p>
        <h1>{person.name}</h1>
        <p className="hg6-profile-role">{person.role} · Artemis IV demonstration</p>
        <div className="hg6-profile-status"><Icon name="radio" size={21}/><div><strong>{latest?'Simulator profile active':'Awaiting simulator stream'}</strong><p>{latest?'This astronaut has an independent fictional physiological simulator feed.':'No recent fictional telemetry packet available for this crew member.'} Not a real astronaut medical record.</p></div></div>
        <div className="hg6-profile-details"><div><span>Heart rate</span><strong>{formatValue(latest?.values?.heart_rate_bpm,0)} bpm</strong></div><div><span>Oxygen saturation</span><strong>{formatValue(latest?.values?.spo2_percent,1)}%</strong></div><div><span>Telemetry mode</span><strong>{training?'Scripted training':'Fictional simulation'}</strong></div><div><span>Routine progress</span><strong>Not recorded</strong></div></div>
        <p className="hg6-profile-context">Physiological values are fictional simulator samples, not observations from a person in space. Historical NASA OSDR records are not assigned to this crew member.</p>
        <div className="hg6-profile-actions"><button type="button" onClick={onClose}>Return to dashboard</button><button type="button" onClick={onMission}>Mission Control <Icon name="arrow" size={15}/></button></div>
      </div>
    </div>
  </section>;
}

export default function MissionDashboard({error,readiness,snapshot,selected,setSelected,samples=[],review,cnn,comparison,unified,voice,speaking,speak,connection,onBody,onRoutine,onHUD,onMission,environment,onEnvironment}){
  const [metricKey,setMetricKey]=useState(METRICS[0].key);
  const [activeCrewIndex,setActiveCrewIndex]=useState(0);
  const activeCrew=CREW[activeCrewIndex];
  const hasTelemetry=Boolean(snapshot?.subjects?.[activeCrew.subjectId]?.latest);
  const streamConnected=connection==='connected'&&hasTelemetry;
  const [showTelemetry,setShowTelemetry]=useState(false);
  const [infoProfile,setInfoProfile]=useState(null);
  const [scenarioId,setScenarioId]=useState('');
  const [scenarioSecond,setScenarioSecond]=useState(0);
  const [scenarioRunning,setScenarioRunning]=useState(false);
  const [scenarioFrame,setScenarioFrame]=useState(null);
  const [scenarioFetchError,setScenarioFetchError]=useState('');
  const [scenarioPending,setScenarioPending]=useState(false);
  const [scenarioSound,setScenarioSound]=useState(true);
  const [liveAlertsEnabled,setLiveAlertsEnabled]=useState(false);
  const lastLiveAttentionRef=useRef({subject_id:null,status:null});
  const alarmRef=useRef(false);
  const audioRef=useRef(null);
  const toggleLiveAlerts=()=>{
    if(!liveAlertsEnabled&&typeof window!=='undefined'){
      const Audio=window.AudioContext||window.webkitAudioContext;
      if(Audio){
        if(!audioRef.current)audioRef.current=new Audio();
        audioRef.current.resume().catch(()=>{});
      }
    }
    setLiveAlertsEnabled(v=>!v);
  };
  const stopScenario=()=>{
    setScenarioFrame(null);setScenarioFetchError('');setScenarioPending(false);
    setScenarioRunning(false);setScenarioId('');setScenarioSecond(0);
    alarmRef.current=false;
    if(typeof window!=='undefined'&&window.speechSynthesis)window.speechSynthesis.cancel();
  };
  const selectScenario=id=>{
    setScenarioFrame(null);setScenarioFetchError('');setScenarioPending(false);
    setScenarioRunning(false);setScenarioId(id);setScenarioSecond(0);
    alarmRef.current=false;
    if(typeof window!=='undefined'&&window.speechSynthesis)window.speechSynthesis.cancel();
  };
  const startScenario=()=>{
    if(!scenarioId||!training||scenarioPending)return;
    // Unlock browser audio during the user's explicit Start action.
    if(scenarioSound&&typeof window!=='undefined'){
      const Context=window.AudioContext||window.webkitAudioContext;
      if(Context){
        if(!audioRef.current)audioRef.current=new Context();
        audioRef.current.resume().catch(()=>{});
      }
    }
    setScenarioRunning(true);
  };
  const speakScenario=()=>{
    if(!scenarioId||typeof window==='undefined'||!window.speechSynthesis)return;
    const item=SCENARIOS.find(x=>x.id===scenarioId);
    if(!item)return;
    window.speechSynthesis.cancel();
    const speech=training?.alarm?.voice_ready_script||('HealthGuard training guidance for '+activeCrew.name+'. '+item.guidance);
    const utterance=new SpeechSynthesisUtterance(speech);
    utterance.lang='en-US';utterance.rate=.95;
    window.speechSynthesis.speak(utterance);
  };
  useEffect(()=>{
    if(!scenarioRunning||!scenarioId||scenarioPending)return;
    const timer=setInterval(()=>setScenarioSecond(v=>{
      if(v>=SCENARIO_LENGTH){setScenarioRunning(false);return v;}
      return v+1;
    }),1000);
    return()=>clearInterval(timer);
  },[scenarioRunning,scenarioId,scenarioPending]);
  // Backend owns all seven scripted signals and their CNN model evaluations.
  // Never use the older browser-side generator as a model prediction fallback.
  useEffect(()=>{
    if(!scenarioId){
      setScenarioFrame(null);setScenarioFetchError('');setScenarioPending(false);
      return;
    }
    let cancelled=false;
    setScenarioPending(true);
    readApi('/api/simulation/scenarios/'+encodeURIComponent(activeCrew.subjectId)+'/'+encodeURIComponent(scenarioId)
      +'?second='+encodeURIComponent(scenarioSecond)+'&include_history=true')
      .then(frame=>{
        if(cancelled)return;
        if(frame.subject_id!==activeCrew.subjectId||frame.scenario_id!==scenarioId
           ||frame.elapsed_seconds!==scenarioSecond
           ||frame.source!=='SERVER_SCRIPTED_TRAINING_SCENARIO'){
          throw new Error('Backend returned mismatched scenario data');
        }
        setScenarioFrame(frame);setScenarioFetchError('');setScenarioPending(false);
      })
      .catch(error=>{if(cancelled)return;setScenarioFetchError(error.message||'Scenario model analysis unavailable');
        setScenarioFrame(null);setScenarioPending(false);setScenarioRunning(false);});
    return()=>{cancelled=true;};
  },[activeCrew.subjectId,scenarioId,scenarioSecond]);
  const training=(scenarioFrame?.scenario_id===scenarioId
                  &&scenarioFrame?.subject_id===activeCrew.subjectId
                  &&scenarioFrame?.elapsed_seconds===scenarioSecond)?scenarioFrame:null;
  const trainingHistory=training?.history||[];
  useEffect(()=>{
    // A pending backend request is not a recovery event. Never reset the
    // alarm transition latch while waiting for the next valid frame.
    if(!training||training.source!=='SERVER_SCRIPTED_TRAINING_SCENARIO')return;
    const prior=alarmRef.current;
    const newlyAlert=Boolean(training.alert)&&!prior;
    alarmRef.current=Boolean(training.alert);
    if(prior&&!training.alert&&typeof window!=='undefined'&&window.speechSynthesis){
      window.speechSynthesis.cancel();
    }
    if(!newlyAlert||!scenarioSound)return;
    if(audioRef.current){
      try{
        const ctx=audioRef.current;
        const osc=ctx.createOscillator(),gain=ctx.createGain();
        osc.type='sine';osc.frequency.setValueAtTime(780,ctx.currentTime);
        osc.frequency.setValueAtTime(590,ctx.currentTime+.18);
        gain.gain.setValueAtTime(0.0001,ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.085,ctx.currentTime+.02);
        gain.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+.38);
        osc.connect(gain);gain.connect(ctx.destination);
        osc.start();osc.stop(ctx.currentTime+.4);
      }catch{/* Audio is optional if browser permissions block it. */}
    }
    // Browser speech permission can vary; manual Speak guidance stays available.
    speakScenario();
  },[training?.alert,scenarioSound,scenarioId,activeCrew.subjectId]);
  useEffect(()=>{
    if(!unified||!unified.subject_id||unified.subject_id!==selected||scenarioId)return;
    const last=lastLiveAttentionRef.current;
    const current={subject_id:unified.subject_id,status:unified.status};
    lastLiveAttentionRef.current=current;
    if(!liveAlertsEnabled||!unified.audible_alert_suggested)return;
    if(last.subject_id===current.subject_id&&last.status===current.status)return;
    if(!['WARNING','CRITICAL'].includes(unified.status))return;
    const ctx=audioRef.current;
    if(ctx&&ctx.state==='running'){
      try{
        const osc=ctx.createOscillator(),gain=ctx.createGain();
        osc.type='triangle';osc.frequency.setValueAtTime(680,ctx.currentTime);
        osc.frequency.setValueAtTime(930,ctx.currentTime+.16);
        gain.gain.setValueAtTime(.0001,ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(.07,ctx.currentTime+.03);
        gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+.35);
        osc.connect(gain);gain.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.38);
      }catch{/* Browser may deny audio playback. */}
    }
    if(typeof window!=='undefined'&&window.speechSynthesis&&unified.voice_ready_script){
      window.speechSynthesis.cancel();
      const utterance=new SpeechSynthesisUtterance(unified.voice_ready_script);
      utterance.lang='en-US';utterance.rate=.95;
      window.speechSynthesis.speak(utterance);
    }
  },[unified?.subject_id,unified?.status,unified?.sequence,unified?.audible_alert_suggested,liveAlertsEnabled,scenarioId,selected]);
  useEffect(()=>()=>{if(audioRef.current)audioRef.current.close().catch(()=>{});},[]);
  const subjects=Object.keys(snapshot?.subjects||{});
  const latest=scenarioId?training:(hasTelemetry?(snapshot?.subjects?.[activeCrew.subjectId]?.latest||samples.filter(x=>x.subject_id===activeCrew.subjectId).at(-1)||null):null);
  const displaySamples=training?trainingHistory:samples.filter(x=>x.subject_id===activeCrew.subjectId);
  const displayReview=scenarioId?null:review;
  const progress=getRoutine();
  const connected=connection==='connected'&&subjects.length>0;
  useEffect(()=>{if(showTelemetry||infoProfile)window.scrollTo({top:0,behavior:'smooth'})},[showTelemetry,infoProfile]);
  return <div className="hg6-shell">
    {infoProfile?<CrewProfile person={infoProfile} latest={latest} training={training} onClose={()=>setInfoProfile(null)} onMission={onMission}/>:showTelemetry?<CrewTelemetry person={activeCrew} selected={selected} latest={latest} samples={displaySamples} review={displayReview} cnn={training?null:cnn} comparison={training?null:comparison} training={training} onClose={()=>setShowTelemetry(false)} onBody={onBody}/>:
    <main className="hg6-main">
      <Hero environment={environment} onEnvironment={onEnvironment} connected={connected} review={hasTelemetry?review:null} progress={progress} subjects={subjects} hasTelemetry={Boolean(training)||hasTelemetry} training={training}/>
      {error&&<div className="hg6-network-error" role="status"><Icon name="alert" size={16}/>Telemetry connection issue: {error}. No missing measurements are filled in.</div>}
      <CrewStrip activeCrewIndex={activeCrewIndex} connected={connected} availableSubjects={subjects} onSelect={i=>{stopScenario();setActiveCrewIndex(i);setSelected(CREW[i].subjectId);setShowTelemetry(false);setInfoProfile(null);}} onManage={onMission}/>
      <ScenarioConsole person={activeCrew} scenarioId={scenarioId} scenarioPending={scenarioPending} scenarioError={scenarioFetchError} onSelectScenario={selectScenario}
        onStart={startScenario} onPause={()=>setScenarioRunning(false)}
        onReset={()=>{setScenarioFrame(null);setScenarioFetchError('');setScenarioSecond(0);setScenarioRunning(false);alarmRef.current=false;}}
        onExit={stopScenario} running={scenarioRunning} elapsed={scenarioSecond}
        sample={training} soundEnabled={scenarioSound} onToggleSound={()=>setScenarioSound(v=>!v)}
        onSpeak={speakScenario}/>
      <div className="hg6-center-grid">
        <SelectedCrew person={activeCrew} hasTelemetry={Boolean(training)||hasTelemetry} latest={latest} review={displayReview} unified={training?null:unified} training={training} connection={connection} onTelemetry={()=>setShowTelemetry(true)} onBody={onBody} onProfile={()=>setInfoProfile(activeCrew)}/>
        <LiveVitals hasTelemetry={Boolean(training)||hasTelemetry} latest={latest} training={training} connection={training||streamConnected?"connected":"reconnecting"} onMetric={setMetricKey}/>
        <PhysioAlert hasTelemetry={Boolean(training)||hasTelemetry} review={displayReview} unified={training?null:unified} voice={training?null:voice} training={training} onTrainingSpeak={speakScenario} speak={speak} speaking={speaking} liveAlertsEnabled={liveAlertsEnabled} onToggleLiveAlerts={toggleLiveAlerts}/>
      </div>
      <TelemetryBiomarkerHub person={activeCrew} latest={latest} training={training}/>
      <EngineeringTelemetry subjectId={activeCrew.subjectId} personName={activeCrew.name} training={training}/>
      <div className="hg6-bottom-grid"><Trend hasTelemetry={Boolean(training)||hasTelemetry} samples={displaySamples} training={training} keyValue={metricKey} onChange={setMetricKey}/><Routine progress={progress} onOpen={onRoutine}/></div>

    </main>}

  </div>;
}
