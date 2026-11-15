import test from 'node:test';
import assert from 'node:assert/strict';
import {BACKGROUND_THEMES,DEFAULT_BACKGROUND,normalizeBackground,WORKSPACE_BACKGROUND_PAGES} from '../src/spaceBackgroundThemes.js';

test('four stable visual themes with a calm default',()=>{
  assert.deepEqual(BACKGROUND_THEMES.map(x=>x.id),['glow','earth','moon','mars']);
  assert.equal(DEFAULT_BACKGROUND,'glow');
});
test('unknown or corrupt saved preferences cannot select an invalid CSS theme',()=>{
  assert.equal(normalizeBackground('mars'),'mars');
  assert.equal(normalizeBackground(null),'glow');
  assert.equal(normalizeBackground('<script>'),'glow');
});
test('HUD and scenario popup retain their existing visual backgrounds',()=>{
  assert.ok(WORKSPACE_BACKGROUND_PAGES.includes('body'));
  assert.ok(WORKSPACE_BACKGROUND_PAGES.includes('telemetry'));
  assert.equal(WORKSPACE_BACKGROUND_PAGES.includes('hud'),false);
  assert.equal(WORKSPACE_BACKGROUND_PAGES.includes('scenario'),false);
});
