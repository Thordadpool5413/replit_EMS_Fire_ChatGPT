import { useEffect, useState, useRef } from 'react';
/** Draft writes happen on edits, never as a side effect of mounting another account. */
export function useLocalDraft<T extends Record<string, string>>(key: string, initial: T) {
  const storageKey = `ems_draft_v1:${key}`;
  const read = (): T => { try { const saved=JSON.parse(localStorage.getItem(storageKey)??'null');return saved && Object.keys(initial).every(k=>typeof saved[k]==='string')?saved:initial; } catch { return initial; } };
  const [cell,setCell]=useState(()=>({key:storageKey,value:read()}));
  const latest=useRef(cell);latest.current=cell;
  const [error,setError]=useState('');
  const value=cell.key===storageKey?cell.value:read();
  useEffect(()=>{setCell({key:storageKey,value:read()});setError('');},[storageKey]);
  const setField=(field:keyof T,text:string)=>{
    const previous=latest.current;
    const next={...(previous.key===storageKey?previous.value:read()),[field]:text};
    try {localStorage.setItem(storageKey,JSON.stringify(next));setError('');}catch {setError('Draft could not be saved on this device. Keep this view open until you save the note.');}
    latest.current={key:storageKey,value:next};setCell(latest.current);
  };
  const clear=()=>{try {localStorage.removeItem(storageKey);}catch {setError('The note was saved, but its local draft could not be cleared.');}setCell({key:storageKey,value:initial});};
  return {value,setField,clear,error};
}
