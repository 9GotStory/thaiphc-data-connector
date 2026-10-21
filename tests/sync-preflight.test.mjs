import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildSyncPlan,inspectSyncDesign} from '../src/sync/preflight.mjs';
import {main} from '../src/cli/index.mjs';

function fixture(){
 return JSON.parse(readFileSync(new URL('../docs/sheets-schema.json',import.meta.url),'utf8'));
}
test('T009A reports eight documented tabs, unchanged source fields and zero possible writes',()=>{
 const plan=buildSyncPlan();
 assert.equal(plan.mode,'OFFLINE_ONLY');
 assert.equal(plan.command,'sync-plan');
 assert.equal(plan.status,'HOLD');
 assert.equal(plan.manifestState,'DRAFT_DESIGN_ONLY');
 assert.equal(plan.schemaVersion,'0.1.0');
 assert.deepEqual(plan.scope,{provinceCode:'54',districtCode:'5406'});
 assert.equal(plan.networkRequests,0);
 assert.equal(plan.appsScriptPosts,0);
 assert.equal(plan.sheetsWrites,0);
 assert.deepEqual(plan.targets.map(t=>[t.endpoint,t.tab,t.sourceFields]),[
  ['assignments','Assignments',25],['subdistricts','Subdistricts',12],
  ['villages','Villages',20],['health-services','HealthServices',16],
  ['volunteer-gender','VolunteerGender',12],['volunteer-family','VolunteerFamily',21],
  ['resigned-volunteers','ResignedVolunteers',18],
  ['volunteer-tenure','VolunteerTenure',21]
 ]);
 assert.ok(plan.targets.every(t=>t.writeAllowed===false&&
   t.destinationContract==='UNVERIFIED'&&t.sourceRowTransfer==='NOT_IMPLEMENTED'));
});
test('T009A three reference datasets require real destination contract, not auto approval',()=>{
 for(const ep of ['subdistricts','villages','health-services']){
  const p=buildSyncPlan(ep);
  assert.equal(p.targets.length,1);
  assert.equal(p.targets[0].endpoint,ep);
  assert.equal(p.targets[0].blocker,'DESTINATION_CONTRACT_REQUIRED');
  assert.ok(p.targets[0].keyFields.length===1);
  assert.equal(p.targets[0].writeAllowed,false);
 }
});
test('T009A village gender requires independent small-cell privacy decision',()=>{
 const t=buildSyncPlan('volunteer-gender').targets[0];
 assert.equal(t.blocker,'PRIVACY_REVIEW_REQUIRED');
 assert.equal(t.writeAllowed,false);
 assert.deepEqual(t.keyFields,['provinceCode','districtCode','villageCode']);
});
test('T009A four person-grain endpoints cannot be automatically enabled',()=>{
 for(const ep of ['assignments','volunteer-family','resigned-volunteers','volunteer-tenure']){
  const plan=buildSyncPlan(ep);
  assert.equal(plan.targets[0].blocker,'PERSON_DATA_DISABLED');
  assert.equal(plan.targets[0].writeAllowed,false);
 }
 assert.deepEqual(buildSyncPlan('volunteer-family').targets[0].keyFields,[]);
});
test('T009A CLI is offline manifest-only; no token or network',async()=>{
 const output=[];
 assert.equal(await main(['sync-plan'],s=>output.push(s),{
  fetchImpl:async()=>{throw Error('NETWORK_MUST_NOT_BE_USED');}
 }),0);
 const payload=JSON.parse(output.join(''));
 assert.equal(payload.status,'HOLD');
 assert.equal(payload.targets.length,8);
 assert.equal(payload.networkRequests,0);
 assert.equal(payload.sheetsWrites,0);
 const single=[];
 assert.equal(await main(['sync-plan','--endpoint','villages'],s=>single.push(s)),0);
 assert.equal(JSON.parse(single.join('')).targets.length,1);
 assert.equal(JSON.parse(single.join('')).targets[0].tab,'Villages');
 assert.doesNotMatch(output.join(''),/TEST_ONLY|bearer|citizenId|firstName|lastName|sample_note/i);
});
test('T009A sync-plan rejects credentials, arbitrary URL, flags, unknown endpoints',async()=>{
 for(const args of [
  ['sync-plan','--acknowledge-authorized-use'],
  ['sync-plan','--token','SECRET'],
  ['sync-plan','--output','records.json'],
  ['sync-plan','--url','https://example.invalid'],
  ['sync-plan','--max-pages','2'],
  ['sync-plan','--endpoint','not-an-endpoint'],
  ['sync-plan','--endpoint','villages','--acknowledge-authorized-use']
 ]){
  const output=[];
  assert.equal(await main(args,s=>output.push(s)),2);
  assert.equal(output.length,1);
  assert.match(output[0],/^CLI_REJECTED/);
  assert.doesNotMatch(output.join(''),/SECRET|records\.json|example\.invalid/);
 }
});
test('T009A modified, malformed or incomplete manifest fails closed',()=>{
 const transforms=[
  m=>{m.state='READY_TO_WRITE';},
  m=>{m.datasets.pop();},
  m=>{m.datasets[1].api='surprise-endpoint';},
  m=>{m.datasets[1].tab='Assignments';},
  m=>{m.datasets[1].gate='PERSON_DATA_APPROVAL_REQUIRED';},
  m=>{m.datasets[1].materialization='AUTHORIZED_WRITE';},
  m=>{m.datasets[1].fields[0].column='changedCode';},
  m=>{m.datasets[1].fields.push(structuredClone(m.datasets[1].fields[0]));},
  m=>{m.datasets[1].candidate=['notAColumn'];},
  m=>{m.metadata_columns.push({name:'citizenId'});},
  m=>{m.metadata_columns[0].name=m.metadata_columns[1].name;},
  m=>{m.datasets[0].fields[0].pii_policy='TRANSFER_RAW_PERSON';}
 ];
 for(const mutate of transforms){
  const m=fixture();mutate(m);
  assert.throws(()=>inspectSyncDesign(m),/SYNC_MANIFEST_INVALID/);
 }
});
test('T009A pure preflight does not serialize manifest sample notes or source row data',()=>{
 const m=fixture();
 m.datasets[1].fields[0].sample_note='SOURCE_ROW_SECRET_SENTINEL';
 const payload=inspectSyncDesign(m);
 assert.doesNotMatch(JSON.stringify(payload),/SOURCE_ROW_SECRET_SENTINEL|REDACTED|sample_note/);
 assert.equal(payload.targets[1].sourceFields,12);
 assert.throws(()=>inspectSyncDesign(m,'random-person-endpoint'),/SYNC_PLAN_ENDPOINT_NOT_SUPPORTED/);
});
