import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {planExtendedBatches} from '../src/sync/extended-batch-plan.mjs';
import {sendExtendedReport,extendedCommitPhrase,buildExtendedReportWire} from '../src/sync/extended-report-transport.mjs';
const key=Buffer.alloc(32,44).toString('base64');
const plan=(n=27)=>planExtendedBatches({
 mode:'IN_MEMORY_MINIMIZED_REPORT_NOT_SENT',
 endpoint:'assignments',runId:'private-run-2026-01',rowCount:n,
 privacyState:'PERSON_DATA_STORAGE_APPROVAL_REQUIRED',
 destinationSchema:['districtCode','status'],
 sourceIdentityStrategy:'HMAC_SHA256_PERSON_ID',
 rows:Array.from({length:n},(_,i)=>({key:'h1_'+String(i).padStart(64,'0'),
  values:{districtCode:'5406',status:'ACTIVE'}})),
 writeAuthorized:false,appsScriptPosts:0,sheetsWrites:0
});
function fixture(p,{badAt=0,unknownAt=0}={}){
 let posts=0,gets=0;
 const sent=[];
 const fetchImpl=async(url,options)=>{
  if(options.method==='GET'){gets++;throw Error('NO_REDIRECT_EXPECTED');}
  posts++;
  assert.equal(options.method,'POST');assert.equal(options.redirect,'manual');
  assert.equal(options.credentials,'omit');
  assert.equal(new URL(url).origin,'https://script.google.com');
  const signed=JSON.parse(options.body);
  assert.deepEqual(Object.keys(signed).sort(),['version','timestamp','nonce','payloadB64','signature'].sort());
  assert.equal(signed.version,'THAIPHC_SYNC_V1');
  const expected=createHmac('sha256',Buffer.from(key,'base64'))
   .update('THAIPHC_SYNC_V1\n'+signed.timestamp+'\n'+signed.nonce+'\n'+signed.payloadB64).digest('base64');
  assert.equal(signed.signature,expected);
  const body=JSON.parse(Buffer.from(signed.payloadB64,'base64'));
  assert.equal(body.endpoint,p.endpoint);
  assert.equal(body.runId,p.runId);
  assert.equal(body.scope.districtCode,'5406');
  sent.push(body.mode);
  if(unknownAt===posts)throw Error('NETWORK_AMBIGUOUS');
  const status=badAt===posts?'REJECTED':
   body.mode==='report-start'?'REPORT_STARTED':
   body.mode==='report-chunk'?'REPORT_CHUNK_STAGED':'REPORT_FINALIZED';
  return new Response(JSON.stringify({
   protocol:'THAIPHC_SYNC_V1',status,
   accepted:status!=='REJECTED',endpoint:p.endpoint,runId:p.runId,
   sheetsWrites:status==='REPORT_STARTED'?2:
    status==='REPORT_FINALIZED'?3:1,
   ...(body.mode==='report-chunk'?{ordinal:body.ordinal}:{}),
   rowCount:body.mode==='report-finalize'?p.sourceRows:
    body.mode==='report-start'?0:p.chunks[body.ordinal-1].rowCount
  }),{status:200,headers:{'content-type':'application/json'}});
 };
 return {fetchImpl,sent,get posts(){return posts},get gets(){return gets}};
}
test('F010 signed 27-row multi-stage transmission sends 4 exact signed POSTs; never accepts until independent readback',async()=>{
 const p=plan(),f=fixture(p);
 const result=await sendExtendedReport({
  plan:p,keyB64:key,acknowledgement:extendedCommitPhrase(p),fetchImpl:f.fetchImpl
 });
 assert.deepEqual(f.sent,['report-start','report-chunk','report-chunk','report-finalize']);
 assert.equal(f.posts,4);assert.equal(f.gets,0);
 assert.equal(result.appsScriptPosts,4);
 assert.equal(result.networkRequests,4);
 assert.equal(result.status,'REPORT_FINALIZED_READBACK_REQUIRED');
 assert.equal(result.destinationReadbackVerified,false);
 assert.equal(result.accepted,false);
 assert.equal(result.rowCount,27);
 assert.equal(result.manifestDigest,p.manifestDigest);
 assert.doesNotMatch(JSON.stringify(result),/payloadB64|signature|ACTIVE|private-run-2026-01/);
});
test('F010 stage failure stops without retry or finalize, even on unknown server result',async()=>{
 for(const mode of [{badAt:3},{unknownAt:2}]){
  const p=plan(),f=fixture(p,mode);
  const result=await sendExtendedReport({
   plan:p,keyB64:key,acknowledgement:extendedCommitPhrase(p),fetchImpl:f.fetchImpl
  });
  assert.equal(result.status,'STAGE_OUTCOME_UNKNOWN_STOP');
  assert.equal(result.appsScriptPosts,f.posts);
  assert.ok(f.posts<=3);
  assert.equal(f.sent.includes('report-finalize'),false);
  assert.equal(result.accepted,false);
 }
});
test('F010 wrong operator acknowledgement or tampered manifest sends no POST',async()=>{
 const p=plan(),f=fixture(p);
 assert.equal((await sendExtendedReport({
  plan:p,keyB64:key,acknowledgement:'NO',fetchImpl:f.fetchImpl
 })).status,'CONFIRMATION_REQUIRED');
 assert.equal(f.posts,0);
 const bad={...p,manifestDigest:'f'.repeat(64)};
 assert.equal((await sendExtendedReport({
  plan:bad,keyB64:key,acknowledgement:extendedCommitPhrase(bad),fetchImpl:f.fetchImpl
 })).status,'TRANSFER_INPUT_REJECTED');
 assert.equal(f.posts,0);
});
test('F010 report signatures are unique per stage, data never persisted by offline builder',()=>{
 const p=plan(1);
 const start=buildExtendedReportWire(p,'start',key),c=buildExtendedReportWire(p,1,key);
 assert.notEqual(start.nonce,c.nonce);
 assert.equal(JSON.parse(Buffer.from(c.payloadB64,'base64')).mode,'report-chunk');
 assert.equal(JSON.parse(Buffer.from(start.payloadB64,'base64')).sourceRows,1);
 assert.equal(p.appsScriptPosts,0);
 assert.equal(p.sheetsWrites,0);
});

