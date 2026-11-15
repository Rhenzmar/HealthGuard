import test from 'node:test';
import assert from 'node:assert/strict';
import {appendEngineeringReading,ENGINEERING_HISTORY_LIMIT} from '../src/engineeringTrendHistory.js';

test('builds a graph from genuine source values and poll receipt times',()=>{
  const first=appendEngineeringReading([],'SIM_CREW_01',{systolic_bp_mmhg:111.2},1000);
  const second=appendEngineeringReading(first,'SIM_CREW_01',{systolic_bp_mmhg:112.1},5200);
  assert.equal(second.length,2);
  assert.equal(second[0].sequence,1);
  assert.equal(second[1].sequence,2);
  assert.equal(second[1].values.systolic_bp_mmhg,112.1);
  assert.equal(second[1].timestamp,'1970-01-01T00:00:05.200Z');
});
test('rejects empty and invalid results instead of inventing history',()=>{
  const row=appendEngineeringReading([],'SIM_CREW_01',{etco2_mmhg:37},1000);
  assert.equal(appendEngineeringReading(row,'SIM_CREW_01',{},2000).length,1);
  assert.equal(appendEngineeringReading(row,'SIM_CREW_01',{etco2_mmhg:null},2000).length,1);
  assert.equal(appendEngineeringReading(row,'SIM_CREW_01',{etco2_mmhg:NaN},2000).length,1);
  assert.equal(appendEngineeringReading(row,'SIM_CREW_01',{etco2_mmhg:38},999).length,1);
});
test('different astronauts never share an engineering trend history',()=>{
  const first=appendEngineeringReading([],'SIM_CREW_01',{diastolic_bp_mmhg:72},1000);
  const next=appendEngineeringReading(first,'SIM_CREW_02',{diastolic_bp_mmhg:90},2000);
  assert.deepEqual(next.map(row=>row.subject_id),['SIM_CREW_02']);
  assert.deepEqual(next.map(row=>row.sequence),[1]);
});
test('keeps the latest bounded observations only',()=>{
  let history=[];
  for(let i=0;i<ENGINEERING_HISTORY_LIMIT+15;i++){
    history=appendEngineeringReading(history,'SIM_CREW_01',{peripheral_temp_c:33.3+i/100},1000+i*4200);
  }
  assert.equal(history.length,ENGINEERING_HISTORY_LIMIT);
  assert.equal(history.at(-1).sequence,ENGINEERING_HISTORY_LIMIT+15);
  assert.equal(history[0].sequence,16);
});
