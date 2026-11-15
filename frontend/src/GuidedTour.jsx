import React,{useEffect,useRef,useState} from 'react';
import {Icon} from './viz.jsx';
import {TOUR_STEPS} from './tourConfig.js';
import './GuidedTour.css';

/**
 * Non-destructive overlay: highlighted elements are visual only.
 * Never triggers telemetry or scenario playback. Voice guidance is optional.
 */
export default function GuidedTour({index,onNext,onBack,onExit,narrationAllowed=true}){
  const step=TOUR_STEPS[index];
  const [focus,setFocus]=useState(null);
  const panelRef=useRef(null);
  const closeRef=useRef(null);
  const [narrationOn,setNarrationOn]=useState(false);
  const activeUtterance=useRef(null);
  const voiceSupported=typeof window!=='undefined'&&
    typeof window.SpeechSynthesisUtterance==='function'&&Boolean(window.speechSynthesis);
  useEffect(()=>{
    if(!voiceSupported||!narrationOn||!narrationAllowed||!step)return;
    const synth=window.speechSynthesis;
    // Critical PhysioAlert speech must always take priority.
    if(synth.speaking||synth.pending)return;
    const speech=new window.SpeechSynthesisUtterance(
      'HealthGuard guide. '+step.title+'. '+step.body
    );
    speech.lang='en-US';
    speech.rate=.95;
    speech.pitch=1;
    activeUtterance.current=speech;
    synth.speak(speech);
    return()=>{
      if(activeUtterance.current===speech){
        activeUtterance.current=null;
        if(synth.speaking||synth.pending)synth.cancel();
      }
    };
  },[index,narrationOn,narrationAllowed,voiceSupported]);
  const toggleNarration=()=>{
    if(!voiceSupported||!narrationAllowed)return;
    setNarrationOn(value=>!value);
  };
  useEffect(()=>{
    if(!step)return;
    const previousFocus=document.activeElement;
    const previousOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    closeRef.current?.focus();
    const key=e=>{
      if(e.key==='Escape'){e.preventDefault();onExit();return;}
      if(e.key==='ArrowRight'){e.preventDefault();onNext();return;}
      if(e.key==='ArrowLeft'){e.preventDefault();onBack();return;}
      if(e.key==='Tab'&&panelRef.current){
        const controls=[...panelRef.current.querySelectorAll('button:not(:disabled)')];
        if(!controls.length)return;
        if(e.shiftKey&&document.activeElement===controls[0]){e.preventDefault();controls.at(-1)?.focus();}
        else if(!e.shiftKey&&document.activeElement===controls.at(-1)){e.preventDefault();controls[0].focus();}
      }
    };
    document.addEventListener('keydown',key);
    return()=>{
      document.removeEventListener('keydown',key);
      document.body.style.overflow=previousOverflow;
      previousFocus?.focus?.();
    };
  },[step,onExit,onNext,onBack]);

  useEffect(()=>{
    if(!step)return;
    let raf=0;
    const update=()=>{
      cancelAnimationFrame(raf);
      raf=requestAnimationFrame(()=>{
        const node=document.querySelector('[data-tour-anchor="'+step.target+'"]');
        const rect=node?.getBoundingClientRect();
        const valid=rect&&rect.width>20&&rect.height>20&&rect.right>0&&rect.left<window.innerWidth
          &&rect.bottom>0&&rect.top<window.innerHeight;
        const fallback=document.querySelector('.topbar')?.getBoundingClientRect();
        const r=valid?rect:fallback;
        if(!r)return setFocus(null);
        setFocus({top:Math.max(8,r.top-5),left:Math.max(8,r.left-5),
          width:Math.min(window.innerWidth-16,r.width+10),
          height:r.height+10,anchorVisible:Boolean(valid)});
      });
    };
    update();
    window.addEventListener('resize',update);
    window.addEventListener('scroll',update,true);
    const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(update):null;
    observer?.observe(document.querySelector('.app-shell')||document.body);
    return()=>{window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);observer?.disconnect();cancelAnimationFrame(raf);};
  },[step]);

  if(!step)return null;
  const showRight=focus&&focus.left+focus.width<window.innerWidth-410&&window.innerWidth>800;
  const style=showRight?{
    top:Math.min(window.innerHeight-300,Math.max(20,focus.top)),
    left:Math.min(window.innerWidth-380,focus.left+focus.width+22)
  }:{left:Math.max(12,(window.innerWidth-Math.min(385,window.innerWidth-24))/2),
    bottom:Math.max(18,Math.min(55,window.innerHeight*.05))};
  return <div className="hg-tour-root" role="dialog" aria-modal="true" aria-label="HealthGuard guided walkthrough">
    <div className="hg-tour-dim"/>
    {focus&&<div className="hg-tour-spotlight" aria-hidden="true" style={{
      top:focus.top,left:focus.left,width:focus.width,height:focus.height
    }}/>}
    <section ref={panelRef} className="hg-tour-panel" style={style} aria-labelledby="hg-tour-title">
      <div className="hg-tour-top"><span>HEALTHGUARD / GUIDED TOUR</span>
        <button ref={closeRef} type="button" onClick={onExit} aria-label="Close guided tour"><Icon name="x" size={17}/></button>
      </div>
      <div className="hg-tour-meta">
        <div className="hg-tour-count">STEP {index+1} OF {TOUR_STEPS.length}</div>
        <button type="button" className="hg-tour-voice" aria-pressed={narrationOn}
          disabled={!voiceSupported||!narrationAllowed}
          onClick={toggleNarration} title={!narrationAllowed?'Voice guidance is unavailable while a scenario is running':'Toggle spoken step-by-step guidance'}>
          <Icon name={narrationOn?'volume':'mute'} size={15}/>
          {narrationOn?'Voice on':'Voice off'}
        </button>
      </div>
      <h2 id="hg-tour-title">{step.title}</h2>
      <p>{step.body}</p>
      <div className="hg-tour-dots" aria-label="Tour progress">{TOUR_STEPS.map((_,i)=><span key={i} className={i===index?'active':i<index?'done':''}/>)}</div>
      <footer className="hg-tour-actions">
        <button type="button" className="hg-tour-skip" onClick={onExit}>Skip tour</button>
        <div>
          {index>0&&<button type="button" className="hg-tour-back" onClick={onBack}>Back</button>}
          <button type="button" className="hg-tour-next" onClick={onNext}>{index===TOUR_STEPS.length-1?'Finish':'Next'}<Icon name="arrow" size={15}/></button>
        </div>
      </footer>
    </section>
  </div>;
}
