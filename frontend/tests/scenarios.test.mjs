import test from 'node:test';
import assert from 'node:assert/strict';
import {SCENARIOS, SCENARIO_LENGTH, scenarioAt, scenarioHistory} from '../src/scenarioSimulator.js';

test('Scenario samples are deterministically computed and identify their fictional source',()=>{
  const sample=scenarioAt('SIM_CREW_02','oxygenation',35);
  assert.deepEqual(sample,scenarioAt('SIM_CREW_02','oxygenation',35));
  assert.equal(sample.source,'SCRIPTED_TRAINING_SCENARIO');
  assert.equal(sample.subject_id,'SIM_CREW_02');
  assert.equal(sample.timestamp,null);
  assert.equal(sample.alert,true);
  assert.equal(sample.flags.spo2_percent,true);
});

test('All scenarios begin with no flags, activate their expected trigger and recover',()=>{
  const keys={
    oxygenation:'spo2_percent',
    exertion:'heart_rate_bpm',
    thermal:'core_temp_c',
    sensor:'spo2_percent'
  };
  for(const s of SCENARIOS){
    const baseline=scenarioAt('SIM_CREW_01',s.id,0);
    const peak=scenarioAt('SIM_CREW_01',s.id,35);
    const recovery=scenarioAt('SIM_CREW_01',s.id,SCENARIO_LENGTH);
    assert.equal(baseline.alert,false,s.id);
    assert.equal(peak.flags[keys[s.id]],true,s.id);
    assert.equal(recovery.alert,false,s.id);
    assert.equal(recovery.stage,'Complete',s.id);
  }
});

test('Histories have ordered, unique indices and distinct astronaut baselines',()=>{
  const hist=scenarioHistory('SIM_CREW_03','thermal',20);
  assert.equal(hist.length,21);
  assert.deepEqual(hist.map(x=>x.sequence),Array.from({length:21},(_,i)=>i));
  assert(hist.every(x=>x.subject_id==='SIM_CREW_03'));
  assert.notEqual(scenarioAt('SIM_CREW_01','thermal',1).values.heart_rate_bpm,
    scenarioAt('SIM_CREW_03','thermal',1).values.heart_rate_bpm);
});

test('Invalid scenario identifiers cannot generate invented outputs',()=>{
  assert.throws(()=>scenarioAt('SIM_CREW_01','malicious',0),/Unknown training scenario/);
});
