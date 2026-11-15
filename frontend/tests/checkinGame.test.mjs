import test from 'node:test';
import assert from 'node:assert/strict';
import {CHECKIN_STAGES,CHECKIN_REGIONS,MOODS,MANUAL_FIELDS,
  emptyCheckinStore,readCheckinStore,saveCheckinStore,
  getCheckinDay,validateCheckinStep,updateCheckinDay,checkinSummary,
  checkinLifetimeXp,getCheckinHistory,removeCheckinDay,checkinBadges
} from '../src/checkinGameLogic.js';

const DAY='2026-11-15';
test('four clear subjective game checkpoints and selectable body regions',()=>{
  assert.deepEqual(CHECKIN_STAGES.map(x=>x.id),['sleep','mind','body','manual']);
  assert.equal(CHECKIN_REGIONS.length,6);
  assert.ok(MOODS.length>=4);
  assert.equal(MANUAL_FIELDS.length,6);
  assert.ok(CHECKIN_STAGES.every(x=>x.xp===15));
});
test('sleep and mind entries validate dimensions without labelling health severity',()=>{
  assert.equal(validateCheckinStep('sleep',{hours:7.5,rest:8}).valid,true);
  assert.equal(validateCheckinStep('sleep',{hours:25,rest:8}).valid,false);
  assert.equal(validateCheckinStep('sleep',{hours:6,rest:0}).valid,false);
  assert.equal(validateCheckinStep('mind',{fatigue:10,mood:'stressed',workload:100}).valid,true);
  assert.equal(validateCheckinStep('mind',{fatigue:10,mood:'diagnosed',workload:30}).valid,false);
});
test('body map allows discomfort and no discomfort but rejects invented regions',()=>{
  const a=validateCheckinStep('body',{none:false,regions:{head:1,chest:3},note:'Some discomfort'});
  assert.equal(a.valid,true);
  assert.equal(a.data.regions.chest,3);
  assert.equal(validateCheckinStep('body',{none:false,regions:{},note:''}).valid,false);
  assert.equal(validateCheckinStep('body',{none:true,regions:{head:2}}).data.none,true);
  assert.deepEqual(validateCheckinStep('body',{none:true,regions:{head:2}}).data.regions,{});
  assert.equal(validateCheckinStep('body',{regions:{fake:2}}).valid,false);
});
test('manual biometrics are blank by default and never filled with simulated values',()=>{
  assert.deepEqual(validateCheckinStep('manual',{}).data,{});
  const v=validateCheckinStep('manual',{heartRate:'71',spo2:'97.5',temp:''});
  assert.equal(v.valid,true);
  assert.deepEqual(v.data,{heartRate:71,spo2:97.5});
  assert.equal(validateCheckinStep('manual',{heartRate:'600'}).valid,false);
  assert.equal(validateCheckinStep('manual',{spo2:'-5'}).valid,false);
  assert.equal(validateCheckinStep('manual',{systolic:'not a number'}).valid,false);
});
test('skipped or logged steps earn equal stamps once and do not modify other crew',()=>{
  let store=emptyCheckinStore();
  for(const stage of CHECKIN_STAGES){
    const outcome=updateCheckinDay(store,DAY,'SIM_CREW_01',stage.id,{}, {skip:true});
    assert.equal(outcome.ok,true);store=outcome.store;
  }
  assert.deepEqual(checkinSummary(store,DAY,'SIM_CREW_01'),{done:4,logged:0,skipped:4,percent:100,xp:60,finished:true});
  assert.equal(checkinSummary(store,DAY,'SIM_CREW_02').xp,0);
  const logged=updateCheckinDay(store,DAY,'SIM_CREW_01','sleep',{hours:5,rest:3});
  assert.equal(logged.ok,true);
  store=logged.store;
  assert.equal(checkinSummary(store,DAY,'SIM_CREW_01').xp,60);
  assert.equal(getCheckinDay(store,DAY,'SIM_CREW_01').sleep.hours,5);
  assert.equal(checkinBadges(store,DAY,'SIM_CREW_01').find(x=>x.name==='Four-Stamp Orbit').earned,true);
  assert.equal(updateCheckinDay(store,DAY,'C001','sleep',{}, {skip:true}).ok,false);
  assert.equal(updateCheckinDay(store,DAY,'SIM_CREW_01','manual',{spo2:105}).ok,false);
});
test('history, local-only storage and individual day deletion do not affect other crew',()=>{
  let s=emptyCheckinStore();
  s=updateCheckinDay(s,DAY,'SIM_CREW_01','sleep',{hours:6.5,rest:7}).store;
  s=updateCheckinDay(s,DAY,'SIM_CREW_02','sleep',{hours:8,rest:9}).store;
  s=updateCheckinDay(s,'2026-11-14','SIM_CREW_01','sleep',{}, {skip:true}).store;
  const memory=new Map();
  const local={getItem:key=>memory.get(key)||null,setItem:(key,val)=>memory.set(key,val)};
  assert.equal(saveCheckinStore(s,local),true);
  assert.deepEqual(readCheckinStore(local),s);
  assert.equal(memory.has('healthguard-mission-quest-v2'),false);
  assert.equal(memory.has('healthguard-wellness-expedition-v1'),false);
  assert.equal(getCheckinHistory(s,'SIM_CREW_01').length,2);
  assert.equal(checkinLifetimeXp(s,'SIM_CREW_01'),30);
  s=removeCheckinDay(s,DAY,'SIM_CREW_01');
  assert.equal(getCheckinHistory(s,'SIM_CREW_01').length,1);
  assert.equal(getCheckinDay(s,DAY,'SIM_CREW_02').sleep.hours,8);
  assert.equal(readCheckinStore({getItem:()=>'{broken'}).version,1);
});
