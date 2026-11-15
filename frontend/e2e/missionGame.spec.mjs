import {test,expect} from '@playwright/test';

test('Mission Quest plays all five interactive astronaut chapters and persists crew XP',async ({page})=>{
  await page.goto('/');
  await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('button',{name:/Health Routine/}).click();
  await expect(page.getByRole('heading',{name:/MISSION QUEST/i})).toBeVisible();
  await expect(page.getByRole('region',{name:'Mission game statistics'}).count()).toBeGreaterThanOrEqual(0);
  await expect(page.getByText('Cadet',{exact:true})).toBeVisible();
  await expect(page.getByText('MISSION LOCKED',{exact:false}).count()).toBeGreaterThanOrEqual(0);
  const answers=[1,0,0,0];
  for(let i=0;i<answers.length;i++){
    await page.locator('.mg-options .mg-option').nth(answers[i]).click();
    await page.getByRole('button',{name:/Submit decision/}).click();
    const modal=page.getByRole('dialog',{name:/Morning physiological check-in|Measurement quality review|Activity and context log|Health indicator learning/});
    await expect(modal).toBeVisible();
    await modal.getByRole('button',{name:/Continue mission/}).click();
    await expect(modal).not.toBeVisible();
  }
  await expect(page.getByRole('heading',{name:/Evening mission reflection/})).toBeVisible();
  await page.getByRole('textbox',{name:'Mission log'}).fill('We examined fictional crew telemetry, verified data context, and recorded the sensor uncertainty.');
  await page.getByRole('button',{name:/File mission log/}).click();
  const reward=page.getByRole('dialog',{name:'Evening mission reflection'});
  await expect(reward).toBeVisible();
  await reward.getByRole('button',{name:/Return to mission map/}).click();
  await expect(page.getByText('85 XP',{exact:false}).first()).toBeVisible();
  await expect(page.getByText('Specialist',{exact:true})).toBeVisible();
  await expect(page.getByText('Perfect Shift',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Play as Marcus Reed'}).click();
  await expect(page.getByText('Cadet',{exact:true})).toBeVisible();
  await expect(page.getByText('0 XP',{exact:false}).first()).toBeVisible();
  await page.getByRole('button',{name:'Play as Elena Park'}).click();
  await expect(page.getByText('Specialist',{exact:true})).toBeVisible();
  await page.reload();
  await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('button',{name:/Health Routine/}).click();
  await expect(page.getByText('Specialist',{exact:true})).toBeVisible();
  await expect(page.getByText('Perfect Shift',{exact:true})).toBeVisible();
});

test('Mission Quest rejects incorrect answer and supports defer, replay, navigation',async ({page})=>{
  await page.goto('/');
  await page.getByRole('navigation',{name:'Primary navigation'}).getByRole('button',{name:/Health Routine/}).click();
  await page.locator('.mg-options .mg-option').first().click();
  await page.getByRole('button',{name:/Submit decision/}).click();
  await expect(page.getByRole('status')).toContainText(/No NASA astronaut is connected/i);
  await expect(page.locator('.mg-map-node').nth(1)).toBeDisabled();
  await page.getByRole('button',{name:/Defer safely/}).click();
  await expect(page.locator('.mg-map-node').nth(1)).toBeEnabled();
  await expect(page.locator('.mg-map-node').first()).toContainText(/DEFERRED/);
  await page.getByRole('button',{name:/Resume mission/}).click();
  await expect(page.locator('.mg-map-node').nth(1)).toBeDisabled();
  await page.locator('.mg-options .mg-option').nth(1).click();
  await page.getByRole('button',{name:/Submit decision/}).click();
  await page.getByRole('dialog',{name:'Morning physiological check-in'}).getByRole('button',{name:/Continue mission/}).click();
  await page.locator('.mg-map-node').first().click();
  await page.getByRole('button',{name:'Replay'}).click();
  await expect(page.locator('.mg-options .mg-option')).toHaveCount(3);
  await expect(page.locator('.mg-map-node').nth(1)).toBeDisabled();
  await page.getByRole('button',{name:/Review crew dashboard/}).click();
  await expect(page.getByRole('heading',{name:/ARTEMIS IV/})).toBeVisible();
});