test('F010 safe ContentService redirect is GET-only; nondefault ports cannot receive a stage',async()=>{
 const p=plan(1),f=fixture(p),seen=[];
 const location='https://script.googleusercontent.com/macros/echo?user_content_key=SYNTHETIC';
 let receipt;
 const result=await sendExtendedReport({
  plan:p,keyB64:key,acknowledgement:extendedCommitPhrase(p),
  fetchImpl:async(url,options)=>{
   seen.push([url,options.method]);
   if(options.method==='POST'){
    receipt=await f.fetchImpl(url,options);
    return new Response(null,{status:302,headers:{location}});
   }
   assert.equal(url,location);assert.equal(options.body,undefined);
   assert.equal(options.headers.Authorization,undefined);
   return receipt;
  }
 });
 assert.equal(result.status,'REPORT_FINALIZED_READBACK_REQUIRED');
 assert.equal(seen.filter(x=>x[1]==='POST').length,3);
 assert.equal(seen.filter(x=>x[1]==='GET').length,3);
 const blocked=plan(1);let calls=0;
 const denied=await sendExtendedReport({
  plan:blocked,keyB64:key,acknowledgement:extendedCommitPhrase(blocked),
  fetchImpl:async()=>{calls++;return new Response(null,{status:302,
   headers:{location:'https://script.googleusercontent.com:8443/macros/echo?user_content_key=SYNTHETIC'}});
  }
 });
 assert.equal(denied.status,'STAGE_OUTCOME_UNKNOWN_STOP');assert.equal(calls,1);
});
test('F010 exact stage receipts reject extra fields, wrong write counts and wrong chunk row counts',async()=>{
 for(const failure of ['extra','writes','chunk-rows']){
  const p=plan(),f=fixture(p);
  const result=await sendExtendedReport({
   plan:p,keyB64:key,acknowledgement:extendedCommitPhrase(p),
   fetchImpl:async(url,options)=>{
    const receipt=await(await f.fetchImpl(url,options)).json();
    if(failure==='extra')receipt.extra='PRIVATE_NOT_FOR_OUTPUT';
    if(failure==='writes')receipt.sheetsWrites=1;
    if(failure==='chunk-rows'&&receipt.status==='REPORT_CHUNK_STAGED')receipt.rowCount=999;
    return new Response(JSON.stringify(receipt),{headers:{'content-type':'application/json'}});
   }
  });
  assert.equal(result.status,'STAGE_OUTCOME_UNKNOWN_STOP');
  assert.equal(f.posts,failure==='chunk-rows'?2:1);
  assert.equal(f.sent.includes('report-finalize'),false);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE_NOT_FOR_OUTPUT/);
 }
});
test('F010 failed stage plans cannot be submitted a second time',async()=>{
 const p=plan(),f=fixture(p,{unknownAt:1});
 const first=await sendExtendedReport({plan:p,keyB64:key,
  acknowledgement:extendedCommitPhrase(p),fetchImpl:f.fetchImpl});
 assert.equal(first.status,'STAGE_OUTCOME_UNKNOWN_STOP');assert.equal(f.posts,1);
 const second=await sendExtendedReport({plan:p,keyB64:key,
  acknowledgement:extendedCommitPhrase(p),fetchImpl:f.fetchImpl});
 assert.equal(second.status,'TRANSFER_ALREADY_ATTEMPTED');
 assert.equal(second.appsScriptPosts,0);assert.equal(f.posts,1);
});
test('F010 chunk plans own immutable copies of row data and manifest arrays',()=>{
 const row={key:'h1_'+'a'.repeat(64),values:{districtCode:'5406',status:'ACTIVE'}};
 const fields=['districtCode','status'];
 const p=planExtendedBatches({
  mode:'IN_MEMORY_MINIMIZED_REPORT_NOT_SENT',endpoint:'assignments',runId:'immutable-plan-1',
  rowCount:1,privacyState:'PERSON_DATA_STORAGE_APPROVAL_REQUIRED',
  destinationSchema:fields,sourceIdentityStrategy:'HMAC_SHA256_PERSON_ID',rows:[row],
  writeAuthorized:false,appsScriptPosts:0,sheetsWrites:0
 });
 row.values.status='MUTATED';fields.push('citizenId');
 assert.equal(p.chunks[0].rows[0].values.status,'ACTIVE');
 assert.deepEqual(p.runFingerprint.destinationFields,['districtCode','status']);
 assert.throws(()=>{p.chunks[0].rows[0].key='OTHER';},TypeError);
 assert.throws(()=>{p.runFingerprint.chunkDigests[0]='0'.repeat(64);},TypeError);
});

