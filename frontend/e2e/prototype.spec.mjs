import {test,expect} from '@playwright/test';

const people=['Cmdr. Elena Park','Dr. Marcus Reed','Lt. Aisha Khan','Spc. Daniel Cho'];
const scenarios=[
  ['oxygenation','Oxygenation decline','CREW HEALTH'],
  ['exertion','Exertion and high heart rate','CREW HEALTH'],
  ['thermal','Thermal instability','CREW HEALTH'],
  ['sensor','Sensor signal anomaly','CREW HEALTH'],
  ['co2','Cabin CO₂ scrubber failure','SPACECRAFT'],
  ['cabin_leak','Cabin pressure leak','SPACECRAFT'],
  ['radiation','Solar radiation event','SPACECRAFT'],
];

test.beforeEach(async ({page})=>{
  await page.addInitScript(()=>{
    window.__healthguardSpeechEvents=[];
    window.__healthguardAudioBeepCount=0;
    window.SpeechSynthesisUtterance=class {
      constructor(text){this.text=text;this.lang='en-US';this.rate=1;}
    };
    Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{
      speak(utterance){window.__healthguardSpeechEvents.push({kind:'speak',text:utterance.text});},
      cancel(){window.__healthguardSpeechEvents.push({kind:'cancel'});},
    }});
    window.AudioContext=class{
      constructor(){this.currentTime=0;this.destination={};this.state='running';}
      resume(){this.state='running';return Promise.resolve();}
      close(){this.state='closed';return Promise.resolve();}
      createOscillator(){return {type:'sine',frequency:{setValueAtTime(){}},
        connect(){},start(){window.__healthguardAudioBeepCount++;},stop(){}};}
      createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},
        connect(){}};}
    };
  });
});

