import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {planExtendedBatches} from '../src/sync/extended-batch-plan.mjs';
const sha=s=>createHash('sha256').update(s,'utf8').digest('hex');
const source=(api,n=1803)=>({
 mode:'IN_MEMORY_MINIMIZED_REPORT_NOT_SENT',
 endpoint:api,runId:'one-final-uat-run',
 rowCount:n,
 privacyState:api==='volunteer-family'?'UNVERIFIED_RELATION_KEY_WRITE_HOLD':
  api==='volunteer-gender'?'AGGREGATE_STORAGE_APPROVAL_REQUIRED':
  'PERSON_DATA_STORAGE_APPROVAL_REQUIRED',
 destinationSchema:['districtCode','status'],
 sourceIdentityStrategy:api==='volunteer-family'?'RUN_SCOPED_SNAPSHOT_ORDINAL_NO_UPSERT':'HMAC_SHA256_PERSON_ID',
 rows:Array.from({length:n},(_,i)=>({
  key:'h1_'+String(i).padStart(8,'0'),
  values:{districtCode:'5406',status:'ACTIVE'}
 })),
 writeAuthorized:false,appsScriptPosts:0,sheetsWrites:0
});
test('F010 1,803-row person snapshot produces exactly 73 bounded no-network chunks',()=>{
 const plan=planExtendedBatches(source('assignments'));
 assert.equal(plan.sourceRows,1803);
 assert.equal(plan.chunkCount,73);
 assert.equal(plan.chunks[0].rowCount,25);
 assert.equal(plan.chunks[72].rowCount,3);
 assert.equal(plan.chunks.reduce((n,c)=>n+c.rowCount,0),1803);
 assert.equal(plan.appsScriptPosts,0);
 assert.equal(plan.sheetsWrites,0);
 assert.equal(plan.writeAuthorized,false);
 assert.equal(plan.publishMethod,'STAGED_COMPLETE_SNAPSHOT_ONLY');
 for(const chunk of plan.chunks){
  assert.equal(sha(JSON.stringify(chunk.rows)),chunk.digest);
  assert.ok(Buffer.byteLength(JSON.stringify(chunk.rows),'utf8')<=125000);
 }
 assert.equal(sha(JSON.stringify({
  version:plan.runFingerprint.version,endpoint:plan.runFingerprint.endpoint,
  runId:plan.runFingerprint.runId,
  sourceIdentityStrategy:plan.runFingerprint.sourceIdentityStrategy,
  sourceRows:plan.runFingerprint.sourceRows,chunkCount:plan.runFingerprint.chunkCount,
  destinationFields:plan.runFingerprint.destinationFields,
  chunkDigests:plan.runFingerprint.chunkDigests
 })),plan.manifestDigest);
});
test('F010 family snapshot is explicitly replacement-only, never id-based upsert',()=>{
 const plan=planExtendedBatches(source('volunteer-family',1803));
 assert.equal(plan.publishMethod,'FULL_SNAPSHOT_REPLACEMENT_ONLY_NO_UPSERT');
 assert.equal(plan.chunkCount,73);
 assert.equal(plan.transferApproved,false);
});
test('F010 batched stage plan rejects duplicates, oversized payload, invalid data and unauthorized switch',()=>{
 const dup=source('assignments',2);dup.rows[1].key=dup.rows[0].key;
 assert.throws(()=>planExtendedBatches(dup),/EXTENDED_BATCH_PLAN_REJECTED/);
 const large=source('assignments',25);
 for(const r of large.rows)r.values.status='A'.repeat(10000);
 assert.throws(()=>planExtendedBatches(large),/EXTENDED_BATCH_PLAN_REJECTED/);
 const invalid=source('assignments',1);invalid.rows[0].values.status='=HYPERLINK("evil","click")';
 assert.throws(()=>planExtendedBatches(invalid),/EXTENDED_BATCH_PLAN_REJECTED/);
 const extra=source('assignments',1);extra.rows[0].values.citizenId='SENSITIVE';
 assert.throws(()=>planExtendedBatches(extra),/EXTENDED_BATCH_PLAN_REJECTED/);
 const live=source('assignments',1);live.writeAuthorized=true;
 assert.throws(()=>planExtendedBatches(live),/EXTENDED_BATCH_PLAN_REJECTED/);
 assert.throws(()=>planExtendedBatches(source('subdistricts',1)),/EXTENDED_BATCH_PLAN_REJECTED/);
});
