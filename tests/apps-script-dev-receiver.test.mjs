import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {projectReferenceRows} from '../src/sync/reference-projection.mjs';

const manifest=JSON.parse(readFileSync(new URL('../docs/sheets-schema.json',import.meta.url),'utf8'));
const gasSource=readFileSync(new URL('../apps-script/dev-receiver.gs',import.meta.url),'utf8');
const apis=['subdistricts','villages','health-services'];

function receiver(){
 const ctx=vm.createContext({
  ContentService:{
   MimeType:{JSON:'application/json'},
   createTextOutput(text){
    return {
     text,mimeType:null,
     setMimeType(value){this.mimeType=value;return this;},
     getContent(){return this.text;}
    };
   }
  }
 });
 vm.runInContext(gasSource,ctx,{filename:'dev-receiver.gs',timeout:2000});
 return {
  validate:x=>JSON.parse(JSON.stringify(ctx.validateMockBatch_(x))),
  http:x=>ctx.doPost(x),
  schema:()=>JSON.parse(JSON.stringify(vm.runInContext('T009D_MOCK_SCHEMAS',ctx)))
 };
}
function fixture(api,n=1){
 const d=manifest.datasets.find(x=>x.api===api);
 if(!d)throw Error('NO_FIXTURE_SCHEMA');
 const x=Object.create(null);
 for(const f of d.fields){
  if(f.observed_kind==='null_only'||f.observed_kind==='string_or_null')x[f.column]=null;
  else if(f.observed_kind==='string')x[f.column]='SYNTHETIC';
  else if(f.observed_kind==='integer')x[f.column]=n;
  else if(f.observed_kind==='number')x[f.column]=0;
  else if(f.observed_kind==='object')x[f.column]={value:'SYNTHETIC'};
  else if(f.observed_kind==='array')x[f.column]=[];
  else throw Error('UNSUPPORTED_FIXTURE_TYPE');
 }
 if(api==='subdistricts'){
  x.code='54060'+n;x.id=x.code;x.district_code='5406';
 }
 if(api==='villages'){
  x.code='540601'+String(n).padStart(3,'0');
  x.village_code_8digit='540601'+String(n).padStart(2,'0');
  x.subdistrict_code='540601';x.district_code='5406';x.province_code='54';x.id=x.code;
 }
 if(api==='health-services'){
  x.health_service_code='FAKE-'+String(n).padStart(2,'0');
  x.province={province_code:'54'};
  x.district={district_code:'5406'};
  x.subdistrict={subdistrict_code:'540601'};
  x.health_service_type={id:'TEST'};
  x.service_areas=[{village_nos:['01','03']}];
  x.legacy_5digit_code='00001';x.legacy_9digit_code='000000123';
  x.village_no='Village 1';x.latitude=0;x.longitude=0;
 }
 return x;
}
function envelope(api,records=[fixture(api)]){
 const projection=projectReferenceRows(api,records,manifest);
 return {
  mode:'SYNTHETIC_ONLY',intent:'VALIDATE_ONLY',
  contractVersion:'T009D-MOCK-1',schemaVersion:'0.1.0',
  endpoint:api,tab:projection.tab,
  scope:{provinceCode:'54',districtCode:'5406'},
  destinationContract:'UNVERIFIED',
  snapshotCompleteness:'NOT_VERIFIED',writeAllowed:false,
  sourceFieldNames:projection.sourceFieldNames,
  rowCount:projection.rowCount,rows:projection.rows
 };
}
const clone=x=>structuredClone(x);
function rejected(x,reason){
 const result=receiver().validate(x);
 assert.equal(result.status,'MOCK_REJECTED');
 assert.equal(result.reason,reason);
 assert.equal(result.rowsValidated,0);
 assert.equal(result.writeAllowed,false);
 assert.equal(result.sheetsWrites,0);
 assert.equal(result.appsScriptPosts,0);
 assert.equal(result.actualIngress,false);
 assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC_VILLAGE_SECRET|PERSON_FIELD_SENTINEL/);
}

