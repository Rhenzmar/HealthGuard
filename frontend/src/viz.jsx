import React from 'react';
import { formatValue } from './api';
import {smoothChartPath} from './chartPaths.js';

const paths = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  user: <><circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></>,
  circle: <circle cx="12" cy="12" r="9"/>,
  heart: <path d="M20.8 4.6a5.6 5.6 0 0 0-7.9 0L12 5.5l-.9-.9a5.6 5.6 0 0 0-7.9 7.9L12 21.2l8.8-8.7a5.6 5.6 0 0 0 0-7.9Z"/>,
  pulse: <path d="M2 12h4l3-7 4 14 3-7h6"/>,
  activity: <><path d="M2 12h4l3-7 4 14 3-7h6"/><circle cx="19" cy="6" r="1"/></>,
  wind: <><path d="M3 8h12a3 3 0 1 0-3-3"/><path d="M2 12h17a3 3 0 1 1-3 3"/><path d="M4 16h7a3 3 0 1 1-3 3"/></>,
  thermometer: <><path d="M14 14.8V5a4 4 0 0 0-8 0v9.8a6 6 0 1 0 8 0Z"/><path d="M10 9v9"/></>,
  flask: <><path d="M9 3h6M10 3v7l-6.3 9.5A2 2 0 0 0 5.4 22h13.2a2 2 0 0 0 1.7-2.5L14 10V3"/><path d="M7 16h10"/></>,
  book: <><path d="M12 6c-3-2-6-2.5-9-1.5v15c3-1 6-.5 9 1.5m0-15c3-2 6-2.5 9-1.5v15c-3-1-6-.5-9 1.5M12 6v15"/></>,
  satellite: <><rect x="9" y="9" width="6" height="6" rx="1"/><path d="m9 9-4-4 2-2 4 4m4 8 4 4-2 2-4-4M3 21h4m10-18h4"/><path d="M5 15 2 18l4 4 3-3M15 5l4-3 3 3-3 4"/></>,
  layers: <><path d="m12 2 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 17l9 5 9-5"/></>,
  shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a2 2 0 0 0 .4 2.2l-2.6 2.6a2 2 0 0 0-2.2-.4 2 2 0 0 0-2 1.6h-3a2 2 0 0 0-2-1.6 2 2 0 0 0-2.2.4l-2.6-2.6A2 2 0 0 0 3.6 15a2 2 0 0 0-1.6-2v-3a2 2 0 0 0 1.6-2 2 2 0 0 0-.4-2.2l2.6-2.6a2 2 0 0 0 2.2.4A2 2 0 0 0 10 2h3a2 2 0 0 0 2 1.6 2 2 0 0 0 2.2-.4l2.6 2.6a2 2 0 0 0-.4 2.2 2 2 0 0 0 1.6 2v3a2 2 0 0 0-1.6 2Z"/></>,
  chevron: <path d="m9 18 6-6-6-6"/>,
  arrow: <path d="M5 12h14m-6-6 6 6-6 6"/>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  eye: <><path d="M2 12s3.8-6 10-6 10 6 10 6-3.8 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
  radio: <><circle cx="12" cy="12" r="2"/><path d="M7 7a7 7 0 0 0 0 10m10-10a7 7 0 0 1 0 10M3 3a13 13 0 0 0 0 18M21 3a13 13 0 0 1 0 18"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  volume: <><path d="M11 5 6 9H3v6h3l5 4V5Zm4 4a4 4 0 0 1 0 6m3-9a8 8 0 0 1 0 12"/></>,
  mute: <><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6m0-6-5 6"/></>,
  external: <><path d="M13 5h6v6m0-6-8 8"/><path d="M19 13v6H5V5h6"/></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
  x: <path d="M5 5 19 19M19 5 5 19"/>,
  help: <><circle cx="12" cy="12" r="10"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5m0 4h.01"/></>,
  check: <path d="m5 12 5 5L20 7"/>,
  alert: <><path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5m0 3h.01"/></>,
  database: <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 2 16 2 16 0V5M4 12c0 3 16 3 16 0"/></>,
};

export function Icon({ name, size = 20, className = '' }) {
  return <svg aria-hidden="true" className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">{paths[name] || paths.pulse}</svg>;
}

function chartGeometry(data, key, width, height, padding = 22) {
  const valid = data.filter(d => d?.values && Number.isFinite(d.values[key]));
  if (!valid.length) return null;
  const values = valid.map(d => d.values[key]);
  let low = Math.min(...values), high = Math.max(...values);
  const spread = Math.max(high - low, Math.abs(high) * 0.012, 0.15);
  low -= spread * .45;
  high += spread * .45;
  const points = values.map((value, i) => ({ x: padding + (i / Math.max(1, values.length - 1)) * (width - 2 * padding), y: padding + (1 - (value - low) / (high - low)) * (height - padding * 2), value, timestamp: valid[i].timestamp, seq: valid[i].sequence }));
  return { valid, points, low, high };
}

