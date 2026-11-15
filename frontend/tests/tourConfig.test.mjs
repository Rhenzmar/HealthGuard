import test from 'node:test';
import assert from 'node:assert/strict';
import {TOUR_STEPS,validTourIndex,tourDestination} from '../src/tourConfig.js';
test('all eight HealthGuard destinations have one helpful walkthrough step',()=>{
 assert.equal(TOUR_STEPS.length,8);
 assert.deepEqual(TOUR_STEPS.map(x=>x.target),
  ['dashboard','telemetry','body','routine','research','mission','hud','scenario']);
 assert.equal(new Set(TOUR_STEPS.map(x=>x.target)).size,TOUR_STEPS.length);
 for(const step of TOUR_STEPS){
  assert.ok(step.title.length>8);
  assert.ok(step.body.length>45);
  assert.ok(step.hint.length>10);
 }
});
test('the final Scenario Lab introduction does not open or reset playback',()=>{
 assert.equal(tourDestination(7),'dashboard');
 assert.equal(tourDestination(2),'body');
 assert.equal(validTourIndex(-1),false);
 assert.equal(validTourIndex(8),false);
});
