import React,{Suspense,useMemo,useState} from 'react';
import {METRICS,formatValue,friendlyStatus,statusTone,timelineLabel} from './api.js';
import {Icon,VitalChart} from './viz.jsx';
import {ENVIRONMENTS,EnvironmentPicker} from './HealthGuardPages.jsx';
import {QUESTS,getQuestPoints,getQuestCompletion} from './questLogic.js';
import {ATTRIBUTION} from 'open-anatomy-3d';
import 'open-anatomy-3d-react/styles.css';

const AnatomyViewer=React.lazy(()=>import('open-anatomy-3d-react').then(m=>({default:m.AnatomyViewer})));
const TODAY=()=>new Date().toISOString().slice(0,10);
function readToday(){
  try{
    const all=JSON.parse(window.localStorage.getItem('healthguard-mission-quest-v1')||'{}');
    const completed=Object.entries(all[TODAY()]||{}).filter(([k,v])=>v==='complete'&&QUESTS.some(q=>q.id===k)).map(([k])=>k);
    return {done:completed.length,percent:getQuestCompletion(completed),xp:getQuestPoints(completed)};
  }catch{return {done:0,percent:0,xp:0};}
}
class AnatomyErrorBoundary extends React.Component{
  constructor(props){super(props);this.state={broken:false};}
  static getDerivedStateFromError(){return {broken:true};}
  render(){return this.state.broken?<div className="mh-human-fallback"><Icon name="heart" size={30}/><span>3D view unavailable</span></div>:this.props.children;}
}
function HumanPreview({onOpen}){
  return <div className="mh-human" data-theme="dark">
    <AnatomyErrorBoundary>
      <Suspense fallback={<div className="mh-human-fallback"><span className="spinning"/><span>Loading model</span></div>}>
        <AnatomyViewer defaultSex="female" pins={[]} showSexToggle={false} showLayerToggles={false} showZoomControls={false} showRotateControl={false} hoverHint="Explore details in Body Explorer" onStructureClick={onOpen} className="mh-human-model"/>
      </Suspense>
    </AnatomyErrorBoundary>
  </div>;
}
function MissionPanel({environment,selected,setSelected,subjects,connection,latest}){
  const env=ENVIRONMENTS.find(x=>x.id===environment)||ENVIRONMENTS[3];
  return <aside className="mh-mission">
    <div className="mh-mission-picture" role="img" aria-label="Decorative photograph of Earth’s horizon from orbit"><span>SPACEFLIGHT / DEMO SCENARIO</span></div>
    <div className="mh-mission-content">
      <span className="mh-eyebrow">MISSION OVERVIEW</span>
      <h2>{env.name}</h2>
      <span className="mh-notice"><i/> Research simulation</span>
      <div className="mh-divider"/>
      <div className="mh-quiet-detail"><span>Telemetry</span><strong>{connection==='connected'?'Connected':'Reconnecting'}</strong></div>
      <div className="mh-quiet-detail"><span>Latest packet</span><strong>{latest?.sequence??'—'}</strong></div>
      <div className="mh-divider"/>
      <div className="mh-roster-head"><strong>Crew monitoring</strong><span>{subjects.length||1} stream{subjects.length===1?'':'s'}</span></div>
      <div className="mh-roster">{(subjects.length?subjects:[selected]).map((id,i)=><button type="button" key={id} className={'mh-crew '+(selected===id?'active':'')} onClick={()=>setSelected(id)} aria-pressed={selected===id}>
        <span className="mh-crew-avatar"><Icon name="user" size={18}/></span><span className="mh-crew-name"><strong>{id.replace(/^SIM_/,'').replaceAll('_',' ')}</strong><small>Fictional crew · {id===selected?'selected':'available'}</small></span>{id===selected&&<span className="mh-crew-active"/>}
      </button>)}</div>
      <p className="mh-mission-foot">Only connected simulator streams are shown. Other crew profiles are not invented.</p>
    </div>
  </aside>;
}
function VitalPanel({latest,metricKey,onSelect,connection}){
  return <section className="mh-panel mh-vitals">
    <div className="mh-panel-heading"><h2>Live vitals</h2><span className={'mh-live '+(connection==='connected'?'yes':'no')}><i/>{connection==='connected'?'Live simulation':'Connecting'}</span></div>
    <div className="mh-vital-rows">{METRICS.map(m=><button type="button" key={m.key} className={'mh-vital '+(metricKey===m.key?'active':'')} aria-pressed={metricKey===m.key} onClick={()=>onSelect(m.key)}>
      <span className="mh-vital-icon" style={{color:m.color}}><Icon name={m.glyph} size={17}/></span><span className="mh-vital-name">{m.label}</span><strong>{formatValue(latest?.values?.[m.key],m.digits)} <small>{m.unit}</small></strong>
    </button>)}</div>
  </section>;
}
function AlertSummary({review,voice,speak,speaking}){
  const status=review?.status||'AWAITING_DATA',tone=statusTone(status);
  return <section className="mh-panel mh-alert">
    <div className="mh-panel-heading"><h2><Icon name="shield" size={18}/> PhysioAlert</h2><span className="mh-alert-tag">PATTERN REVIEW</span></div>
    <div className={'mh-alert-reading tone-'+tone}><span className="mh-indicator"/><div><strong>{friendlyStatus(status)}</strong><p>{review?.reason||'Collecting simulated measurements for review.'}</p></div></div>
    <div className="mh-alert-actions">{voice?.text&&<button type="button" onClick={speak}><Icon name={speaking?'mute':'volume'} size={15}/>{speaking?'Stop audio':'Explain result'}</button>}<span>No diagnostic claims</span></div>
  </section>;
}
function TrendPanel({samples,metricKey,onSelect}){
  const metric=METRICS.find(x=>x.key===metricKey)||METRICS[0];
  return <section className="mh-panel mh-trend">
    <div className="mh-panel-heading"><h2>Live trends</h2><label><span className="sr-only">Select chart metric</span><select value={metric.key} onChange={e=>onSelect(e.target.value)}>{METRICS.map(x=><option key={x.key} value={x.key}>{x.label}</option>)}</select></label></div>
    <div className="mh-trend-plot"><VitalChart data={samples} metric={metric}/></div>
    <p>{samples.length} received samples · Recent stream only, not 24-hour records</p>
  </section>;
}
function RoutinePreview({onOpen,progress}){
  const preview=QUESTS.slice(0,3);
  return <section className="mh-routine">
    <div className="mh-routine-title"><Icon name="check" size={23}/><div><strong>Mission routine</strong><span>Daily check-ins and learning tasks</span></div></div>
    <div className="mh-routine-percent" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} aria-label="Daily routine completion"><strong>{progress.percent}%</strong><span className="mh-progress-track"><i style={{width:progress.percent+'%'}}/></span><small>{progress.done}/{QUESTS.length} recorded</small></div>
    <div className="mh-routine-tasks">{preview.map(q=><span key={q.id}><Icon name="check" size={14}/>{q.name}</span>)}</div>
    <div className="mh-routine-action"><span>{progress.xp} XP <small>earned from tasks</small></span><button type="button" onClick={onOpen}>Open routine <Icon name="arrow" size={15}/></button></div>
  </section>;
}
export default function MissionDashboard({error,readiness,snapshot,selected,setSelected,samples=[],review,voice,speaking,speak,connection,onBody,onRoutine,onHUD,environment,onEnvironment}){
  const [metricKey,setMetricKey]=useState(METRICS[0].key);
  const subjects=Object.keys(snapshot?.subjects||{});
  const latest=snapshot?.subjects?.[selected]?.latest||samples.at(-1)||null;
  const progress=readToday();
  const env=ENVIRONMENTS.find(x=>x.id===environment)||ENVIRONMENTS[3];
  return <div className="mh-page">
    <div className="mh-backdrop" aria-hidden="true"/>
    <div className="mh-content">
      <div className="mh-page-heading">
        <div><p className="mh-eyebrow">HEALTHGUARD / MISSION DASHBOARD</p><h1>Crew health overview</h1><p>Monitor the mission, review physiological signals, and keep up with daily routines.</p></div>
        <EnvironmentPicker value={environment} onChange={onEnvironment} compact/>
      </div>
      {error&&<div className="mh-network-warning" role="status"><Icon name="alert" size={17}/> Data service issue: {error}. Missing measurements are never estimated.</div>}
      <div className="mh-dashboard-grid">
        <MissionPanel environment={environment} selected={selected} setSelected={setSelected} subjects={subjects} connection={connection} latest={latest}/>
        <section className="mh-hero">
          <div className="mh-hero-top"><div className="mh-hero-copy"><span className="mh-eyebrow">SELECTED CREW</span><h2>{selected.replace(/^SIM_/,'').replaceAll('_',' ')}</h2><p>Fictional astronaut · {env.name} scenario</p><span className="mh-hero-status"><i/>{connection==='connected'?'Telemetry streaming':'Awaiting telemetry'}</span></div></div>
          <HumanPreview onOpen={onBody}/>
          <div className="mh-hero-bottom"><span>Educational body model · Not a live body scan</span><div className="mh-hero-buttons"><button type="button" onClick={()=>document.getElementById('mh-trend-anchor')?.scrollIntoView({behavior:'smooth',block:'center'})}><Icon name="activity" size={15}/> See telemetry</button><button type="button" onClick={onBody}><Icon name="heart" size={15}/> Body Explorer</button><button type="button" onClick={onHUD}><Icon name="radio" size={15}/> Mission HUD</button></div></div>
          <small className="mh-model-credit">{ATTRIBUTION}</small>
        </section>
        <div className="mh-right">
          <VitalPanel latest={latest} metricKey={metricKey} onSelect={setMetricKey} connection={connection}/>
          <AlertSummary review={review} voice={voice} speak={speak} speaking={speaking}/>
          <div id="mh-trend-anchor"><TrendPanel samples={samples} metricKey={metricKey} onSelect={setMetricKey}/></div>
        </div>
      </div>
      <RoutinePreview onOpen={onRoutine} progress={progress}/>
      <p className="mh-disclaimer"><Icon name="shield" size={15}/> All live telemetry is simulated. Anomaly detection is experimental and not clinically validated. Historical NASA records remain separate in Health Library. <a href="https://commons.wikimedia.org/wiki/File:ISS-64_Sunrise_through_Earth%27s_horizon.jpg" target="_blank" rel="noreferrer">Background image: NASA/JSC</a>.</p>
    </div>
  </div>;
}
