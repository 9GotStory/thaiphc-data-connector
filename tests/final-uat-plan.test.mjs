import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildFinalUatReleasePlan} from '../src/release/final-uat-plan.mjs';
import {main} from '../src/cli/index.mjs';

const manifest=JSON.parse(readFileSync(new URL('../docs/sheets-schema.json',import.meta.url),'utf8'));
const targets=JSON.parse(readFileSync(new URL('../config/thaiphc-targets.json',import.meta.url),'utf8'));
const clone=x=>structuredClone(x);

test('T009D final release plan validates the pinned three-reference contract without implying new write approval',()=>{
 const plan=buildFinalUatReleasePlan(manifest,targets);
 assert.equal(plan.mode,'FINAL_UAT_RELEASE_PLAN_OFFLINE');
 assert.equal(plan.status,'FINAL_UAT_EXECUTION_NOT_AUTHORIZED');
 assert.equal(plan.writeAuthorized,false);
 assert.equal(plan.liveVerificationPerformed,false);
 assert.equal(plan.sourceNetworkRequests,0);
 assert.equal(plan.appsScriptPosts,0);
 assert.equal(plan.sheetsWrites,0);
 assert.deepEqual(plan.referenceDatasets.map(x=>x.api),[
  'subdistricts','villages','health-services'
 ]);
 assert.deepEqual(plan.referenceDatasets.map(x=>x.observedRows),[8,85,18]);
 assert.deepEqual(plan.referenceDatasets.map(x=>x.phase),[
  'PREVIOUSLY_ACCEPTED_RECHECK_ONLY','FINAL_UAT_FIRST_WRITE_PENDING','FINAL_UAT_FIRST_WRITE_PENDING'
 ]);
 assert.ok(plan.referenceDatasets.every(x=>x.countsAreHistorical===true));
 assert.equal(plan.referenceDatasets[1].sourceTotal,'UNPAGINATED_NO_AUTHORITATIVE_TOTAL');
 assert.equal(plan.referenceDatasets[2].sourceTotal,'PAGINATED_TOTAL_REQUIRED');
 assert.deepEqual(plan.restrictedDatasets.map(x=>x.api),[
  'volunteer-gender','assignments','volunteer-family',
  'resigned-volunteers','volunteer-tenure'
 ]);
 assert.ok(plan.restrictedDatasets.slice(1).every(x=>x.status==='PERSON_DATA_HOLD'));
 assert.equal(plan.finalWindow.independentSheetsReadbackRequired,true);
 assert.equal(plan.finalWindow.disableReceiverAndWriteAfterEveryAttempt,true);
 assert.equal(plan.finalWindow.explicitProductOwnerWriteAuthorizationRequired,true);
 assert.doesNotMatch(JSON.stringify(plan),new RegExp(targets.spreadsheetId));
 assert.doesNotMatch(JSON.stringify(plan),new RegExp(targets.deploymentId));
 assert.equal(Object.isFrozen(plan),true);
});

test('T009D release plan is fail closed for wrong target, duplicate/relabelled datasets, missing metadata and access expansion',()=>{
 const bad=[
  {m:manifest,t:{...targets,spreadsheetId:'bad'}},
  {m:manifest,t:{...targets,deploymentId:'https://evil.invalid'}},
  {m:{...manifest,metadata_columns:manifest.metadata_columns.slice(1)},t:targets},
  {m:{...manifest,datasets:[...manifest.datasets,manifest.datasets[0]]},t:targets},
  {m:{...manifest,datasets:manifest.datasets.map(d=>d.api==='villages'?{...d,tab:'Wrong'}:d)},t:targets},
  {m:{...manifest,datasets:manifest.datasets.map(d=>d.api==='volunteer-family'?{...d,gate:'ELIGIBLE_AFTER_APPROVAL'}:d)},t:targets},
  {m:{...manifest,datasets:manifest.datasets.map(d=>d.api==='volunteer-gender'?{...d,gate:'ELIGIBLE_AFTER_APPROVAL'}:d)},t:targets},
  {m:{...manifest,datasets:manifest.datasets.map(d=>d.api==='health-services'?{...d,candidate:['id']}:d)},t:targets}
 ];
 for(const {m,t} of bad)assert.throws(()=>buildFinalUatReleasePlan(clone(m),clone(t)),/FINAL_RELEASE_CONTRACT_INVALID/);
});

test('T009D release-plan CLI is zero-network and never loads secrets, even on malformed input',async()=>{
 let calls=0,hmac=0,logs=[];
 const tty={
  fetchImpl:async()=>{calls++;throw Error('NETWORK_MUST_NOT_START')},
  readStoredHmac:()=>{hmac++;throw Error('SECRET_MUST_NOT_BE_READ')},
  setupStoredHmac:()=>{hmac++;throw Error('SECRET_MUST_NOT_BE_READ')},
  getToken:()=>{hmac++;throw Error('SECRET_MUST_NOT_BE_READ')}
 };
 assert.equal(await main(['release-plan'],s=>logs.push(s),tty),0);
 assert.equal(JSON.parse(logs[0]).status,'FINAL_UAT_EXECUTION_NOT_AUTHORIZED');
 assert.equal(calls,0);assert.equal(hmac,0);
 for(const args of [
  ['release-plan','--endpoint','villages'],
  ['release-plan','--token','SECRET'],
  ['release-plan','--acknowledge-reference-commit'],
  ['release-plan','--max-pages','10'],
  ['release-plan','--url','https://evil.invalid']
 ]){
  logs=[];
  assert.equal(await main(args,s=>logs.push(s),tty),2);
  assert.match(logs.join(''),/CLI_REJECTED/);
  assert.equal(calls,0);assert.equal(hmac,0);
 }
});
