import {useCallback,useEffect,useState} from 'react';
import {readApi} from './api.js';
import {SCENARIO_LENGTH,SCENARIOS} from './scenarioSimulator.js';

// One backend-grounded training session shared by Scenario Lab and suit HUD.
// Never substitute browser-generated events or model scores for API frames.
export default function useScenarioPlayback(selected) {
  const [id,setId]=useState('');
  const [elapsed,setElapsed]=useState(0);
  const [revision,setRevision]=useState(0);
  const [running,setRunning]=useState(false);
  const [lastVerifiedFrame,setLastVerifiedFrame]=useState(null);
  const [pending,setPending]=useState(false);
  const [error,setError]=useState('');
  const [soundEnabled,setSoundEnabled]=useState(true);

  const stop=useCallback(()=>{
    setId('');
    setElapsed(0);
    setRunning(false);
    setLastVerifiedFrame(null);
    setPending(false);
    setError('');
  },[]);
  const select=useCallback(next=>{
    if(next && !SCENARIOS.some(item=>item.id===next))return;
    setId(next);
    setElapsed(0);
    setRevision(v=>v+1);
    setRunning(false);
    setLastVerifiedFrame(null);
    setPending(false);
    setError('');
  },[]);
  const reset=useCallback(()=>{
    setElapsed(0);
    setRevision(v=>v+1);
    setRunning(false);
    setLastVerifiedFrame(null);
    setError('');
  },[]);
  const pause=useCallback(()=>setRunning(false),[]);
  const toggleSound=useCallback(()=>setSoundEnabled(v=>!v),[]);
  const sample=lastVerifiedFrame?.scenario_id===id
    &&lastVerifiedFrame?.subject_id===selected
    &&lastVerifiedFrame?.elapsed_seconds===elapsed
    ?lastVerifiedFrame:null;
  const latest=lastVerifiedFrame?.scenario_id===id
    &&lastVerifiedFrame?.subject_id===selected
    ?lastVerifiedFrame:null;

  const start=useCallback(()=>{
    if(!id||!sample||pending||error||elapsed>=SCENARIO_LENGTH)return;
    setRunning(true);
  },[id,sample,pending,error,elapsed]);

  // Changing crew never transfers another astronaut's playback state.
  useEffect(()=>{stop()},[selected,stop]);

  useEffect(()=>{
    if(!id||!running||pending)return;
    const timer=window.setInterval(()=>{
      setElapsed(v=>{
        if(v>=SCENARIO_LENGTH){
          setRunning(false);
          return v;
        }
        return v+1;
      });
    },1000);
    return()=>window.clearInterval(timer);
  },[id,running,pending]);

  useEffect(()=>{
    if(!id){setPending(false);return;}
    let cancelled=false;
    setPending(true);
    readApi('/api/simulation/scenarios/'+encodeURIComponent(selected)+'/'+encodeURIComponent(id)
      +'?second='+encodeURIComponent(elapsed)+'&include_history=true')
      .then(frame=>{
        if(cancelled)return;
        if(frame.subject_id!==selected||frame.scenario_id!==id
          ||frame.elapsed_seconds!==elapsed
          ||frame.source!=='SERVER_SCRIPTED_TRAINING_SCENARIO'){
          throw new Error('Scenario backend returned a mismatched frame');
        }
        setLastVerifiedFrame(frame);
        setError('');
        setPending(false);
      })
      .catch(exc=>{
        if(cancelled)return;
        setError(exc.message||'Scenario backend unavailable');
        setPending(false);
        setRunning(false);
      });
    return()=>{cancelled=true;};
  },[selected,id,elapsed,revision]);

  return {
    id, elapsed, running, sample, latest, pending, error, soundEnabled,
    active:Boolean(id), start, pause, reset, stop, select, toggleSound,
    severity:latest?.severity||'UNASSESSED',
    // A prior verified frame remains visible during the next API request.
    // The view must mark it as updating, not imply a new sample exists.
    updating:Boolean(id&&!sample),
  };
}