export function MiniTrend({ data, metric, color }) {
  const g = chartGeometry(data.slice(-34), metric, 124, 48, 3);
  if (!g || g.points.length < 2) return <span className="mini-placeholder">Collecting stream</span>;
  return <svg className="mini-trend" viewBox="0 0 124 48" role="img" aria-label={`Recent simulated ${metric} trend`}><polyline points={g.points.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/></svg>;
}

export function VitalChart({ data, metric, observationMode = 'simulated-second' }) {
  const W = 930, H = 270, pad = 35;
  const g = chartGeometry(data, metric.key, W, H, pad);
  if (!g || g.points.length < 2) return <div className="chart-empty">Waiting for simulated samples. Charts appear when the backend supplies data.</div>;
  const line = smoothChartPath(g.points);
  const area = `${line} L${g.points[g.points.length - 1].x.toFixed(1)} ${H - pad} L${g.points[0].x.toFixed(1)} ${H - pad} Z`;
  const name = `vital-fill-${metric.key}`;
  const engineering = observationMode === 'engineering-poll';
  const firstTime = engineering ? new Date(g.valid[0].received_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'}) : null;
  const lastTime = engineering ? new Date(g.valid.at(-1).received_at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'}) : null;
  return <div className="vital-chart-wrap">
    <svg className="vital-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${metric.label} over ${g.valid.length} ${engineering?'simulator HTTP poll observations':'fictional one-second samples'}, latest ${formatValue(g.points.at(-1).value, metric.digits)} ${metric.unit}`}>
      <defs><linearGradient id={name} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={metric.color} stopOpacity=".26"/><stop offset="100%" stopColor={metric.color} stopOpacity="0"/></linearGradient></defs>
      {[0, .25, .5, .75, 1].map(t => <g key={t}><line x1={pad} y1={pad + t * (H - 2 * pad)} x2={W - pad} y2={pad + t * (H - 2 * pad)} stroke="#2c3a45" strokeDasharray="5 7"/><text x="0" y={pad + t * (H - 2 * pad) + 4} fontSize="12" fill="#8395a5">{(g.high - t * (g.high - g.low)).toFixed(metric.digits > 1 ? 2 : 1)}</text></g>)}
      <path d={area} fill={`url(#${name})`}/><path d={line} fill="none" stroke={metric.color} strokeWidth="2.7" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={g.points.at(-1).x} cy={g.points.at(-1).y} r="5" fill={metric.color} stroke="#101d29" strokeWidth="3"/>
    </svg>
    <div className="chart-axis">{engineering?<><span>{firstTime}</span><span>Simulator poll receipt times · not a sensor recording</span><span>{lastTime}</span></>:<><span>Sample #{g.points[0].seq}</span><span>Simulation timeline · 1 fictional second / sample</span><span>Sample #{g.points.at(-1).seq}</span></>}</div>
  </div>;
}

/** Dots only. NASA's distinct lab draws are not interpolated into a continuous signal. */
export function ResearchDotChart({ rows = [], unit = '' }) {
  const points = rows.filter(r => typeof r.value === 'number' && Number.isFinite(r.value));
  if (!points.length) return <div className="chart-empty">No numeric measurements for the selected filters.</div>;
  const W = 920, H = 230, left = 58, right = 24, top = 24, bottom = 44;
  let low = Math.min(...points.map(p => p.value)), high = Math.max(...points.map(p => p.value));
  const delta = Math.max(high-low, Math.abs(high)*.05, .1); low -= delta*.4; high += delta*.4;
  const x = i => left + (i/Math.max(1,points.length - 1))*(W-left-right);
  const y = v => top + (1-(v-low)/(high-low))*(H-top-bottom);
  return <div className="research-chart-wrap"><svg viewBox={`0 0 ${W} ${H}`} className="research-chart" role="img" aria-label={`${points.length} separate historical NASA laboratory draws; no connecting lines`}>
    {[0,.25,.5,.75,1].map(t=><g key={t}><line x1={left} x2={W-right} y1={top+t*(H-top-bottom)} y2={top+t*(H-top-bottom)} stroke="#304250" strokeDasharray="5 7"/><text x="0" y={top+t*(H-top-bottom)+4} fontSize="13" fill="#899caa">{(high-t*(high-low)).toFixed(1)}</text></g>)}
    {points.map((p,i)=><g key={`${p.sample_id}-${i}`}><circle cx={x(i)} cy={y(p.value)} r="6" fill={p.phase==='preflight'?'#6bdae1':'#edbb83'} stroke="#15222f" strokeWidth="2"><title>{`${p.timepoint} · ${formatValue(p.value,2)} ${unit} · ${p.phase} · ${p.sample_id}`}</title></circle>{points.length<=14 && <text x={x(i)} y={H-10} textAnchor="middle" fontSize="12" fill="#8ea1b1">{p.timepoint}</text>}</g>)}
  </svg><div className="chart-legend"><span><i className="legend-dot pre"/> Preflight</span><span><i className="legend-dot post"/> Postflight</span><small>Discrete samples, not a continuous trend</small></div></div>;
}