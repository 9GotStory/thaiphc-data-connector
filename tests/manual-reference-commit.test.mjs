import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import {collectReferenceSnapshot,SNAPSHOT_CONFIRM} from '../src/sync/reference-snapshot.mjs';
import {syntheticReferenceRow} from '../src/sync/synthetic-reference-row.mjs';
import {buildOfflineCommitEnvelope,buildOfflineValidateEnvelope} from '../src/sync/offline-validate-envelope.mjs';
import {sendReferenceCommit,commitPhrase} from '../src/sync/manual-commit-transport.mjs';
import {main} from '../src/cli/index.mjs';

const manifest=JSON.parse(readFileSync(new URL('../docs/sheets-schema.json',import.meta.url),'utf8'));
const target=JSON.parse(readFileSync(new URL('../config/thaiphc-targets.json',import.meta.url),'utf8'));
const keyB64=Buffer.alloc(32,42).toString('base64'); // FAKE, not production
const bearer='FAKE_TEST_BEARER_1234567890';
const backup='SYNTHETIC_BACKUP_COPY_ID_12345678901234567890';
const url='https://script.google.com/macros/s/'+target.deploymentId+'/exec';
const redirect='https://script.googleusercontent.com/macros/echo?user_content_key=FAKE';
const counts={subdistricts:8,villages:85,'health-services':18};
function row(endpoint,i){
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
const response=(obj,status=200,headers={})=>new Response(JSON.stringify(obj),{
 status,headers:{'content-type':'application/json',...headers}
});
function data(endpoint,n=counts[endpoint]){
 return Array.from({length:n},(_,i)=>row(endpoint,i+1));
}
async function snapshot(endpoint,n=counts[endpoint]){
 const all=data(endpoint,n);
 return collectReferenceSnapshot({
  endpoint,manifest,confirm:async()=>SNAPSHOT_CONFIRM,
  getToken:async()=>bearer,
  fetchImpl:async(path)=>{
   const offset=Number(new URL(path).searchParams.get('offset')||0);
   return response(endpoint==='health-services'?
    {items:all.slice(offset,offset+10),total:n,offset,limit:10}:
    {items:all});
  }
 });
}
function prepare(snap){
 return buildOfflineCommitEnvelope({
  endpoint:snap.endpoint,rows:snap.rows,manifest,keyB64,
  runId:'commit-test-12345',fetchedAtUtc:new Date().toISOString()
 });
}
const committed=(endpoint,inserted,updated,unchanged)=>({
 protocol:'THAIPHC_SYNC_V1',status:'COMMITTED',accepted:true,
 sheetsWrites:updated+(inserted>0?1:0),
 endpoint,rowCount:counts[endpoint],inserted,updated,unchanged
});
const denial=(status='WRITE_DISABLED')=>({
 protocol:'THAIPHC_SYNC_V1',status,accepted:false,sheetsWrites:0
});
const send=(p,snap,fetchImpl,other={})=>sendReferenceCommit({
 prepared:p,snapshot:snap,acknowledgement:commitPhrase(snap.endpoint),
 backupId:backup,restoreConfirmed:true,fetchImpl,...other
});

test('T009D commit envelope uses exact signed mode=commit without altering existing validate-only builder',async()=>{
 for(const endpoint of Object.keys(counts)){
  const snap=await snapshot(endpoint),commit=prepare(snap);
  assert.equal(commit.status,'OFFLINE_COMMIT_PREPARED_NOT_SENT');
  assert.equal(commit.transferApproved,false);
  assert.equal(commit.networkRequests,0);assert.equal(commit.appsScriptPosts,0);
  const signed=commit.envelope;
  const body=JSON.parse(Buffer.from(signed.payloadB64,'base64'));
  assert.equal(body.mode,'commit');assert.equal(body.endpoint,endpoint);
  assert.equal(body.rows.length,counts[endpoint]);
  assert.equal(body.scope.provinceCode,'54');
  assert.equal(body.scope.districtCode,'5406');
  assert.equal(signed.signature,createHmac('sha256',Buffer.from(keyB64,'base64'))
   .update('THAIPHC_SYNC_V1\n'+signed.timestamp+'\n'+signed.nonce+'\n'+signed.payloadB64)
   .digest('base64'));
  const validated=buildOfflineValidateEnvelope({
   endpoint,rows:snap.rows,manifest,keyB64,
   runId:'validate-test-12345',fetchedAtUtc:new Date().toISOString()
  });
  assert.equal(JSON.parse(Buffer.from(validated.envelope.payloadB64,'base64')).mode,'validate');
 }
});

test('T009D commit sender accepts only strict receipt, never claims independently verified sheet write',async()=>{
 for(const endpoint of Object.keys(counts)){
  const snap=await snapshot(endpoint),p=prepare(snap);
  let calls=0;
  const out=await send(p,snap,async(dest,opts)=>{
   calls++;assert.equal(dest,url);
   assert.equal(opts.method,'POST');
   assert.equal(opts.redirect,'manual');
   assert.equal(opts.credentials,'omit');assert.equal(opts.cache,'no-store');
   assert.equal(opts.headers.Authorization,undefined);
   const wire=JSON.parse(opts.body),payload=JSON.parse(Buffer.from(wire.payloadB64,'base64'));
   assert.equal(payload.mode,'commit');assert.equal(payload.endpoint,endpoint);
   assert.equal(payload.rows.length,counts[endpoint]);
   assert.equal(wire.signature,createHmac('sha256',Buffer.from(keyB64,'base64'))
    .update('THAIPHC_SYNC_V1\n'+wire.timestamp+'\n'+wire.nonce+'\n'+wire.payloadB64)
    .digest('base64'));
   return response(committed(endpoint,counts[endpoint],0,0));
  });
  assert.equal(calls,1);
  assert.equal(out.status,'COMMIT_REPORTED_READBACK_REQUIRED');
  assert.equal(out.destinationReportedStatus,'COMMITTED');
  assert.equal(out.reportedInserted,counts[endpoint]);
  assert.equal(out.reportedSheetsWrites,1);
  assert.equal(out.destinationReadbackVerified,false);
  assert.equal(out.accepted,false);
  assert.equal(out.appsScriptPosts,1);
  assert.doesNotMatch(JSON.stringify(out),/payloadB64|signature|FAKE|SYNTHETIC|user_content_key|BACKUP_COPY/);
 }
});

test('T009D commit sender requires snapshot, valid distinct backup ID and confirmed restore BEFORE any network',async()=>{
 const snap=await snapshot('villages'),p=prepare(snap);
 let calls=0;
 const fetchImpl=async()=>{calls++;return response(committed('villages',85,0,0));};
 const cases=[
  {backupId:undefined},
  {backupId:target.spreadsheetId},
  {backupId:'invalid'},
  {restoreConfirmed:false},
  {acknowledgement:'WRONG'},
  {snapshot:{...snap,observedCountMatches:false}},
  {snapshot:{...snap,rowCount:84}},
  {snapshot:{...snap,completeness:'SOURCE_TOTAL_CHECKED'}},
  {snapshot:{...snap,rows:snap.rows.map((r,i)=>i===0?{...r,name_th:'TAMPERED'}:r)}},
  {prepared:{...p,status:'OFFLINE_ONLY_NOT_SENT'}},
  {prepared:{...p,envelope:{...p.envelope,payloadB64:
   Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(p.envelope.payloadB64,'base64')),mode:'validate'})).toString('base64')}}}
 ];
 for(const x of cases){
  const result=await send(p,snap,fetchImpl,x);
  assert.equal(result.appsScriptPosts,0);
  assert.equal(result.writeOutcome,'NOT_ATTEMPTED');
  assert.equal(result.accepted,false);
 }
 assert.equal(calls,0);
});

