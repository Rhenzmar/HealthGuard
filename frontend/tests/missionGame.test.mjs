import test from 'node:test';
import assert from 'node:assert/strict';
import {QUESTS,emptyRoutineStore,updateCrewRoutine,getCrewRoutine,
  summarizeCrewRoutine,localDayKey,readRoutineStore,saveRoutineStore} from '../src/questLogic.js';
import {MISSION_TRIALS,getCrewLifetimeXp,getMissionRank,getMissionStreak,
  missionAchievements,isMissionUnlocked,evaluateTrial} from '../src/missionGameLogic.js';

const DAY='2026-11-15';

test('all five playable missions have valid, unique answer keys and rewards',()=>{
  assert.equal(QUESTS.length,5);
  assert.deepEqual(Object.keys(MISSION_TRIALS),QUESTS.map(q=>q.id));
  for(const quest of QUESTS){
    const trial=MISSION_TRIALS[quest.id];
    assert.ok(trial.callSign&&trial.question&&trial.scene);
    assert.equal(trial.route,quest.route);
    if(quest.id==='evening')continue;
    assert.equal(trial.options.length,3);
    assert.equal(new Set(trial.options.map(x=>x.id)).size,3);
    assert.equal(trial.options.filter(x=>x.id===trial.answer).length,1);
    assert.equal(evaluateTrial(quest.id,trial.answer).correct,true);
    for(const option of trial.options){
      assert.equal(evaluateTrial(quest.id,option.id).correct,option.id===trial.answer);
      assert.ok(evaluateTrial(quest.id,option.id).message.length>=15);
    }
  }
});
test('mission map requires completing or safely deferring the prior quest',()=>{
  const blank={tasks:{}};
  assert.equal(isMissionUnlocked(blank,0),true);
  assert.equal(isMissionUnlocked(blank,1),false);
  assert.equal(isMissionUnlocked({tasks:{morning:'complete'}},1),true);
  assert.equal(isMissionUnlocked({tasks:{morning:'deferred'}},1),true);
  assert.equal(isMissionUnlocked({tasks:{morning:'complete'}},2),false);
});
test('mission progress and XP remain separated across all four astronauts',()=>{
  let s=emptyRoutineStore();
  s=updateCrewRoutine(s,DAY,'SIM_CREW_01',{taskId:'morning',status:'complete'});
  s=updateCrewRoutine(s,DAY,'SIM_CREW_02',{taskId:'quality',status:'complete'});
  s=updateCrewRoutine(s,DAY,'SIM_CREW_03',{taskId:'morning',status:'deferred'});
  assert.equal(getCrewLifetimeXp(s,'SIM_CREW_01'),20);
  assert.equal(getCrewLifetimeXp(s,'SIM_CREW_02'),15);
  assert.equal(getCrewLifetimeXp(s,'SIM_CREW_03'),0);
  assert.equal(getCrewLifetimeXp(s,'SIM_CREW_04'),0);
  assert.equal(summarizeCrewRoutine(s,DAY,'SIM_CREW_01').done,1);
  assert.equal(summarizeCrewRoutine(s,DAY,'SIM_CREW_03').deferred,1);
  assert.equal(summarizeCrewRoutine(s,DAY,'SIM_CREW_04').percent,0);
  s=updateCrewRoutine(s,DAY,'SIM_CREW_01',{taskId:'morning',status:'complete'});
  assert.equal(getCrewLifetimeXp(s,'SIM_CREW_01'),20,'cannot double-award on repeated completion');
});
test('replay removes old reward, defer stays unpenalized, notes remain browser-local',()=>{
  let s=emptyRoutineStore();
  s=updateCrewRoutine(s,DAY,'SIM_CREW_01',{taskId:'evening',status:'complete',note:'Crew log: sensor reviewed.'});
  assert.equal(getCrewLifetimeXp(s,'SIM_CREW_01'),20);
  s=updateCrewRoutine(s,DAY,'SIM_CREW_01',{taskId:'evening',status:null});
  assert.equal(getCrewLifetimeXp(s,'SIM_CREW_01'),0);
  assert.equal(getCrewRoutine(s,DAY,'SIM_CREW_01').note,'Crew log: sensor reviewed.');
  s=updateCrewRoutine(s,DAY,'SIM_CREW_01',{taskId:'quality',status:'deferred'});
  assert.equal(getCrewLifetimeXp(s,'SIM_CREW_01'),0);
  assert.equal(evaluateTrial('evening',null,'short').correct,false);
  assert.equal(evaluateTrial('evening',null,'Documented uncertain telemetry.').correct,true);
});
test('rank, streak and achievements use recorded game progress, not physical status',()=>{
  assert.equal(getMissionRank(0).title,'Cadet');
  assert.equal(getMissionRank(85).title,'Specialist');
  assert.equal(getMissionRank(210).title,'Navigator');
  assert.equal(getMissionRank(425).title,'Commander');
  assert.equal(getMissionRank(750).title,'Mission Legend');
  let s=emptyRoutineStore();
  for(const day of ['2026-11-13','2026-11-14','2026-11-15'])
    for(const q of QUESTS)s=updateCrewRoutine(s,day,'SIM_CREW_01',{taskId:q.id,status:'complete'});
  assert.equal(getCrewLifetimeXp(s,'SIM_CREW_01'),255);
  assert.equal(getMissionStreak(s,'SIM_CREW_01',new Date(2026,10,15,12)),3);
  assert.equal(getMissionStreak(s,'SIM_CREW_02',new Date(2026,10,15,12)),0);
  const badges=missionAchievements(s,DAY,'SIM_CREW_01');
  assert.equal(badges.filter(x=>x.unlocked).length,6);
  assert.equal(summarizeCrewRoutine(s,DAY,'SIM_CREW_01').percent,100);
});
test('legacy browser checklist migrates only to original fictional crew',()=>{
  const data=new Map([['healthguard-mission-quest-v1',
    JSON.stringify({[DAY]:{morning:'complete',quality:'deferred'}})]]);
  const storage={
    getItem:key=>data.get(key)||null,
    setItem:(key,value)=>data.set(key,value)
  };
  const store=readRoutineStore(storage);
  assert.equal(getCrewRoutine(store,DAY,'SIM_CREW_01').tasks.morning,'complete');
  assert.equal(getCrewRoutine(store,DAY,'SIM_CREW_01').tasks.quality,'deferred');
  assert.deepEqual(getCrewRoutine(store,DAY,'SIM_CREW_04').tasks,{});
  assert.equal(saveRoutineStore(store,storage),true);
  assert.equal(readRoutineStore(storage).version,2);
});
