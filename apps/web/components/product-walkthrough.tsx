"use client";

import {useEffect,useRef,useState} from "react";
import {Icon,type IconName} from "./icon";
import {WorkflowScene} from "./workflow-scene";
import {TOUR_DURATION} from "../../mobile/src/walkthrough-model";
import {useTourClock} from "../lib/walkthrough-clock";

const chapters: {label:string;title:string;caption:string;icon:IconName}[] = [
  {label:"Plan the day",title:"A calmer start to care.",caption:"Watch a patient search become a confirmed appointment.",icon:"calendar"},
  {label:"See the whole story",title:"The person behind the record.",caption:"Add patient details and see a new identity record appear.",icon:"fileSearch"},
  {label:"Keep care connected",title:"Every handoff has context.",caption:"Create a follow-up task and assign it to a care coordinator.",icon:"handoff"},
  {label:"Follow the billing",title:"A clear view of billing.",caption:"Choose a service, enter an amount, and save a draft charge.",icon:"wallet"},
  {label:"Work with confidence",title:"The right context. The right access.",caption:"Choose a facility and purpose before entering the care workspace.",icon:"shieldCheck"},
];
const workspaces=["Appointments","Patients","Pending work","Billing","Access context"];
const eyebrows=["YOUR DAY, IN VIEW","PATIENT REGISTRATION","CARE COORDINATION","BILLING CONTEXT","ACCESS & PROVENANCE"];

export function ProductWalkthrough(){
  const [chapter,setChapter]=useState(0),[playback,setPlayback]=useState<"auto"|"paused"|"playing">("auto"),[revision,setRevision]=useState(0),[reduced,setReduced]=useState(true),[visible,setVisible]=useState(false),[focused,setFocused]=useState(false),[foreground,setForeground]=useState(true);
  const root=useRef<HTMLElement>(null),rail=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const media=matchMedia("(prefers-reduced-motion: reduce)");const preference=()=>{setReduced(media.matches);setPlayback(value=>value==="playing"?"auto":value);};preference();media.addEventListener("change",preference);
    const visibility=()=>setForeground(!document.hidden);visibility();document.addEventListener("visibilitychange",visibility);
    const observer=new IntersectionObserver(entries=>setVisible(entries[0]?.isIntersecting??false),{threshold:.15});if(root.current)observer.observe(root.current);
    return()=>{media.removeEventListener("change",preference);document.removeEventListener("visibilitychange",visibility);observer.disconnect();};
  },[]);
  const wantsPlayback=playback==="playing"||(playback==="auto"&&!reduced);
  const rotationRequested=wantsPlayback&&!focused;
  const playing=rotationRequested&&visible&&foreground;
  const elapsed=useTourClock(playing,`${chapter}-${revision}`,()=>setChapter(value=>(value+1)%chapters.length));
  const displayElapsed=reduced&&!playing?TOUR_DURATION-1:elapsed;
  useEffect(()=>{
    const container=rail.current,button=container?.querySelector<HTMLElement>("button[aria-pressed=true]");
    if(!container||!button||container.scrollWidth<=container.clientWidth)return;
    const offset=button.getBoundingClientRect().left-container.getBoundingClientRect().left+container.scrollLeft;
    container.scrollTo({left:Math.max(0,offset-(container.clientWidth-button.offsetWidth)/2),behavior:reduced?"auto":"smooth"});
  },[chapter,reduced]);
  const current=chapters[chapter]!;
  return <section className="product-film" ref={root} aria-label="CuraSphere product walkthrough" data-playing={playing} onFocusCapture={event=>{if(event.target.matches(":focus-visible"))setFocused(true);}} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget))setFocused(false);}}>
    <div className="film-halo" aria-hidden="true"/>
    <div className="film-window">
      <div className="film-chrome"><span className="film-dots" aria-hidden="true"><i/><i/><i/></span><span><Icon name="shieldCheck" size={13}/> CuraSphere / care workspace</span><span className="film-example">Illustrative preview</span></div>
      <div className="film-app"><aside className="film-sidebar" aria-hidden="true"><span className="film-brand">CuraSphere<span>+</span></span><small>CARE WORKSPACE</small>{chapters.map((item,i)=><div key={item.label} className={i===chapter?"active":""}><Icon name={item.icon} size={17}/>{workspaces[i]}</div>)}<span className="film-sidebar-foot"><Icon name="building" size={16}/> Your organization</span></aside>
        <div className="film-content"><div className="film-appbar"><span>Care workspace <span aria-hidden="true">/</span> {workspaces[chapter]}</span><span className="film-user">CT</span></div>
          <div className="film-scene" key={chapter}>
            <div className="film-scene-heading"><div><span className="film-eyebrow">{eyebrows[chapter]}</span><h2>{current.title}</h2></div><span className="film-scene-icon"><Icon name={current.icon} size={23}/></span></div>
            <WorkflowScene chapter={chapter} elapsed={displayElapsed} reduced={reduced} playing={playing}/>
          </div><div className="film-app-foot"><span><i/> Source records stay authoritative</span><span>Synthetic example · No live activity</span></div>
        </div>
      </div>
    </div>
    <div className="film-controls"><div className="film-chapters" ref={rail} role="group" aria-label="Walkthrough chapters">{chapters.map((item,i)=><button type="button" key={item.label} aria-pressed={chapter===i} onClick={event=>{setChapter(i);setRevision(value=>value+1);if(event.detail>0)setFocused(false);}}><span className="film-step">0{i+1}</span><span>{item.label}</span><span className="film-progress" aria-hidden="true">{chapter===i&&<i style={{transform:`scaleX(${elapsed/TOUR_DURATION})`}} />}</span></button>)}</div><button type="button" className="film-play" aria-label={rotationRequested?"Pause walkthrough":"Play walkthrough"} onClick={()=>{setPlayback(rotationRequested?"paused":"playing");setFocused(false);}}><span aria-hidden="true">{rotationRequested?"Ⅱ":"▷"}</span></button></div>
    <p className="film-caption" aria-live="off"><span className="film-counter">Step {chapter+1} of {chapters.length}</span>{current.caption}</p>{reduced&&<p className="film-motion-note">Reduced motion is on. Choose a chapter, or press Play for timed task steps without transition effects.</p>}
  </section>;
}
