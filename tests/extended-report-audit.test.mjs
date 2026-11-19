import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {auditExtendedSnapshot,EXTENDED_REPORT_ENDPOINTS} from '../src/sync/extended-report-audit.mjs';

const manifest=JSON.parse(readFileSync(new URL('../docs/sheets-schema.json',import.meta.url),'utf8'));
function row(api,i){
 const d=manifest.datasets.find(x=>x.api===api),r={};
 for(const f of d.fields) {
  r[f.source_field]=f.observed_kind==='null_only'?null:
   ['integer','integer_or_null'].includes(f.observed_kind)?10:
   f.observed_kind==='boolean'?true:
   f.observed_kind==='number'?10:
   'TEST_NONPERSON_SYNTHETIC';
 }
 r.provinceCode='54';r.districtCode='5406';
 if('subdistrictCode' in r)r.subdistrictCode='540601';
 if('villageCode' in r)r.villageCode='540601'+String(i+1).padStart(3,'0');
 if('id' in r)r.id='FAKE_RECORD_'+i;
 if('total' in r){r.total=12;r.male=6;r.female=6;}
 return r;
}
function pages(api,total=11){
 const rows=Array.from({length:total},(_,i)=>row(api,i));
 return Array.from({length:Math.max(1,Math.ceil(total/10))},(_,i)=>{
  const base={items:rows.slice(i*10,i*10+10)};
  if(api==='assignments')return {...base,provinces:[],
   pagination:{page:i+1,limit:10,total,pages:Math.ceil(total/10)}};
  return {...base,success:true,message:'OK',total,page:i+1,pageSize:10};
 });
}
const check=(api,p)=>auditExtendedSnapshot(api,p,manifest);
test('F010 all 5 remaining endpoints have pinned audit contracts and no person writes',()=>{
 assert.deepEqual(EXTENDED_REPORT_ENDPOINTS,[
  'volunteer-gender','assignments','volunteer-family',
  'resigned-volunteers','volunteer-tenure'
 ]);
 for(const api of EXTENDED_REPORT_ENDPOINTS){
  const out=check(api,pages(api));
  assert.equal(out.rowsChecked,11);
  assert.equal(out.pagesChecked,2);
  assert.equal(out.reportedTotal,11);
  assert.equal(out.writeAuthorized,false);
  assert.equal(out.personDataStorageAllowed,false);
  assert.equal(out.rawRowsReturned,false);
  assert.equal(out.sourceNetworkRequests,0);
  assert.equal(out.appsScriptPosts,0);
  assert.equal(out.sheetsWrites,0);
  assert.notEqual(out.status,'SCHEMA_OR_SCOPE_REVIEW_REQUIRED');
 }
});
test('F010 reports require complete pagination and stable root totals before any storage',()=>{
 for(const api of EXTENDED_REPORT_ENDPOINTS){
  const normal=pages(api,11);
  assert.equal(check(api,normal.slice(0,1)).status,'INCOMPLETE_SNAPSHOT');
  const shuffled=structuredClone(normal);
  if(api==='assignments')shuffled[1].pagination.total=12;
  else shuffled[1].total=12;
  assert.equal(check(api,shuffled).status,'SOURCE_TOTAL_CHANGED');
  const noPage=structuredClone(normal);noPage[1].items.pop();
  assert.equal(check(api,noPage).status,'PAGE_COUNT_MISMATCH');
 }
});
test('F010 must block unexpected person fields, shape changes, duplicates and wrong district',()=>{
 for(const api of EXTENDED_REPORT_ENDPOINTS){
  const unknown=pages(api,1);unknown[0].items[0].secretExtra='NEVER_LOG_THIS';
  const out=check(api,unknown);
  assert.equal(out.status,'SCHEMA_OR_SCOPE_REVIEW_REQUIRED');
  assert.equal(out.issueCounts.UNEXPECTED_SOURCE_FIELD,1);
  assert.doesNotMatch(JSON.stringify(out),/NEVER_LOG_THIS/);
  const wrong=pages(api,1);wrong[0].items[0].districtCode='5407';
  assert.equal(check(api,wrong).issueCounts.OUT_OF_DISTRICT,1);
 }
 const duplicate=pages('assignments',11);
 duplicate[1].items[0].id=duplicate[0].items[0].id;
 assert.equal(check('assignments',duplicate).issueCounts.DUPLICATE_STABLE_KEY,1);
 const illegal=pages('volunteer-tenure',1);
 illegal[0].items[0].retirementDate=20260101;
 assert.equal(check('volunteer-tenure',illegal).issueCounts.SOURCE_TYPE_CHANGED,1);
});
test('F010 tenure accepts the observed nullable fields and keeps rejecting invalid integers',()=>{
 const ps=pages('volunteer-tenure',120);
 const rows=ps.flatMap(page=>page.items);
 for(const [i,r] of rows.entries()){
  if(i<116)r.startYear=r.tenureYears=r.osmYear=null;
  r.approvalDate=i<94?null:'2026-01-01';
  r.retirementDate=i<47?'2026-01-02':null;
  r.retirementReason=i<18?'synthetic':null;
  r.osmStatus=i<14?null:'';
 }
 assert.equal(check('volunteer-tenure',ps).status,'PERSON_DATA_STORAGE_APPROVAL_REQUIRED');
 for(const invalid of [-1,1.5,'0',false]){
  rows[0].tenureYears=invalid;
  assert.equal(check('volunteer-tenure',ps).issueCounts.SOURCE_TYPE_CHANGED,1);
 }
});
test('F010 resigned nullable reasons still stop when village geography is inconsistent',()=>{
 const ps=pages('resigned-volunteers',2);
 ps[0].items[0].retirementReason=null;
 assert.equal(check('resigned-volunteers',ps).status,'PERSON_DATA_STORAGE_APPROVAL_REQUIRED');
 ps[0].items[0].villageCode='540303004';
 ps[0].items[1].villageCode='540602001';
 const result=check('resigned-volunteers',ps);
 assert.equal(result.status,'SCHEMA_OR_SCOPE_REVIEW_REQUIRED');
 assert.equal(result.issueCounts.GEOGRAPHY_INCONSISTENT,2);
 assert.equal(result.issueCounts.SOURCE_TYPE_CHANGED,undefined);
});
test('F010 family cannot be upserted without stable relation-row key; inconsistent geography is not silently repaired',()=>{
 const good=check('volunteer-family',pages('volunteer-family',1));
 assert.equal(good.status,'UNVERIFIED_RELATION_KEY_WRITE_HOLD');
 assert.equal(good.stableIdentityVerified,false);
 const wrong=pages('volunteer-family',1);
 wrong[0].items[0].villageCode='540303004';
 assert.equal(check('volunteer-family',wrong).status,'SCHEMA_OR_SCOPE_REVIEW_REQUIRED');
 assert.equal(check('volunteer-family',wrong).geographyIssues,1);
});

