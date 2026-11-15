import {test,expect} from '@playwright/test';

async function openOps(page){
  await page.goto('/');
  await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('button',{name:/Health Routine/}).click();
  await page.getByRole('navigation',{name:'Choose Health Routine game'}).getByRole('button',{name:/Countermeasure Ops/}).click();
  await expect(page.getByRole('heading',{name:/COUNTERMEASURE OPS/})).toBeVisible();
}
test('Countermeasure Ops is a fourth game with fluid puzzle, independent crew stamps, and Crew Check-In connection',async ({page})=>{
  await openOps(page);
  await expect(page.getByRole('region',{name:'Fluid supply game'})).toBeVisible();
  await expect(page.getByRole('region',{name:'Reaction Arcade game'})).toBeVisible();
  await expect(page.getByRole('button',{name:/Resistance Preparation/})).toBeVisible();
  await expect(page.getByRole('button',{name:/Aerobic Motion Drill/})).toBeVisible();
  await expect(page.getByRole('button',{name:/Crew Daily Check-In/})).toBeVisible();
  await expect(page.getByRole('button',{name:/Verify supply kit/})).toBeDisabled();
  for(const name of ['Check pouch seal','Verify supply label','Clear dispenser access'])
    await page.getByRole('region',{name:'Fluid supply game'}).getByRole('button',{name}).click();
  await expect(page.getByRole('button',{name:/Verify supply kit/})).toBeEnabled();
  await page.getByRole('button',{name:/Verify supply kit/}).click();
  await expect(page.getByText(/1\/5 GAME STAMPS/)).toBeVisible();
  await expect(page.getByText(/20 XP/).first()).toBeVisible();
  await page.getByRole('button',{name:/Aerobic Motion Drill/}).click();
  await page.getByRole('region',{name:'Movement challenge'}).getByRole('button',{name:/Skip without penalty/}).click();
  await expect(page.getByText(/2\/5 GAME STAMPS/)).toBeVisible();
  await page.getByRole('button',{name:'Play as Marcus Reed'}).click();
  await expect(page.getByText(/0\/5 GAME STAMPS/)).toBeVisible();
  await page.getByRole('button',{name:'Play as Elena Park'}).click();
  await expect(page.getByText(/2\/5 GAME STAMPS/)).toBeVisible();
  await page.getByRole('button',{name:/Crew Daily Check-In/}).click();
  await expect(page.getByRole('heading',{name:/DAILY HEALTH LOG/})).toBeVisible();
  for(let i=0;i<4;i++)await page.getByRole('button',{name:/Prefer not to answer/}).click();
  await page.getByRole('navigation',{name:'Choose Health Routine game'}).getByRole('button',{name:/Countermeasure Ops/}).click();
  await expect(page.getByText(/3\/5 GAME STAMPS/)).toBeVisible();
  await page.reload();
  await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('button',{name:/Health Routine/}).click();
  await page.getByRole('navigation',{name:'Choose Health Routine game'}).getByRole('button',{name:/Countermeasure Ops/}).click();
  await expect(page.getByText(/3\/5 GAME STAMPS/)).toBeVisible();
});
test('Countermeasure movement timer and explicit confirmation are required before XP',async ({page})=>{
  await openOps(page);
  const area=page.getByRole('region',{name:'Movement challenge'});
  await page.clock.install();
  await area.getByRole('button',{name:/Start activity/}).click();
  await expect(area.getByRole('button',{name:'Pause'})).toBeVisible();
  await page.clock.runFor(26000);
  await expect(area.getByRole('checkbox',{name:/I actually completed/})).toBeVisible();
  await expect(area.getByRole('button',{name:/Log activity/})).toBeDisabled();
  await area.getByRole('checkbox',{name:/I actually completed/}).check();
  await area.getByRole('button',{name:/Log activity/}).click();
  await expect(area.getByRole('button',{name:/Replay activity/})).toBeVisible();
  await expect(page.getByText(/1\/5 GAME STAMPS/)).toBeVisible();
});
test('Countermeasure Reaction Arcade enforces randomized signal and three successful rounds',async ({page})=>{
  await openOps(page);
  const arcade=page.getByRole('region',{name:'Reaction Arcade game'});
  await arcade.getByRole('button',{name:'Start reaction drill'}).click();
  await arcade.getByRole('button',{name:/Waiting for signal/}).click();
  await expect(arcade.getByText('False start')).toBeVisible();
  for(let n=0;n<3;n++){
    await arcade.getByRole('button',{name:/Retry signal|Next round/}).click();
    await expect(arcade.getByRole('button',{name:'Tap now'})).toBeVisible({timeout:10000});
    await arcade.getByRole('button',{name:'Tap now'}).click();
  }
  await expect(arcade.getByText('Three rounds complete')).toBeVisible();
  await arcade.getByRole('button',{name:/Log results/}).click();
  await expect(arcade.getByRole('button',{name:'Replay'})).toBeVisible();
  await expect(page.getByText(/1\/5 GAME STAMPS/)).toBeVisible();
});
