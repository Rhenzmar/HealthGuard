/** Only visually flag body systems when a verified training frame flags related physiology. */
export const REGION_METRICS=Object.freeze({
  cardiac:['heart_rate_bpm','hrv_rmssd_ms','systolic_bp_mmhg','diastolic_bp_mmhg'],
  respiratory:['spo2_percent','respiratory_rate_bpm','etco2_mmhg'],
  thermal:['core_temp_c','peripheral_temp_c'],
  brain:[],
  renal:[]
});
export function verifiedScenarioFrame(scenario,subjectId){
  const frame=scenario?.latest;
  return Boolean(scenario?.id&&frame?.source==='SERVER_SCRIPTED_TRAINING_SCENARIO'&&frame.scenario_id===scenario.id&&frame.subject_id===subjectId)?frame:null;
}
export function anatomyAlertRegions(frame){
  if(!frame || !['WARNING','CRITICAL'].includes(frame.severity))return [];
  return Object.entries(REGION_METRICS)
    .filter(([,keys])=>keys.some(k=>frame.metric_levels?.[k]===frame.severity||
      (frame.severity==='CRITICAL'&&frame.metric_levels?.[k]==='WARNING')))
    .map(([region])=>region);
}