test('F010 source type diagnostics count allowlisted fields and types without exposing values',()=>{
 const ps=pages('assignments',11);
 ps[0].items[0].isActive='SECRET_SOURCE_VALUE';
 ps[0].items[1].isActive='ANOTHER_PRIVATE_VALUE';
 ps[1].items[0].prefixNameEn=null;
 const out=check('assignments',ps);
 assert.equal(out.status,'SCHEMA_OR_SCOPE_REVIEW_REQUIRED');
 assert.equal(out.issueCounts.SOURCE_TYPE_CHANGED,3);
 assert.deepEqual(out.sourceTypeIssues,[
  {field:'isActive',expectedKind:'boolean',observedType:'string',count:2},
  {field:'prefixNameEn',expectedKind:'string',observedType:'null',count:1}
 ]);
 assert.equal(out.writeAuthorized,false);
 assert.equal(out.appsScriptPosts,0);
 assert.equal(out.sheetsWrites,0);
 assert.doesNotMatch(JSON.stringify(out),/SECRET_SOURCE|ANOTHER_PRIVATE|FAKE_RECORD_/);
});

test('F010 assignments accepts the observed full-snapshot mix of 64 string and 1507 null village names',()=>{
 const ps=pages('assignments',1571);
 let i=0;
 for(const page of ps)for(const r of page.items)r.villageName=i++<64?'SYNTHETIC_VILLAGE':null;
 const out=check('assignments',ps);
 assert.equal(out.status,'PERSON_DATA_STORAGE_APPROVAL_REQUIRED');
 assert.equal(out.pagesChecked,158);assert.equal(out.rowsChecked,1571);
 assert.equal(out.geographyIssues,0);assert.equal(out.stableIdentityVerified,true);
 assert.equal(out.writeAuthorized,false);assert.equal(out.appsScriptPosts,0);
 assert.doesNotMatch(JSON.stringify(out),/SYNTHETIC_VILLAGE|FAKE_RECORD_/);
});

