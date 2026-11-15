/**
 * HealthGuard Crew Check-In, a voluntary role-playing self-assessment game.
 * This module never interprets answers as medical conditions, fitness
 * clearance, NASA-TLX scores, or physiological model input.
 * Data are saved only in local browser storage for fictional crew profiles.
 */
import {ROUTINE_CREW} from './questLogic.js';

export const CHECKIN_STORAGE_KEY='healthguard-crew-checkin-v1';
export const CHECKIN_STAGES=Object.freeze([
  {id:'sleep',title:'Sleep Dock',subtitle:'Sleep & recovery',callSign:'REST MODULE',icon:'moon',xp:15},
  {id:'mind',title:'Mind Command',subtitle:'Fatigue, mood & workload',callSign:'MENTAL STATUS',icon:'brain',xp:15},
  {id:'body',title:'Body Scan',subtitle:'Discomfort map',callSign:'BODY MAP',icon:'scan',xp:15},
  {id:'manual',title:'Bio Console',subtitle:'Manual readings (optional)',callSign:'SENSOR NOTE',icon:'heart-pulse',xp:15},
]);
export const CHECKIN_REGIONS=Object.freeze([
  {id:'head',name:'Head / neck',x:51,y:13},
  {id:'chest',name:'Chest',x:51,y:36},
  {id:'arms',name:'Arms / shoulders',x:23,y:45},
  {id:'abdomen',name:'Abdomen',x:51,y:56},
  {id:'legs',name:'Legs / feet',x:49,y:85},
  {id:'back',name:'Back',x:77,y:48},
]);
export const MOODS=Object.freeze([
  {id:'calm',label:'Calm',icon:'smile'},
  {id:'okay',label:'Okay',icon:'meh'},
  {id:'tired',label:'Tired',icon:'battery-low'},
  {id:'stressed',label:'Stressed',icon:'cloud'},
  {id:'low',label:'Low',icon:'cloud-rain'},
]);
export const MANUAL_FIELDS=Object.freeze([
  {id:'heartRate',name:'Heart rate',unit:'bpm',min:1,max:250,step:1},
  {id:'spo2',name:'Oxygen saturation',unit:'%',min:0,max:100,step:1},
  {id:'systolic',name:'Systolic pressure',unit:'mmHg',min:1,max:300,step:1},
  {id:'diastolic',name:'Diastolic pressure',unit:'mmHg',min:1,max:250,step:1},
  {id:'temp',name:'Body temperature',unit:'°C',min:20,max:45,step:0.1},
  {id:'hrv',name:'HRV (RMSSD)',unit:'ms',min:0,max:300,step:1},
]);
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export const emptyCheckinStore=()=>({version:1,days:{}});
export function readCheckinStore(storage){
  const target=storage===undefined?(typeof window!=='undefined'?window.localStorage:null):storage;
  if(!target)return emptyCheckinStore();
  try{
    const v=JSON.parse(target.getItem(CHECKIN_STORAGE_KEY)||'null');
    if(v?.version===1&&isObject(v.days))return v;
  }catch{}
  return emptyCheckinStore();
}
export function saveCheckinStore(store,storage){
  const target=storage===undefined?(typeof window!=='undefined'?window.localStorage:null):storage;
  try{if(!target)return false;target.setItem(CHECKIN_STORAGE_KEY,JSON.stringify(store));return true}catch{return false}
}
export function getCheckinDay(store,day,crewId){
  const raw=store?.days?.[day]?.[crewId];
  return {stamps:isObject(raw?.stamps)?raw.stamps:{},
    sleep:isObject(raw?.sleep)?raw.sleep:null,
    mind:isObject(raw?.mind)?raw.mind:null,
    body:isObject(raw?.body)?raw.body:null,
    manual:isObject(raw?.manual)?raw.manual:null};
}
function inRange(value,min,max){return typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max}
function numeric(v){return typeof v==='number'?v:(typeof v==='string'&&v.trim()?Number(v):null)}
export function validateCheckinStep(step,data){
  if(!isObject(data))return {valid:false,message:'Choose an answer or use Prefer not to answer.'};
  if(step==='sleep'){
    if(!inRange(data.hours,0,24)||!inRange(data.rest,1,10))
      return {valid:false,message:'Choose sleep duration and a restfulness rating.'};
    return {valid:true,data:{hours:Math.round(data.hours*2)/2,rest:Math.round(data.rest)}};
  }
  if(step==='mind'){
    if(!inRange(data.fatigue,1,10)||!MOODS.some(m=>m.id===data.mood)||!inRange(data.workload,0,100))
      return {valid:false,message:'Choose fatigue, mood, and perceived workload.'};
    return {valid:true,data:{fatigue:Math.round(data.fatigue),mood:data.mood,workload:Math.round(data.workload)}};
  }
  if(step==='body'){
    if(data.none===true)return {valid:true,data:{none:true,regions:{},note:typeof data.note==='string'?data.note.slice(0,250):''}};
    if(!isObject(data.regions))return {valid:false,message:'Select a body region or choose No discomfort to report.'};
    const regions={};
    for(const [id,severity] of Object.entries(data.regions)){
      if(!CHECKIN_REGIONS.some(r=>r.id===id)||!Number.isInteger(severity)||!inRange(severity,1,3))
        return {valid:false,message:'Select a permitted region and mild, moderate, or strong discomfort.'};
      regions[id]=severity;
    }
    if(Object.keys(regions).length===0)
      return {valid:false,message:'Select a region or explicitly choose No discomfort to report.'};
    return {valid:true,data:{none:false,regions,note:typeof data.note==='string'?data.note.slice(0,250):''}};
  }
  if(step==='manual'){
    const clean={};
    for(const item of MANUAL_FIELDS){
      const val=data[item.id];
      if(val===null||val===undefined||val==='')continue;
      const n=numeric(val);
      if(!inRange(n,item.min,item.max))
        return {valid:false,message:item.name+' must be between '+item.min+' and '+item.max+' '+item.unit+'.'};
      clean[item.id]=n;
    }
    // Manually entered biometrics are always optional. Blank fields
    // are saved as omitted, never populated with simulated values.
    return {valid:true,data:clean};
  }
  return {valid:false,message:'Unknown checkpoint'};
}
export function updateCheckinDay(store,day,crewId,step,input,{skip=false}={}){
  if(!DAY.test(day)||!ROUTINE_CREW.includes(crewId)||!CHECKIN_STAGES.some(s=>s.id===step))
    return {store,ok:false,message:'Invalid date, fictional crew, or checkpoint'};
  const result=skip?{valid:true,data:null}:validateCheckinStep(step,input);
  if(!result.valid)return {store,ok:false,message:result.message};
  const prev=getCheckinDay(store,day,crewId);
  const next={...prev,[step]:result.data,stamps:{...prev.stamps,[step]:skip?'skipped':'logged'}};
  return {ok:true,message:skip?'Checkpoint skipped privately; no XP penalty.':'Checkpoint recorded as a game entry.',
    store:{...store,version:1,days:{...(store?.days||{}),
      [day]:{...(store?.days?.[day]||{}),[crewId]:next}}}};
}
export function checkinSummary(store,day,crewId){
  const entry=getCheckinDay(store,day,crewId);
  const completed=CHECKIN_STAGES.filter(s=>['logged','skipped'].includes(entry.stamps[s.id]));
  return {done:completed.length,logged:completed.filter(s=>entry.stamps[s.id]==='logged').length,
    skipped:completed.filter(s=>entry.stamps[s.id]==='skipped').length,
    percent:Math.round(100*completed.length/CHECKIN_STAGES.length),
    xp:completed.reduce((sum,s)=>sum+s.xp,0),finished:completed.length===CHECKIN_STAGES.length};
}
export function checkinLifetimeXp(store,crewId){
  if(!ROUTINE_CREW.includes(crewId))return 0;
  return Object.keys(store?.days||{}).reduce((total,day)=>DAY.test(day)?total+checkinSummary(store,day,crewId).xp:total,0);
}
export function getCheckinHistory(store,crewId,limit=14){
  if(!ROUTINE_CREW.includes(crewId))return [];
  return Object.keys(store?.days||{}).filter(day=>DAY.test(day)&&store.days[day]?.[crewId])
    .sort((a,b)=>b.localeCompare(a)).slice(0,limit).map(day=>{
      const value=getCheckinDay(store,day,crewId);
      return {day,...checkinSummary(store,day,crewId),sleep:value.sleep,mind:value.mind,body:value.body,
        hasManualReadings:value.manual!==null&&Object.keys(value.manual).length>0};
    });
}
export function removeCheckinDay(store,day,crewId){
  if(!DAY.test(day)||!ROUTINE_CREW.includes(crewId))return store;
  const crewDays={...(store?.days||{})};
  if(!crewDays[day]?.[crewId])return store;
  const nextCrew={...crewDays[day]};
  delete nextCrew[crewId];
  if(Object.keys(nextCrew).length)crewDays[day]=nextCrew;else delete crewDays[day];
  return {...store,days:crewDays};
}
export function checkinBadges(store,day,crewId){
  const summary=checkinSummary(store,day,crewId);
  const history=getCheckinHistory(store,crewId,366);
  const today=getCheckinDay(store,day,crewId);
  return [
    {name:'First Check-In',icon:'flag',earned:history.some(h=>h.done>0)},
    {name:'Rest Explorer',icon:'moon',earned:today.stamps.sleep==='logged'},
    {name:'Body Explorer',icon:'scan',earned:today.stamps.body==='logged'},
    {name:'Four-Stamp Orbit',icon:'award',earned:summary.finished},
    {name:'Three Mission Days',icon:'calendar-check',earned:history.filter(h=>h.finished).length>=3},
  ];
}