test('T009D invalid COMMITTED counters, malformed content, and REJECTED never trigger automatic retry',async()=>{
 const snap=await snapshot('subdistricts'),p=prepare(snap);
 const cases=[
  response({...committed('subdistricts',8,0,0),rowCount:7}),
  response({...committed('subdistricts',8,0,0),sheetsWrites:8}),
  response({...committed('subdistricts',8,0,0),unchanged:1}),
  response({...committed('subdistricts',8,0,0),endpoint:'villages'}),
  response({...committed('subdistricts',8,0,0),accepted:false}),
  response({...committed('subdistricts',8,0,0),unsafe:'secret'}),
  response(denial('REJECTED')),
  new Response('<html>login</html>',{status:200,headers:{'content-type':'text/html'}}),
  new Response('bad json',{status:200,headers:{'content-type':'application/json'}}),
  new Response('x'.repeat(16385),{status:200,headers:{'content-type':'application/json'}}),
  response({status:'ok'},500)
 ];
 for(const fixture of cases){
  let calls=0;
  const out=await send(p,snap,async()=>{calls++;return fixture;});
  assert.equal(calls,1);
  assert.equal(out.status,'OUTCOME_UNKNOWN_STOP');
  assert.equal(out.appsScriptPosts,1);
  assert.equal(out.writeOutcome,'STOP_VERIFY_DESTINATION');
  assert.equal(out.destinationReadbackVerified,false);
  assert.equal(out.accepted,false);
 }
});