test('F010 assignments nullable village names still reject other types and unsafe text',()=>{
 for(const value of [3,true,{},[], '=SYNTHETIC_FORMULA', 'bad\ntext']){
  const ps=pages('assignments',1);ps[0].items[0].villageName=value;
  const out=check('assignments',ps);
  assert.equal(out.status,'SCHEMA_OR_SCOPE_REVIEW_REQUIRED');
  assert.equal(out.issueCounts.SOURCE_TYPE_CHANGED,1);
  assert.equal(out.sourceTypeIssues[0].field,'villageName');
  assert.equal(out.sourceTypeIssues[0].expectedKind,'string_or_null');
  assert.equal(out.appsScriptPosts,0);assert.equal(out.sheetsWrites,0);
 }
});

test('F010 unknown source field names remain private in enhanced diagnostics',()=>{
 const ps=pages('assignments',1);
 ps[0].items[0]['SECRET_PERSON_AS_FIELD_NAME']='SECRET_PERSON_AS_VALUE';
 const out=check('assignments',ps);
 assert.equal(out.status,'SCHEMA_OR_SCOPE_REVIEW_REQUIRED');
 assert.equal(out.issueCounts.UNEXPECTED_SOURCE_FIELD,1);
 assert.deepEqual(out.sourceTypeIssues,[]);
 assert.doesNotMatch(JSON.stringify(out),/SECRET_PERSON/);
});
test('F010 gender report flags small cells and preserves aggregate privacy gate',()=>{
 const noCell=check('volunteer-gender',pages('volunteer-gender',1));
 assert.equal(noCell.status,'AGGREGATE_STORAGE_APPROVAL_REQUIRED');
 const small=pages('volunteer-gender',1);
 small[0].items[0].male=2;small[0].items[0].female=10;
 const result=check('volunteer-gender',small);
 assert.equal(result.status,'SMALL_CELL_PRIVACY_REVIEW_REQUIRED');
 assert.equal(result.smallCellRows,1);
 assert.equal(result.writeAuthorized,false);
});
test('F010 all person report output excludes identifiers and test fixtures, even for malformed data',()=>{
 for(const api of EXTENDED_REPORT_ENDPOINTS){
  const ps=pages(api,1);
  const value=ps[0].items[0];
  if('firstName' in value)value.firstName='SECRET_PERSON_123';
  if('citizenId' in value)value.citizenId='SECRET_CITIZEN_123';
  const out=check(api,ps),report=JSON.stringify(out);
  assert.doesNotMatch(report,/SECRET_PERSON|SECRET_CITIZEN|FAKE_RECORD_/);
  if(['assignments','resigned-volunteers','volunteer-tenure','volunteer-family'].includes(api))
    assert.ok(out.restrictedColumnsOmittedByDefault.length>0);
 }
});
test('F010 rejects tampered manifest, malformed input, oversize total and unsupported endpoints',()=>{
 for(const bad of [
  {...manifest,datasets:manifest.datasets.filter(d=>d.api!=='volunteer-family')},
  {...manifest,datasets:manifest.datasets.map(d=>d.api==='volunteer-family'?{...d,candidate:['citizenId']}:d)},
  {...manifest,datasets:manifest.datasets.map(d=>d.api==='assignments'?{...d,gate:'ELIGIBLE_AFTER_APPROVAL'}:d)}
 ])assert.throws(()=>auditExtendedSnapshot(
  bad.datasets.some(x=>x.api==='assignments'&&x.gate==='ELIGIBLE_AFTER_APPROVAL')?'assignments':'volunteer-family',
  pages('assignments',1),bad),/EXTENDED_AUDIT_MANIFEST_INVALID/);
 assert.throws(()=>check('volunteer-gender',[]),/EXTENDED_AUDIT_ARGUMENT_INVALID/);
 assert.throws(()=>check('nonsense',[]),/EXTENDED_AUDIT_MANIFEST_INVALID/);
 const oversized=pages('assignments',1);
 oversized[0].pagination.total=2501;
 assert.equal(check('assignments',oversized).status,'INVALID_PAGE_ENVELOPE');
});
