import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {syntheticReferenceRow} from '../src/sync/synthetic-reference-row.mjs';
import {collectReferenceSnapshot,SNAPSHOT_CONFIRM} from '../src/sync/reference-snapshot.mjs';
import {LIVE_ORIGIN} from '../src/cli/live-fetch.mjs';

const manifest=JSON.parse(readFileSync(new URL('../docs/sheets-schema.json',import.meta.url),'utf8'));
const TOKEN='SYNTHETIC_ONLY_BEARER_123456789';
const respond=p=>new Response(JSON.stringify(p),{
 status:200,headers:{'content-type':'application/json'}
});
function row(api,i=1){
 const r=syntheticReferenceRow(api,manifest);
 if(api==='subdistricts'){
  r.code='54060'+i;r.id=r.code;
 }else if(api==='villages'){
  r.code='540601'+String(i).padStart(3,'0');
  r.id=r.code;r.village_no=i;
  r.village_code_8digit='540601'+String(i).padStart(2,'0');
  r.label=r.name_th;
 }else if(api==='health-services'){
  r.health_service_code='SYNTHETIC-HS-'+i;
  r.health_service_type={id:'SYNTHETIC',name_th:'SYNTHETIC',name_en:null};
  r.province={province_code:'54',province_name_th:'SYNTHETIC',province_name_en:null};
  r.district={district_code:'5406',district_name_th:'SYNTHETIC',district_name_en:null};
  r.subdistrict={subdistrict_code:'540601',subdistrict_name_th:'SYNTHETIC',subdistrict_name_en:null};
 }
 return r;
}
function opts(endpoint,fetchImpl){
 return {
  endpoint,manifest,
  confirm:async()=>SNAPSHOT_CONFIRM,
  getToken:async()=>TOKEN,
  fetchImpl
 };
}
test('T009D bounded subdistrict reference GET returns in-memory rows only after explicit confirmation',async()=>{
 let calls=0;
 const data=Array.from({length:8},(_,i)=>row('subdistricts',i+1));
 const got=await collectReferenceSnapshot(opts('subdistricts',async(url,config)=>{
  calls++;const u=new URL(url);
  assert.equal(u.origin,LIVE_ORIGIN);
  assert.equal(u.pathname,'/api/v1/lookups/subdistricts');
  assert.equal(u.search,'?district_code=5406');
  assert.equal(config.method,'GET');assert.equal(config.redirect,'error');
  assert.equal(config.credentials,'omit');
  assert.equal(config.headers.Authorization,'Bearer '+TOKEN);
  return respond({items:data});
 }));
 assert.equal(got.status,'SNAPSHOT_VALIDATED_IN_MEMORY');
 assert.equal(got.rowCount,8);assert.equal(got.observedCountMatches,true);
 assert.equal(got.completeness,'UNPAGINATED_SOURCE_HAS_NO_TOTAL');
 assert.equal(got.transferApproved,false);
 assert.equal(got.appsScriptPosts,0);assert.equal(got.sheetsWrites,0);
 assert.equal(got.rows.length,8);assert.equal(calls,1);
 assert.equal(got.rows[0].code,'540601');
});

test('T009D village reference GET checks code relation and no pagination claim',async()=>{
 const data=Array.from({length:3},(_,i)=>row('villages',i+1));
 const got=await collectReferenceSnapshot(opts('villages',async(url)=>{
  const u=new URL(url);
  assert.equal(u.search,'?province_code=54&district_code=5406');
  return respond({items:data});
 }));
 assert.equal(got.status,'SNAPSHOT_VALIDATED_IN_MEMORY');
 assert.equal(got.rowCount,3);assert.equal(got.observedCountMatches,false);
 assert.equal(got.paginationComplete,null);
 assert.equal(got.transferApproved,false);
 assert.equal(got.appsScriptPosts,0);
});

