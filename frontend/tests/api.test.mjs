import test from 'node:test';
import assert from 'node:assert/strict';
import { websocketUrl, researchParams, formatValue, friendlyStatus, lastSamples, statusTone } from '../src/api.js';

test('WebSocket URL uses secure scheme and proper path', () => {
  assert.equal(websocketUrl('https://example.onrender.com'), 'wss://example.onrender.com/api/live/ws');
  assert.equal(websocketUrl('http://localhost:8000/'), 'ws://localhost:8000/api/live/ws');
});
test('Research filters are escaped and empty filters omitted', () => {
  assert.equal(researchParams({ biomarker:'ALBUMIN/GLOBULIN RATIO',subject_id:'C001',assay:'' }), '?biomarker=ALBUMIN%2FGLOBULIN+RATIO&subject_id=C001');
});
test('Missing numbers never appear as invented zeros', () => {
  assert.equal(formatValue(undefined), '—');
  assert.equal(formatValue(null), '—');
  assert.equal(formatValue(36.853, 2), '36.85');
});
test('Research statuses remain review language, not clinical triage', () => {
  assert.equal(friendlyStatus('PERSISTENT_PATTERN_REVIEW'),'Persistent Pattern Review');
  assert.equal(statusTone('DETECTORS_DISAGREE'),'amber');
});
test('Live samples deduplicate and stay in sequence order', () => {
  const base=[{sequence:1,values:{}},{sequence:2,values:{}}];
  const result=lastSamples(base,{sequence:2,values:{heart_rate_bpm:75}});
  assert.deepEqual(result.map(s=>s.sequence),[1,2]);
  assert.equal(result.at(-1).values.heart_rate_bpm,75);
});