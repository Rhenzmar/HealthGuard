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
  ['suit_leak','Suit pressure loss','SPACECRAFT'],
  ['suit_power','Suit battery failure','SPACECRAFT'],
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
  for(const label of ['Crew Telemetry','Body Explorer','Health Routine','Health Library','Mission Control','Mission HUD','Mission Dashboard']){
    const button=nav.getByRole('button',{name:new RegExp(label,'i')});
    await button.click();
    await expect(button).toHaveAttribute('aria-current','page');
  }
  expect(errors).toEqual([]);
});

test('all nine selectable scenarios yield source-labeled model evidence and recovery',async ({page,request})=>{
  await page.goto('/');
  await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('button',{name:/Scenario Lab/i}).click();
  const modal=page.getByRole('dialog',{name:'Possible scenarios'});
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
    expect(['MODEL_FLAG','NO_MODEL_FLAG'].includes(model.model_evidence.candidate_17ch.status)).toBe(true);
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

test('scenario critical voice, no beep, and recovery behavior respond to real backend evidence',async ({page,request})=>{
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
  const modal=page.getByRole('dialog',{name:'Possible scenarios'});
  await modal.getByRole('tab',{name:/CREW HEALTH/}).click();
  await modal.getByRole('button',{name:/Oxygenation decline/i}).click();
  await expect(modal.getByRole('button',{name:/Start scenario/i})).toBeEnabled({timeout:30000});
  await modal.getByRole('button',{name:/Show full training controls/i}).click();
  await modal.getByRole('button',{name:/Speak guidance/i}).click();
  await expect.poll(()=>page.evaluate(()=>window.__healthguardSpeechEvents.filter(x=>x.kind==='speak').length)).toBeGreaterThan(0);
  await modal.getByRole('button',{name:/Hide training controls/i}).click();
  await modal.getByRole('button',{name:/Start scenario/i}).click();
  await expect(modal).toBeVisible();
  await expect(page.getByRole('navigation',{name:'Primary navigation'}).getByRole('button',{name:/Scenario Lab/i})).toHaveAttribute('aria-current','page');
  await expect(modal.getByRole('button',{name:/Pause/i}).first()).toBeVisible();
  // The current approved design deliberately has NO pulse/beep alarm.
  await expect(modal.locator('.hg6-scenario-event-alert').first()).toBeVisible({timeout:20000});
  expect(await page.evaluate(()=>window.__healthguardAudioBeepCount)).toBe(0);
  await expect.poll(()=>page.evaluate(()=>window.__healthguardSpeechEvents.filter(x=>x.kind==='speak').length),{timeout:20000}).toBeGreaterThan(1);
  // The deterministic UI fixture advances to the real backend recovery
  // frame on the next tick. Recovery must stop repeating the critical voice.
  await expect.poll(()=>page.evaluate(()=>window.__healthguardSpeechEvents.some(x=>x.kind==='cancel')),{timeout:20000}).toBe(true);
  // There is one additional backend frame after peak that clears the
  // scripted alarm. Speech cancel is instrumented in the fake browser API.
  expect(await page.evaluate(()=>window.__healthguardAudioBeepCount)).toBe(0);
});

test('failed backend scenario request cannot substitute local fabricated data',async ({page})=>{
  await page.route('**/api/simulation/scenarios/SIM_CREW_01/thermal?*',route=>route.fulfill({
    status:503,contentType:'application/json',body:'{"detail":"Test-only outage"}'
  }));
  await page.goto('/');
  await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('button',{name:/Scenario Lab/i}).click();
  const modal=page.getByRole('dialog',{name:'Possible scenarios'});
  await modal.getByRole('button',{name:/Thermal instability/i}).click();
  await expect(modal.getByRole('alert')).toContainText(/Scenario backend unavailable/i);
  await expect(modal.getByRole('button',{name:/Start scenario/i})).toBeDisabled();
});


test('scenario remains active after entering Moon or Mars suit HUD',async ({page})=>{
  await page.goto('/');
  await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('button',{name:/Scenario Lab/i}).click();
  const modal=page.getByRole('dialog',{name:'Possible scenarios'});
  await modal.getByRole('button',{name:/Oxygenation decline/i}).click();
  await expect(modal.getByRole('button',{name:/Start scenario/i})).toBeEnabled({timeout:30000});
  await modal.getByRole('button',{name:/Start scenario/i}).click();
  await expect(modal).toBeVisible();
  await modal.getByRole('button',{name:/View in suit HUD/i}).click();
  const hud=page.getByRole('group',{name:/visor view/i});
  await expect(hud).toBeVisible();
  await expect(page.locator('.hgv-screen')).toHaveClass(/hgv-clear-view/);
  await expect(page.getByRole('complementary',{name:/Simulated body overview/i})).toBeVisible();
  await expect(page.getByRole('button',{name:/Clear view/i})).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:/Clear view/i}).click();
  await expect(page.locator('.hgv-screen')).toHaveClass(/hgv-high-contrast/);
  await page.getByRole('button',{name:/High contrast/i}).click();
  await expect(page.locator('.hgv-screen')).toHaveClass(/hgv-clear-view/);
  // The heart-rate mini-trace uses component-local samples, not a missing parent variable.
  await expect(page.locator('.hgv-panel-left .hgv-signal').first()).toBeVisible();
  await expect(page.locator('.hgv-trend-box')).toBeVisible();
  // Both newly simulated suit channels must display numbers, not NO FEED.
  await expect(page.locator('.hgv-panel-right .hgv-system-row').filter({hasText:'Suit pressure'})).toContainText('psi');
  await expect(page.locator('.hgv-panel-right .hgv-system-row').filter({hasText:'Suit battery'})).toContainText('%');
  await expect(page.locator('.hgv-panel-right .hgv-system-row').filter({hasText:'Suit pressure'})).toContainText('SCRIPTED');
  await expect(page.locator('.hgv-panel-right .hgv-system-row').filter({hasText:'Suit battery'})).toContainText('SCRIPTED');
  await expect(page.locator('.hgv-scenario-badge')).toContainText('OXYGENATION');
  await expect(page.locator('.hgv-telemetry')).toContainText('SERVER SCENARIO');
  await page.getByRole('button',{name:/Mars suit/i}).click();
  await expect(hud).toHaveAttribute('aria-label',/Mars suit visor view/i);
  await expect(page.locator('.hgv-scenario-badge')).toContainText('OXYGENATION');
  await page.getByRole('button',{name:/Scenario Lab/i}).last().click();
  await expect(modal).toBeVisible();
  await expect(modal.locator('.hg-scenario-current')).toContainText('Oxygenation decline');
});

