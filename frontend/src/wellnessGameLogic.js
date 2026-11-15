/**
 * HealthGuard / Wellness Expedition
 *
 * OPTIONAL, self-reported educational habit game; no physical sensors,
 * medical fitness assessment, astronaut readiness or NASA verification.
 * A skipped challenge carries no XP penalty. Every challenge can be done
 * seated or with a gentler alternative; stop if uncomfortable.
 */
import {ROUTINE_CREW} from './questLogic.js';

export const WELLNESS_STORAGE_KEY='healthguard-wellness-expedition-v1';
export const WELLNESS_CHALLENGES=Object.freeze([
  {
    id:'warmup',title:'Orbit Warm-Up',callSign:'THRUSTER START',category:'MOVEMENT',icon:'footprints',xp:25,
    seconds:35,accent:'teal',
    intro:'Start a small, comfortable movement break away from the mission console.',
    goal:'Move gently at your own pace. A seated option is always available.',
    standing:['Stand in a clear, safe space.','Step gently in place or shift weight comfortably.','Ease down to a relaxed pace.'],
    seated:['Sit securely with your feet supported.','Alternate gentle arm reaches or comfortable seated steps.','Relax your shoulders and hands.'],
    safety:'Choose a safe range of movement. Stop for pain, dizziness, unusual breathlessness or discomfort. No activity is required to earn a medical status.',
  },
  {
    id:'mobility',title:'Mobility Lab',callSign:'JOINT CHECK',category:'MOBILITY',icon:'accessibility',xp:20,
    seconds:30,accent:'blue',
    intro:'Try a few gentle movements to reduce time spent in one position.',
    goal:'Move through a comfortable range, without forcing a stretch.',
    standing:['Stand or sit securely, whichever feels better.','Slowly roll your shoulders and loosen your wrists.','Finish with a gentle arm reach if comfortable.'],
    seated:['Sit in a stable chair or position.','Gently circle your wrists and shoulders.','Reach only as far as comfortable, then relax.'],
    safety:'Do not force joints or perform painful stretches. Use approved astronaut exercise procedures during real missions.',
  },
  {
    id:'breathing',title:'Breathing Beacon',callSign:'FOCUS MODE',category:'CALM',icon:'wind',xp:20,
    seconds:32,accent:'violet',
    intro:'Take a short quiet break and bring your attention back to comfortable breathing.',
    goal:'Follow an optional gentle breathing cue, never a breath-holding contest.',
    standing:['Pause and find a comfortable position.','Breathe naturally; the on-screen cue is optional.','Relax your shoulders and return to normal breathing.'],
    seated:['Sit comfortably with your back supported if needed.','Breathe normally; use the cue only if comfortable.','Notice how you feel and rest.'],
    safety:'Do not hold your breath, force deep breaths or hyperventilate. If light-headed, stop and breathe normally.',
  },
  {
    id:'hydration',title:'Hydration Station',callSign:'SUPPLY CHECK',category:'SELF-CARE',icon:'droplets',xp:15,
    seconds:20,accent:'cyan',
    intro:'Review your water access and your own hydration instructions.',
    goal:'Check hydration supplies and follow guidance appropriate for you.',
    standing:['Confirm safe drinking water is available.','Check your personal or mission hydration guidance.','If appropriate, take a normal sip. No fixed volume is required.'],
    seated:['Confirm safe drinking water is accessible while seated.','Review your personal or mission hydration instructions.','If appropriate, take a normal sip. No fixed volume is required.'],
    safety:'Never drink a prescribed amount for game points. Follow any medical fluid restrictions and authorized mission guidance.',
  },
  {
    id:'recovery',title:'Recovery Bay',callSign:'SYSTEM RESET',category:'REST',icon:'moon',xp:20,
    seconds:30,accent:'amber',
    intro:'Take a short recovery break before returning to your simulated shift.',
    goal:'Pause, relax your eyes and shoulders, and check your comfort.',
    standing:['Find a stable, comfortable place to pause.','Rest your eyes away from the screen for a moment.','Relax, then resume when ready.'],
    seated:['Sit in a relaxed, supported position.','Look away from the screen and rest your eyes.','Let your shoulders and hands relax.'],
    safety:'Rest is useful even when you skip a challenge. This timer is not a health assessment or a substitute for needed rest or medical advice.',
  },
]);
const DAY_RE=/^\d{4}-\d{2}-\d{2}$/;
const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
export const emptyWellnessStore=()=>({version:1,days:{}});
export function readWellnessStore(storage){
  const target=storage===undefined?(typeof window!=='undefined'?window.localStorage:null):storage;
  if(!target)return emptyWellnessStore();
  try{
    const value=JSON.parse(target.getItem(WELLNESS_STORAGE_KEY)||'null');
    if(!isObject(value)||value.version!==1||!isObject(value.days))return emptyWellnessStore();
    return value;
  }catch{return emptyWellnessStore()}
}
export function saveWellnessStore(store,storage){
  try{
    const target=storage===undefined?(typeof window!=='undefined'?window.localStorage:null):storage;
    if(!target)return false;
    target.setItem(WELLNESS_STORAGE_KEY,JSON.stringify(store));
    return true;
  }catch{return false}
}
export function getWellnessDay(store,day,crewId){
  const record=store?.days?.[day]?.[crewId];
  const challenges=isObject(record?.challenges)?record.challenges:{};
  return {challenges};
}
export function updateWellnessDay(store,day,crewId,challengeId,action,mode='seated'){
  if(!ROUTINE_CREW.includes(crewId)||!DAY_RE.test(day)||!WELLNESS_CHALLENGES.some(c=>c.id===challengeId))return store;
  if(!['complete','skip','reset'].includes(action))return store;
  const old=getWellnessDay(store,day,crewId);
  const challenges={...old.challenges};
  if(action==='reset')delete challenges[challengeId];
  else challenges[challengeId]={status:action==='complete'?'complete':'skipped',
    mode:mode==='standing'?'standing':'seated'};
  return {...store,version:1,days:{
    ...(store?.days||{}),
    [day]:{...(store?.days?.[day]||{}),[crewId]:{challenges}}
  }};
}
export function wellnessDaySummary(store,day,crewId){
  const challenges=getWellnessDay(store,day,crewId).challenges;
  let done=0,skipped=0,xp=0;
  for(const c of WELLNESS_CHALLENGES){
    if(challenges[c.id]?.status==='complete'){done++;xp+=c.xp;}
    else if(challenges[c.id]?.status==='skipped')skipped++;
  }
  return {done,skipped,pending:WELLNESS_CHALLENGES.length-done-skipped,xp,
    percent:Math.round(done/WELLNESS_CHALLENGES.length*100)};
}
export function wellnessLifetimeXp(store,crewId){
  if(!ROUTINE_CREW.includes(crewId))return 0;
  return Object.keys(store?.days||{}).reduce((total,day)=>DAY_RE.test(day)?
    total+wellnessDaySummary(store,day,crewId).xp:total,0);
}
export function wellnessMilestones(store,day,crewId){
  const summary=wellnessDaySummary(store,day,crewId);
  const xp=wellnessLifetimeXp(store,crewId);
  const entry=getWellnessDay(store,day,crewId);
  return [
    {id:'launch',name:'First Step',icon:'flag',earned:xp>0,description:'Complete a wellness challenge'},
    {id:'move',name:'Motion Pilot',icon:'footprints',earned:entry.challenges.warmup?.status==='complete',description:'Finish a movement break'},
    {id:'focus',name:'Calm Navigator',icon:'wind',earned:entry.challenges.breathing?.status==='complete',description:'Complete a focus break'},
    {id:'full',name:'Full Orbit',icon:'award',earned:summary.done===WELLNESS_CHALLENGES.length,description:'Complete all five today'},
  ];
}
/** Pure countdown helper. Browser may pause the timer when tab is hidden. */
export function remainingSeconds(duration,elapsedMs){
  return Math.max(0,Math.ceil((duration*1000-Math.max(0,elapsedMs))/1000));
}
export function stepIndexForElapsed(seconds,elapsedMs){
  if(!Number.isFinite(seconds)||seconds<=0)return 0;
  return Math.min(2,Math.floor(Math.max(0,elapsedMs)/(seconds*1000/3)));
}
export function breathingCue(elapsedMs){
  const phase=(Math.max(0,elapsedMs)/1000)%8;
  return phase<4?{label:'Breathe comfortably in',phase:'inhale',remaining:Math.ceil(4-phase)}
    :{label:'Breathe comfortably out',phase:'exhale',remaining:Math.ceil(8-phase)};
}
