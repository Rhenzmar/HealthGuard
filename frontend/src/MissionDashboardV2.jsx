
import React,{Suspense,useEffect,useMemo,useState} from 'react';
import {METRICS,formatValue,friendlyStatus,statusTone,timelineLabel} from './api.js';
import {Icon,VitalChart} from './viz.jsx';
import {EnvironmentPicker,ENVIRONMENTS} from './HealthGuardPages.jsx';
import {QUESTS,getQuestPoints,getQuestCompletion} from './questLogic.js';
import {ATTRIBUTION} from 'open-anatomy-3d';
import 'open-anatomy-3d-react/styles.css';

const AnatomyViewer=React.lazy(()=>import('open-anatomy-3d-react').then(m=>({default:m.AnatomyViewer})));
const CREW=[
  {name:'Cmdr. Elena Park',role:'Flight commander',initials:'EP',portrait:'one'},
  {name:'Dr. Marcus Reed',role:'Medical officer',initials:'MR',portrait:'two'},
  {name:'Lt. Aisha Khan',role:'Systems engineer',initials:'AK',portrait:'three'},
  {name:'Spc. Daniel Cho',role:'Mission specialist',initials:'DC',portrait:'four'}
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
function Hero({environment,onEnvironment,connected,review,progress,subjects}){
  const env=ENVIRONMENTS.find(e=>e.id===environment)||ENVIRONMENTS[3];
  const summary=review?.status?friendlyStatus(review.status):'Collecting data';
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
function CrewStrip({activeStream,connected,onTelemetry,onManage,onProfile}){
  return <section className="hg6-strip">
    <div className="hg6-strip-heading">
      <div><Icon name="users" size={18}/><h2>Crew overview</h2><span className="hg6-outline-pill">1 available stream · 3 profiles without live data</span></div>
      <button type="button" className="hg6-small-action" onClick={onManage}>Mission Control <Icon name="arrow" size={15}/></button>
    </div>
    <div className="hg6-crew-grid">
      {CREW.map((person,i)=><button key={person.initials} type="button" className={'hg6-crew-card '+(i===0?'hg6-crew-selected':'')} onClick={i===0?onTelemetry:()=>onProfile(person)}>
        <span className={'hg6-avatar hg6-avatar-'+person.portrait}><span>{person.initials}</span></span>
        <span className="hg6-crew-text"><strong>{person.name}</strong><small>{person.role} · fictional</small><em className={i===0&&connected?'hg6-stream-on':'hg6-stream-off'}><i/>{i===0?(connected?'Simulated stream live':'Stream reconnecting'):'Profile only · no telemetry'}</em></span>
        {i===0&&<Icon name="arrow" size={17}/>}
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
function SelectedCrew({latest,review,connection,onTelemetry,onBody}){
  const status=review?.status||'AWAITING_DATA';
  const quality=review?.quality?.status;
  return <section className="hg6-card hg6-selected">
    <div className="hg6-card-heading"><h2><Icon name="user" size={19}/> Selected crew: Cmdr. Elena Park</h2><span className="hg6-quiet-badge">FICTIONAL CREW 01</span></div>
    <div className="hg6-selected-body">
      <div className="hg6-small-human"><MiniAnatomy onBody={onBody}/><button type="button" onClick={onBody}>Open Body Explorer <Icon name="arrow" size={13}/></button></div>
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
function LiveVitals({latest,connection,onMetric}){
  return <section className="hg6-card hg6-vitals"><div className="hg6-card-heading"><h2><Icon name="pulse" size={19}/> Live vitals</h2><span className={'hg6-connection '+(connection==='connected'?'connected':'')}><i/>{connection==='connected'?'Simulated stream':'Reconnecting'}</span></div>
    <div className="hg6-vital-lines">{METRICS.map(m=><button type="button" key={m.key} onClick={()=>onMetric(m.key)} title={'View '+m.label+' trend'}>
      <span style={{color:m.color}}><Icon name={m.glyph} size={18}/></span><span>{m.label}</span><strong>{metricValue(latest,m.key,m.digits,m.unit)}</strong>
    </button>)}</div>
  </section>;
}
function PhysioAlert({review,voice,speak,speaking}){
  const status=review?.status||'AWAITING_DATA',tone=statusTone(status);
  return <section className="hg6-card hg6-alert"><div className="hg6-card-heading"><h2><Icon name="shield" size={19}/> PhysioAlert</h2><span className="hg6-quiet-badge">CONTEXTUAL REVIEW</span></div>
    <div className={'hg6-alert-state hg6-alert-'+tone}><span className="hg6-alert-symbol"><Icon name={tone==='mint'?'check':'activity'} size={23}/></span><div><strong>{friendlyStatus(status)}</strong><p>{review?.reason||'Collecting valid measurements to review simulated physiological patterns.'}</p></div></div>
    <div className="hg6-alert-bottom">{voice?.text?<button type="button" onClick={speak}><Icon name={speaking?'mute':'volume'} size={15}/>{speaking?'Stop explanation':'Explain result'} <Icon name="arrow" size={14}/></button>:<span>Waiting for a review explanation</span>}<small>Not a diagnosis</small></div>
  </section>;
}
function Trend({samples,keyValue,onChange}){
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
    <div className="hg6-telemetry-heading"><button type="button" onClick={onClose}><Icon name="arrow" size={15}/> Back to Mission Dashboard</button><div><p className="hg6-overline">CREW TELEMETRY · SIMULATED STREAM</p><h1>Cmdr. Elena Park <span>· Crew 01</span></h1><p>Detailed numerical monitoring. No live medical sensors are connected.</p></div></div>
    <div className="hg6-telemetry-metrics">{METRICS.map(m=><button type="button" key={m.key} className={key===m.key?'active':''} onClick={()=>setKey(m.key)}><span>{m.label}</span><strong>{metricValue(latest,m.key,m.digits,m.unit)}</strong></button>)}</div>
    <div className="hg6-telemetry-bottom"><div className="hg6-card"><div className="hg6-card-heading"><h2>{metric.label} · latest samples</h2></div><div className="hg6-large-graph"><VitalChart data={samples} metric={metric}/></div><p className="hg6-trend-footer">{samples.length} available simulator packets</p></div>
    <div className="hg6-card hg6-telemetry-review"><div className="hg6-card-heading"><h2>Model comparison</h2></div><p><span>PhysioAlert</span><strong>{friendlyStatus(review?.status)}</strong></p><p><span>CNN autoencoder</span><strong>{friendlyStatus(cnn?.status)}</strong></p><p><span>Statistical detector</span><strong>{friendlyStatus(comparison?.status)}</strong></p><p><span>Measurement quality</span><strong>{friendlyStatus(review?.quality?.status)}</strong></p><button type="button" onClick={onBody}>Open Body Explorer <Icon name="arrow" size={16}/></button></div></div>
  </section>;
}
export default function MissionDashboard({error,readiness,snapshot,selected,setSelected,samples=[],review,cnn,comparison,voice,speaking,speak,connection,onBody,onRoutine,onHUD,onMission,environment,onEnvironment}){
  const [metricKey,setMetricKey]=useState(METRICS[0].key);
  const [showTelemetry,setShowTelemetry]=useState(false);
  const [infoProfile,setInfoProfile]=useState(null);
  const subjects=Object.keys(snapshot?.subjects||{});
  const latest=snapshot?.subjects?.[selected]?.latest||samples.at(-1)||null;
  const progress=getRoutine();
  const connected=connection==='connected'&&subjects.length>0;
  useEffect(()=>{if(showTelemetry||infoProfile)window.scrollTo({top:0,behavior:'smooth'})},[showTelemetry,infoProfile]);
  return <div className="hg6-shell">
    {showTelemetry?<CrewTelemetry selected={selected} latest={latest} samples={samples} review={review} cnn={cnn} comparison={comparison} onClose={()=>setShowTelemetry(false)} onBody={onBody}/>:
    <main className="hg6-main">
      <Hero environment={environment} onEnvironment={onEnvironment} connected={connected} review={review} progress={progress} subjects={subjects}/>
      {error&&<div className="hg6-network-error" role="status"><Icon name="alert" size={16}/>Telemetry connection issue: {error}. No missing measurements are filled in.</div>}
      <CrewStrip activeStream={selected} connected={connected} onTelemetry={()=>setShowTelemetry(true)} onManage={onMission} onProfile={setInfoProfile}/>
      <div className="hg6-center-grid">
        <SelectedCrew latest={latest} review={review} connection={connection} onTelemetry={()=>setShowTelemetry(true)} onBody={onBody}/>
        <LiveVitals latest={latest} connection={connection} onMetric={setMetricKey}/>
        <PhysioAlert review={review} voice={voice} speak={speak} speaking={speaking}/>
      </div>
      <div className="hg6-bottom-grid"><Trend samples={samples} keyValue={metricKey} onChange={setMetricKey}/><Routine progress={progress} onOpen={onRoutine}/></div>
      <p className="hg6-fineprint">All displayed crew names and profiles are fictional. Only Crew 01 has an available simulated telemetry source. Experimental pattern flags are not medical diagnoses. <a href="https://eol.jsc.nasa.gov/SearchPhotos/photo.pl?frame=5378&mission=ISS046&roll=E" target="_blank" rel="noreferrer">Earth photograph: NASA/JSC</a>. <span>3D anatomy: {ATTRIBUTION}.</span></p>
    </main>}
    {infoProfile&&<div className="hg6-modal-backdrop" role="presentation" onClick={()=>setInfoProfile(null)}><div className="hg6-modal" role="dialog" aria-modal="true" aria-labelledby="hg6-profile-title" onClick={e=>e.stopPropagation()}><div className="hg6-modal-icon"><Icon name="user" size={26}/></div><h2 id="hg6-profile-title">{infoProfile.name}</h2><p>{infoProfile.role} · Fictional demo profile</p><p>This crew profile does not have a connected telemetry stream. HealthGuard cannot display measurements, model reviews, or health status for this individual.</p><button type="button" onClick={()=>setInfoProfile(null)}>Close profile</button></div></div>}
  </div>;
}
