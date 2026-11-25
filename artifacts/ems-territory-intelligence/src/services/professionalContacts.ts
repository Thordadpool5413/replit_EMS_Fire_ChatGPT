import type {KeyContact} from '../types';
export const CONTACT_ROLES=['Leadership role','Clinical role','Education role','Operational role','Technical / biomedical role','IT / communications role','Procurement role','Administrative / budget role','Role not classified'] as const;
export type ContactRole=typeof CONTACT_ROLES[number];
/** Title categories are research prompts, not delegated authority or verified employment. */
export function contactRole(c:Pick<KeyContact,'role'|'title'>):ContactRole{
 const t=[c.title,c.role].filter(Boolean).join(' ').toLowerCase();
 if(/\b(?:purchas\w*|procure\w*|contracting officer)\b/.test(t))return 'Procurement role';
 if(/\b(?:finance|budget|city manager|county manager|municipal administrator)\b/.test(t))return 'Administrative / budget role';
 if(/\b(?:biomedical|biomed|equipment technician|clinical engineering)\b/.test(t))return 'Technical / biomedical role';
 if(/\b(?:information technology|communications|dispatch|it director|cio|cad administrator)\b/.test(t))return 'IT / communications role';
 if(/\b(?:educat\w*|training|instructor)\b/.test(t))return 'Education role';
 if(/\b(?:medical director|clinical|quality|nurse)\b/.test(t))return 'Clinical role';
 if(/\b(?:fleet|logistics|captain|battalion|operations|supervisor)\b/.test(t))return 'Operational role';
 if(/\b(?:chief|director|commissioner|administrator)\b/.test(t))return 'Leadership role';
 return 'Role not classified';
}
export function professionalEmail(value:unknown):string|undefined{
 if(typeof value!=='string'||value.length>254)return;
 const v=value.trim();
 return /^[A-Za-z0-9.!#$%&'*+/=?^_\x60{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$/.test(v)&&!/[?&#%\r\n]/.test(v)?v:undefined;
}
export function professionalPhone(value:unknown):string|undefined{
 if(typeof value!=='string'||value.length>50)return;
 const v=value.trim();
 return /^\+?[\d(). -]+(?:\s*(?:x|ext\.?)\s*\d{1,8})?$/i.test(v)&&v.replace(/\D/g,'').length>=7?v:undefined;
}
export function professionalSource(value:unknown):string|undefined{
 if(typeof value!=='string')return;
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port?u.href:undefined;}catch{return;}
}
export function recordedContactContext(c:KeyContact){
 const sourceName=typeof c.verificationSource==='string'&&!/^(?:source not listed|unknown|not reported)$/i.test(c.verificationSource.trim())?c.verificationSource.trim():'';
 // officialWebsite is a recorded website, not proof that the named contact appears there.
 return {role:contactRole(c),sourceName,website:professionalSource(c.officialWebsite),email:professionalEmail(c.email),phone:professionalPhone(c.phone)};
}
