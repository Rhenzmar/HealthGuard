import test from 'node:test';
import assert from 'node:assert/strict';
import {currentActivity,primaryPattern,recentBaselineComparison} from '../src/crewContext.js';

test('activity uses actual simulator-declared context rather than invention',()=>{
  assert.deepEqual(currentActivity({activity_state:'RESTING'},{activity_state:'EXERTION'},null),{value:'Resting',note:'Declared'});
  assert.deepEqual(currentActivity(null,null,null),{value:'Not available',note:'No context'});
  assert.deepEqual(currentActivity(null,null,{activity_state:'SCRIPTED_EXERTION'}),{value:'Scripted Exertion',note:'Scripted'});
});

test('primary pattern reports largest real model residual, not a diagnosis',()=>{
  const unified={explanation:{candidate_17ch:{top_reconstruction_residuals:[{channel:'spo2_percent',residual:5}]}}};
  assert.deepEqual(primaryPattern(unified,null),{value:'Oxygen saturation',note:'Largest residual'});
  assert.equal(primaryPattern(null,null).value,'Awaiting model evidence');
  assert.equal(primaryPattern(null,{model_evidence:{candidate_17ch:{largest_reconstruction_errors:[{channel:'heart_rate_bpm'}]}}}).value,'Heart rate');
});

test('recent comparison requires 45 valid packets from the selected subject',()=>{
  const samples=Array.from({length:45},(_,i)=>({subject_id:'SIM_CREW_01',sequence:i,values:{heart_rate_bpm:70}}));
  samples.push({subject_id:'SIM_CREW_02',sequence:1,values:{heart_rate_bpm:999}});
  assert.deepEqual(recentBaselineComparison(samples,{subject_id:'SIM_CREW_01',sequence:45,values:{heart_rate_bpm:74}}),{value:'HR +4.0 bpm',note:'vs prior 45'});
  assert.deepEqual(recentBaselineComparison(samples.slice(0,30),{subject_id:'SIM_CREW_01',sequence:45,values:{heart_rate_bpm:74}}),{value:'Building reference',note:'30/45 packets'});
  assert.equal(recentBaselineComparison(samples,{subject_id:'SIM_CREW_03',sequence:45,values:{heart_rate_bpm:74}}).value,'Building reference');
  assert.equal(recentBaselineComparison(samples,null).value,'Not available');
});
