/** Pure game rules for HealthGuard's fictional crew training. No sensor proof. */
import {QUESTS,ROUTINE_CREW,getCrewRoutine,summarizeCrewRoutine,localDayKey} from './questLogic.js';

export const MISSION_TRIALS=Object.freeze({
  morning:{
    callSign:'SIGNAL LOCK',flavor:'Identify the source before trusting a reading.',
    scene:'The mission dashboard is receiving a new set of health readings. The crew must identify their origin before the briefing starts.',
    question:'The dashboard displays a heart rate of 74 bpm. What does this number represent in HealthGuard?',
    options:[
      {id:'a',label:'A confirmed real astronaut measurement',detail:'No NASA astronaut is connected to this fictional stream.'},
      {id:'b',label:'A generated value from the crew simulator',detail:'Correct. The app labels continuous crew telemetry as synthetic.'},
      {id:'c',label:'A medical diagnosis from the CNN',detail:'A heart rate number alone does not diagnose an illness.'}
    ],answer:'b',hint:'Check the source label on Mission Dashboard.',route:'dashboard'
  },
  quality:{
    callSign:'SIGNAL DETECTIVE',flavor:'Investigate uncertain measurements.',
    scene:'A single pulse-oximeter value suddenly drops, but the signal is noisy and other inputs remain near baseline.',
    question:'What should the crew do before treating the number as reliable?',
    options:[
      {id:'a',label:'Confirm the sensor and repeat the measurement',detail:'Correct. Checking measurement quality helps avoid misinterpreting an artifact.'},
      {id:'b',label:'Assume that the CNN diagnosed oxygen deprivation',detail:'The anomaly detector does not establish a disease or identify its cause.'},
      {id:'c',label:'Ignore the recording and mark it normal',detail:'A questionable reading should be verified, not assumed normal.'}
    ],answer:'a',hint:'A single unusual observation may be an artifact.',route:'telemetry'
  },
  activity:{
    callSign:'MISSION CONTEXT',flavor:'Connect signals with crew activity.',
    scene:'A fictional crew member finishes a workout. Their heart rate is temporarily higher than their resting baseline.',
    question:'Which additional piece of context is most useful for interpreting the pattern?',
    options:[
      {id:'a',label:'Whether they were exercising or resting',detail:'Correct. Activity context helps distinguish expected changes from unfamiliar patterns.'},
      {id:'b',label:'The number of XP earned in Mission Quest',detail:'Game points are unrelated to physiological measurements.'},
      {id:'c',label:'The color of the dashboard wallpaper',detail:'The visual theme is not a physiological variable.'}
    ],answer:'a',hint:'Think about what the crew was doing when the reading changed.',route:'dashboard'
  },
  literacy:{
    callSign:'BODY SYSTEMS',flavor:'Match a signal to its monitored system.',
    scene:'Your team is inspecting the Body Explorer to decide which simulated values belong to the respiratory system.',
    question:'Which pair of signals is directly relevant to breathing and oxygenation?',
    options:[
      {id:'a',label:'SpO₂ and respiratory rate',detail:'Correct. These are the two available simulated respiratory measurements.'},
      {id:'b',label:'HRV and systolic blood pressure',detail:'Those are cardiovascular measurements or estimates.'},
      {id:'c',label:'Mission score and radiation badge',detail:'Those do not represent respiratory sensor channels.'}
    ],answer:'a',hint:'Use the Lungs section of Body Explorer.',route:'body'
  },
  evening:{
    callSign:'CAPTAIN’S LOG',flavor:'Finish the day with a mission debrief.',
    scene:'The shift is closing. Write a short fictional crew log about what you checked or what remains uncertain.',
    question:'Enter a mission log of at least 12 characters to complete this quest.',
    options:[],answer:null,hint:'You might mention a simulated reading, data quality, activity context, or what needs follow-up.',route:'routine'
  }
});

