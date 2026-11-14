
import React,{Suspense,useEffect,useMemo,useState} from 'react';
import {METRICS,formatValue,friendlyStatus,statusTone,timelineLabel} from './api.js';
import {Icon,VitalChart} from './viz.jsx';
import {EnvironmentPicker,ENVIRONMENTS} from './HealthGuardPages.jsx';
import {QUESTS,getQuestPoints,getQuestCompletion} from './questLogic.js';
import {ATTRIBUTION} from 'open-anatomy-3d';
import 'open-anatomy-3d-react/styles.css';

const AnatomyViewer=React.lazy(()=>import('open-anatomy-3d-react').then(m=>({default:m.AnatomyViewer})));
const CREW=[
  {name:'Cmdr. Elena Park',role:'Flight commander',initials:'EP',portrait:'one',image:'/crew/elena.svg',stream:true},
  {name:'Dr. Marcus Reed',role:'Medical officer',initials:'MR',portrait:'two',image:'/crew/marcus.svg',stream:false},
  {name:'Lt. Aisha Khan',role:'Systems engineer',initials:'AK',portrait:'three',image:'/crew/aisha.svg',stream:false},
  {name:'Spc. Daniel Cho',role:'Mission specialist',initials:'DC',portrait:'four',image:'/crew/daniel.svg',stream:false}
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
function Hero({environment,onEnvironment,connected,review,progress,subjects,hasTelemetry}){
  const env=ENVIRONMENTS.find(e=>e.id===environment)||ENVIRONMENTS[3];
  const summary=!hasTelemetry?'Awaiting telemetry':review?.status?friendlyStatus(review.status):'Collecting data';
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
function CrewStrip({activeCrewIndex,onSelect,connected,onManage}){
  return <section className="hg6-strip">
    <div className="hg6-strip-heading">
      <div><Icon name="users" size={18}/><h2>Crew overview</h2><span className="hg6-outline-pill">4 fictional astronauts · 1 simulator stream</span></div>
      <button type="button" className="hg6-small-action" onClick={onManage}>Mission Control <Icon name="arrow" size={15}/></button>
    </div>
    <div className="hg6-crew-grid">
      {CREW.map((person,i)=><button key={person.initials} type="button" className={'hg6-crew-card '+(i===activeCrewIndex?'hg6-crew-selected':'')} aria-pressed={i===activeCrewIndex} aria-label={'Select '+person.name} onClick={()=>onSelect(i)}>
        <span className={'hg6-avatar hg6-avatar-'+person.portrait}><img src={person.image} alt={person.name+' fictional astronaut portrait'} loading="lazy"/><span className="hg6-fallback-initials">{person.initials}</span></span>
        <span className="hg6-crew-text"><strong>{person.name}</strong><small>{person.role} · fictional</small><em className={i===0&&connected?'hg6-stream-on':'hg6-stream-off'}><i/>{i===0?(connected?'Simulated stream live':'Stream reconnecting') :'Telemetry not connected'}</em></span>
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
function SelectedCrew({person,hasTelemetry,latest,review,connection,onTelemetry,onBody,onProfile}){

  if(!hasTelemetry)return <section className="hg6-card hg6-selected" aria-label={'Selected crew '+person.name}>
    <div className="hg6-card-heading"><h2><Icon name="user" size={19}/> Selected crew: {person.name}</h2><span className="hg6-quiet-badge">FICTIONAL CREW 0{CREW.indexOf(person)+1}</span></div>
    <div className="hg6-selected-body">
      <div className="hg6-small-human hg6-selected-portrait"><img src={person.image} alt={'Fictional astronaut '+person.name+' wearing a space suit'}/><button type="button" onClick={onProfile}>View crew profile <Icon name="arrow" size={13}/></button></div>
      <div className="hg6-health-summary hg6-unavailable-summary"><div className="hg6-crew-unavailable" role="status"><span className="hg6-crew-unavailable-icon"><Icon name="radio" size={26}/></span><h3>Telemetry not connected</h3><p>{person.name} has a fictional crew profile, but no independent physiological data stream has been assigned.</p><div className="hg6-crew-no-data"><span>Vital signs</span><strong>Not available</strong></div><div className="hg6-crew-no-data"><span>PhysioAlert</span><strong>Awaiting data</strong></div></div></div>
    </div>
    <div className="hg6-selected-foot"><span>Measurements are not borrowed from another crew member.</span><button type="button" onClick={onProfile}>View crew profile <Icon name="arrow" size={15}/></button></div>
  </section>;
  const status=review?.status||'AWAITING_DATA';
  const quality=review?.quality?.status;
  return <section className="hg6-card hg6-selected">
    <div className="hg6-card-heading"><h2><Icon name="user" size={19}/> Selected crew: Cmdr. Elena Park</h2><span className="hg6-quiet-badge">FICTIONAL CREW 01</span></div>
    <div className="hg6-selected-body">
      <div className="hg6-small-human hg6-selected-portrait"><img src="/crew/elena.svg" alt="Illustration of fictional astronaut Elena Park wearing a space suit"/><button type="button" onClick={onBody}>Open Body Explorer <Icon name="arrow" size={13}/></button></div>
      <div className="hg6-health-summary">
        <div className="hg6-summary-intro"><div><h3>Health monitoring summary</h3><p>Five simulated signals · Experimental pattern review</p></div><span className={'hg6-state '+(statusTone(status)==='mint'?'hg6-state-mint':'')}>{friendlyStatus(status)}</span></div>
        <RowSummary glyph="heart" label="Cardiovascular" note="Simulated"><span>HR {formatValue(latest?.values?.heart_rate_bpm,0)} bpm</span><span className="hg6-sep"> · </span><span>HRV {formatValue(latest?.values?.hrv_rmssd_ms,1)} ms</span></RowSummary>
        <RowSummary glyph="wind" label="Respiratory" note="Simulated"><span>SpO₂ {formatValue(latest?.values?.spo2_percent,1)}%</span><span className="hg6-sep"> · </span><span>RR {formatValue(latest?.values?.respiratory_rate_bpm,1)}/min</span></RowSummary>
        <RowSummary glyph="thermometer" label="Thermal" note="Simulated"><span>Core {formatValue(latest?.values?.core_temp_c,2)} °C</span></RowSummary>
        <RowSummary glyph="shield" label="Pattern review" note="Experimental">{friendlyStatus(status)}</RowSummary>
        <RowSummary glyph="activity" label="Signal quality" note="Quality check">{friendlyStatus(quality||'NOT_EVALUATED')}</RowSummary>
      </div>
    </div>
    <div className="hg6-selected-foot"><span>Model status is not a clinical diagnosis.</span><button type="button" onClick={onTelemetry}>View detailed telemetry <Icon name="arrow" size={15}/></button></div>
  </section>;
}
function LiveVitals({hasTelemetry,latest,connection,onMetric}){
  if(!hasTelemetry)return <section className="hg6-card hg6-vitals"><div className="hg6-card-heading"><h2><Icon name="pulse" size={19}/> Live vitals</h2><span className="hg6-connection"><i/>Not connected</span></div><div className="hg6-empty-panel"><Icon name="radio" size={24}/><strong>No vital signs available</strong><p>An independent simulator stream has not been assigned to this crew member.</p></div></section>;
  return <section className="hg6-card hg6-vitals"><div className="hg6-card-heading"><h2><Icon name="pulse" size={19}/> Live vitals</h2><span className={'hg6-connection '+(connection==='connected'?'connected':'')}><i/>{connection==='connected'?'Simulated stream':'Reconnecting'}</span></div>
    <div className="hg6-vital-lines">{METRICS.map(m=><button type="button" key={m.key} onClick={()=>onMetric(m.key)} title={'View '+m.label+' trend'}>
      <span style={{color:m.color}}><Icon name={m.glyph} size={18}/></span><span>{m.label}</span><strong>{metricValue(latest,m.key,m.digits,m.unit)}</strong>
    </button>)}</div>
  </section>;
}
function PhysioAlert({hasTelemetry,review,voice,speak,speaking}){
  if(!hasTelemetry)return <section className="hg6-card hg6-alert"><div className="hg6-card-heading"><h2><Icon name="shield" size={19}/> PhysioAlert</h2><span className="hg6-quiet-badge">CONTEXTUAL REVIEW</span></div><div className="hg6-empty-panel hg6-empty-alert"><Icon name="shield" size={26}/><strong>Awaiting telemetry</strong><p>PhysioAlert cannot assess a crew member without their own valid measurements.</p></div><div className="hg6-alert-bottom"><small>No assessment available</small><small>Not a diagnosis</small></div></section>;
  const status=review?.status||'AWAITING_DATA',tone=statusTone(status);
  return <section className="hg6-card hg6-alert"><div className="hg6-card-heading"><h2><Icon name="shield" size={19}/> PhysioAlert</h2><span className="hg6-quiet-badge">CONTEXTUAL REVIEW</span></div>
    <div className={'hg6-alert-state hg6-alert-'+tone}><span className="hg6-alert-symbol"><Icon name={tone==='mint'?'check':'activity'} size={23}/></span><div><strong>{friendlyStatus(status)}</strong><p>{review?.reason||'Collecting valid measurements to review simulated physiological patterns.'}</p></div></div>
    <div className="hg6-alert-bottom">{voice?.text?<button type="button" onClick={speak}><Icon name={speaking?'mute':'volume'} size={15}/>{speaking?'Stop explanation':'Explain result'} <Icon name="arrow" size={14}/></button>:<span>Waiting for a review explanation</span>}<small>Not a diagnosis</small></div>
  </section>;
}
function Trend({hasTelemetry,samples,keyValue,onChange}){
  if(!hasTelemetry)return <section className="hg6-card hg6-trend" id="hg6-trend"><div className="hg6-card-heading"><h2><Icon name="activity" size={18}/> Live trend: <span>Unavailable</span></h2></div><div className="hg6-trend-empty"><Icon name="activity" size={24}/><span>No trend data for this crew member. An independent stream is required to display measurements.</span></div></section>;
  const metric=METRICS.find(m=>m.key===keyValue)||METRICS[0];
  return <section className="hg6-card hg6-trend" id="hg6-trend"><div className="hg6-card-heading"><h2><Icon name="activity" size={18}/> Live trend: <span>{metric.label}</span></h2><label><span className="sr-only">Select chart measurement</span><select value={metric.key} onChange={e=>onChange(e.target.value)}>{METRICS.map(m=><option key={m.key} value={m.key}>{m.label}</option>)}</select></label></div>
    <div className="hg6-trend-plot"><VitalChart data={samples} metric={metric}/></div>
    <p className="hg6-trend-footer">Latest {samples.length} received simulator samples · Not a 24-hour recording</p>
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
function CrewTelemetry({selected,latest,samples,review,cnn,comparison,onClose,onBody}){
  const [key,setKey]=useState(METRICS[0].key);
  const metric=METRICS.find(x=>x.key===key)||METRICS[0];
  return <section className="hg6-telemetry" aria-label="Detailed crew telemetry">
    <div className="hg6-telemetry-heading"><button type="button" onClick={onClose}><Icon name="arrow" size={15}/> Back to Mission Dashboard</button><div><p className="hg6-overline">CREW TELEMETRY · SIMULATED STREAM</p><h1><img className="hg6-telemetry-avatar" src="/crew/elena.svg" alt="Fictional astronaut Elena Park"/> Cmdr. Elena Park <span>· Crew 01</span></h1><p>Detailed numerical monitoring. No live medical sensors are connected.</p></div></div>
    <div className="hg6-telemetry-metrics">{METRICS.map(m=><button type="button" key={m.key} className={key===m.key?'active':''} onClick={()=>setKey(m.key)}><span>{m.label}</span><strong>{metricValue(latest,m.key,m.digits,m.unit)}</strong></button>)}</div>
    <div className="hg6-telemetry-bottom"><div className="hg6-card"><div className="hg6-card-heading"><h2>{metric.label} · latest samples</h2></div><div className="hg6-large-graph"><VitalChart data={samples} metric={metric}/></div><p className="hg6-trend-footer">{samples.length} available simulator packets</p></div>
    <div className="hg6-card hg6-telemetry-review"><div className="hg6-card-heading"><h2>Model comparison</h2></div><p><span>PhysioAlert</span><strong>{friendlyStatus(review?.status)}</strong></p><p><span>CNN autoencoder</span><strong>{friendlyStatus(cnn?.status)}</strong></p><p><span>Statistical detector</span><strong>{friendlyStatus(comparison?.status)}</strong></p><p><span>Measurement quality</span><strong>{friendlyStatus(review?.quality?.status)}</strong></p><button type="button" onClick={onBody}>Open Body Explorer <Icon name="arrow" size={16}/></button></div></div>
  </section>;
}

function CrewProfile({person,onClose,onMission}){
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
        <div className="hg6-profile-status"><Icon name="radio" size={21}/><div><strong>Telemetry not connected</strong><p>This astronaut has a demonstration profile but no live or simulated physiological data source assigned.</p></div></div>
        <div className="hg6-profile-details"><div><span>Heart rate</span><strong>Not available</strong></div><div><span>Oxygen saturation</span><strong>Not available</strong></div><div><span>PhysioAlert</span><strong>Awaiting data</strong></div><div><span>Routine progress</span><strong>Not recorded</strong></div></div>
        <p className="hg6-profile-context">When an independent telemetry feed is implemented for this fictional crew member, their measurements and reviews can be shown here. Until then, no readings or health status are invented.</p>
        <div className="hg6-profile-actions"><button type="button" onClick={onClose}>Return to dashboard</button><button type="button" onClick={onMission}>Mission Control <Icon name="arrow" size={15}/></button></div>
      </div>
    </div>
  </section>;
}

export default function MissionDashboard({error,readiness,snapshot,selected,setSelected,samples=[],review,cnn,comparison,voice,speaking,speak,connection,onBody,onRoutine,onHUD,onMission,environment,onEnvironment}){
  const [metricKey,setMetricKey]=useState(METRICS[0].key);
  const [activeCrewIndex,setActiveCrewIndex]=useState(0);
  const activeCrew=CREW[activeCrewIndex];
  const hasTelemetry=activeCrew.stream;
  const [showTelemetry,setShowTelemetry]=useState(false);
  const [infoProfile,setInfoProfile]=useState(null);
  const subjects=Object.keys(snapshot?.subjects||{});
  const latest=snapshot?.subjects?.[selected]?.latest||samples.at(-1)||null;
  const progress=getRoutine();
  const connected=connection==='connected'&&subjects.length>0;
  useEffect(()=>{if(showTelemetry||infoProfile)window.scrollTo({top:0,behavior:'smooth'})},[showTelemetry,infoProfile]);
  return <div className="hg6-shell">
    {infoProfile?<CrewProfile person={infoProfile} onClose={()=>setInfoProfile(null)} onMission={onMission}/>:showTelemetry?<CrewTelemetry selected={selected} latest={latest} samples={samples} review={review} cnn={cnn} comparison={comparison} onClose={()=>setShowTelemetry(false)} onBody={onBody}/>:
    <main className="hg6-main">
      <Hero environment={environment} onEnvironment={onEnvironment} connected={connected} review={review} progress={progress} subjects={subjects} hasTelemetry={hasTelemetry}/>
      {error&&<div className="hg6-network-error" role="status"><Icon name="alert" size={16}/>Telemetry connection issue: {error}. No missing measurements are filled in.</div>}
      <CrewStrip activeCrewIndex={activeCrewIndex} connected={connected} onSelect={i=>{setActiveCrewIndex(i);setShowTelemetry(false);setInfoProfile(null);}} onManage={onMission}/>
      <div className="hg6-center-grid">
        <SelectedCrew person={activeCrew} hasTelemetry={hasTelemetry} latest={hasTelemetry?latest:null} review={hasTelemetry?review:null} connection={connection} onTelemetry={()=>setShowTelemetry(true)} onBody={onBody} onProfile={()=>setInfoProfile(activeCrew)}/>
        <LiveVitals hasTelemetry={hasTelemetry} latest={hasTelemetry?latest:null} connection={connection} onMetric={setMetricKey}/>
        <PhysioAlert hasTelemetry={hasTelemetry} review={hasTelemetry?review:null} voice={hasTelemetry?voice:null} speak={speak} speaking={speaking}/>
      </div>
      <div className="hg6-bottom-grid"><Trend hasTelemetry={hasTelemetry} samples={hasTelemetry?samples:[]} keyValue={metricKey} onChange={setMetricKey}/><Routine progress={progress} onOpen={onRoutine}/></div>

    </main>}

  </div>;
}
