import test from 'node:test';
import assert from 'node:assert/strict';
import {WELLNESS_CHALLENGES,emptyWellnessStore,readWellnessStore,saveWellnessStore,
  getWellnessDay,updateWellnessDay,wellnessDaySummary,wellnessLifetimeXp,
  wellnessMilestones,remainingSeconds,stepIndexForElapsed,breathingCue} from '../src/wellnessGameLogic.js';

const DAY='2026-11-15';
test('five optional nonclinical wellness challenges include gentle alternatives and unique XP',()=>{
  assert.equal(WELLNESS_CHALLENGES.length,5);
  assert.deepEqual(WELLNESS_CHALLENGES.map(c=>c.id),['warmup','mobility','breathing','hydration','recovery']);
  assert.equal(new Set(WELLNESS_CHALLENGES.map(c=>c.id)).size,5);
  for(const c of WELLNESS_CHALLENGES){
    assert.ok(c.seconds>=20&&c.seconds<=35);
    assert.ok(c.xp>0&&c.xp<=25);
    assert.equal(c.seated.length,3);
    assert.equal(c.standing.length,3);
    assert.ok(c.safety.length>=55);
  }
});
test('only the self-reported daily completions earn points, no duplicate XP',()=>{
  let s=emptyWellnessStore();
  s=updateWellnessDay(s,DAY,'SIM_CREW_01','warmup','complete','seated');
  assert.equal(wellnessDaySummary(s,DAY,'SIM_CREW_01').xp,25);
  assert.equal(wellnessDaySummary(s,DAY,'SIM_CREW_01').done,1);
  s=updateWellnessDay(s,DAY,'SIM_CREW_01','warmup','complete','standing');
  assert.equal(wellnessDaySummary(s,DAY,'SIM_CREW_01').xp,25);
  assert.equal(getWellnessDay(s,DAY,'SIM_CREW_01').challenges.warmup.mode,'standing');
  s=updateWellnessDay(s,DAY,'SIM_CREW_01','mobility','skip');
  assert.equal(wellnessDaySummary(s,DAY,'SIM_CREW_01').skipped,1);
  assert.equal(wellnessDaySummary(s,DAY,'SIM_CREW_01').xp,25);
  s=updateWellnessDay(s,DAY,'SIM_CREW_01','warmup','reset');
  assert.equal(wellnessDaySummary(s,DAY,'SIM_CREW_01').xp,0);
});
test('separate crew/day progress and badges, no cross-crew data leakage',()=>{
  let s=emptyWellnessStore();
  for(const c of WELLNESS_CHALLENGES)s=updateWellnessDay(s,DAY,'SIM_CREW_01',c.id,'complete','seated');
  s=updateWellnessDay(s,DAY,'SIM_CREW_02','warmup','complete','standing');
  s=updateWellnessDay(s,'2026-11-14','SIM_CREW_01','warmup','complete');
  assert.equal(wellnessDaySummary(s,DAY,'SIM_CREW_01').done,5);
  assert.equal(wellnessDaySummary(s,DAY,'SIM_CREW_01').xp,100);
  assert.equal(wellnessLifetimeXp(s,'SIM_CREW_01'),125);
  assert.equal(wellnessLifetimeXp(s,'SIM_CREW_02'),25);
  assert.equal(wellnessLifetimeXp(s,'SIM_CREW_03'),0);
  assert.equal(wellnessDaySummary(s,DAY,'SIM_CREW_02').done,1);
  assert.equal(wellnessMilestones(s,DAY,'SIM_CREW_01').filter(b=>b.earned).length,4);
  assert.equal(wellnessMilestones(s,DAY,'SIM_CREW_03').filter(b=>b.earned).length,0);
  assert.deepEqual(updateWellnessDay(s,DAY,'C001','warmup','complete'),s);
  assert.deepEqual(updateWellnessDay(s,DAY,'SIM_CREW_01','unknown','complete'),s);
});
test('countdown never becomes negative, breathing cues never prompt holding',()=>{
  assert.equal(remainingSeconds(35,0),35);
  assert.equal(remainingSeconds(35,34500),1);
  assert.equal(remainingSeconds(35,35000),0);
  assert.equal(remainingSeconds(35,99000),0);
  assert.equal(stepIndexForElapsed(30,0),0);
  assert.equal(stepIndexForElapsed(30,12500),1);
  assert.equal(stepIndexForElapsed(30,26000),2);
  assert.equal(breathingCue(0).phase,'inhale');
  assert.equal(breathingCue(4500).phase,'exhale');
  assert.ok(!/hold/i.test(breathingCue(4500).label));
});
test('local storage round trip is separate from quiz progress and corrupt data fails closed',()=>{
  const items=new Map();
  const storage={getItem:key=>items.get(key)||null,setItem:(key,value)=>items.set(key,value)};
  let s=emptyWellnessStore();
  s=updateWellnessDay(s,DAY,'SIM_CREW_04','recovery','complete');
  assert.equal(saveWellnessStore(s,storage),true);
  assert.deepEqual(readWellnessStore(storage),s);
  assert.equal(items.has('healthguard-mission-quest-v2'),false);
  const broken={getItem:()=>'{bad json'};
  assert.deepEqual(readWellnessStore(broken),emptyWellnessStore());
});
