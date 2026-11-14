import React,{Suspense,useState} from 'react';
import {METRICS,formatValue,friendlyStatus,statusTone,timelineLabel} from './api.js';
import {Icon,VitalChart} from './viz.jsx';
import {EnvironmentPicker} from './HealthGuardPages.jsx';
import {QUESTS,getQuestCompletion,getQuestPoints} from './questLogic.js';
import {ATTRIBUTION} from 'open-anatomy-3d';
import 'open-anatomy-3d-react/styles.css';

const RealBody=React.lazy(()=>import('open-anatomy-3d-react').then(m=>({default:m.AnatomyViewer})));
function getRoutineProgress(){
  try{
    const all=JSON.parse(localStorage.getItem('healthguard-mission-quest-v1')||'{}');
    const entries=all[new Date().toISOString().slice(0,10)]||{};
    const completed=Object.keys(entries).filter(k=>entries[k]==='complete');
    return {done:completed.length,percent:getQuestCompletion(completed),points:getQuestPoints(completed)};
  }catch{return {done:0,percent:0,points:0};}
}
class ModelErrorBoundary extends React.Component{
  constructor(p){super(p);this.state={failed:false};}
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<div className="hgd-model-loading"><Icon name="heart" size={30}/><strong>3D model unavailable</strong><span>Health monitoring is still available.</span></div>:this.props.children;}
}
function HumanViewer({onBody}){
  return <section className="hgd-card hgd-human">
    <div className="hgd-card-head"><div><p className="hgd-eyebrow">BODY OVERVIEW</p><h2>Human systems</h2></div><span className="hgd-minor">EDUCATIONAL 3D</span></div>
    <div className="hgd-model" data-theme="dark">
      <ModelErrorBoundary>
        <Suspense fallback={<div className="hgd-model-loading"><span className="spinning"/><strong>Loading human anatomy</strong><span>Simulated telemetry is unaffected.</span></div>}>
          <RealBody defaultSex="female" pins={[]} showSexToggle={false} showLayerToggles={false} showZoomControls={false} showRotateControl={false} hoverHint="Open Body Explorer to learn about this structure" onStructureClick={onBody} className="hgd-real-viewer"/>
        </Suspense>
      </ModelErrorBoundary>
    </div>
    <div className="hgd-human-foot"><span>Drag to rotate · Model, not medical scan</span><button type="button" onClick={onBody}>Explore anatomy <Icon name="arrow" size={15}/></button></div>
    <p className="hgd-credit">{ATTRIBUTION} · Educational display only.</p>
  </section>;
}
function Vitals({latest,selectedMetric,setSelectedMetric,connection}){
  return <section className="hgd-card hgd-vitals">
    <div className="hgd-card-head"><div><p className="hgd-eyebrow">SIMULATED TELEMETRY</p><h2>Live vital signs</h2></div><span className={'hgd-connected '+(connection==='connected'?'on':'off')}><i/>{connection==='connected'?'Streaming':'Reconnecting'}</span></div>
    <div className="hgd-vital-rows">{METRICS.map(m=><button className={'hgd-vital '+(selectedMetric===m.key?'active':'')} type="button" key={m.key} aria-pressed={selectedMetric===m.key} onClick={()=>setSelectedMetric(m.key)}>
      <span style={{color:m.color}}><Icon name={m.glyph} size={19}/></span><span className="hgd-vital-name">{m.label}</span><strong>{formatValue(latest?.values?.[m.key],m.digits)} <small>{m.unit}</small></strong>
    </button>)}</div>
    <p className="hgd-footnote">Five fictional channels · Packet {latest?.sequence??'—'}</p>
  </section>;
}
function AlertReview({review,cnn,comparison,voice,speaking,speak}){
  const status=review?.status||'AWAITING_DATA';
  const tone=statusTone(status);
  return <section className="hgd-card hgd-review">
    <div className="hgd-card-head"><div><p className="hgd-eyebrow">CONTEXT-AWARE REVIEW</p><h2>PhysioAlert</h2></div><Icon name="shield" size={20}/></div>
    <div className={'hgd-review-state tone-'+tone}><span className="hgd-status-dot"/><strong>{friendlyStatus(status)}</strong></div>
    <p className="hgd-review-reason">{review?.reason||'Collecting valid simulated data to evaluate numerical patterns.'}</p>
    <div className="hgd-model-states"><div><span>CNN autoencoder</span><strong>{friendlyStatus(cnn?.status||review?.raw_detector_statuses?.cnn)}</strong></div><div><span>Statistical detector</span><strong>{friendlyStatus(comparison?.status||review?.raw_detector_statuses?.covariance)}</strong></div><div><span>Signal quality</span><strong>{friendlyStatus(review?.quality?.status)}</strong></div></div>
    {voice?.text&&<button className="hgd-speak" type="button" onClick={speak}><Icon name={speaking?'mute':'volume'} size={15}/>{speaking?'Stop explanation':'Listen to explanation'}</button>}
    <p className="hgd-footnote">Experimental pattern review. No disease diagnosis or clinical risk assessment.</p>
  </section>;
}
export default function HealthDashboard({error,readiness,snapshot,selected,setSelected,samples=[],review,cnn,comparison,voice,speaking,speak,connection,onBody,onRoutine,environment,onEnvironment}){
  const [selectedMetric,setSelectedMetric]=useState(METRICS[0].key);
  const metric=METRICS.find(m=>m.key===selectedMetric)||METRICS[0];
  const latest=snapshot?.subjects?.[selected]?.latest||samples.at(-1)||null;
  const subjects=Object.keys(snapshot?.subjects||{});
  const progress=getRoutineProgress();
  return <div className="hgd-page">
    <header className="hgd-header"><div><p className="hgd-eyebrow">HEALTHGUARD / MISSION OVERVIEW</p><h1>Mission dashboard</h1><p>Understand physiological patterns at a glance.</p></div><EnvironmentPicker value={environment} onChange={onEnvironment} compact/></header>
    <div className="hgd-meta"><span className="hgd-sim-tag"><i/> SIMULATION ONLY</span>
      <label>CREW <select aria-label="Select simulated crew" value={selected} onChange={e=>setSelected(e.target.value)}>{(subjects.length?subjects:[selected]).map(id=><option key={id} value={id}>{id.replaceAll('_',' ')}</option>)}</select></label>
      <span>Last sample: {timelineLabel(latest?.timestamp)}</span><span>Model engine: {readiness?.models_loaded?'Loaded':'Checking'}</span>
    </div>
    {error&&<div className="hgd-error" role="status"><Icon name="alert" size={18}/>Backend connection issue: {error}. Missing measurements are not estimated.</div>}
    <div className="hgd-primary"><HumanViewer onBody={onBody}/><div className="hgd-right"><Vitals latest={latest} selectedMetric={selectedMetric} setSelectedMetric={setSelectedMetric} connection={connection}/><AlertReview review={review} cnn={cnn} comparison={comparison} voice={voice} speaking={speaking} speak={speak}/></div></div>
    <div className="hgd-secondary">
      <section className="hgd-card hgd-trends"><div className="hgd-card-head"><div><p className="hgd-eyebrow">SIGNAL HISTORY</p><h2>Physiological trends</h2></div><label className="hgd-metric-select"><span className="sr-only">Select signal</span><select value={metric.key} onChange={e=>setSelectedMetric(e.target.value)}>{METRICS.map(m=><option key={m.key} value={m.key}>{m.label}</option>)}</select></label></div><div className="hgd-trend-chart"><VitalChart data={samples} metric={metric}/></div><p className="hgd-footnote">Latest {samples.length} received simulator samples. No imputed measurements.</p></section>
      <section className="hgd-card hgd-routine"><div className="hgd-card-head"><div><p className="hgd-eyebrow">MISSION QUEST</p><h2>Today's routine</h2></div><Icon name="check" size={20}/></div><div className="hgd-progress-stats"><strong>{progress.percent}%</strong><span>{progress.done} of {QUESTS.length} activities</span></div><div className="hgd-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} aria-label="Routine completion"><i style={{width:progress.percent+'%'}}/></div><p className="hgd-xp">{progress.points} XP <span>recorded in this browser</span></p><button className="hgd-routine-open" type="button" onClick={onRoutine}>View health routine <Icon name="arrow" size={16}/></button><p className="hgd-footnote">XP rewards documenting tasks, never particular vital-sign values.</p></section>
    </div>
    <p className="hgd-disclaimer"><Icon name="shield" size={16}/> Live readings are fictional simulator data. Real historical NASA OSD-575 measurements are available separately in NASA Research. The models are not clinically validated.</p>
  </div>;
}
