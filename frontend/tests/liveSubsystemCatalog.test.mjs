import test from 'node:test';
import assert from 'node:assert/strict';
import {SUBSYSTEMS,CHANNELS,CHANNEL_KEYS,subsystemValues} from '../src/liveSubsystemCatalog.js';

test('covers 17 distinct schema features, split nine/five-plus-four/eight',()=>{
 assert.equal(CHANNEL_KEYS.length,17);
 assert.equal(new Set(CHANNEL_KEYS).size,17);
 assert.deepEqual(new Set(CHANNEL_KEYS),new Set(Object.keys(CHANNELS)));
 assert.equal(SUBSYSTEMS.filter(x=>x.branch==='physiological').reduce((n,x)=>n+x.keys.length,0),9);
 assert.equal(SUBSYSTEMS.filter(x=>x.branch==='engineering').reduce((n,x)=>n+x.keys.length,0),8);
 assert.equal(Object.values(CHANNELS).filter(x=>x.origin==='stream').length,5);
 assert.equal(Object.values(CHANNELS).filter(x=>x.origin==='estimate').length,4);
});
test('does not take engineering values for live stream channels or invent missing values',()=>{
 const group=SUBSYSTEMS[0];
 const rows=subsystemValues(group,{heart_rate_bpm:70},{heart_rate_bpm:900,systolic_bp_mmhg:114});
 assert.equal(rows[0].value,70);
 assert.equal(rows[1].value,null);
 assert.equal(rows[2].value,114);
 assert.equal(rows[3].value,null);
});
test('engineering group gets values only from separate simulator source',()=>{
 const rows=subsystemValues(SUBSYSTEMS[3],{cabin_co2_ppm:900},{cabin_co2_ppm:640});
 assert.equal(rows[0].value,640);
});
