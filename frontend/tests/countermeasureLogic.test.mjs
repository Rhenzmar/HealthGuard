import test from 'node:test';
import assert from 'node:assert/strict';
import {COUNTERMEASURE_TASKS,SUPPLY_CHECKS,blankCountermeasureStore,
  readCountermeasureStore,saveCountermeasureStore,countermeasureEntries,updateCountermeasure,
  countermeasureSummary,countermeasureLifetimeXp,countermeasureBadges,
  remainingCountermeasureSeconds,medianReactionMs} from '../src/countermeasureLogic.js';
import {emptyCheckinStore,updateCheckinDay} from '../src/checkinGameLogic.js';
const DATE='2026-11-15';
test('all five tasks are present, with no synthetic-water target or diagnostic result',()=>{
  assert.deepEqual(COUNTERMEASURE_TASKS.map(x=>x.id),['checkin','resistance','aerobic','reaction','fluid']);
  assert.equal(SUPPLY_CHECKS.length,3);
  assert.equal(new Set(COUNTERMEASURE_TASKS.map(x=>x.id)).size,5);
  assert.ok(COUNTERMEASURE_TASKS.every(x=>x.xp===20));
});
test('progress is independent across four crew and stores, and cannot be doubled',()=>{
  let s=blankCountermeasureStore(),check=emptyCheckinStore();
  s=updateCountermeasure(s,DATE,'SIM_CREW_01','resistance','complete',{mode:'seated'});
  s=updateCountermeasure(s,DATE,'SIM_CREW_01','resistance','complete',{mode:'standing'});
  s=updateCountermeasure(s,DATE,'SIM_CREW_02','aerobic','skipped');
  assert.equal(countermeasureSummary(s,check,DATE,'SIM_CREW_01').xp,20);
  assert.equal(countermeasureSummary(s,check,DATE,'SIM_CREW_02').xp,20);
  assert.equal(countermeasureSummary(s,check,DATE,'SIM_CREW_03').xp,0);
  assert.equal(countermeasureEntries(s,DATE,'SIM_CREW_01').resistance.mode,'standing');
  const origin=s;
  assert.equal(updateCountermeasure(s,DATE,'C001','fluid','complete',{}),origin);
  assert.equal(updateCountermeasure(s,DATE,'SIM_CREW_01','checkin','complete',{}),origin);
  check=updateCheckinDay(check,DATE,'SIM_CREW_01','sleep',{}, {skip:true}).store;
  assert.equal(countermeasureSummary(s,check,DATE,'SIM_CREW_01').checkinStamps,1);
  for(const step of ['mind','body','manual'])check=updateCheckinDay(check,DATE,'SIM_CREW_01',step,{}, {skip:true}).store;
  assert.equal(countermeasureSummary(s,check,DATE,'SIM_CREW_01').xp,40);
  assert.equal(countermeasureSummary(s,check,DATE,'SIM_CREW_01').statuses.checkin,'complete');
});
test('three valid reaction rounds required; invalid or negative scores are rejected',()=>{
  const s=blankCountermeasureStore();
  assert.equal(updateCountermeasure(s,DATE,'SIM_CREW_01','reaction','complete',{times:[200,300]}),s);
  assert.equal(updateCountermeasure(s,DATE,'SIM_CREW_01','reaction','complete',{times:[-10,200,300]}),s);
  assert.equal(updateCountermeasure(s,DATE,'SIM_CREW_01','reaction','complete',{times:['200',200,300]}),s);
  const result=updateCountermeasure(s,DATE,'SIM_CREW_01','reaction','complete',{times:[230,210,280]});
  assert.deepEqual(countermeasureEntries(result,DATE,'SIM_CREW_01').reaction.times,[230,210,280]);
  assert.equal(medianReactionMs([230,210,280]),230);
  assert.equal(medianReactionMs([5,20,80,100]),50);
  assert.equal(medianReactionMs([]),null);
});
test('fluid-puzzle stamp needs all three inspection steps and never records water volume',()=>{
  const s=blankCountermeasureStore();
  assert.equal(updateCountermeasure(s,DATE,'SIM_CREW_01','fluid','complete',{checks:{seal:true,label:true}}),s);
  const checks=Object.fromEntries(SUPPLY_CHECKS.map(x=>[x.id,true]));
  const result=updateCountermeasure(s,DATE,'SIM_CREW_01','fluid','complete',{checks,volume:999999});
  assert.deepEqual(countermeasureEntries(result,DATE,'SIM_CREW_01').fluid,{status:'complete',checked:['seal','label','access']});
  assert.equal(countermeasureSummary(result,emptyCheckinStore(),DATE,'SIM_CREW_01').xp,20);
});
test('all five stamps can be earned including skips, without scoring health',()=>{
  let s=blankCountermeasureStore(),check=emptyCheckinStore();
  for(const step of ['sleep','mind','body','manual'])check=updateCheckinDay(check,DATE,'SIM_CREW_01',step,{}, {skip:true}).store;
  for(const task of ['resistance','aerobic','reaction','fluid'])s=updateCountermeasure(s,DATE,'SIM_CREW_01',task,'skipped');
  const summary=countermeasureSummary(s,check,DATE,'SIM_CREW_01');
  assert.equal(summary.stamped,5);
  assert.equal(summary.skipped,4);
  assert.equal(summary.percent,100);
  assert.equal(summary.xp,100);
  assert.equal(countermeasureLifetimeXp(s,check,'SIM_CREW_01'),100);
  assert.equal(countermeasureBadges(s,check,DATE,'SIM_CREW_01').find(b=>b.id==='all').earned,true);
  s=updateCountermeasure(s,DATE,'SIM_CREW_01','reaction','reset');
  assert.equal(countermeasureSummary(s,check,DATE,'SIM_CREW_01').xp,80);
});
test('timer clamps at zero and game storage is isolated from other mission games',()=>{
  assert.equal(remainingCountermeasureSeconds(25,0),25);
  assert.equal(remainingCountermeasureSeconds(25,24900),1);
  assert.equal(remainingCountermeasureSeconds(25,26000),0);
  const db=new Map();
  const local={getItem:k=>db.get(k)||null,setItem:(k,v)=>db.set(k,v)};
  const s=updateCountermeasure(blankCountermeasureStore(),DATE,'SIM_CREW_04','aerobic','skipped');
  assert.equal(saveCountermeasureStore(s,local),true);
  assert.deepEqual(readCountermeasureStore(local),s);
  assert.deepEqual([...db.keys()],['healthguard-countermeasure-ops-v1']);
});
