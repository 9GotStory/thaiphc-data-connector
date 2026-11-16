import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const decision=JSON.parse(await readFile(new URL('../docs/live-pilot-authorization-state.json',import.meta.url),'utf8'));
const note=await readFile(new URL('../docs/live-pilot-authorization-review.md',import.meta.url),'utf8');
const draft=await readFile(new URL('../docs/live-pilot-request-draft.md',import.meta.url),'utf8');

test('T004D is evidence only and has no live authorization',()=>{
 assert.equal(decision.decision,'HOLD');
 assert.equal(decision.phase,'EXTERNAL_AUTHORIZATION_EVIDENCE_ONLY');
 for(const k of ['live_transport_implementation_approved','live_pilot_execution_approved','api_owner_approved_programmatic_access','browser_bearer_reuse_authorized','personal_endpoints_enabled','apps_script_transfer_approved','google_sheets_write_approved']){
   assert.equal(decision[k],false,k);
 }
 assert.deepEqual(decision.permitted_live_endpoints,[]);
});
test('proposal is one narrow reference lookup, not a live dispatch',()=>{
 assert.equal(decision.proposed_pilot.endpoint_id,'subdistricts');
 assert.equal(decision.proposed_pilot.method,'GET');
 assert.equal(decision.proposed_pilot.relative_path,'/api/v1/lookups/subdistricts');
 assert.deepEqual(decision.proposed_pilot.fixed_query,{district_code:'5406'});
 assert.equal(decision.proposed_pilot.district_code,'5406');
 assert.equal(decision.proposed_pilot.proposed_max_requests,1);
 assert.equal(decision.proposed_pilot.live_authorized,false);
});
test('public contact leads are not approval records',()=>{
 assert.ok(decision.public_contact_leads.length>=2);
 assert.ok(decision.public_contact_leads.every(x=>x.classification==='PUBLIC_CONTACT_ONLY_NOT_APPROVAL'));
 assert.equal(decision.approval_reference,null);
 assert.equal(decision.api_owner_role,'UNKNOWN');
 assert.ok(decision.missing_evidence.includes('BROWSER_TOKEN_REUSE_PERMISSION_OR_APPROVED_ALTERNATIVE'));
});
test('request draft contains no personal records or credentials',()=>{
 assert.ok(draft.includes('ยังไม่ได้ส่ง'));
 assert.ok(draft.includes('district_code=5406'));
 assert.ok(note.includes('HOLD'));
 for(const data of [draft,note,JSON.stringify(decision)]){
  assert.doesNotMatch(data,/(?<!\d)\d{13}(?!\d)/);
  assert.doesNotMatch(data,/Bearer\s+[A-Za-z0-9_.-]{24,}/);
  assert.doesNotMatch(data,/-----BEGIN .*PRIVATE KEY-----/);
 }
});

test('sensitive-data guards detect constructed synthetic sentinel values',()=>{
 const syntheticNationalId='123456789'+'0123';
 const syntheticBearer='Bearer '+'MOCK_ONLY_'+'12345678901234567890';
 assert.match(syntheticNationalId,/(?<!\d)\d{13}(?!\d)/);
 assert.match(syntheticBearer,/Bearer\s+[A-Za-z0-9_.-]{24,}/);
});
