/**
 * Recent observations from the existing, separate engineering simulator.
 * Each row is one successful HTTP poll; timestamps are CLIENT RECEIPT times.
 * No interpolated values and no synthetic fallback are created here.
 */
export const ENGINEERING_HISTORY_LIMIT = 120;
export const ENGINEERING_VITAL_KEYS = Object.freeze([
  'systolic_bp_mmhg','diastolic_bp_mmhg','etco2_mmhg','peripheral_temp_c'
]);

export function appendEngineeringReading(previous,subjectId,values,receivedAt){
  if(typeof subjectId!=='string'||!subjectId||!values||typeof values!=='object'||
    !ENGINEERING_VITAL_KEYS.some(key=>Number.isFinite(values[key]))||
    !Number.isFinite(receivedAt))return Array.isArray(previous)?previous:[];
  const prior=(Array.isArray(previous)?previous:[]).filter(item=>item?.subject_id===subjectId);
  const last=prior.at(-1);
  if(last && receivedAt<=last.received_at)return prior;
  const reading={
    subject_id:subjectId,
    sequence:(last?.sequence??0)+1,
    timestamp:new Date(receivedAt).toISOString(),
    received_at:receivedAt,
    values:Object.fromEntries(ENGINEERING_VITAL_KEYS.filter(k=>Number.isFinite(values[k])).map(k=>[k,values[k]]))
  };
  return [...prior,reading].slice(-ENGINEERING_HISTORY_LIMIT);
}
