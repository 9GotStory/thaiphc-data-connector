import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const sample=JSON.parse(await readFile(new URL('./fixtures/geo-observed-redacted.json',import.meta.url),'utf8'));
const villages=sample.villages;
const health=sample.health_services;
const codes = new Map(villages.map(v=>[v.code,v]));
const services = new Map(health.items.map(s=>[s.health_service_code,s]));

test('85 geographic-only villages have distinct IDs/codes and consistent code formats',()=>{
 assert.equal(villages.length,85);
 assert.equal(codes.size,85);
 assert.equal(new Set(villages.map(v=>v.id)).size,85);
 assert.equal(new Set(villages.map(v=>v.village_code_8digit)).size,85);
 const composite=new Set();
 for(const v of villages){
   assert.equal(v.id,v.code);
   assert.equal(v.code,v.subdistrict_code+String(v.village_no).padStart(3,'0'));
   assert.equal(v.village_code_8digit,v.subdistrict_code+String(v.village_no).padStart(2,'0'));
   assert.equal(v.code.slice(0,4),'5406');
   const key=v.subdistrict_code+':'+v.village_no;
   assert.equal(composite.has(key),false);
   composite.add(key);
 }
});

test('geographic-only fixture retains only whitelisted non-person fields',()=>{
 assert.deepEqual(Object.keys(villages[0]).sort(),['code','id','village_code_8digit','subdistrict_code','village_no','health_service_code'].sort());
 assert.deepEqual(Object.keys(health.items[0]).sort(),['health_service_code','subdistrict_code','latitude','longitude','service_areas'].sort());
});

test('village health-service joins identify unresolved code without claiming a broken FK',()=>{
 assert.equal(health.total,18);
 assert.equal(health.items.length,10);
 assert.equal(services.size,10);
 const references=villages.filter(v=>v.health_service_code!==null);
 assert.equal(references.length,10);
 const matched=references.filter(v=>services.has(v.health_service_code));
 assert.equal(matched.length,9);
 const unresolved=references.filter(v=>!services.has(v.health_service_code));
 assert.equal(unresolved.length,1);
 assert.equal(unresolved[0].health_service_code,'BA0000588');
});

test('sample health-service coordinates are zero and nested service area is scoped',()=>{
 for(const s of health.items){
   assert.equal(s.latitude,0);
   assert.equal(s.longitude,0);
   assert.equal(s.service_areas.length,1);
   for(const a of s.service_areas){
     assert.equal(a.subdistrict_code,s.subdistrict_code);
     assert.equal(typeof a.is_primary,'boolean');
     assert.equal(Array.isArray(a.village_nos),true);
     assert.ok(a.village_nos.every(v=>typeof v==='string'));
   }
 }
});

test('observed village nullability is retained in reduced fixture',()=>{
 assert.equal(villages.filter(v=>v.health_service_code===null).length,75);
 assert.equal(villages.filter(v=>v.health_service_code==='GA0006419').length,9);
});
