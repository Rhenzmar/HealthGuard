/** Read-only API client. No secrets, health claims, or fake fallback measurements. */
const rawBase = typeof import.meta !== 'undefined' && import.meta.env?.VITE_PHYSIOGRAPH_API_BASE;
export const API_BASE = (rawBase || 'https://healthguard-api-19xg.onrender.com').replace(/\/+$/, '');

export const METRICS = [
  { key: 'heart_rate_bpm', label: 'Heart rate', short: 'HEART RATE', unit: 'bpm', digits: 0, color: '#72dce4', glyph: 'heart' },
  { key: 'spo2_percent', label: 'Oxygen saturation', short: 'SpO₂', unit: '%', digits: 1, color: '#a1b8ff', glyph: 'wind' },
  { key: 'respiratory_rate_bpm', label: 'Respiratory rate', short: 'RESPIRATION', unit: 'breaths/min', digits: 1, color: '#ddb9ff', glyph: 'activity' },
  { key: 'core_temp_c', label: 'Core temperature', short: 'TEMPERATURE', unit: '°C', digits: 2, color: '#f9c98c', glyph: 'thermometer' },
  { key: 'hrv_rmssd_ms', label: 'HRV (RMSSD)', short: 'HRV · RMSSD', unit: 'ms', digits: 1, color: '#8edeb9', glyph: 'pulse' },
];

export function websocketUrl(base = API_BASE) {
  const url = new URL(base);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = url.pathname.replace(/\/$/, '') + '/api/live/ws';
  url.search = '';
  url.hash = '';
  return url.toString();
}

export async function readApi(path, signal) {
  const response = await fetch(`${API_BASE}${path}`, { signal, headers: { Accept: 'application/json' }, cache: 'no-store' });
  if (!response.ok) throw new Error(`API ${response.status} · ${path}`);
  return response.json();
}

export function researchParams(params) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== null && val !== undefined && val !== '') query.set(key, String(val));
  });
  return `?${query.toString()}`;
}

export function formatValue(value, digits = 1) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '—';
}

export function friendlyStatus(status) {
  if (!status) return 'Awaiting analysis';
  return String(status).replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

export function statusTone(status) {
  const s = String(status || '');
  if (/ERROR|VERIFY_MEASUREMENT_QUALITY|DISAGREE|PERSISTENT|FLAGGED|UNUSUAL/.test(s)) return 'amber';
  if (/LOADED|NO_PATTERN_FLAG|NO_MODEL_FLAG|RETURN_TO_UNFLAGGED/.test(s)) return 'mint';
  return 'blue';
}

export function timelineLabel(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'UTC' }) + ' UTC';
}

export function lastSamples(existing, sample, count = 160) {
  if (!sample || !Number.isInteger(sample.sequence)) return existing || [];
  const sorted = [...(existing || []).filter(x => x.sequence !== sample.sequence), sample].sort((a, b) => a.sequence - b.sequence);
  return sorted.slice(-count);
}