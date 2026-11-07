"use client";
import {useSyncExternalStore} from "react";
// Serialize source-authorized reads within this browser. Never cache facts/auth,
// enqueue commands, retry a request, or share results between patients.
let tail:Promise<void>=Promise.resolve();
let pending=0;
const listeners=new Set<()=>void>();
const publish=()=>{for(const listener of [...listeners])listener();};
const subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
export function useTwinReadsBusy(){return useSyncExternalStore(subscribe,()=>pending>0,()=>false);}
export function fetchTwinRead(input:RequestInfo|URL,options:RequestInit={}):Promise<Response>{
 if((options.method&&options.method.toUpperCase()!=='GET')||(options.body!==undefined&&options.body!==null))return Promise.reject(new TypeError('Twin read scheduling accepts GET only. Commands must be explicit and cannot be queued.'));
 pending++;publish();
 const result=tail.then(()=>{options.signal?.throwIfAborted();return fetch(input,{...options,method:'GET',cache:'no-store'});});
 tail=result.then(()=>undefined,()=>undefined);
 return result.finally(()=>{pending--;publish();});
}
