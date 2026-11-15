import test from 'node:test';
import assert from 'node:assert/strict';
import {CREW_SUBJECT_IDS,crewIndexForSubject,latestForSubject,samplesForSubject,crewFeedStatus} from '../src/missionDashboardState.js';

test('each astronaut maps to an independent selected crew index',()=>{
  CREW_SUBJECT_IDS.forEach((subject,index)=>assert.equal(crewIndexForSubject(subject),index));
  assert.equal(crewIndexForSubject('UNKNOWN'),0);
});

test('snapshot selection cannot borrow a different crew member packet',()=>{
  const snapshot={subjects:{SIM_CREW_01:{latest:{subject_id:'SIM_CREW_01',sequence:1}},SIM_CREW_02:{latest:{subject_id:'SIM_CREW_01',sequence:2}}}};
  assert.equal(latestForSubject(snapshot,'SIM_CREW_01').sequence,1);
  assert.equal(latestForSubject(snapshot,'SIM_CREW_02'),null);
  assert.equal(latestForSubject(snapshot,'SIM_CREW_04'),null);
});

test('trend data never mixes crew IDs and falls back to latest snapshot',()=>{
  const samples=[{subject_id:'SIM_CREW_01',sequence:3},{subject_id:'SIM_CREW_02',sequence:5}];
  assert.deepEqual(samplesForSubject(samples,'SIM_CREW_02',{subject_id:'SIM_CREW_02',sequence:6}).map(x=>x.sequence),[5,6]);
  assert.deepEqual(samplesForSubject(samples,'SIM_CREW_01',{subject_id:'SIM_CREW_02',sequence:8}).map(x=>x.sequence),[3]);
  assert.deepEqual(samplesForSubject(samples,'SIM_CREW_01',{subject_id:'SIM_CREW_01',sequence:3}).map(x=>x.sequence),[3]);
});

test('crew cards distinguish active feeds, cached snapshots, and missing packets',()=>{
  assert.deepEqual(crewFeedStatus('connected',['SIM_CREW_01'],'SIM_CREW_01'),{label:'Simulated feed active',online:true});
  assert.equal(crewFeedStatus('reconnecting',['SIM_CREW_01'],'SIM_CREW_01').label,'Last simulator snapshot');
  assert.equal(crewFeedStatus('connected',[],'SIM_CREW_04').label,'Awaiting simulator packet');
  assert.equal(crewFeedStatus('connecting',[],'SIM_CREW_04').label,'Connection pending');
});
