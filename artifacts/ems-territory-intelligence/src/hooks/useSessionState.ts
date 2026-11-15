import { useState, useEffect, type SetStateAction, type Dispatch } from 'react';
/** Session-only view preferences; never agency facts. */
export function useSessionState<T extends string|number>(key:string,initial:T):[T,Dispatch<SetStateAction<T>>] {
  const [value,setValue]=useState<T>(()=>{try{const saved=JSON.parse(sessionStorage.getItem(key)??'null');return typeof saved===typeof initial?saved:initial;}catch{return initial;}});
  useEffect(()=>{try{sessionStorage.setItem(key,JSON.stringify(value));}catch{/* View remains usable without storage. */}},[key,value]);
  return [value,setValue];
}
