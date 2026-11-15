import test from 'node:test';
import assert from 'node:assert/strict';
import {verifiedScenarioFrame,anatomyAlertRegions} from '../src/scenarioAnatomy.js';

const frame={subject_id:'SIM_CREW_01',scenario_id:'oxygenation',source:'SERVER_SCRIPTED_TRAINING_SCENARIO',severity:'CRITICAL',metric_levels:{spo2_percent:'CRITICAL',heart_rate_bpm:'WARNING'}};
test('scenario must belong to selected crew and match the trusted source',()=>{
  assert.equal(verifiedScenarioFrame({id:'oxygenation',latest:frame},'SIM_CREW_01'),frame);
  assert.equal(verifiedScenarioFrame({id:'oxygenation',latest:frame},'SIM_CREW_02'),null);
  assert.equal(verifiedScenarioFrame({id:'exertion',latest:frame},'SIM_CREW_01'),null);
});
test('critical oxygenation flags related lungs and cardiac sections only',()=>{
  assert.deepEqual(anatomyAlertRegions(frame),['cardiac','respiratory']);
  assert.deepEqual(anatomyAlertRegions({...frame,severity:'OPTIMAL'}),[]);
});
test('engineering-only warning does not falsely flag an organ',()=>{
  assert.deepEqual(anatomyAlertRegions({...frame,metric_levels:{},severity:'CRITICAL'}),[]);
});
