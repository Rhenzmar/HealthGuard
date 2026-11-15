/**
 * Short, human-readable scripts for browser text-to-speech.
 * Voice narration is deterministic, not an LLM medical assessment.
 * The backend's risk/attention classifications are never changed here.
 */
export const SCENARIO_MESSAGES = Object.freeze({
  oxygenation: 'Oxygen saturation is declining. Verify the oximeter and follow the approved oxygenation checklist.',
  exertion: 'Heart rate is elevated during exertion. Pause the activity and verify the readings.',
  thermal: 'Core temperature is rising. Reduce workload and follow the approved thermal checklist.',
  sensor: 'The oxygen sensor signal may be unreliable. Check sensor contact and repeat the measurement.',
  co2: 'Cabin carbon dioxide is rising. Verify the atmosphere reading and follow the environmental checklist.',
  cabin_leak: 'Cabin pressure is falling. Notify Mission Control and follow the pressure-loss checklist.',
  radiation: 'Simulated radiation readings are elevated. Verify the readings and follow the radiation checklist.',
  suit_leak: 'Suit pressure is falling. Pause the EVA task and follow the suit pressure checklist.',
  suit_power: 'Suit power is decreasing. Pause EVA tasks and follow the power checklist.'
});

const LIVE_MESSAGES = Object.freeze({
  OPTIMAL: 'No unusual pattern has been flagged in the current simulated window. Continue monitoring.',
  CHECK: 'A simulated reading needs another look. Check signal quality, recent activity, and the measurements.',
  WARNING: 'A simulated pattern needs review. Verify the readings and follow the mission checklist.',
  CRITICAL: 'A simulated engineering reading has crossed its training threshold. Verify the reading and follow the mission checklist.'
});

const label=status=>status==='CRITICAL'?'Critical alert':
  status==='WARNING'?'Warning':status==='CHECK'?'Check':'Status update';

/** Use ONLY validated simulator training labels, never untrusted model prose. */
export function liveVoiceAnnouncement(review) {
  const status=review?.classification_domain==='FICTIONAL_MISSION_TRAINING_ONLY'
    ? review?.status
    : null;
  if(!Object.hasOwn(LIVE_MESSAGES,status)) {
    return 'HealthGuard. Measurements are being reviewed. Verify the current simulated readings.';
  }
  return 'HealthGuard '+label(status)+'. '+LIVE_MESSAGES[status];
}

/** The scenario ID comes from the app's own trusted training scenario catalog. */
export function scenarioVoiceAnnouncement(scenarioId,status='CHECK',mode='alert') {
  const message=SCENARIO_MESSAGES[scenarioId];
  if(!message)return 'HealthGuard training. Review the simulated measurements and follow the approved mission checklist.';
  const prefix=mode==='guidance'?'HealthGuard training guidance':
    'HealthGuard '+label(status)+' - training';
  return prefix+'. '+message;
}
