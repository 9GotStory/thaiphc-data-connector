import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {main} from '../src/cli/index.mjs';
import {collectReferenceSnapshot,SNAPSHOT_CONFIRM} from '../src/sync/reference-snapshot.mjs';
import {syntheticReferenceRow} from '../src/sync/synthetic-reference-row.mjs';
import {buildOfflineValidateEnvelope} from '../src/sync/offline-validate-envelope.mjs';
import {sendReferenceValidate,sendSyntheticValidate,REFERENCE_VALIDATE_CONFIRM} from '../src/sync/manual-validate-transport.mjs';

const manifest=JSON.parse(readFileSync(new URL('../docs/sheets-schema.json',import.meta.url),'utf8'));
const targets=JSON.parse(readFileSync(new URL('../config/thaiphc-targets.json',import.meta.url),'utf8'));
const keyB64=Buffer.alloc(32,73).toString('base64'); // INVENTED TEST KEY
const TOKEN='FAKE_TEST_BEARER_1234567890';
const WEB_APP_URL='https://script.google.com/macros/s/'+targets.deploymentId+'/exec';
const GOOGLE='https://script.googleusercontent.com/macros/echo?user_content_key=FAKE';
const refCount={subdistricts:8,villages:85,'health-services':18};
function row(endpoint,i=1){
 const r=syntheticReferenceRow(endpoint,manifest);
 if(endpoint==='subdistricts'){
  r.code='54060'+i;r.id=r.code;
 }else if(endpoint==='villages'){
  const sub='54060'+(Math.floor((i-1)/15)+1),n=(i-1)%15+1;
  r.code=sub+String(n).padStart(3,'0');r.id=r.code;
  r.subdistrict_code=sub;
  r.village_code_8digit=sub+String(n).padStart(2,'0');
  r.village_no=n;r.label=r.name_th;
 }else{
  r.health_service_code='SYNTHETIC-HS-'+i;
  r.health_service_type={id:'SYNTHETIC',name_th:'SYNTHETIC',name_en:null};
  r.province={province_code:'54',province_name_th:'SYNTHETIC',province_name_en:null};
  r.district={district_code:'5406',district_name_th:'SYNTHETIC',district_name_en:null};
  r.subdistrict={subdistrict_code:'540601',subdistrict_name_th:'SYNTHETIC',subdistrict_name_en:null};
 }
 return r;
}
const respond=data=>new Response(JSON.stringify(data),{
 status:200,headers:{'content-type':'application/json'}
});
const valid=(endpoint,rowCount)=>({
 protocol:'THAIPHC_SYNC_V1',status:'VALIDATED',accepted:true,
 sheetsWrites:0,endpoint,rowCount,inserted:0,updated:0,unchanged:0
});
const denied=status=>({
 protocol:'THAIPHC_SYNC_V1',status,accepted:false,sheetsWrites:0
});
async function memory(endpoint,n=refCount[endpoint]){
 const rows=Array.from({length:n},(_,i)=>row(endpoint,i+1));
 return collectReferenceSnapshot({
  endpoint,manifest,confirm:async()=>SNAPSHOT_CONFIRM,
  getToken:async()=>TOKEN,fetchImpl:async(url)=>{
   const offset=Number(new URL(url).searchParams.get('offset')||0);
   return respond(endpoint==='health-services'?
     {items:rows.slice(offset,offset+10),total:n,offset,limit:10}:
     {items:rows});
  }
 });
}
function prepared(snapshot){
 return buildOfflineValidateEnvelope({
  endpoint:snapshot.endpoint,rows:snapshot.rows,manifest,keyB64,
  runId:'source-validation-001',fetchedAtUtc:new Date().toISOString()
 });
}
test('T009D real-reference validate can POST exactly verified source snapshots for all 3 endpoints without commit',async()=>{
 for(const endpoint of ['subdistricts','villages','health-services']){
  const snapshot=await memory(endpoint);
  assert.equal(snapshot.status,'SNAPSHOT_VALIDATED_IN_MEMORY');
  const p=prepared(snapshot);
  let calls=0;
  const out=await sendReferenceValidate({
   snapshot,prepared:p,acknowledgement:REFERENCE_VALIDATE_CONFIRM,
   fetchImpl:async(target,opts)=>{
    calls++;assert.equal(target,WEB_APP_URL);
    assert.equal(opts.method,'POST');assert.equal(opts.redirect,'manual');
    assert.equal(opts.credentials,'omit');
    assert.equal(opts.headers.Authorization,undefined);
    const wire=JSON.parse(opts.body);
    const batch=JSON.parse(Buffer.from(wire.payloadB64,'base64'));
    assert.equal(batch.mode,'validate');
    assert.equal(batch.endpoint,endpoint);
    assert.equal(batch.rows.length,refCount[endpoint]);
    assert.equal(wire.signature,createHmac('sha256',Buffer.from(keyB64,'base64'))
     .update('THAIPHC_SYNC_V1\n'+wire.timestamp+'\n'+wire.nonce+'\n'+wire.payloadB64)
     .digest('base64'));
    return respond(valid(endpoint,refCount[endpoint]));
   }
  });
  assert.equal(calls,1);assert.equal(out.status,'VALIDATED');
  assert.equal(out.mode,'MANUAL_REFERENCE_VALIDATE_ONLY');
  assert.equal(out.accepted,true);
  assert.equal(out.sourceRowsPostAttempted,true);
  assert.equal(out.destinationWriteApproved,false);
  assert.equal(out.appsScriptPosts,1);assert.equal(out.sheetsWrites,0);
  assert.equal(out.rowCount,refCount[endpoint]);
  assert.doesNotMatch(JSON.stringify(out),/payloadB64|signature|SYNTHETIC|FAKE_TEST|user_content_key|540601001/);
  // The original synthetic-only sender MUST reject the very same real-row-shaped wire.
  const blocked=await sendSyntheticValidate({prepared:p,
   acknowledgement:'POST SYNTHETIC VALIDATE 5406',
   fetchImpl:async()=>{throw Error('NETWORK_NOT_ALLOWED');}});
  assert.equal(blocked.status,'INPUT_REJECTED');
  assert.equal(blocked.appsScriptPosts,0);
 }
});
test('T009D reference sender blocks tampered snapshot, unsigned data changes and wrong confirmation without POST',async()=>{
 const snapshot=await memory('villages'),p=prepared(snapshot);
 let calls=0;
 const fetchImpl=async()=>{calls++;return respond(valid('villages',85));};
 const wrong=await sendReferenceValidate({snapshot,prepared:p,
  acknowledgement:'WRONG',fetchImpl});
 assert.equal(wrong.status,'MANUAL_CONFIRMATION_REQUIRED');
 const changed=await sendReferenceValidate({
  snapshot:{...snapshot,rows:snapshot.rows.map((r,i)=>i===0?{...r,name_th:'CHANGED'}:r)},
  prepared:p,acknowledgement:REFERENCE_VALIDATE_CONFIRM,fetchImpl});
 assert.equal(changed.status,'INPUT_REJECTED');
 const fakeCount=await sendReferenceValidate({
  snapshot:{...snapshot,observedCountMatches:false},
  prepared:p,acknowledgement:REFERENCE_VALIDATE_CONFIRM,fetchImpl});
 assert.equal(fakeCount.status,'INPUT_REJECTED');
 const dangerous=buildOfflineValidateEnvelope({
  endpoint:'villages',rows:[row('villages')],manifest,keyB64,
  runId:'source-validation-002',fetchedAtUtc:new Date().toISOString()
 });
 const notFull=await sendReferenceValidate({snapshot,prepared:dangerous,
  acknowledgement:REFERENCE_VALIDATE_CONFIRM,fetchImpl});
 assert.equal(notFull.status,'INPUT_REJECTED');
 assert.equal(calls,0);
});
test('T009D reference POST follows only safe bodyless redirect, rejects unsafe statuses and never retries',async()=>{
 const snapshot=await memory('subdistricts'),p=prepared(snapshot);
 let methods=[];
 const ok=await sendReferenceValidate({snapshot,prepared:p,
  acknowledgement:REFERENCE_VALIDATE_CONFIRM,fetchImpl:async(url,opts)=>{
   methods.push(opts.method);
   if(methods.length===1)return new Response(null,{status:302,headers:{Location:GOOGLE}});
   assert.equal(url,GOOGLE);assert.equal(opts.method,'GET');
   assert.equal(opts.body,undefined);
   assert.equal(opts.headers.Authorization,undefined);
   return respond(valid('subdistricts',8));
  }});
 assert.equal(ok.status,'VALIDATED');
 assert.deepEqual(methods,['POST','GET']);
 assert.equal(ok.networkRequests,2);assert.equal(ok.appsScriptPosts,1);
 for(const first of [
  new Response(null,{status:307,headers:{Location:GOOGLE}}),
  new Response(null,{status:302,headers:{Location:'https://evil.invalid/path'}}),
  respond(denied('WRITE_DISABLED')),
  respond({...valid('subdistricts',8),status:'COMMITTED',sheetsWrites:8})
 ]){
  let calls=0;
  const r=await sendReferenceValidate({snapshot,prepared:p,
   acknowledgement:REFERENCE_VALIDATE_CONFIRM,fetchImpl:async()=>{calls++;return first;}});
  assert.equal(calls,1);assert.equal(r.accepted,false);
  assert.equal(r.appsScriptPosts,1);assert.equal(r.sheetsWrites,0);
 }
 let calls=0;
 const unknown=await sendReferenceValidate({snapshot,prepared:p,
  acknowledgement:REFERENCE_VALIDATE_CONFIRM,fetchImpl:async()=>{
   calls++;throw Error('Bearer PRIVATE_TOKEN '+GOOGLE);
  }});
 assert.equal(calls,1);assert.equal(unknown.status,'REQUEST_FAILED');
 assert.equal(unknown.sourceRowsPostAttempted,true);
 assert.doesNotMatch(JSON.stringify(unknown),/Bearer|PRIVATE_TOKEN|user_content_key/);
});
class FakeTTY extends EventEmitter{
 constructor(){super();this.isTTY=true;this.isRaw=false;this.paused=false;}
 setRawMode(x){this.isRaw=x;}
 pause(){this.paused=true;}
 resume(){this.paused=false;}
 isPaused(){return this.paused;}
}
function tty(confirm=REFERENCE_VALIDATE_CONFIRM){
 const input=new FakeTTY(),prompts=[];
 const output={isTTY:true,write(value){
  prompts.push(value);
  let typed=null;
  if(value.includes('Type TRANSFER REFERENCE VALIDATE'))typed=confirm;
  if(value.includes('Paste authorized Bearer'))typed=TOKEN;
  if(value.includes('Paste destination HMAC'))typed=keyB64;
  if(typed!==null)queueMicrotask(()=>input.emit('data',Buffer.from(typed+'\r')));
  return true;
 }};
 return {input,output,prompts};
}
test('T009D CLI end-to-end manually fetches and validates 8 source rows but emits summary only',async()=>{
 const io=tty(),logs=[];let src=0,dst=0;
 const code=await main(
  ['send-reference-validate','--endpoint','subdistricts','--acknowledge-reference-validate'],
  text=>logs.push(text),{...io,fetchImpl:async(url,opts)=>{
   if(url.includes('/api/v1/lookups/subdistricts')){
    src++;assert.equal(opts.method,'GET');return respond({items:Array.from({length:8},(_,i)=>row('subdistricts',i+1))});
   }
   dst++;assert.equal(url,WEB_APP_URL);assert.equal(opts.method,'POST');
   const p=JSON.parse(Buffer.from(JSON.parse(opts.body).payloadB64,'base64'));
   assert.equal(p.mode,'validate');assert.equal(p.rows.length,8);
   return respond(valid('subdistricts',8));
  }}
 );
 assert.equal(code,0);assert.equal(src,1);assert.equal(dst,1);
 assert.equal(io.input.isRaw,false);
 const out=JSON.parse(logs[0]);
 assert.equal(out.status,'VALIDATED');assert.equal(out.sourceNetworkRequests,1);
 assert.equal(out.appsScriptPosts,1);assert.equal(out.sheetsWrites,0);
 assert.doesNotMatch(logs.join(''),/FAKE_TEST|SYNTHETIC|Bearer|payloadB64|signature/);
});
test('T009D incomplete source audit blocks Web App POST and never prompts for HMAC',async()=>{
 const io=tty(),logs=[];let src=0,dst=0;
 const code=await main(
  ['send-reference-validate','--endpoint','subdistricts','--acknowledge-reference-validate'],
  x=>logs.push(x),{...io,fetchImpl:async(url)=>{
   if(url.includes('/api/v1/lookups/subdistricts')){
    src++;return respond({items:Array.from({length:7},(_,i)=>row('subdistricts',i+1))});
   }
   dst++;return respond(valid('subdistricts',7));
  }}
 );
 assert.equal(code,2);assert.equal(src,1);assert.equal(dst,0);
 assert.equal(JSON.parse(logs[0]).status,'SOURCE_NOT_READY');
 assert.ok(io.prompts.every(x=>!x.includes('Paste destination HMAC')));
});
test('T009D rejects invalid real transfer scope and cancelled hidden confirmation before source calls',async()=>{
 const bad=[
  ['send-reference-validate','--endpoint','villages'],
  ['send-reference-validate','--endpoint','volunteer-gender','--acknowledge-reference-validate'],
  ['send-reference-validate','--endpoint','villages','--acknowledge-authorized-use','--acknowledge-reference-validate'],
  ['send-reference-validate','--endpoint','villages','--acknowledge-reference-validate','--token','oops'],
  ['send-reference-validate','--endpoint','villages','--acknowledge-reference-validate','--url','https://evil.invalid'],
  ['send-reference-validate','--endpoint','villages','--acknowledge-reference-validate','--max-pages','2'],
  ['audit-source','--endpoint','villages','--acknowledge-authorized-use','--acknowledge-reference-validate'],
 ];
 let calls=0;
 for(const args of bad){
  const code=await main(args,()=>{}, {fetchImpl:async()=>{calls++;}});
  assert.equal(code,2);
 }
 const io=tty('NO'),logs=[];
 const code=await main(
  ['send-reference-validate','--endpoint','villages','--acknowledge-reference-validate'],
  x=>logs.push(x),{...io,fetchImpl:async()=>{calls++;}}
 );
 assert.equal(code,2);assert.equal(calls,0);
 assert.ok(io.prompts.every(x=>!x.includes('Paste authorized Bearer')));
 assert.doesNotMatch(logs.join(''),/Bearer|FAKE_TEST/);
});