export const MISSION_RANKS=Object.freeze([
  {min:0,title:'Cadet',rank:1,icon:'shield'},
  {min:85,title:'Specialist',rank:2,icon:'star'},
  {min:210,title:'Navigator',rank:3,icon:'compass'},
  {min:425,title:'Commander',rank:4,icon:'crown'},
  {min:750,title:'Mission Legend',rank:5,icon:'award'}
]);
export function getCrewLifetimeXp(store,crewId){
  if(!ROUTINE_CREW.includes(crewId))return 0;
  return Object.entries(store?.days||{}).reduce((total,[day,people])=>
    /^\d{4}-\d{2}-\d{2}$/.test(day)?
      total+summarizeCrewRoutine({days:{[day]:people}},day,crewId).xp:total,0);
}
export function getMissionRank(xp){
  const score=Math.max(0,Number.isFinite(xp)?xp:0);
  const index=MISSION_RANKS.findLastIndex(t=>score>=t.min);
  const rank=MISSION_RANKS[Math.max(index,0)];
  const next=MISSION_RANKS[index+1]||null;
  return {...rank,nextTitle:next?.title||null,nextXp:next?.min??rank.min,
    required:next?next.min-rank.min:0,
    xpIntoRank:score-rank.min,
    percent:next?Math.min(100,Math.round((score-rank.min)/(next.min-rank.min)*100)):100};
}
export function getMissionStreak(store,crewId,now=new Date()){
  // Full-day completion is treated as a fictional game achievement, never
  // as an indication of adherence to an actual medical protocol.
  const date=new Date(now.getFullYear(),now.getMonth(),now.getDate(),12);
  let streak=0;
  const today=localDayKey(date);
  const completed=day=>summarizeCrewRoutine(store,day,crewId).done===QUESTS.length;
  if(!completed(today))date.setDate(date.getDate()-1);
  for(let i=0;i<366;i++){
    if(!completed(localDayKey(date)))break;
    streak++;
    date.setDate(date.getDate()-1);
  }
  return streak;
}
export function missionAchievements(store,day,crewId){
  const entry=getCrewRoutine(store,day,crewId);
  const summary=summarizeCrewRoutine(store,day,crewId);
  const xp=getCrewLifetimeXp(store,crewId);
  const streak=getMissionStreak(store,crewId,new Date(day+'T12:00:00'));
  const ever=QUESTS.some(q=>Object.values(store?.days||{}).some(x=>x?.[crewId]?.tasks?.[q.id]==='complete'));
  return [
    {id:'first',name:'First Contact',icon:'flag',description:'Clear your first mission',unlocked:ever},
    {id:'quality',name:'Signal Sleuth',icon:'shield-check',description:'Complete a quality-check mission',unlocked:entry.tasks.quality==='complete'},
    {id:'explorer',name:'Systems Explorer',icon:'orbit',description:'Complete the body-systems mission',unlocked:entry.tasks.literacy==='complete'},
    {id:'all',name:'Perfect Shift',icon:'award',description:'Clear all five missions in a day',unlocked:summary.done===QUESTS.length},
    {id:'streak',name:'Three-Day Orbit',icon:'flame',description:'Complete three mission days in sequence',unlocked:streak>=3},
    {id:'rank',name:'Mission Navigator',icon:'compass',description:'Earn 210 total XP',unlocked:xp>=210}
  ];
}
export function isMissionUnlocked(crewState,questIndex){
  if(questIndex<=0)return true;
  const prev=QUESTS[questIndex-1];
  return ['complete','deferred'].includes(crewState?.tasks?.[prev.id]);
}
export function evaluateTrial(questId,choice,note=''){
  const trial=MISSION_TRIALS[questId];
  if(!trial)return {correct:false,message:'Mission unavailable'};
  if(questId==='evening'){
    const count=(note||'').trim().length;
    return count>=12?{correct:true,message:'Mission log filed. Your fictional shift is complete.'}
      :{correct:false,message:'Write at least 12 characters before filing your mission log.'};
  }
  const answer=trial.options.find(o=>o.id===choice);
  return {correct:choice===trial.answer,message:answer?.detail||'Choose a mission response.'};
}
