/**
 * Countermeasure Ops is an educational, fictional mission routine game.
 * It does NOT prescribe exercise, hydration volumes, medical treatment, or
 * measure cardiovascular fitness, cognitive ability or flight readiness.
 */
import {ROUTINE_CREW} from './questLogic.js';
import {checkinSummary} from './checkinGameLogic.js';

export const COUNTERMEASURE_KEY='healthguard-countermeasure-ops-v1';
export const COUNTERMEASURE_TASKS=Object.freeze([
  {id:'checkin',label:'Crew Daily Check-In',tag:'REFLECTION',icon:'clipboard-list',xp:20,
    hint:'Complete the four private Crew Check-In checkpoints, or skip questions freely.'},
  {id:'resistance',label:'Resistance Preparation',tag:'MOVEMENT',icon:'dumbbell',xp:20,
    hint:'Try a comfortable low-intensity warm-up. No weights are required.'},
  {id:'aerobic',label:'Aerobic Motion Drill',tag:'MOVEMENT',icon:'bike',xp:20,
    hint:'Try gentle movement or a seated alternative at your own pace.'},
  {id:'reaction',label:'Reaction Arcade',tag:'COGNITIVE',icon:'timer',xp:20,
    hint:'Play three reaction rounds. The results are game timings, not a NASA PVT.'},
  {id:'fluid',label:'Fluid Supply Challenge',tag:'SYSTEMS',icon:'droplets',xp:20,
    hint:'Inspect the fictional water-supply bay, not a drinking target.'}
]);
export const SUPPLY_CHECKS=Object.freeze([
  {id:'seal',label:'Check pouch seal',icon:'shield-check',detail:'Verify the fictional container is sealed.'},
  {id:'label',label:'Verify supply label',icon:'scan',detail:'Confirm this is the intended water supply.'},
  {id:'access',label:'Clear dispenser access',icon:'check-circle',detail:'Keep the simulated dispenser reachable.'},
]);
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const isObj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export const blankCountermeasureStore=()=>({version:1,days:{}});
export function readCountermeasureStore(storage){
  const target=storage===undefined?(typeof window!=='undefined'?window.localStorage:null):storage;
  if(!target)return blankCountermeasureStore();
  try{
    const data=JSON.parse(target.getItem(COUNTERMEASURE_KEY)||'null');
    if(data?.version===1&&isObj(data.days))return data;
  }catch{}
  return blankCountermeasureStore();
}
export function saveCountermeasureStore(store,storage){
  const target=storage===undefined?(typeof window!=='undefined'?window.localStorage:null):storage;
  try{if(!target)return false;target.setItem(COUNTERMEASURE_KEY,JSON.stringify(store));return true}catch{return false}
}
export function countermeasureEntries(store,day,crewId){
  const entries=store?.days?.[day]?.[crewId];
  return isObj(entries)?entries:{};
}
export function updateCountermeasure(store,day,crewId,taskId,outcome,details={}){
  if(!ROUTINE_CREW.includes(crewId)||!DATE.test(day)||
    !COUNTERMEASURE_TASKS.some(task=>task.id===taskId&&task.id!=='checkin')||
    !['complete','skipped','reset'].includes(outcome))return store;
  const earlier=countermeasureEntries(store,day,crewId);
  const next={...earlier};
  if(outcome==='reset')delete next[taskId];
  else{
    const clean={status:outcome};
    if(taskId==='reaction'&&outcome==='complete'){
      if(!isObj(details)||!Array.isArray(details.times)||details.times.length!==3||
        !details.times.every(t=>Number.isFinite(t)&&t>=0&&t<=10000))return store;
      clean.times=details.times.map(t=>Math.round(t));
    }
    if(['resistance','aerobic'].includes(taskId)&&outcome==='complete')
      clean.mode=details?.mode==='standing'?'standing':'seated';
    if(taskId==='fluid'&&outcome==='complete'){
      if(!SUPPLY_CHECKS.every(x=>details?.checks?.[x.id]===true))return store;
      clean.checked=SUPPLY_CHECKS.map(x=>x.id);
    }
    next[taskId]=clean;
  }
  return {...store,version:1,days:{...(store?.days||{}),
    [day]:{...(store?.days?.[day]||{}),[crewId]:next}}};
}
export function countermeasureSummary(store,checkinStore,day,crewId){
  const saved=countermeasureEntries(store,day,crewId);
  const checkin=checkinSummary(checkinStore,day,crewId);
  const statuses=Object.fromEntries(COUNTERMEASURE_TASKS.map(t=>{
    const status=t.id==='checkin'?(checkin.finished?'complete':null):saved[t.id]?.status;
    return [t.id,status==='complete'?'complete':status==='skipped'?'skipped':'pending'];
  }));
  const complete=Object.values(statuses).filter(s=>s==='complete').length;
  const skipped=Object.values(statuses).filter(s=>s==='skipped').length;
  const stamped=complete+skipped;
  return {statuses,completed:complete,skipped,stamped,pending:COUNTERMEASURE_TASKS.length-stamped,
    percent:Math.round(stamped/COUNTERMEASURE_TASKS.length*100),
    xp:stamped*20,finished:stamped===COUNTERMEASURE_TASKS.length,
    checkinStamps:checkin.done};
}
export function countermeasureLifetimeXp(store,checkinStore,crewId){
  if(!ROUTINE_CREW.includes(crewId))return 0;
  const days=new Set([...Object.keys(store?.days||{}),...Object.keys(checkinStore?.days||{})]);
  return [...days].filter(day=>DATE.test(day)).reduce((sum,day)=>
    sum+countermeasureSummary(store,checkinStore,day,crewId).xp,0);
}
export function countermeasureBadges(store,checkinStore,day,crewId){
  const data=countermeasureSummary(store,checkinStore,day,crewId);
  const stamps=data.statuses;
  return [
    {id:'launch',label:'Launch Day',icon:'flag',earned:data.stamped>0},
    {id:'moves',label:'Motion Officer',icon:'activity',earned:stamps.resistance==='complete'||stamps.aerobic==='complete'},
    {id:'pvt',label:'Reaction Pilot',icon:'zap',earned:stamps.reaction==='complete'},
    {id:'supply',label:'Supply Guardian',icon:'shield-check',earned:stamps.fluid==='complete'},
    {id:'all',label:'All Systems',icon:'award',earned:data.finished},
  ];
}
export function remainingCountermeasureSeconds(duration,elapsedMs){
  return Math.max(0,Math.ceil(Math.max(0,duration*1000-Math.max(0,elapsedMs))/1000));
}
export function medianReactionMs(times){
  if(!Array.isArray(times)||!times.length)return null;
  if(!times.every(t=>Number.isFinite(t)&&t>=0))return null;
  const s=[...times].sort((a,b)=>a-b);
  const n=s.length;
  return Math.round(n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2);
}
