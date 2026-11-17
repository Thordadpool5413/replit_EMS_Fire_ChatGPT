import {useEffect,useState} from 'react';
import {loadSourceDirectoryManifest,type SourceDirectoryManifest} from '../services/nationalSourceDirectory';
export function useNationalSourceDirectory(){
 const [manifest,setManifest]=useState<SourceDirectoryManifest|null>(null);const[error,setError]=useState('');const[attempt,setAttempt]=useState(0);
 useEffect(()=>{let active=true;setError('');loadSourceDirectoryManifest().then(data=>{if(active)setManifest(data);}).catch(e=>{if(active)setError(e instanceof Error?e.message:String(e));});return()=>{active=false;};},[attempt]);
 return {manifest,error,retry:()=>setAttempt(a=>a+1)};
}
