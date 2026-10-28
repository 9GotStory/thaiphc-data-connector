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
   ...(body.mode==='report-finalize'?{rowCount:p.sourceRows}:{})
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
