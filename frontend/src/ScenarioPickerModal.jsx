import React,{useEffect,useRef,useState} from 'react';
import {Icon} from './viz.jsx';
import {METRICS,formatValue} from './api.js';
import {SCENARIOS,SCENARIO_LENGTH} from './scenarioSimulator.js';
import {scenarioVoiceAnnouncement} from './healthguardVoice.js';
import './scenarioPickerModal.css';

const CREW=new Set(['oxygenation','exertion','thermal','sensor']);
const CATS=[{id:'crew',label:'Crew health',icon:'heart'},{id:'ship',label:'Spacecraft',icon:'satellite'}];
const levels=['OPTIMAL','CHECK','WARNING','CRITICAL'];
export default function ScenarioPickerModal({
  open,onClose,onBody,onHUD,person,scenarioId,onSelectScenario,onStart,onPause,onReset,onExit,
  running,elapsed,sample,soundEnabled,onToggleSound,onSpeak,scenarioPending=false,scenarioError=''
}){
  const [category,setCategory]=useState('crew');
  const modalRef=useRef(null),closeRef=useRef(null),onCloseRef=useRef(onClose);
  onCloseRef.current=onClose;
  useEffect(()=>{
    if(!open)return;
    const previousFocus=document.activeElement,oldOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    setCategory(!scenarioId||CREW.has(scenarioId)?'crew':'ship');
    closeRef.current?.focus();
    const onKey=event=>{
      if(event.key==='Escape'){event.preventDefault();onCloseRef.current();return;}
      if(event.key!=='Tab'||!modalRef.current)return;
      const items=[...modalRef.current.querySelectorAll('button:not([disabled]),select:not([disabled]),summary')].filter(el=>el.getClientRects().length);
      if(!items.length)return;
      if(event.shiftKey&&document.activeElement===items[0]){event.preventDefault();items.at(-1).focus();}
      else if(!event.shiftKey&&document.activeElement===items.at(-1)){event.preventDefault();items[0].focus();}
    };
    document.addEventListener('keydown',onKey);
    return()=>{document.body.style.overflow=oldOverflow;document.removeEventListener('keydown',onKey);previousFocus?.focus?.();};
  },[open]);
  if(!open)return null;
  const selected=SCENARIOS.find(s=>s.id===scenarioId);
  const visible=SCENARIOS.filter(s=>category==='crew'?CREW.has(s.id):!CREW.has(s.id));
  const frame=sample?.source==='SERVER_SCRIPTED_TRAINING_SCENARIO'&&sample.scenario_id===scenarioId&&sample.subject_id===person?.subjectId?sample:null;
  const level=levels.includes(frame?.severity)?frame.severity:'UNASSESSED';
  const elapsedSec=Math.max(0,Math.min(elapsed,SCENARIO_LENGTH));
  const status=scenarioError?'Unavailable':scenarioPending?'Updating':running?'Playing':elapsedSec===SCENARIO_LENGTH?'Complete':selected?'Ready':'Choose a scenario';
  const canStart=Boolean(selected&&frame&&!scenarioPending&&!scenarioError&&elapsedSec<SCENARIO_LENGTH);
  const time='T+'+String(Math.floor(elapsedSec/60)).padStart(2,'0')+':'+String(elapsedSec%60).padStart(2,'0')+' / 01:04';
  return <div className="hg-scenario-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!running)onClose();}}>
    <section className="hg-scenario-modal hg-scenario-clean" role="dialog" aria-modal="true" aria-labelledby="hg-scenario-title" ref={modalRef}>
      <header className="hg-scenario-modal-header">
        <div><span className="hg-scenario-kicker">HEALTHGUARD / SIMULATED TRAINING</span><h2 id="hg-scenario-title">Scenario Lab</h2>
          <p>Choose a fictional event and review the astronaut's changing indicators.</p></div>
        <button type="button" ref={closeRef} className="hg-scenario-close" onClick={onClose} aria-label="Close scenario popup"><Icon name="x" size={18}/></button>
      </header>
      <div className="hg-scenario-tabs" role="tablist" aria-label="Scenario category">
        {CATS.map(cat=><button role="tab" id={'scenario-tab-'+cat.id} aria-controls="scenario-options" aria-selected={category===cat.id} key={cat.id}
          type="button" className={category===cat.id?'active':''} onClick={()=>setCategory(cat.id)}><Icon name={cat.icon} size={15}/>{cat.label}<span>{SCENARIOS.filter(s=>cat.id==='crew'?CREW.has(s.id):!CREW.has(s.id)).length}</span></button>)}
      </div>
      <div className="hg-scenario-scroll">
        <div className="hg-scenario-layout">
          <section className="hg-scenario-selection" role="tabpanel" id="scenario-options" aria-labelledby={'scenario-tab-'+category}>
            <h3>Select a scenario</h3>
            <div className="hg-scenario-list">{visible.map(s=><button key={s.id} type="button" aria-pressed={scenarioId===s.id}
              className={'hg-scenario-choice'+(scenarioId===s.id?' active':'')} onClick={()=>onSelectScenario(s.id)}>
              <Icon name={scenarioId===s.id?'check':'activity'} size={17}/>
              <span><strong>{s.name}</strong><small>{s.subtitle}</small></span></button>)}</div>
            <p className="hg-scenario-disclaimer"><Icon name="shield" size={15}/> Fictional training, not real astronaut monitoring or a medical diagnosis.</p>
          </section>
          <section className="hg-scenario-preview" aria-label="Selected scenario preview">
            <div className="hg-scenario-preview-top"><span>LIVE TRAINING PREVIEW</span><b>{status}</b></div>
            {selected?<><h3>{selected.name}</h3><p className="hg-scenario-preview-caption">{selected.subtitle}</p>
              <div role="status" aria-live="polite" className={'hg-scenario-warning hg-scenario-warning-'+level.toLowerCase()}>
                <Icon name={level==='CRITICAL'?'alert':'shield'} size={18}/>
                <div><strong>{level==='UNASSESSED'?'Awaiting evaluation':level+' · TRAINING'}</strong>
                  <span>{['WARNING','CRITICAL'].includes(level)?scenarioVoiceAnnouncement(scenarioId,level):frame?.stage||'Ready to start.'}</span></div>
              </div>
              {scenarioError&&<p role="alert" className="hg-scenario-error">{scenarioError}. No invented model outputs.</p>}
              {scenarioPending&&<p role="status" className="hg-scenario-pending">Loading the next verified scenario frame…</p>}
              <div className="hg-scenario-readings">{METRICS.map(m=><div key={m.key} className={frame?.metric_levels?.[m.key]==='CRITICAL'?'critical':''}>
                <span>{m.label}</span><strong>{formatValue(frame?.values?.[m.key],m.digits)} <small>{m.unit}</small></strong></div>)}</div>
              <details className="hg-scenario-evidence"><summary>Training details and model evidence <Icon name="chevron" size={14}/></summary>
                <p>{selected.cause}</p><p>Illustrative trigger: {selected.triggerLabel}</p>
                <div>17-channel CNN <b>{frame?.model_evidence?.candidate_17ch?.status||'Awaiting evidence'}</b></div>
                <div>Covariance comparison <b>{frame?.model_evidence?.statistical_comparator?.status||'Awaiting evidence'}</b></div>
                <button type="button" onClick={onSpeak}><Icon name="volume" size={15}/> Speak guidance</button>
              </details>
            </>:<p className="hg-scenario-empty">Select an event to see its simulated indicators.</p>}
          </section>
        </div>
      </div>
      <footer className="hg-scenario-playback">
        <div className="hg-scenario-playback-summary"><div><strong>{selected?.name||'No scenario selected'}</strong><span>{time}</span></div>
          <div className="hg-scenario-progress" role="progressbar" aria-label="Scenario playback" aria-valuenow={elapsedSec} aria-valuemin={0} aria-valuemax={SCENARIO_LENGTH}><i style={{width:(elapsedSec/SCENARIO_LENGTH*100)+'%'}}/></div></div>
        <div className="hg-scenario-playback-buttons">
          <button type="button" className="hg-scenario-start" disabled={!running&&!canStart} onClick={running?onPause:onStart}><Icon name={running?'check':'activity'} size={15}/>{running?'Pause':elapsedSec>0?'Resume':'Start'}</button>
          <button type="button" className="hg-scenario-secondary" disabled={!selected} onClick={onReset}>Restart</button>
          <button type="button" className="hg-scenario-secondary" aria-pressed={soundEnabled} onClick={onToggleSound}><Icon name={soundEnabled?'volume':'mute'} size={15}/>{soundEnabled?'Voice & alarm on':'Voice & alarm off'}</button>
          {selected&&<button type="button" className="hg-scenario-secondary" onClick={onBody}>Body Explorer</button>}
          {selected&&<button type="button" className="hg-scenario-secondary" onClick={onHUD}>Suit HUD</button>}
          <button type="button" className="hg-scenario-secondary" onClick={()=>{onExit();onClose();}}>Return to live</button>
        </div>
      </footer>
    </section>
  </div>;
}
