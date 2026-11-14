import React from 'react';
import {Icon} from './viz.jsx';
import {METRICS,formatValue} from './api.js';
import {SCENARIOS,SCENARIO_LENGTH,SCENARIO_STAGES} from './scenarioSimulator.js';
import './scenarioConsole.css';

export default function ScenarioConsole({
  person, scenarioId, onSelectScenario, onStart, onPause, onReset, onExit,
  running, elapsed, sample, soundEnabled, onToggleSound, onSpeak
}){
  const scenario=SCENARIOS.find(s=>s.id===scenarioId);
  const active=Boolean(scenario);
  const alert=Boolean(sample?.alert);
  const tier=sample?.severity||'OPTIMAL';
  return <section className={'hg6-scenario-console '+(alert?'hg6-scenario-alarm':'')} aria-label="Interactive simulated emergency training">
    <div className="hg6-scenario-heading">
      <div className="hg6-scenario-heading-title">
        <Icon name="activity" size={19}/>
        <div><h2>Interactive Scenario Lab</h2><p>Scripted training playback · {person.name} · not a medical system</p></div>
      </div>
      <span className={'hg6-scenario-mode '+(active?'hg6-scenario-mode-active':'')}>{active?'TRAINING SIMULATION':'LIVE SIMULATOR VIEW'}</span>
    </div>
    <div className="hg6-scenario-controls">
      <label className="hg6-scenario-chooser"><span>Choose a scenario</span><select value={scenarioId} onChange={e=>onSelectScenario(e.target.value)}>
        <option value="">Normal live simulator</option>
        {SCENARIOS.map(s=><option value={s.id} key={s.id}>{s.name}</option>)}
      </select></label>
      <div className="hg6-scenario-actions">
        <button type="button" onClick={running?onPause:onStart} disabled={!active||elapsed>=SCENARIO_LENGTH} className="hg6-scenario-primary"><Icon name={running?'check':'activity'} size={15}/>{running?'Pause playback':elapsed>0?'Resume playback':'Start simulation'}</button>
        <button type="button" onClick={onReset} disabled={!active} className="hg6-scenario-secondary">Restart</button>
        <button type="button" onClick={onExit} disabled={!active} className="hg6-scenario-secondary">Return to live</button>
        <button type="button" onClick={onToggleSound} aria-pressed={soundEnabled} className="hg6-scenario-secondary"><Icon name={soundEnabled?'volume':'mute'} size={15}/>{soundEnabled?'Audio on':'Audio off'}</button>
      </div>
    </div>
    {active?<div className="hg6-scenario-running">
      <div className="hg6-scenario-tier"><strong>Scripted training status</strong><div>{['OPTIMAL','CHECK','WARNING','CRITICAL'].map(level=><span key={level} className={'hg6-tier-'+level.toLowerCase()+(level===tier?' active':'')}>{level}</span>)}</div><small>Illustrative progression only. No medically validated severity thresholds.</small></div>
      <div className="hg6-scenario-timeline">
        <div className="hg6-scenario-timeline-top"><div><strong>{scenario.name}</strong><p>{scenario.subtitle}</p></div><span className="hg6-scenario-timer">T+{String(Math.floor(elapsed/60)).padStart(2,'0')}:{String(elapsed%60).padStart(2,'0')} / 01:04</span></div>
        <div className="hg6-scenario-track" role="progressbar" aria-label="Scenario progress" aria-valuenow={elapsed} aria-valuemin={0} aria-valuemax={SCENARIO_LENGTH}><span style={{width:(elapsed/SCENARIO_LENGTH*100)+'%'}}/></div>
        <div className="hg6-scenario-stages">{SCENARIO_STAGES.slice(0,4).map(stage=><span key={stage.at} className={elapsed>=stage.at?'passed':''}>{stage.title}</span>)}</div>
        <p className="hg6-scenario-trigger">Training trigger: {scenario.triggerLabel}. These thresholds are illustrative, not clinical limits.</p>
      </div>
      <div className={'hg6-scenario-event '+(alert?'hg6-scenario-event-alert':'')}>
        <div className="hg6-scenario-event-icon"><Icon name={alert?'alert':'shield'} size={22}/></div>
        <div><span>{alert?'SIMULATED ALERT · ACTION REVIEW':elapsed>=SCENARIO_LENGTH?'SCENARIO COMPLETE':'SCRIPTED MONITORING'}</span><h3>{alert?'Physiological pattern deviation':sample?.stage||'Baseline'}</h3><p>{sample?.reason||'The fictional telemetry will change once playback begins.'}</p></div>
      </div>
      <div className="hg6-scenario-live-grid">
        {METRICS.map(metric=><div key={metric.key} className={'hg6-scenario-metric hg6-scenario-metric-'+(sample?.metric_levels?.[metric.key]||'OPTIMAL').toLowerCase()}>
          <span>{metric.label}</span><strong>{formatValue(sample?.values?.[metric.key],metric.digits)} <small>{metric.unit}</small></strong>
          <em>{sample?.metric_levels?.[metric.key]||'OPTIMAL'} · SCRIPTED</em>
        </div>)}
      </div>
      {sample?.engineering_values&&['co2','cabin_leak','radiation'].includes(scenarioId)&&<div className="hg6-scenario-env">
        <strong>Scripted spacecraft environment · not actual instrument data</strong>
        <div className="hg6-scenario-env-grid">{[
          ['cabin_co2_ppm','Cabin CO₂','ppm'],
          ['cabin_pressure_kpa','Cabin pressure','kPa'],
          ['radiation_rate_usv_h','Radiation rate','µSv/h']
        ].map(([key,label,unit])=><div key={key} className={sample.engineering_flags?.[key]?'flagged':''}>
          <span>{label}</span><strong>{formatValue(sample.engineering_values[key],1)} <small>{unit}</small></strong>
          <em>{sample.engineering_flags?.[key]?'SCRIPTED DEVIATION':'ILLUSTRATIVE'}</em>
        </div>)}</div>
      </div>}
      <div className="hg6-scenario-guidance"><div><strong><Icon name="shield" size={16}/> Training response guidance</strong><p>{scenario.guidance}</p></div><button type="button" onClick={onSpeak}><Icon name="volume" size={16}/> Speak guidance</button></div>
    </div>:<div className="hg6-scenario-idle">
      <Icon name="shield" size={20}/>
      <p>Select a scenario to replay a developing change in the selected astronaut’s vital signs. The scenario runs locally and does not overwrite backend sensor packets or PhysioAlert model results.</p>
    </div>}
  </section>;
}
