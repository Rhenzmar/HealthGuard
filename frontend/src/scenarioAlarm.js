/** Short, one-shot training tone at the onset of a verified critical event.
 * The voice reminder is separately scheduled at five-second intervals.
 */
let context=null;
export function unlockScenarioAlarm(){
  if(typeof window==='undefined')return;
  const Audio=window.AudioContext||window.webkitAudioContext;
  if(!Audio)return;
  try{
    if(!context)context=new Audio();
    context.resume().catch(()=>{});
  }catch{/* Some browsers disable procedural sound. Voice remains available. */}
}
export function playScenarioAlarm(){
  if(!context||context.state!=='running')return;
  try{
    const t=context.currentTime;
    for(const [offset,freq] of [[0,660],[.3,495]]){
      const oscillator=context.createOscillator(),gain=context.createGain();
      oscillator.type='sine';oscillator.frequency.value=freq;
      gain.gain.setValueAtTime(0,t+offset);
      gain.gain.linearRampToValueAtTime(.075,t+offset+.025);
      gain.gain.exponentialRampToValueAtTime(.001,t+offset+.25);
      oscillator.connect(gain);gain.connect(context.destination);
      oscillator.start(t+offset);oscillator.stop(t+offset+.27);
    }
  }catch{/* Silent fallback. */}
}
