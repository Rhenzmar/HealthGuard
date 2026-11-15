import React,{useEffect,useRef,useState} from 'react';
import {BACKGROUND_THEMES} from './spaceBackgroundThemes.js';

/** A small optional appearance control; changing it does not alter mission data. */
export default function SpaceBackgroundPicker({value,onChange}){
  const [open,setOpen]=useState(false);
  const root=useRef(null);
  const selected=BACKGROUND_THEMES.find(item=>item.id===value)||BACKGROUND_THEMES[0];
  useEffect(()=>{
    if(!open)return;
    const onPointer=event=>{
      if(root.current&&!root.current.contains(event.target))setOpen(false);
    };
    const onKey=event=>{if(event.key==='Escape')setOpen(false);};
    document.addEventListener('pointerdown',onPointer);
    document.addEventListener('keydown',onKey);
    return()=>{document.removeEventListener('pointerdown',onPointer);document.removeEventListener('keydown',onKey);};
  },[open]);
  return <div ref={root} className="hg-scene-picker">
    <button type="button" className="hg-scene-trigger" aria-haspopup="true" aria-expanded={open}
      aria-controls="hg-scene-options" onClick={()=>setOpen(v=>!v)} title="Choose workspace background">
      <span className={'hg-scene-swatch hg-swatch-'+selected.id} aria-hidden="true"/>
      <span>Background: {selected.label}</span>
      <span className="hg-scene-chevron" aria-hidden="true">⌃</span>
    </button>
    {open&&<div id="hg-scene-options" className="hg-scene-options" role="group" aria-label="Workspace background">
      <div className="hg-scene-options-heading">WORKSPACE APPEARANCE</div>
      {BACKGROUND_THEMES.map(item=><button key={item.id} type="button" className={item.id===value?'active':''}
        aria-pressed={item.id===value} onClick={()=>{onChange(item.id);setOpen(false);}}>
        <span className={'hg-scene-swatch hg-swatch-'+item.id} aria-hidden="true"/>
        <span className="hg-scene-option-copy"><strong>{item.label}</strong><small>{item.description}</small></span>
        {item.id===value&&<span className="hg-scene-check" aria-hidden="true">✓</span>}
      </button>)}
    </div>}
  </div>;
}
