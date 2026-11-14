/** Crew selection and feed labeling remain independent of the UI renderer. */
export const CREW_SUBJECT_IDS = Object.freeze([
  'SIM_CREW_01','SIM_CREW_02','SIM_CREW_03','SIM_CREW_04'
]);

export function crewIndexForSubject(subjectId) {
  const index = CREW_SUBJECT_IDS.indexOf(subjectId);
  return index === -1 ? 0 : index;
}

export function latestForSubject(snapshot,subjectId) {
  const packet = snapshot?.subjects?.[subjectId]?.latest;
  if (!packet || (packet.subject_id && packet.subject_id !== subjectId)) return null;
  return packet;
}

/** Never use one crew member's packets as another crew member's trend. */
export function samplesForSubject(samples,subjectId,latest=null) {
  const rows = Array.isArray(samples) ? samples.filter(packet=>packet?.subject_id===subjectId) : [];
  const hasLatest = latest && (!latest.subject_id || latest.subject_id===subjectId) &&
    Number.isInteger(latest.sequence) && !rows.some(packet=>packet.sequence===latest.sequence);
  return [...rows,...(hasLatest?[{...latest,subject_id:subjectId}]:[])].sort((a,b)=>a.sequence-b.sequence);
}

export function crewFeedStatus(connection,availableSubjects,subjectId) {
  const hasSnapshot = Array.isArray(availableSubjects) && availableSubjects.includes(subjectId);
  if (connection==='connected' && hasSnapshot) return {label:'Simulated feed active',online:true};
  if (hasSnapshot) return {label:'Last simulator snapshot',online:false};
  if (connection==='connected') return {label:'Awaiting simulator packet',online:false};
  return {label:'Connection pending',online:false};
}
