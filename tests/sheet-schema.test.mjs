import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const spec=JSON.parse(await readFile(new URL('../docs/sheets-schema.json',import.meta.url),'utf8'));
const fieldMatrix=await readFile(new URL('../docs/field-matrix.md',import.meta.url),'utf8');
const prose=await readFile(new URL('../docs/sheet-schema.md',import.meta.url),'utf8');
const names=new Set(spec.datasets.map(d=>d.tab));

test('design is not deployable and lists all eight distinct datasets',()=>{
 assert.equal(spec.state,'DRAFT_DESIGN_ONLY');
 assert.equal(spec.datasets.length,8);
 assert.equal(names.size,8);
 assert.ok(spec.datasets.every(d=>d.materialization==='DESIGN_ONLY_NO_WRITES'));
});

test('every observed source path matches T002 source matrix with exact field spelling',()=>{
 const rows=[];
 for(const line of fieldMatrix.split(/\r?\n/)){
  if(!line.startsWith('| `')||!line.includes('items[].'))continue;
  const cells=line.split('|').slice(1,-1).map(x=>x.trim());
  if(cells.length<3||!cells[1].startsWith('`items[].'))continue;
  rows.push(cells[0].replaceAll('`','')+':'+cells[1].replaceAll('`','').slice('items[].'.length));
 }
 assert.equal(rows.length,162);
 const generated=spec.datasets.flatMap(d=>[...d.fields.map(f=>d.api+':'+f.source_field),...d.nested_paths.map(p=>d.api+':'+p.path)]);
 assert.equal(generated.length,162);
 assert.deepEqual(generated.slice().sort(),rows.slice().sort());
 assert.equal(spec.datasets.reduce((n,d)=>n+d.fields.length,0),145);
 assert.equal(spec.datasets.reduce((n,d)=>n+d.nested_paths.length,0),17);
});

test('columns retain exact spelling, type and preserve nested parent JSON fields',()=>{
 for(const d of spec.datasets){
   const cols=d.fields.map(f=>f.column);
   assert.equal(new Set(cols).size,cols.length);
   assert.ok(d.fields.every(f=>f.source_field===f.column));
   assert.ok(d.fields.every(f=>!f.column.startsWith('_')));
   for(const path of d.nested_paths)assert.ok(cols.includes(path.stored_in_column));
 }
 const health=spec.datasets.find(d=>d.api==='health-services');
 for(const k of ['health_service_type','province','district','subdistrict','service_areas']){
  assert.equal(health.fields.find(f=>f.column===k)?.sheet_type,'JSON_TEXT');
 }
 const assign=spec.datasets.find(d=>d.api==='assignments');
 assert.ok(assign.fields.some(f=>f.column==='osmShowbbody'));
 assert.ok(!assign.fields.some(f=>f.column==='osmShowbody'));
});

test('codes remain text, real person field values are omitted by policy',()=>{
 for(const d of spec.datasets){
  for(const f of d.fields){
   if(/(^|_)(code|id)$|Code$|_code|^osmCode$|postal_code/i.test(f.column)&&f.observed_kind==='string'){
     assert.equal(f.sheet_type,'TEXT',d.api+':'+f.column);
   }
   if(['citizenId','firstName','lastName','fullName','address','volunteerName'].includes(f.column)){
     assert.equal(f.pii_policy,'RESTRICTED_DEFAULT_OMIT');
   }
  }
 }
 assert.ok(spec.datasets.filter(d=>d.gate==='PERSON_DATA_APPROVAL_REQUIRED').length===4);
 assert.ok(spec.rules.privacy.includes('DISABLED_BY_DEFAULT'));
});

test('volunteer family has no invented key and aggregates differ from person records',()=>{
 const family=spec.datasets.find(d=>d.api==='volunteer-family');
 assert.deepEqual(family.candidate,[]);
 assert.equal(family.upsert_policy,'BLOCKED_NO_STABLE_KEY');
 const gender=spec.datasets.find(d=>d.api==='volunteer-gender');
 assert.deepEqual(gender.candidate,['provinceCode','districtCode','villageCode']);
 assert.ok(!gender.candidate.includes('total'));
 const people=spec.datasets.filter(d=>d.gate==='PERSON_DATA_APPROVAL_REQUIRED');
 assert.ok(people.every(d=>d.gate==='PERSON_DATA_APPROVAL_REQUIRED'));
});

test('NULL, ABSENT, and VALUE are distinct; empty string stays VALUE (synthetic-only)',()=>{
 const classify=(obj,key)=>!Object.hasOwn(obj,key)?'ABSENT':obj[key]===null?'NULL':'VALUE';
 const ex={a:null,b:'',c:false,d:0};
 assert.deepEqual(['a','b','c','d','e'].map(k=>classify(ex,k)),['NULL','VALUE','VALUE','VALUE','ABSENT']);
 assert.ok(spec.rules.null_policy.includes('ABSENT, NULL, or VALUE'));
 assert.ok(prose.includes('RAW')&&prose.includes('PLAIN_TEXT'));
});

test('support tabs carry no sensitive raw payload field',()=>{
 assert.deepEqual(spec.supporting_tabs.map(x=>x.tab),['_SyncRuns','_Quarantine']);
 const forbidden=['citizenId','firstName','lastName','fullName','raw_payload','bearer_token','osmCode'];
 for(const t of spec.supporting_tabs){
  assert.equal(t.columns.filter(x=>forbidden.includes(x)).length,0);
 }
 assert.ok(spec.rules.deletion_policy.includes('NEVER_REMOVE_ROWS_FROM_INCOMPLETE_PAGESET'));
});

test('documentation/manifest are free of obvious raw Thai national IDs and secrets',()=>{
 const s=JSON.stringify(spec)+fieldMatrix+prose;
 assert.doesNotMatch(s,/(?<!\d)\d{13}(?!\d)/);
 assert.doesNotMatch(s,/Bearer\s+[A-Za-z0-9_.-]{20,}/i);
});
