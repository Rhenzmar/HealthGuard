import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveScenarioNavigation} from '../src/scenarioNavigation.js';

test('Scenario Lab overlays whichever section the user is viewing',()=>{
  for(const section of ['dashboard','telemetry','body','routine','research','mission','hud']){
    assert.deepEqual(resolveScenarioNavigation(section,'scenario'),{
      page:section,scenarioOpen:true,scroll:false
    });
  }
});
test('leaving the popup by navigating to another section changes only the requested page',()=>{
  assert.deepEqual(resolveScenarioNavigation('body','hud'),{
    page:'hud',scenarioOpen:false,scroll:true
  });
  assert.deepEqual(resolveScenarioNavigation('mission','telemetry'),{
    page:'telemetry',scenarioOpen:false,scroll:true
  });
});