test('T009D parsed denial distinguishes no-write server report from unknown write, but never retries',async()=>{
 const snap=await snapshot('villages'),p=prepare(snap);
 for(const code of ['INGRESS_DISABLED','WRITE_DISABLED','AUTH_FAILED','LOCK_BUSY','REPLAY_REJECTED']){
  let calls=0;
  const out=await send(p,snap,async()=>{calls++;return response(denial(code));});
  assert.equal(calls,1);assert.equal(out.status,'DENIED_STOP');
  assert.equal(out.destinationReportedStatus,code);
  assert.equal(out.writeOutcome,'REPORTED_PREWRITE_DENIAL');
  assert.equal(out.destinationReadbackVerified,false);
 }
 let calls=0;
 const unknown=await send(p,snap,async()=>{
  calls++;throw Error('Bearer SECRET '+redirect);
 });
 assert.equal(calls,1);assert.equal(unknown.status,'OUTCOME_UNKNOWN_STOP');
 assert.equal(unknown.appsScriptPosts,1);
 assert.doesNotMatch(JSON.stringify(unknown),/SECRET|Bearer|user_content_key/);
});

test('T009D Google redirect sends bodyless GET only to allowlisted destination',async()=>{
 const snap=await snapshot('subdistricts'),p=prepare(snap),methods=[];
 const good=await send(p,snap,async(dest,opts)=>{
  methods.push(opts.method);
  if(methods.length===1){
   assert.equal(dest,url);
   return new Response(null,{status:302,headers:{location:redirect}});
  }
  assert.equal(dest,redirect);assert.equal(opts.method,'GET');
  assert.equal(opts.body,undefined);assert.equal(opts.headers.Authorization,undefined);
  assert.equal(opts.redirect,'error');
  return response(committed('subdistricts',0,2,6));
 });
 assert.deepEqual(methods,['POST','GET']);
 assert.equal(good.reportedUpdated,2);
 assert.equal(good.reportedSheetsWrites,2);
 assert.equal(good.networkRequests,2);
 for(const [status,location] of [[302,'https://evil.invalid/'],[307,redirect],[308,redirect]]){
  let n=0;
  const out=await send(p,snap,async()=>{
   n++;return new Response(null,{status,headers:{location}});
  });
  assert.equal(n,1);assert.equal(out.status,'OUTCOME_UNKNOWN_STOP');
  assert.equal(out.appsScriptPosts,1);
 }
});

