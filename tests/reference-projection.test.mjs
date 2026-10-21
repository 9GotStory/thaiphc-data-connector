import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {projectReferenceRows} from '../src/sync/reference-projection.mjs';

const manifest=JSON.parse(readFileSync(new URL('../docs/sheets-schema.json',import.meta.url),'utf8'));
const byApi=api=>manifest.datasets.find(d=>d.api===api);
function sample(api,index=1){
 const def=byApi(api);
 const x=Object.create(null);
 for(const f of def.fields){
  if(f.observed_kind==='null_only'||f.observed_kind==='string_or_null')x[f.source_field]=null;
  else if(f.observed_kind==='integer')x[f.source_field]=index;
  else if(f.observed_kind==='number')x[f.source_field]=0;
  else if(f.observed_kind==='object')x[f.source_field]={name_th:'SYNTHETIC'};
  else if(f.observed_kind==='array')x[f.source_field]=[];
  else if(f.observed_kind==='string')x[f.source_field]='SYNTHETIC';
  else throw Error('INVALID_TEST_FIXTURE_KIND');
 }
 if(api==='subdistricts'){
  x.code='54060'+index;x.id=x.code;x.district_code='5406';
 }else if(api==='villages'){
  x.code='540601'+String(index).padStart(3,'0');
  x.id=x.code;x.village_code_8digit='540601'+String(index).padStart(2,'0');
  x.subdistrict_code='540601';x.district_code='5406';x.province_code='54';
 }else if(api==='health-services'){
  x.health_service_code='HS-'+String(index).padStart(2,'0');
  x.legacy_5digit_code='00001';x.legacy_9digit_code='000000123';
  x.village_no='หมู่ 4';
  x.province={province_code:'54',province_name_th:'SYNTHETIC'};
  x.district={district_code:'5406',district_name_th:'SYNTHETIC'};
  x.subdistrict={subdistrict_code:'540601',subdistrict_name_th:'SYNTHETIC'};
  x.health_service_type={id:'FAKE',name_th:'SYNTHETIC'};
  x.service_areas=[{village_nos:['01','2'],subdistrict_code:'540601',id:'SYNTHETIC'}];
  x.latitude=0;x.longitude=0;
 }
 return x;
}
function project(api,rows,proposal=manifest){return projectReferenceRows(api,rows,proposal);}
test('T009C pure in-memory projection for all 3 references preserves exact T003 headers',()=>{
 for(const [api,cols] of [['subdistricts',12],['villages',20],['health-services',16]]){
  const p=project(api,[sample(api)]);
  assert.equal(p.mode,'IN_MEMORY_DESIGN_ONLY');
  assert.equal(p.status,'NOT_READY_FOR_TRANSFER');
  assert.equal(p.destinationContract,'UNVERIFIED');
  assert.equal(p.snapshotCompleteness,'NOT_VERIFIED');
  assert.equal(p.writeAllowed,false);
  assert.equal(p.networkRequests,0);assert.equal(p.appsScriptPosts,0);assert.equal(p.sheetsWrites,0);
  assert.equal(p.metadataColumns,'UNIMPLEMENTED');
  assert.equal(p.rowCount,1);
  assert.equal(p.sourceFieldNames.length,cols);
  assert.deepEqual(p.sourceFieldNames,byApi(api).fields.map(x=>x.source_field));
  assert.equal(p.rows[0].values.length,cols);
 }
});
test('T009C preserves numeric-looking geographic codes as strings and exact key',()=>{
 const village=sample('villages');
 village.code='540601001';village.village_code_8digit='54060101';
 const p=project('villages',[village]);
 assert.equal(p.rows[0].key,'540601001');
 assert.equal(p.rows[0].values[p.sourceFieldNames.indexOf('code')],'540601001');
 assert.equal(p.rows[0].values[p.sourceFieldNames.indexOf('village_code_8digit')],'54060101');
 assert.equal(p.rows[0].values[p.sourceFieldNames.indexOf('village_no')],1);
 const service=project('health-services',[sample('health-services')]);
 assert.equal(service.rows[0].values[service.sourceFieldNames.indexOf('legacy_5digit_code')],'00001');
 assert.equal(service.rows[0].values[service.sourceFieldNames.indexOf('legacy_9digit_code')],'000000123');
 assert.equal(service.rows[0].values[service.sourceFieldNames.indexOf('village_no')],'หมู่ 4');
 assert.equal(service.zeroCoordinateCount,1);
});
test('T009C distinguishes missing, null, and empty VALUE without coercion',()=>{
 const v=sample('villages');
 delete v.name_en;
 v.health_service_code=null;
 v.name_th='';
 const p=project('villages',[v]);
 const row=p.rows[0];
 assert.equal(row.presence.name_en,'ABSENT');
 assert.equal(row.presence.health_service_code,'NULL');
 assert.equal(row.presence.name_th,'VALUE');
 assert.equal(row.values[p.sourceFieldNames.indexOf('name_en')],null);
 assert.equal(row.values[p.sourceFieldNames.indexOf('health_service_code')],null);
 assert.equal(row.values[p.sourceFieldNames.indexOf('name_th')],'');
});
test('T009C serializes nested objects with stable sorted keys and keeps array order',()=>{
 const h=sample('health-services');
 h.health_service_type={z:'FINAL',a:'FIRST'};
 h.service_areas=[{z:2,a:1},{b:3}];
 const result=project('health-services',[h]);
 const data=result.rows[0];
 assert.equal(data.values[result.sourceFieldNames.indexOf('health_service_type')],'{"a":"FIRST","z":"FINAL"}');
 assert.equal(data.values[result.sourceFieldNames.indexOf('service_areas')],'[{"a":1,"z":2},{"b":3}]');
 assert.equal(h.service_areas[0].z,2); // no input mutation
});
test('T009C zero coordinates flag is informational, not fabricated GIS positions',()=>{
 const a=sample('health-services',1),b=sample('health-services',2);
 b.latitude=18.5;b.longitude=100.1;
 const p=project('health-services',[a,b]);
 assert.equal(p.zeroCoordinateCount,1);
 assert.equal(p.rows[0].values[p.sourceFieldNames.indexOf('latitude')],0);
 assert.equal(p.rows[1].values[p.sourceFieldNames.indexOf('longitude')],100.1);
});
test('T009C empty projection does not imply empty authoritative snapshot',()=>{
 const p=project('subdistricts',[]);
 assert.equal(p.rowCount,0);
 assert.equal(p.status,'NOT_READY_FOR_TRANSFER');
 assert.equal(p.snapshotCompleteness,'NOT_VERIFIED');
});
test('T009C denies volunteer gender village-level and all person-grain sources',()=>{
 for(const api of [
  'volunteer-gender','assignments','volunteer-family','resigned-volunteers',
  'volunteer-tenure','UNKNOWN','__proto__']){
  assert.throws(()=>project(api,[]),/REFERENCE_ONLY_ENDPOINT_REQUIRED/);
 }
});
test('T009C rejects duplicates and unknown source/PII-shaped fields without emitting source values',()=>{
 const a=sample('villages'),b=sample('villages');
 assert.throws(()=>project('villages',[a,b]),/DUPLICATE_SOURCE_KEY/);
 a.citizenId='FAKE_PERSON';
 assert.throws(()=>project('villages',[a]),/UNEXPECTED_SOURCE_FIELD/);
});
test('T009C refuses out-of-scope district, subdistrict, nine-digit village or nested geography',()=>{
 for(const [api,modify] of [
  ['subdistricts',r=>{r.district_code='5407';}],
  ['subdistricts',r=>{r.code='550601';}],
  ['villages',r=>{r.province_code='55';}],
  ['villages',r=>{r.district_code='5407';}],
  ['villages',r=>{r.code='540602001';}],
  ['villages',r=>{r.subdistrict_code='540609';}],
  ['health-services',r=>{r.province.province_code='55';}],
  ['health-services',r=>{r.district.district_code='5407';}],
  ['health-services',r=>{r.subdistrict.subdistrict_code='540609';}],
  ['health-services',r=>{r.latitude=91;}]
 ]){
  const row=sample(api);modify(row);
  assert.throws(()=>project(api,[row]),/GEOGRAPHIC_SCOPE_MISMATCH/);
 }
});
test('T009C rejects missing key, wrong types, invented null-only kind or infinity',()=>{
 for(const [api,mutate,why] of [
  ['villages',r=>{delete r.code;},'GEOGRAPHIC_SCOPE_MISMATCH'],
  ['villages',r=>{r.code=540601001;},'GEOGRAPHIC_SCOPE_MISMATCH'],
  ['villages',r=>{r.village_no='1';},'INVALID_INTEGER'],
  ['villages',r=>{r.name_en='UNOBSERVED';},'UNKNOWN_NULL_ONLY_TYPE'],
  ['health-services',r=>{r.longitude=Infinity;},'GEOGRAPHIC_SCOPE_MISMATCH'],
  ['health-services',r=>{r.service_areas='not an array';},'INVALID_ARRAY']
 ]){
  const row=sample(api);mutate(row);
  assert.throws(()=>project(api,[row]),new RegExp(why));
 }
});
test('T009C rejects dangerous formula-like text, control characters and too-long cells',()=>{
 for(const bad of ['=1+1','+cmd','-SUM(1,2)','@evil','  =HYPERLINK("x")','bad\ntext','a'.repeat(32768)]){
  const row=sample('subdistricts');
  row.name_th=bad;
  assert.throws(()=>project('subdistricts',[row]),/INVALID_OR_UNSAFE_STRING/);
 }
});
test('T009C rejects non-JSON nested payloads, overlarge arrays and cyclic values',()=>{
 for(const mutate of [
  row=>{row.service_areas=[()=>1];},
  row=>{row.service_areas=Array.from({length:151},()=>1);},
  row=>{const r={};r.self=r;row.service_areas=[r];},
  row=>{row.service_areas=[{name:'=FORMULA'}];}
 ]){
  const row=sample('health-services');mutate(row);
  assert.throws(()=>project('health-services',[row]),/INVALID_NESTED_VALUE|NESTED_LIMIT_EXCEEDED|NESTED_DEPTH_EXCEEDED|UNSAFE_TEXT/);
 }
});
test('T009C rejects row count above conservative in-memory reference limits',()=>{
 const r=sample('subdistricts');
 assert.throws(()=>project('subdistricts',Array.from({length:21},()=>r)),/ROW_LIMIT_EXCEEDED/);
 assert.throws(()=>project('villages',Array.from({length:151},()=>sample('villages'))),/ROW_LIMIT_EXCEEDED/);
 assert.throws(()=>project('health-services',Array.from({length:101},()=>sample('health-services'))),/ROW_LIMIT_EXCEEDED/);
});
test('T009C rejects tampered schema gates, source mapping and restricted fields',()=>{
 for(const mutate of [
  m=>{m.datasets.find(x=>x.api==='villages').gate='PERSON_DATA_APPROVAL_REQUIRED';},
  m=>{m.datasets.find(x=>x.api==='villages').candidate=['citizenId'];},
  m=>{m.datasets.find(x=>x.api==='villages').fields[0].column='wrong';}
 ]){
  const m=structuredClone(manifest);mutate(m);
  assert.throws(()=>project('villages',[sample('villages')],m),/SYNC_MANIFEST_INVALID/);
 }
});
test('T009C projection has no network/Sheets transport implementation',()=>{
 const code=readFileSync(new URL('../src/sync/reference-projection.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(code,/\bfetch\s*\(|\bSpreadsheetApp\b|\bUrlFetchApp\b|\bwriteFile\s*\(|\bsetValues\s*\(|\bdoPost\s*\(/);
});
