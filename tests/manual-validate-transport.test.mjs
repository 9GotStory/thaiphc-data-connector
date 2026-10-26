import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {main} from '../src/cli/index.mjs';
import {syntheticReferenceRow} from '../src/sync/synthetic-reference-row.mjs';
import {buildOfflineValidateEnvelope} from '../src/sync/offline-validate-envelope.mjs';
import {sendSyntheticValidate,SYNTHETIC_VALIDATE_CONFIRM}
 from '../src/sync/manual-validate-transport.mjs';

const manifest=JSON.parse(readFileSync(new URL('../docs/sheets-schema.json',import.meta.url),'utf8'));
const targets=JSON.parse(readFileSync(new URL('../config/thaiphc-targets.json',import.meta.url),'utf8'));
const keyB64=Buffer.alloc(32,23).toString('base64'); // ONLY fake test key
const url='https://script.google.com/macros/s/'+targets.deploymentId+'/exec';
const google='https://script.googleusercontent.com/macros/echo?user_content_key=FAKE&lib=FAKE';
function prepared(endpoint='villages'){
 return buildOfflineValidateEnvelope({
  endpoint,rows:[syntheticReferenceRow(endpoint,manifest)],manifest,keyB64,
  runId:'synthetic-unit-0001',fetchedAtUtc:new Date().toISOString()
 });
}
function valid(endpoint){
 return {protocol:'THAIPHC_SYNC_V1',status:'VALIDATED',accepted:true,
  sheetsWrites:0,endpoint,rowCount:1,inserted:0,updated:0,unchanged:0};
}
function denied(status='INGRESS_DISABLED'){
 return {protocol:'THAIPHC_SYNC_V1',status,accepted:false,sheetsWrites:0};
}
function response(obj,init={}){
 return new Response(JSON.stringify(obj),{status:200,
  headers:{'content-type':'application/json'},...init});
}
const send=(p,fetchImpl,acknowledgement=SYNTHETIC_VALIDATE_CONFIRM)=>
 sendSyntheticValidate({prepared:p,fetchImpl,acknowledgement});

test('T009D synthetic fixture produces a valid T017 wire for only the three reference datasets',()=>{
 for(const endpoint of ['subdistricts','villages','health-services']){
  const p=prepared(endpoint);
  assert.equal(p.status,'OFFLINE_ONLY_NOT_SENT');
  assert.equal(p.rowCount,1);assert.equal(p.endpoint,endpoint);
  const b=JSON.parse(Buffer.from(p.envelope.payloadB64,'base64').toString('utf8'));
  assert.equal(b.mode,'validate');assert.equal(b.endpoint,endpoint);
  assert.equal(b.scope.provinceCode,'54');assert.equal(b.scope.districtCode,'5406');
  assert.equal(b.rows.length,1);
  assert.match(JSON.stringify(b),/SYNTHETIC/);
 }
 for(const endpoint of ['volunteer-gender','assignments','volunteer-tenure','not-known'])
  assert.throws(()=>syntheticReferenceRow(endpoint,manifest));
});

test('T009D manual POST pins existing V3; emits only redacted status and valid HMAC, no bearer',async()=>{
 let count=0;
 for(const endpoint of ['subdistricts','villages','health-services']){
  const p=prepared(endpoint);
  const r=await send(p,async (target,opts)=>{
   count++;
   assert.equal(target,url);
   assert.equal(opts.method,'POST');
   assert.equal(opts.redirect,'manual');
   assert.equal(opts.credentials,'omit');
   assert.equal(opts.referrerPolicy,'no-referrer');
   assert.equal(opts.cache,'no-store');
   assert.equal(opts.headers.Accept,'application/json');
   assert.equal(opts.headers['Content-Type'],'application/json');
   assert.equal(opts.headers.Authorization,undefined);
   const wire=JSON.parse(opts.body);
   assert.deepEqual(Object.keys(wire),
    ['version','timestamp','nonce','payloadB64','signature']);
   assert.equal(wire.version,'THAIPHC_SYNC_V1');
   const batch=JSON.parse(Buffer.from(wire.payloadB64,'base64').toString('utf8'));
   assert.equal(batch.mode,'validate');
   assert.equal(batch.endpoint,endpoint);
   assert.equal(wire.signature,createHmac('sha256',Buffer.from(keyB64,'base64'))
    .update(wire.version+'\n'+wire.timestamp+'\n'+wire.nonce+'\n'+wire.payloadB64)
    .digest('base64'));
   return response(valid(endpoint));
  });
  assert.equal(r.status,'VALIDATED');assert.equal(r.accepted,true);
  assert.equal(r.appsScriptPosts,1);assert.equal(r.networkRequests,1);
  assert.equal(r.sheetsWrites,0);assert.equal(r.rowCount,1);
  assert.equal(r.mode,'MANUAL_VALIDATE_ONLY');
  assert.doesNotMatch(JSON.stringify(r),/payloadB64|signature|FAKE|SYNTHETIC|script\.google/);
 }
 assert.equal(count,3);
});

