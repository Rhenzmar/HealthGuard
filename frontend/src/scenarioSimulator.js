/**
 * Local, scripted astronaut training scenarios.
 * No NASA OSDR measurements, medical diagnosis, predictive AI inference,
 * or actual spacecraft atmosphere sensors are used by this module.
 * Thresholds are UI training triggers only, NOT clinical limits.
 */
export const SCENARIOS = [
  {
    id: 'oxygenation',
    name: 'Oxygenation decline',
    subtitle: 'Illustrative breathing / oxygenation event',
    triggerLabel: 'SpO₂ below 94% (training trigger)',
    cause: 'A scripted oxygenation decline. Cabin oxygen, CO₂ and suit telemetry are not measured.',
    guidance: 'Training response: stop strenuous activity, notify mission control and the medical officer, verify the pulse oximeter and check approved cabin or suit atmosphere instrumentation. Follow the mission-approved response checklist. Do not use this demonstration as operational guidance.'
  },
  {
    id: 'exertion',
    name: 'Exertion and high heart rate',
    subtitle: 'Rising cardiovascular and respiratory workload',
    triggerLabel: 'Heart rate above 115 bpm (training trigger)',
    cause: 'A scripted high-workload exercise response, not an indication of a specific disease.',
    guidance: 'Training response: stop the exertion, move to a safe position, confirm the readings and inform the medical officer or mission control. Resume tasks only under mission-approved procedures.'
  },
  {
    id: 'thermal',
    name: 'Thermal instability',
    subtitle: 'Rising simulated core temperature',
    triggerLabel: 'Core temperature above 38.0°C (training trigger)',
    cause: 'A scripted thermal-stress pattern. Suit coolant and ambient temperature are not connected.',
    guidance: 'Training response: reduce workload, notify mission control, verify the temperature sensor and check available thermal-control instrumentation. Follow the approved thermal-event checklist.'
  },
  {
    id: 'sensor',
    name: 'Sensor signal anomaly',
    subtitle: 'Inconsistent SpO₂ reading, other channels remain near baseline',
    triggerLabel: 'Inconsistent signal pattern (training trigger)',
    cause: 'An intentionally inconsistent simulated oximeter trace. A bad sensor is a possibility, not a confirmed diagnosis.',
    guidance: 'Training response: check sensor contact and fit, repeat the measurement with approved equipment and report the inconsistency. Avoid treating a single suspect reading as confirmed physiological deterioration.'
  }
];

const BASELINES = {
  SIM_CREW_01: [70, 98.3, 14.0, 36.75, 62],
  SIM_CREW_02: [65, 98.6, 12.8, 36.63, 71],
  SIM_CREW_03: [76, 97.9, 15.5, 36.85, 55],
  SIM_CREW_04: [72, 98.45, 13.5, 36.7, 65]
};

export const SCENARIO_LENGTH = 64;
export const SCENARIO_STAGES = [
  { at: 0, title: 'Baseline', description: 'Training run begins with simulated nominal readings.' },
  { at: 9, title: 'Developing', description: 'The scripted disturbance begins; measurements gradually diverge.' },
  { at: 25, title: 'Peak disturbance', description: 'The strongest simulated deviation is reached.' },
  { at: 44, title: 'Recovery', description: 'The disturbance is removed and the illustrative signals begin to recover.' },
  { at: 64, title: 'Complete', description: 'Training scenario complete. Return to the live simulator to resume its feed.' }
];
const clamp = (x, min = 0, max = 1) => Math.min(max, Math.max(min, x));
const round = (n, places = 1) => Number(n.toFixed(places));

