import test from 'node:test';
import assert from 'node:assert/strict';
import {contactRole,professionalEmail,professionalPhone,professionalSource,recordedContactContext} from './professionalContacts';
import type {KeyContact} from '../types';
test('recorded titles give research categories, not purchase authority',()=>{
 for(const [title,role] of [['Fire Chief','Leadership role'],['EMS Training Captain','Education role'],['Medical Director','Clinical role'],['Biomedical Technician','Technical / biomedical role'],['IT Director','IT / communications role'],['Purchasing Manager','Procurement role'],['Fleet Captain','Operational role'],['City Manager','Administrative / budget role'],['Economic buyer','Role not classified']])assert.equal(contactRole({title,role:''}),role);
});
test('contact actions use only syntactically valid recorded values and never generate missing fields',()=>{
 assert.equal(professionalEmail('chief@example.gov'),'chief@example.gov');
 for(const email of ['','chief@example.gov?bcc=other@example.gov','chief@example.gov\r\n','mailto:chief@example.gov','chief%0a@example.gov'])assert.equal(professionalEmail(email),undefined);
 assert.equal(professionalPhone('+1 (800) 555-0123'),'+1 (800) 555-0123');
 assert.equal(professionalPhone('123;phone-context=evil'),undefined);
 assert.equal(professionalSource('https://user:pass@example.gov'),undefined);
 assert.equal(professionalSource('javascript:alert(1)'),undefined);
 const c=recordedContactContext({name:'Fixture',title:'Chief',role:'',email:'',phone:'',verificationSource:'Source not listed'} as KeyContact);
 assert.equal(c.email,undefined);assert.equal(c.phone,undefined);assert.equal(c.sourceName,'');
});
