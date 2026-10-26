import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildOfflineValidateEnvelope} from '../src/sync/offline-validate-envelope.mjs';
import {simulateValidateHttp} from '../src/sync/synthetic-http-validate.mjs';

const manifest=JSON.parse(readFileSync(new URL('../docs/sheets-schema.json',import.meta.url),'utf8'));
const cfg=JSON.parse(readFileSync(new URL('../config/thaiphc-targets.json',import.meta.url),'utf8'));
const secret=Buffer.alloc(32,22).toString('base64'); // synthetic test-only key
function sample(api){
 const d=manifest.datasets.find(x=>x.api===api);
 const x=Object.create(null);
 for(const f of d.fields){
  if(f.observed_kind==='null_only'||f.observed_kind==='string_or_null')x[f.source_field]=null;
  else if(f.observed_kind==='integer')x[f.source_field]=1;
  else if(f.observed_kind==='number')x[f.source_field]=0;
  else if(f.observed_kind==='object')x[f.source_field]={name_th:'SYNTHETIC'};
  else if(f.observed_kind==='array')x[f.source_field]=[];
  else if(f.observed_kind==='string')x[f.source_field]='SYNTHETIC';
 }
 if(api==='subdistricts'){
  x.code='540601';x.id=x.code;x.district_code='5406';
 }else if(api==='villages'){
  x.code='540601001';x.id=x.code;x.village_code_8digit='54060101';
  x.subdistrict_code='540601';x.district_code='5406';x.province_code='54';
 }else{
  x.health_service_code='SYNTHETIC-HS-1';x.legacy_5digit_code='00001';
  x.legacy_9digit_code='000000001';x.village_no='หมู่ 4';
  x.province={province_code:'54'};x.district={district_code:'5406'};
  x.subdistrict={subdistrict_code:'540601'};x.latitude=0;x.longitude=0;
  x.health_service_type={id:'SYNTHETIC'};x.service_areas=[];
 }
 return x;
}
const prepared=(endpoint='villages')=>buildOfflineValidateEnvelope({
 endpoint,rows:[sample(endpoint)],manifest,keyB64:secret,
 runId:'synthetic-run-0001',fetchedAtUtc:new Date().toISOString()
});
const VALIDATED=(endpoint,rowCount=1)=>({
 protocol:'THAIPHC_SYNC_V1',status:'VALIDATED',accepted:true,
 sheetsWrites:0,endpoint,rowCount,inserted:0,updated:0,unchanged:0
});
const rejectReply=(status='INGRESS_DISABLED')=>({
 protocol:'THAIPHC_SYNC_V1',status,accepted:false,sheetsWrites:0
});
const ok=(body,other={})=>({
 status:200,headers:{'content-type':'application/json; charset=utf-8'},
 body:JSON.stringify(body),...other
});
const redirect=(location='https://script.googleusercontent.com/macros/echo?user_content_key=SYNTHETIC&lib=TEST',status=302)=>({
 status,headers:{Location:location},body:'<html>Moved Temporarily</html>'
});
const run=(p, ...exchanges)=>simulateValidateHttp({prepared:p,exchanges});

