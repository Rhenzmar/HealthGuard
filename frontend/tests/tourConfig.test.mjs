import test from 'node:test';
import assert from 'node:assert/strict';
import {TOUR_STEPS,TOUR_SEEN_KEY,getTourStep,isTourStepCountValid} from '../src/tourConfig.js';

test('all eight navigation sections have valid unique tour steps',()=>{
 const expected=['dashboard','telemetry','body','routine','research','mission','hud','scenario'];
 assert.deepEqual(TOUR_STEPS.map(step=>step.target),expected);
 assert.equal(isTourStepCountValid(),true);
 for(const step of TOUR_STEPS){assert.ok(step.body.length>35);assert.ok(step.title.length>5);}
});
test('no tour step changes or invents clinical data',()=>{
 assert.match(TOUR_STEPS[0].body,/simulated/i);
 assert.match(TOUR_STEPS[4].body,/historical/i);
 assert.match(TOUR_STEPS.at(-1).body,/fictional/i);
 assert.equal(getTourStep(-1),null);
 assert.equal(getTourStep(100),null);
 assert.equal(typeof TOUR_SEEN_KEY,'string');
});
