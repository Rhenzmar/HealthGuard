import test from 'node:test';
import assert from 'node:assert/strict';
import {smoothChartPath} from '../src/chartPaths.js';

test('smooth curve passes through all actual data coordinates',()=>{
  const pts=[{x:0,y:5},{x:10,y:15},{x:20,y:8},{x:30,y:12}];
  const d=smoothChartPath(pts);
  assert.match(d,/^M0\.00 5\.00 C/);
  for(const p of pts.slice(1))assert.ok(d.includes(p.x.toFixed(2)+' '+p.y.toFixed(2)));
  assert.equal((d.match(/ C/g)||[]).length,3);
});
test('flat data stays flat, including graph-like constant readings',()=>{
  const d=smoothChartPath([{x:0,y:12},{x:10,y:12},{x:50,y:12}]);
  assert.equal(d,'M0.00 12.00 C3.33 12.00 6.67 12.00 10.00 12.00 C23.33 12.00 36.67 12.00 50.00 12.00');
});
test('monotone endpoints and turning points do not introduce spikes',()=>{
  const d=smoothChartPath([{x:0,y:0},{x:1,y:10},{x:2,y:3}]);
  assert.match(d,/ C1\.33 10\.00 1\.67 3\.00 2\.00 3\.00$/);
});
test('handles empty, singleton, duplicate or nonfinite coordinates safely',()=>{
  assert.equal(smoothChartPath([]),'');
  assert.equal(smoothChartPath([{x:1,y:2}]),'M1.00 2.00');
  assert.equal(smoothChartPath([{x:1,y:2},{x:1,y:3}]),'');
  assert.equal(smoothChartPath([{x:1,y:2},{x:3,y:NaN}]),'');
});