test('T009D mock pinned schema exactly matches T003 3 reference tabs, source types and keys',()=>{
 const schemas=receiver().schema();
 assert.deepEqual(Object.keys(schemas),apis);
 for(const api of apis){
  const src=manifest.datasets.find(d=>d.api===api);
  assert.equal(schemas[api].tab,src.tab);
  assert.equal(schemas[api].key,src.candidate[0]);
  assert.deepEqual(schemas[api].columns,src.fields.map(x=>x.column));
  assert.deepEqual(schemas[api].types,src.fields.map(x=>x.observed_kind));
  assert.equal(src.gate,'ELIGIBLE_AFTER_APPROVAL');
 }
});
test('T009D same Apps Script source validates injected T009C synthetic memory records (3 datasets)',()=>{
 const validate=receiver().validate;
 for(const api of apis){
  const payload=envelope(api,[fixture(api,1),fixture(api,2)]);
  const accepted=validate(payload);
  assert.equal(accepted.status,'MOCK_VALIDATED');
  assert.equal(accepted.mode,'SYNTHETIC_ONLY');
  assert.equal(accepted.endpoint,api);
  assert.equal(accepted.rowsValidated,2);
  assert.equal(accepted.writeAllowed,false);
  assert.equal(accepted.snapshotCompleteness,'NOT_VERIFIED');
  assert.equal(accepted.destinationContract,'UNVERIFIED');
  assert.equal(accepted.appsScriptPosts,0);
  assert.equal(accepted.sheetsWrites,0);
  assert.equal(accepted.actualIngress,false);
  assert.ok(!('rows' in accepted));
  assert.ok(!('values' in accepted));
 }
});
test('T009D doPost is hard-denied even when given a valid synthetic payload',()=>{
 const r=receiver();
 for(const request of [undefined,{},{
  postData:{contents:JSON.stringify(envelope('villages'))},
  parameter:{token:'SYNTHETIC_VILLAGE_SECRET'}
 }]){
  const output=r.http(request);
  assert.equal(output.mimeType,'application/json');
  assert.deepEqual(JSON.parse(output.getContent()),{
   status:'INGRESS_DISABLED',writeAllowed:false,sheetsWrites:0
  });
  assert.doesNotMatch(output.getContent(),/SYNTHETIC_VILLAGE_SECRET|540601/);
 }
});
test('T009D rejects all volunteer-gender and person-grain datasets, including disguised tabs',()=>{
 for(const api of ['volunteer-gender','assignments','volunteer-family','resigned-volunteers','volunteer-tenure','__proto__']){
  const payload=envelope('villages');
  payload.endpoint=api;
  rejected(payload,'DATASET_DISABLED');
 }
 const disguised=envelope('villages');
 disguised.tab='Assignments';
 rejected(disguised,'SCHEMA_MISMATCH');
});
test('T009D cannot be switched into real POST, write, complete snapshot or non-mock mode',()=>{
 for(const mutate of [
  x=>{x.mode='LIVE_READ_ONLY';},
  x=>{x.intent='WRITE';},
  x=>{x.contractVersion='PRODUCTION-1';},
  x=>{x.schemaVersion='0.2.0';},
  x=>{x.writeAllowed=true;},
  x=>{x.snapshotCompleteness='COMPLETE';},
  x=>{x.destinationContract='VERIFIED';}
 ]){
  const x=envelope('villages');mutate(x);
  rejected(x,'UNAUTHORIZED_MODE');
 }
});
test('T009D rejects missing, extra, or nonsensical envelope properties',()=>{
 const x=envelope('villages');x.accessToken='PERSON_FIELD_SENTINEL';
 rejected(x,'INVALID_ENVELOPE');
 const missing=envelope('villages');delete missing.rows;
 rejected(missing,'INVALID_ENVELOPE');
 rejected(null,'INVALID_ENVELOPE');
 rejected(['hello'],'INVALID_ENVELOPE');
});
test('T009D rejects changed province, district or extra scope fields',()=>{
 for(const mutate of [
  x=>{x.scope.provinceCode='55';},
  x=>{x.scope.districtCode='5407';},
  x=>{x.scope.extra='another';}
 ]){
  const x=envelope('subdistricts');mutate(x);
  rejected(x,'SCOPE_MISMATCH');
 }
});
test('T009D rejects missing/extra/case-changed/incorrectly ordered columns',()=>{
 for(const mutate of [
  x=>{x.sourceFieldNames.pop();},
  x=>{x.sourceFieldNames.push('citizenId');},
  x=>{x.sourceFieldNames[0]='Code';},
  x=>{x.sourceFieldNames.reverse();}
 ]){
  const x=envelope('villages');mutate(x);
  rejected(x,'SCHEMA_MISMATCH');
 }
});
test('T009D rejects row count mismatch, missing/extra fields, and non-array cells',()=>{
 for(const [mutate,reason] of [
  [x=>{x.rowCount=0;},'ROW_BOUNDARY_INVALID'],
  [x=>{x.rows=[];x.rowCount=0;},'ROW_BOUNDARY_INVALID'],
  [x=>{x.rows[0].extra='PERSON_FIELD_SENTINEL';},'ROW_SHAPE_INVALID'],
  [x=>{delete x.rows[0].presence.name_th;},'ROW_SHAPE_INVALID'],
  [x=>{x.rows[0].presence.citizenId='VALUE';},'ROW_SHAPE_INVALID'],
  [x=>{x.rows[0].values={};},'ROW_SHAPE_INVALID'],
  [x=>{x.rows[0].values.pop();},'ROW_SHAPE_INVALID']
 ]){
  const x=envelope('villages');mutate(x);
  rejected(x,reason);
 }
});
test('T009D rejects mismatched, empty and duplicate source identity',()=>{
 for(const mutate of [
  x=>{x.rows[0].key='different';},
  x=>{x.rows[0].key='';},
  x=>{x.rows[0].presence.code='ABSENT';}
 ]){
  const x=envelope('villages');mutate(x);
  rejected(x,'INVALID_SOURCE_KEY');
 }
 const duplicate=envelope('villages',[fixture('villages',1),fixture('villages',2)]);
 duplicate.rows[1]=clone(duplicate.rows[0]);
 rejected(duplicate,'DUPLICATE_SOURCE_KEY');
});
test('T009D rejects out-of-scope identifiers and nested service geometry',()=>{
 for(const [api,mutate] of [
  ['subdistricts',x=>{x.rows[0].key='540601';x.rows[0].values[x.sourceFieldNames.indexOf('district_code')]='5407';}],
  ['villages',x=>{x.rows[0].values[x.sourceFieldNames.indexOf('district_code')]='5407';}],
  ['villages',x=>{x.rows[0].values[x.sourceFieldNames.indexOf('subdistrict_code')]='540602';}],
  ['health-services',x=>{x.rows[0].values[x.sourceFieldNames.indexOf('province')]='{"province_code":"55"}';}]
 ]){
  const x=envelope(api);mutate(x);
  rejected(x,'GEOGRAPHIC_SCOPE_MISMATCH');
 }
});
test('T009D null, missing and empty string presence are not conflated',()=>{
 const x=envelope('villages');
 const idx=x.sourceFieldNames.indexOf('name_th');
 x.rows[0].presence.name_th='NULL';x.rows[0].values[idx]=null;
 rejected(x,'INVALID_FIELD');
 const y=envelope('villages');
 y.rows[0].values[y.sourceFieldNames.indexOf('name_en')]='INVENTED';
 y.rows[0].presence.name_en='VALUE';
 rejected(y,'INVALID_FIELD');
 const z=envelope('villages');
 z.rows[0].values[z.sourceFieldNames.indexOf('name_th')]='';
 const accepted=receiver().validate(z);
 assert.equal(accepted.status,'MOCK_VALIDATED');
 const absent=envelope('villages');
 absent.rows[0].presence.name_th='ABSENT';
 absent.rows[0].values[absent.sourceFieldNames.indexOf('name_th')]=null;
 assert.equal(receiver().validate(absent).status,'MOCK_VALIDATED');
});
test('T009D refuses numeric coercion, JSON shape mismatch, unsafe text',()=>{
 for(const [api,name,bad] of [
  ['villages','village_no','1'],['villages','village_no',1.25],
  ['villages','name_th','=HYPERLINK("x")'],
  ['villages','name_th','bad\nstring'],
  ['villages','name_th','PERSON_FIELD_SENTINEL'.repeat(2000)],
  ['health-services','latitude','0'],
  ['health-services','service_areas','{}'],
  ['health-services','province','{"wrong":"shape"'],
 ]){
  const x=envelope(api);
  x.rows[0].values[x.sourceFieldNames.indexOf(name)]=bad;
  rejected(x,'INVALID_FIELD');
 }
});
test('T009D rejects over-limit batch, oversized JSON and invalid/cyclic payload without leaks',()=>{
 const a=envelope('villages');
 a.rows=Array.from({length:151},(_,i)=>clone(a.rows[0]));
 a.rowCount=151;
 rejected(a,'ROW_BOUNDARY_INVALID');
 const b=envelope('villages');
 b.rows[0].values[b.sourceFieldNames.indexOf('label')]='x'.repeat(32700);
 b.rows=Array.from({length:20},(_,i)=>({...clone(b.rows[0]),key:'540601'+String(i+1).padStart(3,'0')}));
 b.rowCount=20;
 rejected(b,'PAYLOAD_TOO_LARGE');
 const c=envelope('villages');c.self=c;
 rejected(c,'INVALID_ENVELOPE');
});
test('T009D mock source never calls Apps Script Sheets/transport or emits dataset values',()=>{
 assert.doesNotMatch(gasSource,/\b(?:SpreadsheetApp|UrlFetchApp|PropertiesService|DriveApp|LockService)\s*\./);
 assert.doesNotMatch(gasSource,/\bfetch\s*\(|\bLogger\s*\.|\bconsole\s*\.|\bJSON\.stringify\(payload\)\s*;[\s\S]*\bContentService/);
 const output=receiver().validate(envelope('villages'));
 assert.doesNotMatch(JSON.stringify(output),/540601001|SYNTHETIC/);
 assert.equal(output.writeAllowed,false);
});
