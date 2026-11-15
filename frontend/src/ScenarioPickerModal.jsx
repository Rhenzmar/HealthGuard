import React,{useEffect,useRef,useState} from 'react';
import {Icon} from './viz.jsx';
import {SCENARIOS,SCENARIO_LENGTH} from './scenarioSimulator.js';
import ScenarioConsole from './ScenarioConsole.jsx';
import './scenarioPickerModal.css';

const CREW_SCENARIOS = new Set(['oxygenation','exertion','thermal','sensor']);
const CATEGORIES = [
  {id:'crew',label:'CREW HEALTH',title:'Physiological events',description:'Scripted changes in a fictional astronaut’s vital signs.'},
  {id:'environment',label:'SPACECRAFT',title:'Spacecraft and cabin events',description:'Illustrative atmosphere and radiation events, with simulated crew responses.'}
];

/**
 * A presentation-only picker. All scenario timing and data remain owned by
 * MissionDashboard, even when this dialog is closed.
 */
export default function ScenarioPickerModal({
  open,onClose,onHUD,person,scenarioId,onSelectScenario,onStart,onPause,onReset,onExit,
  running,elapsed,sample,soundEnabled,onToggleSound,onSpeak,scenarioPending=false,scenarioError=''
}){
  const [category,setCategory]=useState('crew');
  const [showDetails,setShowDetails]=useState(false);
  useEffect(()=>{if(running)setShowDetails(true);},[running]);
  const modalRef=useRef(null);
  const closeRef=useRef(null);
  const returnFocusRef=useRef(null);
  const onCloseRef=useRef(onClose);
  onCloseRef.current=onClose;
  useEffect(()=>{
    if(!open)return;
    returnFocusRef.current=document.activeElement;
    setCategory(CREW_SCENARIOS.has(scenarioId)||!scenarioId?'crew':'environment');
    setShowDetails(Boolean(running));
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    closeRef.current?.focus();
    const onKeyDown=event=>{
      if(event.key==='Escape'){event.preventDefault();onCloseRef.current();return;}
      if(event.key!=='Tab'||!modalRef.current)return;
      const focusables=Array.from(modalRef.current.querySelectorAll('button:not([disabled]),select:not([disabled]),a[href],summary,[tabindex]:not([tabindex="-1"])')).filter(node=>node.getClientRects().length);
      if(!focusables.length)return;
      const first=focusables[0],last=focusables[focusables.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    };
    document.addEventListener('keydown',onKeyDown);
    return()=>{
      document.body.style.overflow=previousOverflow;
      document.removeEventListener('keydown',onKeyDown);
      returnFocusRef.current?.focus?.();
    };
  },[open]);
  if(!open)return null;
  const group=CATEGORIES.find(item=>item.id===category)||CATEGORIES[0];
  const visible=SCENARIOS.filter(item=>category==='crew'?CREW_SCENARIOS.has(item.id):!CREW_SCENARIOS.has(item.id));
  const selected=SCENARIOS.find(item=>item.id===scenarioId);
  const isFinished=elapsed>=SCENARIO_LENGTH;
  const status=scenarioError?'UNAVAILABLE':scenarioPending?'LOADING':running?'PLAYING':selected?isFinished?'COMPLETE':'READY':'NO SCENARIO';
  const level=selected && sample?.source==='SERVER_SCRIPTED_TRAINING_SCENARIO'
    ? sample.severity:null;
  const play=()=>{onStart();setShowDetails(true);};
  return <div className="hg-scenario-backdrop" onMouseDown={event=>{if(!running&&event.target===event.currentTarget)onClose();}}>
    <section className="hg-scenario-modal" role="dialog" aria-modal="true" aria-label="Choose a training scenario" aria-labelledby="hg-scenario-title" ref={modalRef}>
      <header className="hg-scenario-modal-header">
        <div><span className="hg-scenario-kicker">HEALTHGUARD · TRAINING SIMULATION</span><h2 id="hg-scenario-title">Possible scenarios</h2><p>Choose a fictional event to demonstrate changing astronaut health indicators.</p></div>
        <div className="hg-scenario-modal-header-actions">
          {selected&&<button type="button" className="hg-scenario-reset" onClick={onHUD} title="View the same scenario in the astronaut suit display"><Icon name="radio" size={15}/> View in suit HUD</button>}
          <button type="button" className="hg-scenario-reset" onClick={()=>{onExit();onClose();}} title="Stop scenario and return to normal simulated feed"><Icon name="radio" size={15}/> Reset to live</button>
          <button ref={closeRef} type="button" className="hg-scenario-close" onClick={onClose} aria-label="Close scenario picker"><Icon name="x" size={18}/></button>
        </div>
      </header>
      <div className="hg-scenario-tabs" role="tablist" aria-label="Scenario category">
        {CATEGORIES.map(item=><button key={item.id} type="button" role="tab" id={'hg-scenario-tab-'+item.id} aria-selected={category===item.id} aria-controls="hg-scenario-panel" className={category===item.id?'active':''} onClick={()=>setCategory(item.id)}>{item.label}<span>{SCENARIOS.filter(s=>item.id==='crew'?CREW_SCENARIOS.has(s.id):!CREW_SCENARIOS.has(s.id)).length}</span></button>)}
      </div>
      <div className="hg-scenario-modal-body" id="hg-scenario-panel" role="tabpanel" aria-labelledby={'hg-scenario-tab-'+category}>
        <div className="hg-scenario-group"><span className="hg-scenario-group-icon"><Icon name={category==='crew'?'heart':'satellite'} size={17}/></span><div><h3>{group.title}</h3><p>{group.description}</p></div><span className="hg-scenario-count">{visible.length} EVENTS</span></div>
        <div className="hg-scenario-cards">{visible.map((scenario,i)=><button key={scenario.id} type="button" className={'hg-scenario-option '+(scenarioId===scenario.id?'selected':'')} onClick={()=>onSelectScenario(scenario.id)} aria-pressed={scenarioId===scenario.id}>
          <div className="hg-scenario-option-top"><span className="hg-scenario-number">{String(i+1).padStart(2,'0')}</span><strong>{scenario.name}</strong><span className="hg-scenario-category">{category==='crew'?'CREW':'CABIN'}</span></div>
          <p>{scenario.subtitle}</p>
          <div className="hg-scenario-option-meta"><span>{scenario.triggerLabel}</span><b>{scenarioId===scenario.id?'SELECTED':'SELECT'} <Icon name="arrow" size={13}/></b></div>
        </button>)}</div>
        <p className="hg-scenario-disclaimer"><Icon name="shield" size={14}/> Scenario values, severity tiers and triggers are scripted for demonstration only. They are not measurements from real astronauts or clinical risk predictions.</p>
      </div>
      <footer className="hg-scenario-modal-footer">
        <div className="hg-scenario-current">
          <div><span className="hg-scenario-status-dot"/><strong>{selected?'ACTIVE SELECTION · '+selected.name:'NO ACTIVE SCENARIO'}</strong><span className={'hg-scenario-status '+(running?'live':'')}>{status}</span>{level&&<span className={'hg-scenario-level hg-scenario-level-'+level.toLowerCase()} aria-live="polite">{level} · TRAINING</span>}</div>
          <p>{selected?selected.cause:'Select a scenario above to prepare a fictional playback.'}</p>
          {scenarioError&&<p role="alert" className="hg-scenario-error">Scenario backend unavailable: {scenarioError}. No fabricated model outputs are shown.</p>}
          {scenarioPending&&<p role="status" className="hg-scenario-pending">Loading scenario and 17-channel model evidence…</p>}
          {selected&&<div className="hg-scenario-progress" role="progressbar" aria-label="Scenario playback progress" aria-valuemin={0} aria-valuemax={SCENARIO_LENGTH} aria-valuenow={elapsed}><i style={{width:(elapsed/SCENARIO_LENGTH*100)+'%'}}/></div>}
        </div>
        <div className="hg-scenario-footer-actions">
          {selected&&<button type="button" className="hg-scenario-secondary" onClick={onReset} title="Restart selected scenario">Restart</button>}
          {selected&&running&&<button type="button" className="hg-scenario-secondary" onClick={onPause}>Pause</button>}
          <button type="button" className="hg-scenario-start" disabled={!selected||!sample||scenarioPending||Boolean(scenarioError)||running||isFinished} onClick={play}><Icon name="activity" size={16}/>{running?'Running':elapsed>0?'Resume playback':'Start scenario'}</button>
        </div>
      </footer>
      {selected&&<div className="hg-scenario-detail-region">
        <button className="hg-scenario-detail-toggle" type="button" onClick={()=>setShowDetails(v=>!v)} aria-expanded={showDetails}><Icon name="activity" size={15}/>{showDetails?'Hide training controls':'Show full training controls'}<Icon name="chevron" size={14}/></button>
        {showDetails&&<div className="hg-scenario-detail-expanded"><ScenarioConsole person={person} scenarioId={scenarioId} scenarioPending={scenarioPending} scenarioError={scenarioError} onSelectScenario={onSelectScenario} onStart={onStart} onPause={onPause} onReset={onReset} onExit={onExit} running={running} elapsed={elapsed} sample={sample} soundEnabled={soundEnabled} onToggleSound={onToggleSound} onSpeak={onSpeak}/></div>}
      </div>}
    </section>
  </div>;
}
