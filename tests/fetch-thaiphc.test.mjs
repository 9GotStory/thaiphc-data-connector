import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchThaiPhc} from '../scripts/fetch-thaiphc.mjs';
import {ENDPOINTS} from '../src/cli/endpoints.mjs';

const token='SYNTHETIC_READ_ONLY_TOKEN';
const json=(data,status=200)=>new Response(JSON.stringify(data),{
 status,headers:{'Content-Type':'application/json'}
});

test('the direct reader follows each of the eight endpoints and collects every page',async()=>{
 for(const [endpoint,{pagination,path}] of Object.entries(ENDPOINTS)){
  const source=Array.from({length:11},(_,i)=>({
   code:`reference-${i}`,districtCode:'5406',subdistrictCode:'540601',
   villageCode:'540303004',retirementReason:null,citizenId:'SYNTHETIC_RESTRICTED',
   volunteerName:'SYNTHETIC_PRIVATE_NAME'
  }));
  const calls=[];
  const result=await fetchThaiPhc(endpoint,token,{async fetchImpl(value,options){
   const url=new URL(value);
   const q=url.searchParams;
   assert.equal(url.origin,'https://api-thaiphc.hss.moph.go.th');
   assert.equal(url.pathname,path);
   assert.equal(options.method,'GET');
   assert.equal(options.redirect,'error');
   assert.equal(options.headers.Authorization,`Bearer ${token}`);
   assert.equal(q.get('district')??q.get('district_code')??q.get('districtCode'),'5406');
   const page=calls.length+1;
   const offset=(page-1)*10;
   calls.push({page:q.get('page'),offset:q.get('offset')});
   if(pagination==='none')return json({items:source});
   const items=source.slice(offset,offset+10),total=source.length;
   if(pagination==='assignment')return json({items,pagination:{page,limit:10,total}});
   if(pagination==='offset')return json({items,offset,limit:10,total});
   return json({items,page,pageSize:10,total,success:true});
  }});
  assert.equal(result.total,11,endpoint);
  assert.equal(result.items.length,11,endpoint);
  assert.equal(result.requestedDistrictCode,'5406');
  assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC_RESTRICTED|SYNTHETIC_PRIVATE_NAME|SYNTHETIC_READ_ONLY_TOKEN/);
  if(pagination==='none')assert.deepEqual(calls,[{page:null,offset:null}]);
  else if(pagination==='offset')assert.deepEqual(calls.map(call=>call.offset),['0','10']);
  else assert.deepEqual(calls.map(call=>call.page),['1','2']);
  if(endpoint==='volunteer-family')assert.equal(result.items[0].villageCode,'540303004');
  if(endpoint==='volunteer-tenure')assert.equal(result.items[0].retirementReason,null);
 }
});

test('HTTP rejection and incomplete pages fail instead of returning partial JSON',async()=>{
 await assert.rejects(fetchThaiPhc('assignments',token,{fetchImpl:async()=>json({},401)}),/^Error: HTTP_401$/);
 const incomplete={items:[],total:3,page:1,pageSize:10,success:true};
 await assert.rejects(fetchThaiPhc('volunteer-family',token,{fetchImpl:async()=>json(incomplete)}),/^Error: INCOMPLETE_SOURCE_PAGE$/);
});