test('T009D 302/303 Google ContentService redirect is HTTPS-only GET with no POST body',async()=>{
 for(const redirectCode of [302,303]){
  const calls=[];
  const p=prepared();
  const r=await send(p,async(target,opts)=>{
   calls.push({target,opts});
   if(calls.length===1){
    assert.equal(target,url);
    assert.equal(opts.method,'POST');
    return new Response('HTML redirect',{status:redirectCode,headers:{Location:google,'Content-Type':'text/html'}});
   }
   assert.equal(target,google);
   assert.equal(opts.method,'GET');
   assert.equal(opts.redirect,'error');
   assert.equal(opts.credentials,'omit');
   assert.equal('body' in opts,false);
   assert.equal('Authorization' in opts.headers,false);
   assert.equal('Content-Type' in opts.headers,false);
   return response(valid('villages'));
  });
  assert.equal(r.status,'VALIDATED');
  assert.equal(r.appsScriptPosts,1);
  assert.equal(r.networkRequests,2);
  assert.equal(calls.length,2);
  assert.doesNotMatch(JSON.stringify(r),/user_content_key|FAKE/);
 }
});

test('T009D denial gate stops all network traffic before fetching',async()=>{
 let calls=0;
 const p=prepared();
 const no=await send(p,async()=>{calls++;throw Error('MUST_NOT_REQUEST');},'NOT APPROVED');
 assert.equal(no.status,'MANUAL_CONFIRMATION_REQUIRED');
 assert.equal(no.appsScriptPosts,0);assert.equal(no.networkRequests,0);
 assert.equal(calls,0);
 const pCommit={...p,envelope:{...p.envelope,payloadB64:
  Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(p.envelope.payloadB64,'base64')),mode:'commit'})).toString('base64')}};
 const blocked=await send(pCommit,async()=>{calls++;return response(valid('villages'));});
 assert.equal(blocked.status,'INPUT_REJECTED');
 assert.equal(blocked.appsScriptPosts,0);assert.equal(calls,0);
});

test('T009D refuses arbitrary redirect host, port, HTTP downgrade and POST-preserving status',async()=>{
 const candidates=[
  ['https://fake.invalid/macros/echo?key=x',302],
  ['https://script.googleusercontent.com.attacker.invalid/macros/echo?k=x',302],
  ['http://script.googleusercontent.com/macros/echo?k=x',302],
  ['https://script.googleusercontent.com:8443/macros/echo?k=x',303],
  [google,307],[google,308],[google,301]
 ];
 for(const [target,status] of candidates){
  let calls=0;
  const r=await send(prepared(),async ()=>{
   calls++;return new Response(null,{status,headers:{Location:target}});
  });
  assert.equal(r.status,'REDIRECT_REJECTED');assert.equal(r.accepted,false);
  assert.equal(calls,1);assert.equal(r.appsScriptPosts,1);
  assert.equal(r.networkRequests,1);
  assert.doesNotMatch(JSON.stringify(r),/attacker|user_content_key|FAKE/);
 }
});

test('T009D no retry after network ambiguity, failures never echo secrets',async()=>{
 let count=0;
 const r=await send(prepared(),async()=>{
  count++;throw Error('Bearer FAKESECRET HTTPS='+google);
 });
 assert.equal(r.status,'REQUEST_FAILED');
 assert.equal(count,1);assert.equal(r.appsScriptPosts,1);
 assert.doesNotMatch(JSON.stringify(r),/FAKESECRET|Bearer|HTTPS|user_content_key/);
});

test('T009D HTTP 200 alone cannot mask logical rejection or unsafe commit',async()=>{
 for(const [obj,status] of [
  [denied(),'INGRESS_DISABLED'],
  [denied('AUTH_FAILED'),'AUTH_FAILED'],
  [valid('subdistricts'),'UNSAFE_RESPONSE'],
  [{...valid('villages'),sheetsWrites:2},'UNSAFE_RESPONSE'],
  [{...valid('villages'),status:'COMMITTED'},'UNSAFE_COMMIT_RESPONSE']
 ]){
  const r=await send(prepared(),async()=>response(obj));
  assert.equal(r.status,status);
  assert.equal(r.accepted,false);
  assert.equal(r.sheetsWrites,0);
 }
});

