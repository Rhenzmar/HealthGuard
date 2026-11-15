import { test, expect } from '@playwright/test';

test('Mission Control environment, crew, telemetry filters and navigation', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  const navigation = page.getByRole('navigation', {name:'Primary navigation'});
  await navigation.getByRole('button', {name:/Mission Control/i}).click();
  await expect(page.getByRole('heading', {name:'Mission Control.'})).toBeVisible();
  const environments = page.getByRole('region', {name:'Choose a fictional mission environment'});
  const mars = environments.getByRole('button', {name:/Mars habitat/i});
  await mars.click();
  await expect(mars).toHaveAttribute('aria-pressed','true');
  await expect(page.getByText('Mars surface habitat')).toBeVisible();
  const crew = page.getByRole('button', {name:/Dr. Marcus Reed Medical officer/i});
  await crew.click();
  await expect(crew).toHaveAttribute('aria-pressed','true');
  const radiation = page.getByRole('group',{name:'Filter mission system channels'});
  await radiation.getByRole('button',{name:'Radiation'}).click();
  await expect(radiation.getByRole('button',{name:'Radiation'})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByText('Radiation rate')).toBeVisible();
  await expect(page.getByText('Cabin humidity')).toHaveCount(0);
  await radiation.getByRole('button',{name:'All systems'}).click();
  await expect(page.getByText('Cabin humidity')).toBeVisible();
  await page.getByRole('button',{name:'Crew telemetry'}).click();
  await expect(navigation.getByRole('button',{name:/Crew Telemetry/i})).toHaveAttribute('aria-current','page');
  expect(errors).toEqual([]);
});