export function scenarioAt(subjectId, scenarioId, second) {
  const scenario = SCENARIOS.find(s => s.id === scenarioId);
  if (!scenario) throw new Error('Unknown training scenario');
  const t = clamp(Math.floor(second), 0, SCENARIO_LENGTH);
  const [hr, spo2, rr, temp, hrv] = BASELINES[subjectId] || BASELINES.SIM_CREW_01;
  // Smooth, deterministic onset and recovery. No jitter or random values
  // that could be confused with real sensor noise.
  const rising = clamp((t - 8) / 18);
  const falling = 1 - clamp((t - 44) / 18);
  const disturbance = rising * falling;
  const wobble = Math.sin(t / 4 + hr / 10) * 0.55;
  const values = {
    heart_rate_bpm: round(hr + wobble, 1),
    spo2_percent: round(spo2 + 0.07 * Math.sin(t / 7), 1),
    respiratory_rate_bpm: round(rr + 0.15 * Math.sin(t / 5), 1),
    core_temp_c: round(temp + 0.025 * Math.sin(t / 9), 2),
    hrv_rmssd_ms: round(hrv + 0.5 * Math.sin(t / 6), 1)
  };
  if (scenarioId === 'oxygenation') {
    values.heart_rate_bpm = round(values.heart_rate_bpm + 29 * disturbance);
    values.spo2_percent = round(values.spo2_percent - 10 * disturbance, 1);
    values.respiratory_rate_bpm = round(values.respiratory_rate_bpm + 10 * disturbance);
    values.hrv_rmssd_ms = round(values.hrv_rmssd_ms - 17 * disturbance);
  } else if (scenarioId === 'exertion') {
    values.heart_rate_bpm = round(values.heart_rate_bpm + 73 * disturbance);
    values.spo2_percent = round(values.spo2_percent - 1.25 * disturbance, 1);
    values.respiratory_rate_bpm = round(values.respiratory_rate_bpm + 17 * disturbance);
    values.core_temp_c = round(values.core_temp_c + 0.45 * disturbance, 2);
    values.hrv_rmssd_ms = round(values.hrv_rmssd_ms - 28 * disturbance);
  } else if (scenarioId === 'thermal') {
    values.heart_rate_bpm = round(values.heart_rate_bpm + 29 * disturbance);
    values.respiratory_rate_bpm = round(values.respiratory_rate_bpm + 8 * disturbance);
    values.core_temp_c = round(values.core_temp_c + 2.1 * disturbance, 2);
    values.hrv_rmssd_ms = round(values.hrv_rmssd_ms - 16 * disturbance);
  } else if (scenarioId === 'sensor') {
    values.spo2_percent = round(values.spo2_percent - 16 * disturbance, 1);
    values.heart_rate_bpm = round(values.heart_rate_bpm + 0.7 * disturbance);
  }
  const flags = {
    heart_rate_bpm: scenarioId === 'exertion' && values.heart_rate_bpm > 115,
    spo2_percent: scenarioId === 'oxygenation' && values.spo2_percent < 94 ||
      scenarioId === 'sensor' && disturbance > 0.55,
    respiratory_rate_bpm: scenarioId === 'oxygenation' && values.respiratory_rate_bpm > 20 ||
      scenarioId === 'exertion' && values.respiratory_rate_bpm > 26,
    core_temp_c: scenarioId === 'thermal' && values.core_temp_c > 38,
    hrv_rmssd_ms: false
  };
  const alert = Object.values(flags).some(Boolean);
  // Severity is a scripted training progression, not a diagnostic score.
  // The status colors describe only scenario intensity; stable, actual
  // physiological baselines and sparse OSDR lab data are not rated.
  const tier = disturbance < 0.12 ? 'OPTIMAL' :
    disturbance < 0.42 ? 'CHECK' :
    disturbance < 0.78 ? 'WARNING' : alert ? 'CRITICAL' : 'WARNING';
  const affected = {
    oxygenation: ['heart_rate_bpm','spo2_percent','respiratory_rate_bpm','hrv_rmssd_ms'],
    exertion: ['heart_rate_bpm','spo2_percent','respiratory_rate_bpm','core_temp_c','hrv_rmssd_ms'],
    thermal: ['heart_rate_bpm','respiratory_rate_bpm','core_temp_c','hrv_rmssd_ms'],
    sensor: ['spo2_percent']
  }[scenarioId];
  const metric_levels = Object.fromEntries(Object.keys(values).map(key=>[
    key,affected.includes(key) ? tier : 'OPTIMAL'
  ]));
  const stage = t >= 64 ? 'Complete' : t >= 44 ? 'Recovery' :
    t >= 25 ? 'Peak disturbance' : t >= 9 ? 'Developing' : 'Baseline';
  return {
    subject_id: subjectId,
    sequence: t,
    timestamp: null, // This is playback time, not a real acquisition timestamp.
    source: 'SCRIPTED_TRAINING_SCENARIO',
    scenario_id: scenarioId,
    elapsed_seconds: t,
    values, flags, alert, stage, disturbance, severity:tier, metric_levels,
    reason: alert ? scenario.cause : t > 8 && t < 63 ? 'Scenario values are evolving. Training triggers have not fired at this instant.' :
      'Illustrative baseline or recovered phase; not a clinical clearance.',
    guidance: scenario.guidance,
    trigger: scenario.triggerLabel
  };
}

export function scenarioHistory(subjectId, scenarioId, second) {
  const end = clamp(Math.floor(second), 0, SCENARIO_LENGTH);
  return Array.from({ length: end + 1 }, (_, t) => scenarioAt(subjectId, scenarioId, t));
}
