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
    sensor:'spo2_percent',
    co2:'respiratory_rate_bpm',
    cabin_leak:'spo2_percent',
    radiation:'radiation_rate_usv_h',
    suit_leak:'suit_pressure_psi',
    suit_power:'suit_battery_percent'
  };
  for(const s of SCENARIOS){
    const baseline=scenarioAt('SIM_CREW_01',s.id,0);
    const peak=scenarioAt('SIM_CREW_01',s.id,35);
    const recovery=scenarioAt('SIM_CREW_01',s.id,SCENARIO_LENGTH);
    assert.equal(baseline.alert,false,s.id);
    assert.equal(['radiation','suit_leak','suit_power'].includes(s.id)?peak.engineering_flags[keys[s.id]]:peak.flags[keys[s.id]],true,s.id);
    assert.equal(recovery.alert,false,s.id);
    assert.equal(recovery.severity,'OPTIMAL',s.id);
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

test('Four-tier scripted status progresses and recovers without classifying labs',()=>{
  const levels=[0,14,22,35,64].map(t=>scenarioAt('SIM_CREW_01','oxygenation',t).severity);
  assert.deepEqual(levels,['OPTIMAL','CHECK','WARNING','CRITICAL','OPTIMAL']);
  const peak=scenarioAt('SIM_CREW_01','oxygenation',35);
  assert.equal(peak.metric_levels.spo2_percent,'CRITICAL');
  assert.equal(peak.metric_levels.core_temp_c,'OPTIMAL');
  assert.equal(peak.source,'SCRIPTED_TRAINING_SCENARIO');
});

test('Environmental disturbances change only scripted engineering values',()=>{
 const co2=scenarioAt('SIM_CREW_02','co2',35);
 const leak=scenarioAt('SIM_CREW_02','cabin_leak',35);
 const radiation=scenarioAt('SIM_CREW_02','radiation',35);
 assert(co2.engineering_values.cabin_co2_ppm>4000);
 assert(co2.engineering_flags.cabin_co2_ppm);
 assert(leak.engineering_values.cabin_pressure_kpa<85);
 assert(leak.engineering_flags.cabin_pressure_kpa);
 assert(radiation.engineering_values.radiation_rate_usv_h>1000);
 assert(radiation.engineering_flags.radiation_rate_usv_h);
 assert.equal(radiation.flags.spo2_percent,false);
 assert.equal(radiation.source,'SCRIPTED_TRAINING_SCENARIO');
});

test('Suit pressure and battery simulations show separate scripted failures with recovery',()=>{
  for(const [id,key] of [['suit_leak','suit_pressure_psi'],['suit_power','suit_battery_percent']]){
    const start=scenarioAt('SIM_CREW_01',id,0);
    const peak=scenarioAt('SIM_CREW_01',id,35);
    const end=scenarioAt('SIM_CREW_01',id,64);
    assert(peak.engineering_values[key]<start.engineering_values[key]);
    assert.equal(peak.engineering_flags[key],true);
    assert.equal(peak.severity,'CRITICAL');
    assert.equal(end.engineering_flags[key],false);
  }
});