test('T009D health service reference GET reads verified 10+8 offset pages',async()=>{
 const data=Array.from({length:18},(_,i)=>row('health-services',i+1));
 let calls=0;
 const got=await collectReferenceSnapshot(opts('health-services',async(url,config)=>{
  const u=new URL(url);
  const offset=calls++*10;
  assert.equal(u.pathname,'/api/v1/geo-management/health-services');
  assert.equal(u.searchParams.get('offset'),String(offset));
  assert.equal(u.searchParams.get('limit'),'10');
  assert.equal(u.searchParams.getAll('health_service_type_ids_exclude').length,3);
  assert.equal(config.method,'GET');
  return respond({items:data.slice(offset,offset+10),total:18,offset,limit:10});
 }));
 assert.equal(calls,2);
 assert.equal(got.status,'SNAPSHOT_VALIDATED_IN_MEMORY');
 assert.equal(got.rowCount,18);
 assert.equal(got.observedCountMatches,true);
 assert.equal(got.pagesFetched,2);
 assert.equal(got.paginationComplete,true);
 assert.equal(got.completeness,'SOURCE_TOTAL_CHECKED');
 assert.equal(got.appsScriptPosts,0);
 assert.equal(got.transferApproved,false);
});

test('T009D no token read or network before explicit confirmation',async()=>{
 let tokens=0,calls=0;
 const r=await collectReferenceSnapshot({
  endpoint:'villages',manifest,
  confirm:async()=> 'UNAUTHORIZED',
  getToken:async()=>{tokens++;return TOKEN;},
  fetchImpl:async()=>{calls++;return respond({items:[]});}
 });
 assert.equal(r.status,'CONFIRMATION_REQUIRED');
 assert.equal(tokens,0);assert.equal(calls,0);assert.equal(r.networkRequests,0);
 assert.equal('rows' in r,false);
});

test('T009D refuses gender/person endpoints and invalid bearer before network',async()=>{
 let calls=0;
 for(const endpoint of ['volunteer-gender','assignments','volunteer-family',
  'resigned-volunteers','volunteer-tenure','unknown']){
  const r=await collectReferenceSnapshot(opts(endpoint,async()=>{calls++;}));
  assert.equal(r.status,'REFERENCE_ONLY_ENDPOINT_REQUIRED');
  assert.equal('rows' in r,false);
 }
 const invalid=await collectReferenceSnapshot({
  ...opts('villages',async()=>{calls++;}),getToken:async()=> 'MOCK_ONLY_12345'
 });
 assert.equal(invalid.status,'INVALID_TOKEN_FORMAT');assert.equal(calls,0);
});

test('T009D missing page and changing health total fail closed with no source rows returned',async()=>{
 const all=Array.from({length:18},(_,i)=>row('health-services',i+1));
 for(const fault of ['MISSING','TOTAL_CHANGED','DUPLICATE']){
  let count=0;
  const out=await collectReferenceSnapshot(opts('health-services',async()=>{
   const offset=count++*10;
   let items=all.slice(offset,offset+10);
   if(fault==='MISSING'&&offset===10)items=items.slice(0,7);
   if(fault==='DUPLICATE'&&offset===10)items[0]={...items[0],health_service_code:all[0].health_service_code};
   const total=fault==='TOTAL_CHANGED'&&offset===10?19:18;
   return respond({items,total,offset,limit:10});
  }));
  assert.notEqual(out.status,'SNAPSHOT_VALIDATED_IN_MEMORY');
  assert.equal(out.appsScriptPosts,0);
  assert.equal('rows' in out,false);
 }
});

test('T009D source rows with extra person field, invalid district or unsafe text are rejected',async()=>{
 for(const fault of ['PERSON_FIELD','OUT_OF_DISTRICT','FORMULA']){
  const item=row('villages');
  if(fault==='PERSON_FIELD')item.citizenId='SYNTHETIC';
  if(fault==='OUT_OF_DISTRICT')item.district_code='5501';
  if(fault==='FORMULA')item.name_th='=BAD';
  const out=await collectReferenceSnapshot(opts('villages',async()=>respond({items:[item]})));
  assert.notEqual(out.status,'SNAPSHOT_VALIDATED_IN_MEMORY');
  assert.equal('rows' in out,false);
 }
});

test('T009D API HTTP error redacts token and any private server content',async()=>{
 for(const res of [
  new Response('SECRET_BEARER_PERSON',{status:403}),
  new Response('REDIRECT_SECRET',{status:302,headers:{Location:'https://example.invalid'}}),
  new Response('HTML_LOGIN',{status:200,headers:{'content-type':'text/html'}})
 ]){
  const out=await collectReferenceSnapshot(opts('villages',async()=>res));
  assert.notEqual(out.status,'SNAPSHOT_VALIDATED_IN_MEMORY');
  assert.equal('rows' in out,false);
  assert.doesNotMatch(JSON.stringify(out),/SECRET|BEARER_PERSON|LOGIN/);
 }
});
