// The native app has an independent React install; share data, not its hooks.
import {TOUR_DURATION} from '../../mobile/src/walkthrough-model';
import {useEffect,useRef,useState} from 'react';
export function useTourClock(playing:boolean,resetKey:string,onAdvance:()=>void){
 const [elapsed,setElapsed]=useState({key:resetKey,value:0}),clock=useRef(0),advance=useRef(onAdvance);advance.current=onAdvance;
 useEffect(()=>{clock.current=0;setElapsed({key:resetKey,value:0});},[resetKey]);
 useEffect(()=>{
  if(!playing)return;let previous=Date.now();
  const timer=setInterval(()=>{const now=Date.now();clock.current=Math.min(TOUR_DURATION,clock.current+Math.max(0,now-previous));previous=now;setElapsed({key:resetKey,value:clock.current});if(clock.current>=TOUR_DURATION){clearInterval(timer);advance.current();}},60);
  return()=>clearInterval(timer);
 },[playing,resetKey]);
 return elapsed.key===resetKey?elapsed.value:0;
}