test('T009D HTML login, incorrect content type, oversized body and bad JSON are rejected',async()=>{
 const failures=[
  new Response('LOGIN_HTML',{status:200,headers:{'content-type':'text/html'}}),
  new Response('{broken',{status:200,headers:{'content-type':'application/json'}}),
  new Response('x'.repeat(16385),{status:200,headers:{'content-type':'application/json'}}),
  new Response('denied',{status:403,headers:{'content-type':'text/plain'}})
 ];
 for(const r of failures){
  const o=await send(prepared(),async()=>r);
  assert.equal(o.accepted,false);
  assert.equal(o.sheetsWrites,0);
  assert.doesNotMatch(JSON.stringify(o),/LOGIN_HTML|broken|denied|xxxx/);
 }
});

class FakeTTY extends EventEmitter{
 constructor(){super();this.isTTY=true;this.isRaw=false;this.paused=false;}
 setRawMode(x){this.isRaw=x;}
 pause(){this.paused=true;}
 resume(){this.paused=false;}
 isPaused(){return this.paused;}
}
function fakeTTY(confirm=SYNTHETIC_VALIDATE_CONFIRM,key=keyB64){
 const input=new FakeTTY(),output={isTTY:true,write(message){
  if(message.includes('Type POST SYNTHETIC VALIDATE'))
   queueMicrotask(()=>input.emit('data',Buffer.from(confirm+'\r')));
  if(message.includes('Paste destination HMAC'))
   queueMicrotask(()=>input.emit('data',Buffer.from(key+'\r')));
  return true;
 }};
 return {input,output};
}

test('T009D manual CLI sends only synthetic validate after hidden TTY confirmation',async()=>{
 const output=[];let count=0;
 const result=await main(
  ['send-validate','--synthetic','--endpoint','villages','--acknowledge-synthetic-post'],
  x=>output.push(x),{
   ...fakeTTY(),
   fetchImpl:async (target,opts)=>{
    count++;assert.equal(target,url);
    const wire=JSON.parse(opts.body);
    assert.equal(JSON.parse(Buffer.from(wire.payloadB64,'base64')).mode,'validate');
    return response(valid('villages'));
   }
  }
 );
 assert.equal(result,0);assert.equal(count,1);
 const report=JSON.parse(output[0]);
 assert.equal(report.status,'VALIDATED');
 assert.equal(report.sheetsWrites,0);
 assert.doesNotMatch(output.join(''),/payloadB64|signature|SYNTHETIC|FAKE|Bearer/);
});

test('T009D CLI invalid flags and confirmation never produce any network request',async()=>{
 let count=0;const logs=[];
 for(const args of [
  ['send-validate','--endpoint','villages','--acknowledge-synthetic-post'],
  ['send-validate','--synthetic','--endpoint','volunteer-gender','--acknowledge-synthetic-post'],
  ['send-validate','--synthetic','--endpoint','villages','--acknowledge-synthetic-post','--url','https://evil.invalid'],
  ['send-validate','--synthetic','--endpoint','villages','--acknowledge-synthetic-post','--max-pages','2'],
  ['send-validate','--synthetic','--endpoint','villages'],
  ['sync-plan','--synthetic']
 ]){
  const code=await main(args,x=>logs.push(x),{fetchImpl:async()=>{count++;}});
  assert.equal(code,2);
 }
 const invalid=await main(
  ['send-validate','--synthetic','--endpoint','villages','--acknowledge-synthetic-post'],
  x=>logs.push(x),{...fakeTTY('NOT APPROVED'),fetchImpl:async()=>{count++;}}
 );
 assert.equal(invalid,2);assert.equal(count,0);
 assert.ok(logs.every(x=>!x.includes('FAKESECRET')));
});

test('T009D never changes deployed receiver, Sheet config, or exposes a commit option',()=>{
 const code=readFileSync(new URL('../src/sync/manual-validate-transport.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(code,/mode\s*:\s*['"]commit['"]|SpreadsheetApp|UrlFetchApp|writeFileSync/);
 assert.ok(code.includes("redirect:method==='POST'?'manual':'error'"));
 assert.ok(code.includes('isSafeGoogleContentRedirect'));
 assert.notEqual(targets.deploymentId,'AKfycbwVnsHsWXRP_VliCUmOQ0bpRaHqjlR8YDe_JFUf39hRtBBiTknpXaGDESZTzCfQYLmDlg');
});
