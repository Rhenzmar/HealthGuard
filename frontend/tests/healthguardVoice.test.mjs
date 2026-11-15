import test from 'node:test';
import assert from 'node:assert/strict';
import {SCENARIO_MESSAGES,scenarioVoiceAnnouncement,liveVoiceAnnouncement} from '../src/healthguardVoice.js';

test('each supported training scenario has a concise, specific message',()=>{
  assert.equal(Object.keys(SCENARIO_MESSAGES).length,9);
  for(const [id,message] of Object.entries(SCENARIO_MESSAGES)){
    assert.ok(message.length<160,id+' should be concise');
    assert.match(scenarioVoiceAnnouncement(id,'CRITICAL'),/HealthGuard Critical alert - training/);
  }
});
test('live speech reflects only verified training levels',()=>{
  const review={classification_domain:'FICTIONAL_MISSION_TRAINING_ONLY',status:'CRITICAL'};
  assert.match(liveVoiceAnnouncement(review),/training threshold/i);
  assert.match(liveVoiceAnnouncement({...review,status:'CHECK'}),/signal quality/i);
  assert.match(liveVoiceAnnouncement({...review,status:'OPTIMAL'}),/Continue monitoring/);
  assert.doesNotMatch(liveVoiceAnnouncement({...review,status:'CRITICAL',voice_ready_script:'Untrusted content'}),/Untrusted/);
});
test('does not invent a critical level when the review is unverified',()=>{
  assert.doesNotMatch(liveVoiceAnnouncement({status:'CRITICAL'}),/Critical alert/);
  assert.doesNotMatch(scenarioVoiceAnnouncement('not-a-scenario','CRITICAL'),/critical alert/i);
});
test('guidance is nonrepetitive, even for scripted training prompts',()=>{
  assert.match(scenarioVoiceAnnouncement('sensor','CHECK','guidance'),/^HealthGuard training guidance/);
  assert.match(scenarioVoiceAnnouncement('sensor','CHECK','guidance'),/sensor signal/i);
});