test('T018 pinned target is user-confirmed Web App V3, never Library V2 or arbitrary URL',()=>{
 assert.equal(cfg.scriptId,'131WvR9DXpBFlh4snqGQG3VVV5ljkqcysRK_s0-HaKwQDnzpZs2UfCkE6');
 assert.equal(cfg.deploymentId,'AKfycbw6FbaK1XM2AEVt0vokP2Ssz-UomZMmvX1oTOSVrZCpgxUVqScDjVqc9JJfUVkRUxQFlQ');
 assert.notEqual(cfg.deploymentId,'AKfycbwVnsHsWXRP_VliCUmOQ0bpRaHqjlR8YDe_JFUf39hRtBBiTknpXaGDESZTzCfQYLmDlg');
 assert.equal(run(prepared(),ok(VALIDATED('villages'))).status,'VALIDATED');
});
test('T018 receiver VALIDATED JSON succeeds in direct 200 mock for all three references',()=>{
 for(const endpoint of ['subdistricts','villages','health-services']){
  const res=run(prepared(endpoint),ok(VALIDATED(endpoint)));
  assert.equal(res.mode,'SYNTHETIC_HTTP_ONLY');
  assert.equal(res.status,'VALIDATED');assert.equal(res.accepted,true);
  assert.equal(res.rowCount,1);assert.equal(res.endpoint,endpoint);
  assert.deepEqual(res.simulatedMethods,['POST']);
  assert.equal(res.httpStatus,200);
  assert.equal(res.networkRequests,0);assert.equal(res.appsScriptPosts,0);
  assert.equal(res.sheetsWrites,0);
 }
});
test('T018 Google ContentService 302/303 one-time redirect is GET-only with no repeat POST',()=>{
 for(const status of [302,303]){
  const res=run(prepared(),redirect(undefined,status),ok(VALIDATED('villages')));
  assert.equal(res.status,'VALIDATED');
  assert.deepEqual(res.simulatedMethods,['POST','GET']);
  assert.equal(res.networkRequests,0);
  assert.equal(res.appsScriptPosts,0);
 }
});
test('T018 logical INGRESS_DISABLED and auth failures are not mistaken for HTTP 200 success',()=>{
 for(const status of ['INGRESS_DISABLED','AUTH_FAILED','NOT_CONFIGURED','REPLAY_REJECTED','WRITE_DISABLED']){
  const res=run(prepared(),ok(rejectReply(status)));
  assert.equal(res.status,status);assert.equal(res.accepted,false);
  assert.equal(res.rowCount,0);assert.equal(res.sheetsWrites,0);
 }
});
test('T018 never treats COMMITTED, wrong dataset, row count or Sheets effects as success',()=>{
 const p=prepared();
 const invalid=[
  {...VALIDATED('villages'),rowCount:2},
  {...VALIDATED('villages'),endpoint:'subdistricts'},
  {...VALIDATED('villages'),sheetsWrites:1},
  {...VALIDATED('villages'),inserted:1},
  {...VALIDATED('villages'),accepted:false},
  {...VALIDATED('villages'),other:'SYNTHETIC'},
  {...rejectReply(),accepted:true},
  {...rejectReply(),sheetsWrites:1},
  {protocol:'THAIPHC_SYNC_V1',status:'COMMITTED',accepted:true,sheetsWrites:0}
 ];
 for(const reply of invalid){
  const res=run(p,ok(reply));
  assert.equal(res.accepted,false);
  assert.notEqual(res.status,'VALIDATED');
  assert.equal(res.sheetsWrites,0);
 }
});
test('T018 strictly rejects redirect to unknown, loop, downgrade, credentials, port, fragment or relative URL',()=>{
 const malicious=[
  'https://attacker.invalid/macros/echo?key=x',
  'https://script.googleusercontent.com.evil.invalid/macros/echo?key=x',
  'https://script.google.com/macros/s/'+cfg.deploymentId+'/exec',
  'http://script.googleusercontent.com/macros/echo?key=x',
  'https://user:pass@script.googleusercontent.com/macros/echo?key=x',
  'https://script.googleusercontent.com:444/macros/echo?key=x',
  'https://script.googleusercontent.com/macros/echo?key=x#fragment',
  'https://script.googleusercontent.com/malicious?key=x',
  'https://script.googleusercontent.com/macros/echo',
  '/macros/echo?key=x',
  'not-url'
 ];
 for(const location of malicious){
  const res=run(prepared(),redirect(location),ok(VALIDATED('villages')));
  assert.equal(res.status,'REDIRECT_REJECTED');
  assert.deepEqual(res.simulatedMethods,['POST']);
  assert.equal(res.appsScriptPosts,0);
 }
});
test('T018 refuses 301/307/308 and repeated redirect; no unsafe automatic POST resend',()=>{
 for(const status of [301,307,308]){
  const res=run(prepared(),redirect(undefined,status));
  assert.equal(res.status,'REDIRECT_REJECTED');
  assert.deepEqual(res.simulatedMethods,['POST']);
 }
 const second=run(prepared(),redirect(),redirect());
 assert.equal(second.status,'REDIRECT_REJECTED');
 assert.deepEqual(second.simulatedMethods,['POST','GET']);
});
test('T018 rejects redirect with missing Location, extra/missing scripted exchanges and malformed response steps',()=>{
 const noLocation={status:302,headers:{},body:''};
 assert.equal(run(prepared(),noLocation,ok(VALIDATED('villages'))).status,'REDIRECT_REJECTED');
 assert.equal(run(prepared(),redirect()).status,'REDIRECT_REJECTED');
 assert.equal(run(prepared(),ok(VALIDATED('villages')),ok(VALIDATED('villages'))).status,'REDIRECT_REJECTED');
 assert.throws(()=>run(prepared()),/SYNTHETIC_HTTP_INPUT_REJECTED/);
 assert.throws(()=>run(prepared(),redirect(),ok(VALIDATED('villages')),ok(VALIDATED('villages'))),
  /SYNTHETIC_HTTP_INPUT_REJECTED/);
 for(const bad of [
  {status:200,headers:{'content-type':'application/json'},body:9},
  {status:'200',headers:{'content-type':'application/json'},body:'{}'},
  {status:200,headers:{'Content-Type':'application/json','content-type':'application/json'},body:'{}'}
 ]) assert.throws(()=>run(prepared(),bad),/SYNTHETIC_HTTP_INPUT_REJECTED/);
});
test('T018 rejects HTML login, malformed JSON, missing/wrong content type, header mismatch and oversized content',()=>{
 const p=prepared();
 const tests=[
  [ok(VALIDATED('villages'),{headers:{'content-type':'text/html'}}),'CONTENT_TYPE_REJECTED'],
  [ok(VALIDATED('villages'),{headers:{}}),'CONTENT_TYPE_REJECTED'],
  [{status:200,headers:{'content-type':'application/json'},body:'{not json}'},'INVALID_JSON_RESPONSE'],
  [ok(VALIDATED('villages'),{headers:{'content-type':'application/json','content-length':'999'}}),'CONTENT_LENGTH_REJECTED'],
  [{status:200,headers:{'content-type':'application/json'},body:'x'.repeat(16385)},'SYNTHETIC_HTTP_INPUT_REJECTED']
 ];
 for(const [step,want] of tests){
  if(want==='SYNTHETIC_HTTP_INPUT_REJECTED')assert.throws(()=>run(p,step),new RegExp(want));
  else assert.equal(run(p,step).status,want);
 }
 assert.equal(run(p,{status:403,headers:{'content-type':'text/html'},body:'Sign in'}).status,'HTTP_REJECTED');
});
test('T018 only recognizes exact THAIPHC_SYNC_V1 response schema and allowed rejection statuses',()=>{
 const p=prepared();
 for(const data of [
  {...VALIDATED('villages'),protocol:'UNKNOWN'},
  {...VALIDATED('villages'),status:'SOMETHING_NEW'},
  {protocol:'THAIPHC_SYNC_V1',status:'VALIDATED',accepted:true,sheetsWrites:0},
  {protocol:'THAIPHC_SYNC_V1',status:'REJECTED',accepted:false,sheetsWrites:0,debug:'SECRET'}
 ]) assert.equal(run(p,ok(data)).status,'UNSAFE_RESPONSE');
});
test('T018 structurally refuses forged prepared envelope with commit mode or wrong geography',()=>{
 const p=prepared();
 for(const mutate of [
  b=>{b.mode='commit';},
  b=>{b.scope.districtCode='9999';},
  b=>{b.endpoint='assignments';},
  b=>{b.rows=[];}
 ]){
  const b=JSON.parse(Buffer.from(p.envelope.payloadB64,'base64').toString('utf8'));
  mutate(b);
  const fake={...p,envelope:{...p.envelope,payloadB64:Buffer.from(JSON.stringify(b),'utf8').toString('base64')}};
  assert.throws(()=>run(fake,ok(VALIDATED('villages'))),/SYNTHETIC_HTTP_INPUT_REJECTED/);
 }
 assert.throws(()=>run({...p,endpoint:'volunteer-gender'},ok(VALIDATED('villages'))),
  /SYNTHETIC_HTTP_INPUT_REJECTED/);
 assert.throws(()=>run({...p,transferApproved:true},ok(VALIDATED('villages'))),
  /SYNTHETIC_HTTP_INPUT_REJECTED/);
});
test('T018 no actual HTTP client, source bearer, CLI route or Sheets operation',()=>{
 const source=readFileSync(new URL('../src/sync/synthetic-http-validate.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\bfetch\s*\(|\bXMLHttpRequest\b|https?\.request|UrlFetchApp|SpreadsheetApp|writeFile|appendFile|console\.|process\.stdout/);
 assert.doesNotMatch(source,/mode\s*:\s*['"]commit['"]|THAIPHC_BEARER|readRealBearer/);
 const res=run(prepared(),redirect(),ok(VALIDATED('villages')));
 const text=JSON.stringify(res);
 assert.doesNotMatch(text,/payloadB64|signature|user_content_key|SYNTHETIC-HS|script\.googleusercontent|script\.google\.com/);
});
