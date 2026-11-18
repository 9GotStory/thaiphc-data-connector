import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {projectMinimizedExtendedSnapshot} from '../src/sync/extended-minimized-projection.mjs';

const manifest=JSON.parse(readFileSync(new URL('../docs/sheets-schema.json',import.meta.url),'utf8'));
const key=Buffer.alloc(32,57).toString('base64');
function source(api,i=0){
 const d=manifest.datasets.find(x=>x.api===api),r={};
 for(const f of d.fields){
  r[f.source_field]=f.observed_kind==='null_only'?null:
   f.observed_kind==='integer'?12:
   f.observed_kind==='boolean'?true:'FAKE_VALUE';
 }
 r.provinceCode='54';r.districtCode='5406';
 if('id' in r)r.id='SECRET_UUID_'+i;
 if('citizenId' in r)r.citizenId='SECRET_CITIZEN_ID_'+i;
 if('osmCode' in r)r.osmCode='SECRET_OSM_'+i;
 if('firstName' in r)r.firstName='SECRET_FIRSTNAME_'+i;
 if('address' in r)r.address='SECRET_HOME_ADDRESS_'+i;
 if('volunteerId' in r)r.volunteerId='SECRET_VOLUNTEER_'+i;
 if('subdistrictCode' in r)r.subdistrictCode='540601';
 if('villageCode' in r)r.villageCode='540601'+String(i+1).padStart(3,'0');
 if(api==='volunteer-gender'){r.total=12;r.male=6;r.female=6;}
 return r;
}
function pages(api,num=2){
 const rows=Array.from({length:num},(_,i)=>source(api,i));
 return [{
  items:rows,...(api==='assignments'?
   {provinces:[],pagination:{page:1,limit:10,total:num,pages:1}}:
   {success:true,message:'OK',page:1,pageSize:10,total:num})
 }];
}
const make=(endpoint,overrides={})=>projectMinimizedExtendedSnapshot({
 endpoint,manifest,pages:pages(endpoint),privacyKeyB64:key,runId:'feature010-run-1',
 ...overrides
});
test('F010 minimized projection excludes all manifest-restricted direct-identifying columns',()=>{
 for(const api of ['assignments','volunteer-family','resigned-volunteers','volunteer-tenure']){
  const o=make(api);
  assert.equal(o.rowCount,2);
  assert.equal(o.writeAuthorized,false);
  assert.equal(o.appsScriptPosts,0);
  assert.equal(o.sheetsWrites,0);
  const json=JSON.stringify(o);
  for(const secret of ['SECRET_UUID','SECRET_CITIZEN_ID','SECRET_OSM',
   'SECRET_FIRSTNAME','SECRET_HOME_ADDRESS','SECRET_VOLUNTEER'])
   assert.doesNotMatch(json,new RegExp(secret));
  for(const col of o.sourceFieldsOmitted)
   assert.ok(!Object.hasOwn(o.rows[0].values,col),'restricted source column leaked: '+col);
 }
});
test('F010 person pseudonyms are deterministic HMAC identities, not raw UUID or national IDs',()=>{
 const a=make('assignments'),b=make('assignments');
 assert.equal(a.rows[0].key,b.rows[0].key);
 assert.notEqual(a.rows[0].key,a.rows[1].key);
 assert.match(a.rows[0].key,/^h1_[a-f0-9]{64}$/);
 assert.equal(a.sourceIdentityStrategy,'HMAC_SHA256_PERSON_ID');
 const c=make('resigned-volunteers');
 assert.notEqual(a.rows[0].key,c.rows[0].key); // domain separation by endpoint
});

test('F010 assignments projection preserves null and text village names while omitting person identifiers',()=>{
 const ps=pages('assignments',2);
 ps[0].items[0].villageName=null;
 ps[0].items[1].villageName='SYNTHETIC_VILLAGE';
 const out=make('assignments',{pages:ps});
 assert.equal(out.rows[0].values.villageName,null);
 assert.equal(out.rows[1].values.villageName,'SYNTHETIC_VILLAGE');
 assert.match(out.rows[0].key,/^h1_[a-f0-9]{64}$/);
 assert.doesNotMatch(JSON.stringify(out),/SECRET_UUID|SECRET_CITIZEN|SECRET_FIRSTNAME/);
});
test('F010 family never invents a permanent unique relationship key',()=>{
 const a=make('volunteer-family'),b=make('volunteer-family',{runId:'feature010-run-2'});
 assert.equal(a.sourceIdentityStrategy,'RUN_SCOPED_SNAPSHOT_ORDINAL_NO_UPSERT');
 assert.notEqual(a.rows[0].key,b.rows[0].key);
 assert.equal(a.privacyState,'UNVERIFIED_RELATION_KEY_WRITE_HOLD');
});
test('F010 gender complementary suppression prevents small sex-cell reconstruction',()=>{
 const p=pages('volunteer-gender',1);
 p[0].items[0].total=12;p[0].items[0].male=2;p[0].items[0].female=10;
 const o=make('volunteer-gender',{pages:p});
 assert.equal(o.suppressedGenderRows,1);
 assert.equal(o.rows[0].values.male,null);
 assert.equal(o.rows[0].values.female,null);
 assert.equal(o.rows[0].values.total,12);
 assert.equal(o.privacyState,'SMALL_CELL_PRIVACY_REVIEW_REQUIRED');
});
test('F010 no projection for invalid source, tampered manifest or invalid key',()=>{
 const p=pages('assignments',1);p[0].items[0].districtCode='5407';
 assert.throws(()=>make('assignments',{pages:p}),/EXTENDED_MINIMIZATION_REJECTED/);
 assert.throws(()=>make('assignments',{privacyKeyB64:'BAD'}),/EXTENDED_MINIMIZATION_REJECTED/);
 const wrong=structuredClone(manifest);
 wrong.datasets.find(d=>d.api==='assignments').gate='NO_GUARD';
 assert.throws(()=>make('assignments',{manifest:wrong}),/EXTENDED_AUDIT_MANIFEST_INVALID/);
});