test('F010 exact destination and switch rejections expose only safe codes and still stop without retry',async()=>{
 for(const status of ['REPORT_DESTINATION_NOT_CONFIGURED','INGRESS_DISABLED','WRITE_DISABLED','PERSON_DATA_WRITE_DISABLED','AUTH_FAILED']){
  const p=plan(1);let calls=0;
  const result=await sendExtendedReport({plan:p,keyB64:key,acknowledgement:extendedCommitPhrase(p),
   fetchImpl:async()=>{calls++;return new Response(JSON.stringify({
    protocol:'THAIPHC_SYNC_V1',status,accepted:false,sheetsWrites:0,
    ...(status==='REPORT_DESTINATION_NOT_CONFIGURED'?{endpoint:p.endpoint,runId:p.runId}:{})
   }),{headers:{'content-type':'application/json'}});}
  });
  assert.equal(result.status,'STAGE_OUTCOME_UNKNOWN_STOP');assert.equal(result.receiverStatus,status);
  assert.equal(result.accepted,false);assert.equal(calls,1);assert.equal(result.stage,'start');
  assert.equal((await sendExtendedReport({plan:p,keyB64:key,acknowledgement:extendedCommitPhrase(p),
   fetchImpl:async()=>{calls++;throw Error('MUST_NOT_RETRY')}})).status,'TRANSFER_ALREADY_ATTEMPTED');
  assert.equal(calls,1);
 }
});

test('F010 untrusted rejection fields, identities and statuses are never echoed as diagnostics',async()=>{
 for(const mutate of [
  r=>{r.privateValue='PRIVATE_NOT_FOR_OUTPUT'},r=>{r.endpoint='PRIVATE_ENDPOINT'},
  r=>{r.runId='PRIVATE_RUN'},r=>{r.accepted='false'},r=>{r.sheetsWrites=1},
  r=>{r.status='PRIVATE_STATUS'},r=>{r.rowCount=0}
 ]){
  const p=plan(1);
  const result=await sendExtendedReport({plan:p,keyB64:key,acknowledgement:extendedCommitPhrase(p),
   fetchImpl:async()=>{
    const r={protocol:'THAIPHC_SYNC_V1',status:'REPORT_DESTINATION_NOT_CONFIGURED',
     accepted:false,sheetsWrites:0,endpoint:p.endpoint,runId:p.runId};mutate(r);
    return new Response(JSON.stringify(r),{headers:{'content-type':'application/json'}});
   }});
  assert.equal(result.status,'STAGE_OUTCOME_UNKNOWN_STOP');assert.equal(result.receiverStatus,undefined);
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE_/);
 }
});

test('F010 a destination rejection after staging starts retains reconciliation and never finalizes',async()=>{
 const p=plan(),f=fixture(p);
 const result=await sendExtendedReport({plan:p,keyB64:key,acknowledgement:extendedCommitPhrase(p),
  fetchImpl:async(url,options)=>{
   if(f.posts===0)return f.fetchImpl(url,options);
   const b=JSON.parse(Buffer.from(JSON.parse(options.body).payloadB64,'base64').toString('utf8'));
   return new Response(JSON.stringify({protocol:'THAIPHC_SYNC_V1',status:'REPORT_DESTINATION_NOT_CONFIGURED',
    accepted:false,sheetsWrites:0,endpoint:p.endpoint,runId:p.runId,ordinal:b.ordinal,rowCount:b.rowCount}),
    {headers:{'content-type':'application/json'}});
  }});
 assert.equal(result.status,'STAGE_OUTCOME_UNKNOWN_STOP');assert.equal(result.receiverStatus,'REPORT_DESTINATION_NOT_CONFIGURED');
 assert.equal(result.stage,'chunk');assert.equal(result.ordinal,1);assert.equal(result.appsScriptPosts,2);
 assert.equal(result.recoveryStrategy,'READBACK_AND_RECONCILE_NO_AUTOMATIC_RETRY');
 assert.deepEqual(f.sent,['report-start']);
});