test('crew switching and primary/remainder navigation work',async ({page})=>{
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading',{name:/ARTEMIS IV/}).first()).toBeVisible();
  for(const name of people){
    const button=page.getByRole('button',{name:'Select '+name});
    await button.click();
    await expect(page.getByText('Selected crew: '+name)).toBeVisible();
    await expect(button).toHaveAttribute('aria-pressed','true');
  }
  const nav=page.getByRole('navigation',{name:'Primary navigation'});
  for(const [label,title] of [
    ['Crew Telemetry','Crew Telemetry'],
    ['Anomaly Center','Anomaly Center'],
    ['Mission Dashboard','ARTEMIS IV']]){
    await nav.getByRole('button',{name:new RegExp(label,'i')}).click();
    await expect(page.getByRole('heading',{name:new RegExp(title,'i')}).first()).toBeVisible();
  }
  for(const label of ['Health Library','Mission Control','Health Routine']){
    await page.getByRole('button',{name:'More',exact:true}).click();
    await page.getByRole('group',{name:'More destinations'}).getByRole('button',{name:new RegExp(label,'i')}).click();
    await expect(page.getByRole('heading').first()).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('all seven selectable scenarios yield real backend CNN evidence and recovery',async ({page,request})=>{
  await page.goto('/');
  await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('button',{name:/Scenario Lab/i}).click();
  const modal=page.getByRole('dialog',{name:'Choose a training scenario'});
  await expect(modal).toBeVisible();
  for(const [id,label,category] of scenarios){
    await modal.getByRole('tab',{name:new RegExp(category)}).click();
    const option=modal.getByRole('button',{name:new RegExp(label,'i')});
    await option.click();
    await expect(option).toHaveAttribute('aria-pressed','true');
    await expect(modal.getByRole('button',{name:/Start scenario/i})).toBeEnabled({timeout:30000});
    const peak=await request.get('http://127.0.0.1:8000/api/simulation/scenarios/SIM_CREW_01/'+id+'?second=35');
    expect(peak.status()).toBe(200);
    const model=await peak.json();
    expect(model.alarm.active).toBe(true);
    expect(model.model_evidence.candidate_17ch.status).toBe('MODEL_FLAG');
    expect(model.model_evidence.unified.classification_domain).toBe('FICTIONAL_MISSION_TRAINING_ONLY');
    const end=await request.get('http://127.0.0.1:8000/api/simulation/scenarios/SIM_CREW_01/'+id+'?second=64');
    expect(end.status()).toBe(200);
    expect((await end.json()).alarm.active).toBe(false);
  }
  await modal.getByRole('button',{name:/Restart/i}).first().click();
  await expect(modal.getByRole('button',{name:/Start scenario/i})).toBeEnabled({timeout:30000});
  await page.keyboard.press('Escape');
  await expect(modal).not.toBeVisible();
  await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('button',{name:/Scenario Lab/i}).click();
  await expect(modal).toBeVisible();
});

test('scenario audio and speech controls respond to real backend evidence',async ({page,request})=>{
  const backend='http://127.0.0.1:8000';
  // Test fixture remaps the next browser tick to an actual server-generated
  // peak and the following tick to actual server-generated recovery.
  // Does not create or replace model scores. UI-only temporal acceleration.
  let recovery=false;
  await page.route('**/api/simulation/scenarios/SIM_CREW_01/oxygenation?*',async route=>{
    const path=new URL(route.request().url());
    const seconds=Number(path.searchParams.get('second'));
    const chosen=seconds===0?0:recovery?64:35;
    const response=await request.get(backend+'/api/simulation/scenarios/SIM_CREW_01/oxygenation?second='+chosen+'&include_history=true');
    const source=await response.json();
    const frame={...source,sequence:seconds,elapsed_seconds:seconds};
    if(seconds>0)recovery=true;
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(frame)});
  });
  await page.goto('/');
  await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('button',{name:/Scenario Lab/i}).click();
  const modal=page.getByRole('dialog',{name:'Choose a training scenario'});
  await modal.getByRole('tab',{name:/CREW HEALTH/}).click();
  await modal.getByRole('button',{name:/Oxygenation decline/i}).click();
  await expect(modal.getByRole('button',{name:/Start scenario/i})).toBeEnabled({timeout:30000});
  await modal.getByRole('button',{name:/Show full training controls/i}).click();
  await modal.getByRole('button',{name:/Speak guidance/i}).click();
  await expect.poll(()=>page.evaluate(()=>window.__healthguardSpeechEvents.filter(x=>x.kind==='speak').length)).toBeGreaterThan(0);
  await modal.getByRole('button',{name:/Hide training controls/i}).click();
  await modal.getByRole('button',{name:/Start scenario/i}).click();
  await expect(modal).not.toBeVisible();
  await expect.poll(()=>page.evaluate(()=>window.__healthguardAudioBeepCount),{timeout:20000}).toBeGreaterThan(0);
  await expect.poll(()=>page.evaluate(()=>window.__healthguardSpeechEvents.filter(x=>x.kind==='speak').length),{timeout:20000}).toBeGreaterThan(1);
  // There is one additional backend frame after peak that clears the
  // scripted alarm. Speech cancel is instrumented in the fake browser API.
  await expect.poll(()=>page.evaluate(()=>window.__healthguardSpeechEvents.filter(x=>x.kind==='cancel').length),{timeout:20000}).toBeGreaterThan(2);
});

test('failed backend scenario request cannot substitute local fabricated data',async ({page})=>{
  await page.route('**/api/simulation/scenarios/SIM_CREW_01/thermal?*',route=>route.fulfill({
    status:503,contentType:'application/json',body:'{"detail":"Test-only outage"}'
  }));
  await page.goto('/');
  await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('button',{name:/Scenario Lab/i}).click();
  const modal=page.getByRole('dialog',{name:'Choose a training scenario'});
  await modal.getByRole('button',{name:/Thermal instability/i}).click();
  await expect(modal.getByRole('alert')).toContainText(/Scenario backend unavailable/i);
  await expect(modal.getByRole('button',{name:/Start scenario/i})).toBeDisabled();
});
