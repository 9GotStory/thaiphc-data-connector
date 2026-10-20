import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRequest,ENDPOINTS,endpointNames} from '../src/cli/endpoints.mjs';
import {createMockTransport,syntheticTransport} from '../src/cli/transport.mjs';
import {collectOffline} from '../src/cli/runner.mjs';
import {main} from '../src/cli/index.mjs';

function query(id,opts){return new URLSearchParams(buildRequest(id,opts).query);}
function mockChange(id,fn){
 const base=syntheticTransport(id);
 return createMockTransport(async(req)=>fn(await base(req),req));
}
test('all eight exact allowlisted paths',()=>{
 assert.equal(endpointNames().length,8);
 assert.ok(endpointNames().every(id=>ENDPOINTS[id].path.startsWith('/api/v1/')));
 assert.throws(()=>buildRequest('https://other.example'),/UNKNOWN_ENDPOINT/);
});
test('assignments preserve both blank aliases and exact order',()=>{
 const p=query('assignments');
 assert.deepEqual([...p.keys()],['page','pageSize','provinceCode','districtCode','osmStatus','osm_status','approval_status','order_by','sort_dir']);
 assert.equal(p.get('osmStatus'),'');
 assert.equal(p.get('osm_status'),'');
 assert.deepEqual([p.get('approval_status'),p.get('order_by'),p.get('sort_dir')],['approved','approved_date','desc']);
});
test('unpaginated lookup queries use underscore keys',()=>{
 assert.deepEqual([...query('subdistricts').keys()],['district_code']);
 assert.deepEqual([...query('villages').keys()],['province_code','district_code']);
 assert.throws(()=>buildRequest('villages',{page:2}),/UNPAGINATED_LOOKUP/);
});
test('health-services keeps all three repeated exclusion UUIDs',()=>{
 const p=query('health-services',{offset:7,pageSize:7});
 assert.deepEqual([...p.keys()],['limit','offset','health_service_type_ids_exclude','health_service_type_ids_exclude','health_service_type_ids_exclude','province_code','district_code']);
 assert.deepEqual(p.getAll('health_service_type_ids_exclude'),[
  '7310dd94-0395-48cb-845b-803279a54f6c',
  '96ca3348-49c2-4d89-903b-32939fd1c95c',
  'f464d614-c20e-4391-84a9-4c8edb7982a9'
 ]);
});
test('all report parameter variants match observed aliases',()=>{
 for(const id of ['volunteer-gender','volunteer-family'])
  assert.deepEqual([...query(id).keys()],['page','pageSize','province','district']);
 for(const id of ['resigned-volunteers','volunteer-tenure'])
  assert.deepEqual([...query(id).keys()],['page','pageSize','provinceCode','districtCode','province','district']);
});
test('request limits and invalid endpoint are rejected',()=>{
 for(const o of [{page:0},{pageSize:0},{pageSize:101},{page:1.5},{pageSize:'10'}])
  assert.throws(()=>buildRequest('volunteer-gender',o));
 assert.throws(()=>buildRequest('health-services',{offset:-1}));
 assert.throws(()=>buildRequest('assignments',{offset:1}));
});
test('offline runs ignore a hostile global fetch',async()=>{
 const prev=globalThis.fetch;
 try{globalThis.fetch=()=>{throw new Error('NO_NETWORK');};
  const r=await collectOffline('villages',{transport:syntheticTransport('villages'),pageSize:3});
  assert.deepEqual([r.status,r.pages,r.records],['COMPLETE',1,1]);
 }finally{globalThis.fetch=prev;}
});
test('two mock pagination flavors complete, output contains counts only',async()=>{
 for(const id of ['health-services','volunteer-gender']){
  const r=await collectOffline(id,{transport:syntheticTransport(id),pageSize:3});
  assert.deepEqual([r.status,r.pages,r.records],['COMPLETE',2,5]);
  assert.equal(Object.hasOwn(r,'items'),false);
 }
});
test('person-level mock inputs still block all four datasets',async()=>{
 for(const id of ['assignments','volunteer-family','resigned-volunteers','volunteer-tenure']){
  const r=await collectOffline(id,{transport:syntheticTransport(id),pageSize:3});
  assert.equal(r.status,'BLOCKED',id);assert.equal(r.issueCounts.PERSON_DATA_DISABLED,1);
 }
});
test('unbranded function cannot serve as offline transport',async()=>{
 await assert.rejects(()=>collectOffline('villages',{transport:async()=>({status:200,body:{items:[]}})}),/OFFLINE_TRANSPORT_REQUIRED/);
});
test('page cap creates PARTIAL not COMPLETE',async()=>{
 const r=await collectOffline('health-services',{transport:syntheticTransport('health-services'),pageSize:2,maxPages:1});
 assert.deepEqual([r.status,r.pages,r.records],['PARTIAL',1,2]);
 assert.equal(r.issueCounts.PAGE_LIMIT_REACHED,1);
});
test('retry 429,503 uses deterministic bounded exponential delay',async()=>{
 let count=0;const delays=[];const success=syntheticTransport('villages');
 const mock=createMockTransport(async req=>++count<=2?{status:count===1?429:503,body:{}}:success(req));
 const r=await collectOffline('villages',{transport:mock,retryDelay:async ms=>delays.push(ms)});
 assert.equal(r.status,'COMPLETE');assert.equal(r.requestAttempts,3);
 assert.deepEqual(delays,[50,100]);
});
test('403 blocks and never exposes error body',async()=>{
 const r=await collectOffline('villages',{transport:createMockTransport(async()=>({status:403,body:{message:'PRIVATE'}}))});
 assert.equal(r.status,'BLOCKED');assert.equal(r.issueCounts.AUTHORIZATION_REJECTED,1);
 assert.doesNotMatch(JSON.stringify(r),/PRIVATE/);
});
test('thrown transport exception does not echo token or person strings',async()=>{
 const r=await collectOffline('villages',{transport:createMockTransport(async()=>{throw Error('Bearer PRIVATESECRET firstName IDENTIFIER');}),maxRetries:0});
 assert.equal(r.status,'PARTIAL');assert.equal(r.issueCounts.MOCK_TRANSPORT_ERROR,1);
 assert.doesNotMatch(JSON.stringify(r),/PRIVATESECRET|firstName|IDENTIFIER/);
});
test('report failure is blocked even when it has an items array',async()=>{
 const r=await collectOffline('volunteer-gender',{transport:mockChange('volunteer-gender',r=>({status:200,body:{...r.body,success:false}}))});
 assert.equal(r.status,'BLOCKED');assert.equal(r.issueCounts.MALFORMED_PAGINATION,1);
});
test('total change across pages blocks the run',async()=>{
 const r=await collectOffline('volunteer-gender',{pageSize:3,transport:mockChange('volunteer-gender',(r,req)=>{
   if(new URLSearchParams(req.query).get('page')==='2')r.body.total=6;
   return r;
 })});
 assert.equal(r.status,'BLOCKED');assert.equal(r.issueCounts.TOTAL_CHANGED_BETWEEN_PAGES,1);
});
test('missing last-page data blocks the run',async()=>{
 const r=await collectOffline('health-services',{pageSize:3,transport:mockChange('health-services',(r,req)=>{
   if(new URLSearchParams(req.query).get('offset')==='3')r.body.items=[];
   return r;
 })});
 assert.equal(r.status,'BLOCKED');assert.equal(r.issueCounts.MISSING_PAGE_ROWS,1);
});
test('malformed response body blocks without exposing data',async()=>{
 for(const body of [{items:'wrong'},{items:[null]},null]){
  const r=await collectOffline('villages',{transport:createMockTransport(async()=>({status:200,body}))});
  assert.equal(r.status,'BLOCKED');
  assert.equal(r.issueCounts.MALFORMED_RESPONSE,1);
 }
});
test('cross-district village code is flagged, not rewritten',async()=>{
 const r=await collectOffline('volunteer-gender',{pageSize:3,transport:mockChange('volunteer-gender',r=>{
  r.body.items[0].villageCode='540303004';return r;
 })});
 assert.equal(r.status,'QUARANTINED');assert.ok(r.issueCounts.GEOGRAPHY_MISMATCH);
 assert.equal('items' in r,false);
});
test('gender aggregate mismatch is quarantined',async()=>{
 const r=await collectOffline('volunteer-gender',{pageSize:3,transport:mockChange('volunteer-gender',r=>{
  r.body.items[0].female=1;return r;
 })});
 assert.equal(r.status,'QUARANTINED');assert.ok(r.issueCounts.GENDER_TOTAL_MISMATCH);
});
test('duplicate page keys are not accepted as complete',async()=>{
 const r=await collectOffline('volunteer-gender',{pageSize:3,transport:mockChange('volunteer-gender',(r,req)=>{
  if(new URLSearchParams(req.query).get('page')==='2'){
   r.body.items[0].villageCode='540608001';r.body.items[0].villageNo='1';
  }
  return r;
 })});
 assert.equal(r.status,'BLOCKED');assert.ok(r.issueCounts.DUPLICATE_SOURCE_KEY);
});
test('missing village key cannot produce complete state',async()=>{
 const r=await collectOffline('villages',{transport:mockChange('villages',r=>{
  delete r.body.items[0].code;return r;
 })});
 assert.equal(r.status,'BLOCKED');assert.ok(r.issueCounts.MISSING_KEY);
});
test('CLI inspect/help and simulate emit no source rows',async()=>{
 for(const argv of [[],['inspect'],['dry-run','--endpoint','villages'],['validate','--endpoint','volunteer-gender']]){
  const lines=[];const code=await main(argv,s=>lines.push(s));
  assert.equal(code,0);
  assert.doesNotMatch(lines.join('\n'),/citizenId|firstName|fullName|Authorization:\s*Bearer/);
 }
});
test('CLI rejects live, token, output flags without echoing unknown values',async()=>{
 for(const argv of [['dry-run','--live'],['dry-run','--token','PRIVATEVALUE'],['dry-run','--output','people.json'],['validate','--endpoint','PRIVATEVALUE']]){
  const lines=[];const code=await main(argv,s=>lines.push(s));
  assert.equal(code,2);assert.doesNotMatch(lines.join('\n'),/PRIVATEVALUE|people.json/);
 }
});

test('direct executable entrypoint emits help and JSON; no inert launch',async()=>{
 const {spawnSync}=await import('node:child_process');
 const path=(await import('node:url')).fileURLToPath(new URL('../src/cli/index.mjs',import.meta.url));
 const p=spawnSync(process.execPath,[path,'inspect','--endpoint','villages'],{encoding:'utf8',timeout:6000});
 assert.equal(p.status,0,String(p.stderr).slice(0,100));
 assert.equal(JSON.parse(p.stdout).endpoints[0].id,'villages');
 assert.equal(p.stderr,'');
});
