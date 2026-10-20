import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {CONFIRM_PHRASE,isCandidateRealBearer,confirmLiveUseFromTTY,readRealBearerFromTTY} from '../src/cli/live-tty.mjs';
import {LIVE_ORIGIN,liveFetchSubdistricts} from '../src/cli/live-fetch.mjs';
import {main} from '../src/cli/index.mjs';

const TOKEN='TEST_ONLY_LOCAL_NOT_A_REAL_TOKEN_0123456789';
function rows(){
 return Array.from({length:8},(_,i)=>{
  const code='54060'+String(i+1);
  return {code,id:code,name_th:'SYNTHETIC',district_code:'5406',
   name_en:'synthetic',district_name_th:'SYNTHETIC',
   province_code:null,province_name_th:null,province_name_en:null};
 });
}
const jsonResponse=(object,status=200,headers={})=>
 new Response(JSON.stringify(object),{status,headers:{'content-type':'application/json',...headers}});
const fakeFetch=(handler)=>async(url,opts)=>handler(url,opts);
function invoke(fetchImpl,getToken=async()=>TOKEN,confirm=async()=>CONFIRM_PHRASE){
 return liveFetchSubdistricts({fetchImpl,getToken,confirm});
}
class FakeTTY extends EventEmitter{
 constructor(){super();this.isTTY=true;this.isRaw=false;this.history=[];this.paused=false;}
 setRawMode(v){this.isRaw=v;this.history.push(v);}
 resume(){this.paused=false;}
 pause(){this.paused=true;}
 isPaused(){return this.paused;}
}
function tty(){
 const input=new FakeTTY(),written=[];
 const output={isTTY:true,write(x){written.push(x);return true;}};
 return {input,output,written};
}
test('real-token candidate never accepts flags, whitespace, or mock token',()=>{
 assert.equal(isCandidateRealBearer(TOKEN),true);
 for(const candidate of ['', 'Bearer '+TOKEN, 'MOCK_ONLY_1234567890',
  'x', 'a'.repeat(8193), 'x'*2, TOKEN+'\nTOKEN2',TOKEN+'\r\nInjected: value']){
  assert.equal(isCandidateRealBearer(candidate),false);
 }
});
test('TTY-only confirmation and token entry are separate and non-echoing',async()=>{
 const io=tty();
 const confirmed=confirmLiveUseFromTTY(io);
 const confirmBuffer=Buffer.from(CONFIRM_PHRASE+'\r');
 io.input.emit('data',confirmBuffer);
 assert.equal(await confirmed,CONFIRM_PHRASE);
 assert.ok(confirmBuffer.every(b=>b===0));
 assert.equal(io.input.isRaw,false);
 const pending=readRealBearerFromTTY(io);
 const tokenBytes=Buffer.from(TOKEN+'\r');
 io.input.emit('data',tokenBytes);
 assert.equal(await pending,TOKEN);
 assert.ok(tokenBytes.every(b=>b===0));
 assert.deepEqual(io.input.history,[true,false,true,false]);
 assert.doesNotMatch(io.written.join(''),/TEST_ONLY_LOCAL|FETCH SUBDISTRICTS 5406 to confirm \(hidden\): [A-Z]/);
});
test('non-TTY, blank, cancellation, extra controls and oversized input fail',async()=>{
 const io=tty();
 await assert.rejects(()=>readRealBearerFromTTY({input:{isTTY:false},output:io.output}),/SECURE_INTERACTIVE_TTY_REQUIRED/);
 await assert.rejects(()=>confirmLiveUseFromTTY({input:io.input,output:{isTTY:false}}),/SECURE_INTERACTIVE_TTY_REQUIRED/);
 for(const input of ['\x03','\r','x'.repeat(8194),TOKEN+'\x1b']){
  const t=tty();const p=readRealBearerFromTTY(t);
  t.input.emit('data',Buffer.from(input));
  await assert.rejects(p,/TTY_INPUT_CANCELLED|INVALID_BEARER_TOKEN_FORMAT|TTY_TOO_LONG/);
  assert.equal(t.input.isRaw,false);
 }
});
test('confirmation must match phrase exactly; no token prompt on refusal',async()=>{
 const t=tty();const p=confirmLiveUseFromTTY(t);
 t.input.emit('data',Buffer.from('YES\r'));
 await assert.rejects(p,/LIVE_CONFIRMATION_REJECTED/);
 let requested=false;let network=false;
 const out=await invoke(async()=>{network=true;throw Error('network');},
 async()=>{requested=true;return TOKEN;},async()=> 'YES');
 assert.equal(out.status,'CONFIRMATION_REQUIRED');
 assert.equal(requested,false);assert.equal(network,false);
});
test('successful injected mock GET uses exact HTTPS host/GET/scope/headers and emits counts only',async()=>{
 let calls=0;
 const out=await invoke(fakeFetch((url,opts)=>{
  calls++;
  const u=new URL(url);
  assert.equal(u.origin,LIVE_ORIGIN);
  assert.equal(u.pathname,'/api/v1/lookups/subdistricts');
  assert.equal(u.search,'?district_code=5406');
  assert.equal(opts.method,'GET');
  assert.equal(opts.redirect,'error');
  assert.equal(opts.cache,'no-store');
  assert.equal(opts.credentials,'omit');
  assert.equal(opts.referrerPolicy,'no-referrer');
  assert.equal(opts.headers.Accept,'application/json');
  assert.equal(opts.headers.Authorization,'Bearer '+TOKEN);
  assert.equal(opts.signal.aborted,false);
  return jsonResponse({items:rows()});
 }));
 assert.equal(calls,1);
 assert.deepEqual(out,{mode:'LIVE_READ_ONLY',endpoint:'subdistricts',status:'PASS',success:true,httpStatus:200,count:8});
 assert.doesNotMatch(JSON.stringify(out),/TEST_ONLY|SYNTHETIC|Bearer/);
});
test('global fetch is never used with an injected offline fetch',async()=>{
 const original=globalThis.fetch;
 try{
  globalThis.fetch=()=>{throw Error('NETWORK_FORBIDDEN');};
  const out=await invoke(async()=>jsonResponse({items:rows()}));
  assert.equal(out.status,'PASS');
 }finally{globalThis.fetch=original;}
});
test('401/403 and non-200 errors disclose no error body',async()=>{
 for(const [code,expected] of [[401,'HTTP_401'],[403,'HTTP_403'],[500,'HTTP_ERROR'],[302,'HTTP_ERROR']]){
  const response=new Response('SENSITIVE_UPSTREAM_PERSON_NAME',{status:code});
  const r=await invoke(async()=>response);
  assert.equal(r.status,expected);
  assert.equal(r.httpStatus,code);
  assert.doesNotMatch(JSON.stringify(r),/SENSITIVE_UPSTREAM_PERSON_NAME|Bearer/);
 }
});
test('redirect refusal enforced even if injected fetch throws with sensitive text',async()=>{
 const r=await invoke(async(url,opts)=>{
   assert.equal(opts.redirect,'error');
   throw Error('Bearer '+TOKEN+' redirected to hostile host');
 });
 assert.equal(r.status,'REQUEST_FAILED_OR_TIMED_OUT');
 assert.doesNotMatch(JSON.stringify(r),/TEST_ONLY|hostile/);
});
test('wrong content-type/invalid JSON/missing response body are blocked',async()=>{
 const outcomes=[
  [async()=>new Response('abc',{status:200,headers:{'content-type':'text/html'}}),'UNEXPECTED_CONTENT_TYPE'],
  [async()=>new Response('invalid',{status:200,headers:{'content-type':'application/json'}}),'INVALID_JSON'],
  [async()=>({status:200,headers:new Headers({'content-type':'application/json'}),body:null}),'MISSING_RESPONSE_BODY']
 ];
 for(const [mock,status] of outcomes){
  const r=await invoke(mock);assert.equal(r.status,status);assert.equal(r.count,0);
 }
});
test('advertised oversized responses fail before reading body',async()=>{
 const r=await invoke(async()=>jsonResponse({items:rows()},200,{'content-length':'200000'}));
 assert.equal(r.status,'RESPONSE_TOO_LARGE');
});
test('streamed oversized responses fail even without Content-Length',async()=>{
 const data=' '.repeat(140000);
 const r=await invoke(async()=>new Response(data,{headers:{'content-type':'application/json'}}));
 assert.equal(r.status,'RESPONSE_TOO_LARGE');
});
test('scope error, duplicate key, missing key, and unknown fields cannot return PASS',async()=>{
 const badScope=rows();badScope[0].district_code='5407';
 const duplicate=rows();duplicate[1].code=duplicate[0].code;duplicate[1].id=duplicate[0].id;
 const unknown=rows();unknown[0].citizenId='MASKED_PERSON';
 const missing=rows();delete missing[0].name_th;
 const bad=[
  [{items:badScope},'INVALID_LOOKUP_ROW'],
  [{items:duplicate},'DUPLICATE_SOURCE_KEY'],
  [{items:unknown},'UNEXPECTED_RESPONSE_SCHEMA'],
  [{items:missing},'INVALID_LOOKUP_ROW'],
  [{items:rows(),total:8},'UNEXPECTED_RESPONSE_SCHEMA'],
  [{items:rows().concat(rows(),rows())},'DUPLICATE_SOURCE_KEY']
 ];
 for(const [payload,status] of bad){
  const r=await invoke(async()=>jsonResponse(payload));
  assert.equal(r.status,status);
  assert.equal(r.count,0);
  assert.doesNotMatch(JSON.stringify(r),/MASKED_PERSON/);
 }
});
test('unexpected request dependencies are rejected without calls or token',async()=>{
 await assert.rejects(()=>liveFetchSubdistricts({confirm:async()=>CONFIRM_PHRASE,getToken:null,fetchImpl:async()=>{}}),/LIVE_DEPENDENCY_REQUIRED/);
 const r=await invoke(async()=>{throw Error('should not call');},async()=> 'MOCK_ONLY_12345678');
 assert.equal(r.status,'INVALID_TOKEN_FORMAT');
});
test('CLI requires exact endpoint, explicit acknowledgement and rejects token flags',async()=>{
 const good=['live-fetch','--endpoint','subdistricts','--acknowledge-authorized-use'];
 for(const args of [
  ['live-fetch'],['live-fetch','--endpoint','villages','--acknowledge-authorized-use'],
  ['live-fetch','--endpoint','subdistricts'],['live-fetch','--endpoint','subdistricts','--token','SECRET'],
  ['live-fetch','--endpoint','subdistricts','--acknowledge-authorized-use','--output','raw.json'],
  ['live-fetch','--endpoint','subdistricts','--acknowledge-authorized-use','--max-pages','2'],
  ['dry-run','--acknowledge-authorized-use'],
  [...good,'--acknowledge-authorized-use']]){
   const captured=[];
   const code=await main(args,x=>captured.push(x));
   assert.equal(code,2);
   assert.doesNotMatch(captured.join(''),/SECRET|raw.json/);
 }
});
test('CLI with TTY and fake injected fetch sends one request and prints safe summary',async()=>{
 const io=tty();let callCount=0;const messages=[];
 const pending=main(['live-fetch','--endpoint','subdistricts','--acknowledge-authorized-use'],
  text=>messages.push(text),{...io,fetchImpl:async()=>{
    callCount++;return jsonResponse({items:rows()});
  }});
 io.input.emit('data',Buffer.from(CONFIRM_PHRASE+'\r'));
 await new Promise(resolve=>setImmediate(resolve));
 io.input.emit('data',Buffer.from(TOKEN+'\r'));
 assert.equal(await pending,0);
 assert.equal(callCount,1);
 assert.equal(JSON.parse(messages[0]).status,'PASS');
 assert.equal(JSON.parse(messages[0]).count,8);
 assert.doesNotMatch(messages.join(''),/TEST_ONLY|SYNTHETIC/);
});