test('suit pressure fault updates simulated HUD and critical alert',async ({page,request})=>{
  const backend='http://127.0.0.1:8000';
  await page.route('**/api/simulation/scenarios/SIM_CREW_01/suit_leak?*',async route=>{
    const url=new URL(route.request().url());
    const tick=Number(url.searchParams.get('second'));
    const chosen=tick===0?0:35;
    const response=await request.get(backend+'/api/simulation/scenarios/SIM_CREW_01/suit_leak?second='+chosen+'&include_history=true');
    const verified=await response.json();
    await route.fulfill({status:response.status(),contentType:'application/json',
      body:JSON.stringify({...verified,elapsed_seconds:tick,sequence:tick})});
  });
  await page.goto('/');
  await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('button',{name:/Scenario Lab/i}).click();
  const modal=page.getByRole('dialog',{name:'Possible scenarios'});
  await modal.getByRole('tab',{name:/SPACECRAFT/}).click();
  await modal.getByRole('button',{name:/Suit pressure loss/i}).click();
  await expect(modal.getByRole('button',{name:/Start scenario/i})).toBeEnabled({timeout:30000});
  await modal.getByRole('button',{name:/Start scenario/i}).click();
  await modal.getByRole('button',{name:/View in suit HUD/i}).click();
  const pressure=page.locator('.hgv-panel-right .hgv-system-row').filter({hasText:'Suit pressure'});
  await expect(pressure).toContainText('psi');
  await expect(page.locator('.hgv-screen')).toHaveClass(/hgv-severity-critical/,{timeout:20000});
  await expect(pressure).toContainText(/2\.\d+\s*psi/);
  await expect(page.locator('.hgv-suit-alert-critical')).toBeVisible();
  expect(await page.evaluate(()=>window.__healthguardAudioBeepCount)).toBe(0);
});