class FakeTTY extends EventEmitter{
 constructor(){super();this.isTTY=true;this.isRaw=false;this.paused=false;}
 setRawMode(v){this.isRaw=v;}
 pause(){this.paused=true;}
 resume(){this.paused=false;}
 isPaused(){return this.paused;}
}
function tty(overrides={}){
 const input=new FakeTTY(),prompts=[];
 const values={
  backupPhrase:'BACKUP VERIFIED RESTORE TESTED 5406',
  backup,
  confirm:commitPhrase('subdistricts'),bearer,hmac:keyB64,...overrides
 };
 const output={isTTY:true,write(msg){
  prompts.push(msg);
  let value=null;
  if(msg.includes('Type BACKUP VERIFIED RESTORE TESTED'))value=values.backupPhrase;
  if(msg.includes('Paste ID of separate verified'))value=values.backup;
  if(msg.includes('Type COMMIT '))value=values.confirm;
  if(msg.includes('Paste authorized Bearer'))value=values.bearer;
  if(msg.includes('Paste destination HMAC'))value=values.hmac;
  if(value!==null)queueMicrotask(()=>input.emit('data',Buffer.from(value+'\r')));
  return true;
 }};
 return {input,output,prompts};
}
test('T009D CLI with verified fake backup obtains hidden credentials, sends one synthetic mocked real-reference commit and requires readback',async()=>{
 const io=tty(),logs=[];let source=0,dest=0;
 const exit=await main(
  ['send-reference-commit','--endpoint','subdistricts','--acknowledge-reference-commit'],
  x=>logs.push(x),{...io,fetchImpl:async(target,opts)=>{
   if(target===url){
    dest++;assert.equal(opts.method,'POST');
    const p=JSON.parse(Buffer.from(JSON.parse(opts.body).payloadB64,'base64'));
    assert.equal(p.mode,'commit');
    assert.equal(p.rows.length,8);
    return response(committed('subdistricts',8,0,0));
   }
   source++;assert.equal(opts.method,'GET');
   return response({items:data('subdistricts')});
  }}
 );
 assert.equal(exit,2); // deliberate: operator readback is still required
 assert.equal(source,1);assert.equal(dest,1);
 assert.equal(io.input.isRaw,false);
 const parsed=JSON.parse(logs[0]);
 assert.equal(parsed.status,'COMMIT_REPORTED_READBACK_REQUIRED');
 assert.equal(parsed.destinationReadbackVerified,false);
 assert.equal(parsed.sourceNetworkRequests,1);
 assert.doesNotMatch(logs.join(''),/payloadB64|signature|FAKE|SYNTHETIC|BACKUP_COPY|Bearer/);
});
test('T009D CLI invalid flags and wrong backup phrase block before ANY source/target request',async()=>{
 const bad=[
  ['send-reference-commit','--endpoint','subdistricts'],
  ['send-reference-commit','--endpoint','volunteer-gender','--acknowledge-reference-commit'],
  ['send-reference-commit','--endpoint','subdistricts','--acknowledge-reference-commit','--url','https://evil.invalid'],
  ['send-reference-commit','--endpoint','subdistricts','--acknowledge-reference-commit','--token','SECRET'],
  ['send-reference-commit','--endpoint','subdistricts','--acknowledge-reference-commit','--max-pages','2'],
  ['send-reference-commit','--endpoint','subdistricts','--acknowledge-reference-commit','--acknowledge-reference-validate'],
  ['audit-source','--endpoint','subdistricts','--acknowledge-authorized-use','--acknowledge-reference-commit']
 ];
 let calls=0;
 for(const args of bad){
  const code=await main(args,()=>{}, {fetchImpl:async()=>{calls++;}});
  assert.equal(code,2);
 }
 for(const overrides of [{backupPhrase:'WRONG'}, {backup:target.spreadsheetId}, {confirm:'WRONG'}]){
  const io=tty(overrides);
  const code=await main(
   ['send-reference-commit','--endpoint','subdistricts','--acknowledge-reference-commit'],
   ()=>{}, {...io,fetchImpl:async()=>{calls++;}});
  assert.equal(code,2);
  assert.equal(io.input.isRaw,false);
 }
 assert.equal(calls,0);
});
