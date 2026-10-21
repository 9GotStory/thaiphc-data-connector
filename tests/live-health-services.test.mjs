import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {CONFIRM_HEALTH_SERVICES_PHRASE,confirmLiveUseFromTTY} from '../src/cli/live-tty.mjs';
import {LIVE_ORIGIN} from '../src/cli/live-fetch.mjs';
import {liveFetchHealthServices} from '../src/cli/live-health-services.mjs';
import {main} from '../src/cli/index.mjs';

const TOKEN='TEST_ONLY_SYNTHETIC_TOKEN_1234567890';
const EXCLUDES=[
 '7310dd94-0395-48cb-845b-803279a54f6c',
 '96ca3348-49c2-4d89-903b-32939fd1c95c',
 'f464d614-c20e-4391-84a9-4c8edb7982a9'
];
const uuid='00000000-0000-4000-8000-000000000001';
function services(total=18){
 return Array.from({length:total},(_,i)=>{
  const sub='54060'+(i%8+1);
  return {
   health_service_code:'GA'+String(i+1).padStart(7,'0'),
   health_service_name_th:'SYNTHETIC_SERVICE_'+(i+1),health_service_name_en:null,
   legacy_5digit_code:String(i+1).padStart(5,'0'),
   legacy_9digit_code:String(i+1).padStart(9,'0'),
   village_no:'1',latitude:0,longitude:0,
   health_service_type:{id:uuid,name_th:'SYNTHETIC_TYPE',name_en:'Synthetic Type'},
   province:{province_code:'54',province_name_th:'SYNTHETIC_PROVINCE',province_name_en:'Synthetic Province'},
   district:{district_code:'5406',district_name_th:'SYNTHETIC_DISTRICT',district_name_en:'Synthetic District'},
   subdistrict:{subdistrict_code:sub,subdistrict_name_th:'SYNTHETIC_SUBDISTRICT',subdistrict_name_en:'Synthetic Subdistrict'},
   service_areas:[{id:uuid,subdistrict_code:sub,subdistrict_name_th:'SYNTHETIC_SUBDISTRICT',village_nos:['1'],is_primary:true}],
   created_at:'2025-07-30T04:31:26.342131+00:00',
   updated_at:'2025-07-30T04:31:26.342132+00:00',deleted_at:null
  };
 });
}
function json(payload,status=200,headers={}){
 return new Response(JSON.stringify(payload),{status,headers:{'content-type':'application/json',...headers}});
}
function response(items,total=18,offset=0,limit=10){return json({items,total,limit,offset});}
function injector(callback,options={}){
 return liveFetchHealthServices({
  confirm:async()=>CONFIRM_HEALTH_SERVICES_PHRASE,
  getToken:async()=>TOKEN,
  fetchImpl:callback,
  ...options
 });
}
function fetchPages(rows=services(),total=rows.length){
 let call=0;
 return async(url,opts)=>{
  const u=new URL(url);
  assert.equal(u.origin,LIVE_ORIGIN);
  assert.equal(u.pathname,'/api/v1/geo-management/health-services');
  assert.equal(u.searchParams.get('limit'),'10');
  assert.equal(u.searchParams.get('offset'),String(call*10));
  assert.deepEqual(u.searchParams.getAll('health_service_type_ids_exclude'),EXCLUDES);
  assert.equal(u.searchParams.get('province_code'),'54');
  assert.equal(u.searchParams.get('district_code'),'5406');
  assert.equal([...u.searchParams.keys()].length,7);
  assert.equal(opts.method,'GET');
  assert.equal(opts.redirect,'error');
  assert.equal(opts.credentials,'omit');
  assert.equal(opts.cache,'no-store');
  assert.equal(opts.referrerPolicy,'no-referrer');
  assert.equal(opts.headers.Accept,'application/json');
  assert.equal(opts.headers.Authorization,'Bearer '+TOKEN);
  const offset=call++*10;
  return response(rows.slice(offset,offset+10),total,offset);
 };
}
class FakeTTY extends EventEmitter{
 constructor(){super();this.isTTY=true;this.isRaw=false;this.paused=false;this.history=[];}
 setRawMode(v){this.isRaw=v;this.history.push(v);}
 pause(){this.paused=true;}
 resume(){this.paused=false;}
 isPaused(){return this.paused;}
}
function tty(){
 const input=new FakeTTY(),written=[];
 const output={isTTY:true,write(x){written.push(x);return true;}};
 return {input,output,written};
}

test('18 source-like synthetic rows have 16 fields, no real identities',()=>{
 const rows=services();
 assert.equal(rows.length,18);
 assert.ok(rows.every(x=>Object.keys(x).length===16));
 assert.ok(rows.every(x=>x.health_service_name_th.startsWith('SYNTHETIC')));
});
test('two bounded pages 10+8, exactly repeated exclusions, complete aggregate only',async()=>{
 let calls=0;
 const fake=fetchPages();
 const r=await injector(async(url,opts)=>{calls++;return fake(url,opts);});
 assert.equal(calls,2);
 assert.deepEqual(r,{mode:'LIVE_READ_ONLY',endpoint:'health-services',status:'PASS',
   success:true,httpStatus:200,count:18,total:18,pagesFetched:2,zeroCoordinateCount:18});
 assert.doesNotMatch(JSON.stringify(r),/TEST_ONLY|SYNTHETIC_SERVICE|00000000-0000/);
});
test('20 rows exactly two pages, zero rows one page, no unnecessary third request',async()=>{
 for(const count of [0,10,20]){
  let calls=0;const fake=fetchPages(services(count),count);
  const result=await injector(async(url,opts)=>{calls++;return fake(url,opts);});
  assert.equal(result.status,'PASS');
  assert.equal(result.count,count);
  assert.equal(calls,Math.max(1,Math.ceil(count/10)));
 }
});
test('separate health-service confirmation hides bytes; invalid scope rejected',async()=>{
 const io=tty(),pending=confirmLiveUseFromTTY(io,'health-services');
 const buf=Buffer.from(CONFIRM_HEALTH_SERVICES_PHRASE+'\r');
 io.input.emit('data',buf);
 assert.equal(await pending,CONFIRM_HEALTH_SERVICES_PHRASE);
 assert.ok(buf.every(x=>x===0));
 assert.deepEqual(io.input.history,[true,false]);
 assert.match(io.written.join(''),/FETCH HEALTH SERVICES 5406/);
 await assert.rejects(()=>confirmLiveUseFromTTY(io,'not-supported'),/LIVE_CONFIRMATION_SCOPE_REJECTED/);
});
test('bad confirmation stops before token read or any request',async()=>{
 let tokenCount=0,calls=0;
 const out=await injector(async()=>{calls++;return response([],0,0);},{
  confirm:async()=> 'FETCH VILLAGES 5406',
  getToken:async()=>{tokenCount++;return TOKEN;}
 });
 assert.equal(out.status,'CONFIRMATION_REQUIRED');assert.equal(tokenCount,0);assert.equal(calls,0);
});
test('unexpected status including 401/403 does not disclose response or continue',async()=>{
 for(const [status,expected] of [[401,'HTTP_401'],[403,'HTTP_403'],[500,'HTTP_ERROR'],[302,'HTTP_ERROR']]){
  const out=await injector(async()=>new Response('SECRET_SERVER_BODY',{status}));
  assert.equal(out.status,expected);assert.equal(out.httpStatus,status);
  assert.equal(out.count,0);assert.equal('pagesFetched' in out,false);
  assert.doesNotMatch(JSON.stringify(out),/SECRET_SERVER_BODY/);
 }
 const r=await injector(async(url,opts)=>{
  assert.equal(opts.redirect,'error');
  throw Error('Bearer '+TOKEN+' SECRET');
 });
 assert.equal(r.status,'REQUEST_FAILED_OR_TIMED_OUT');
 assert.doesNotMatch(JSON.stringify(r),/TEST_ONLY|SECRET/);
});
test('second page HTTP failure never claims partial result',async()=>{
 let calls=0;
 const out=await injector(async()=>{
  calls++;return calls===1?response(services().slice(0,10),18,0):new Response('SECRET',{status:403});
 });
 assert.equal(calls,2);assert.equal(out.status,'HTTP_403');
 assert.equal(out.count,0);assert.equal('total' in out,false);
});
test('cross-page duplicate service code fails closed',async()=>{
 const rows=services();rows[10].health_service_code=rows[0].health_service_code;
 const out=await injector(fetchPages(rows));
 assert.equal(out.status,'DUPLICATE_SOURCE_KEY');assert.equal(out.count,0);
});
test('out-of-district, out-of-province or unknown subdistrict rejected',async()=>{
 for(const mutate of [
  rows=>{rows[0].province.province_code='55';},
  rows=>{rows[0].district.district_code='5407';},
  rows=>{rows[0].subdistrict.subdistrict_code='540609';}
 ]){
  const rows=services();mutate(rows);
  const r=await injector(fetchPages(rows));
  assert.equal(r.status,'GEOGRAPHIC_SCOPE_MISMATCH');
 }
});
test('nested service area out of scope or unexpected keys fail',async()=>{
 for(const [mutate,expected] of [
  [rows=>{rows[0].service_areas[0].subdistrict_code='540701';},'INVALID_SERVICE_AREA'],
  [rows=>{rows[0].service_areas[0].citizenId='SECRET';},'INVALID_SERVICE_AREA'],
  [rows=>{rows[0].service_areas[0].is_primary='true';},'INVALID_SERVICE_AREA'],
  [rows=>{rows[0].service_areas[0].village_nos=[1];},'INVALID_SERVICE_AREA'],
  [rows=>{rows[0].service_areas=[...Array(101)].map(()=>rows[0].service_areas[0]);},'UNEXPECTED_RESPONSE_SCHEMA'],
  [rows=>{rows[0].health_service_type.sensitive_field='SECRET';},'UNEXPECTED_RESPONSE_SCHEMA'],
  [rows=>{rows[0].citizenId='SECRET';},'UNEXPECTED_RESPONSE_SCHEMA'],
  [rows=>{delete rows[0].legacy_5digit_code;},'UNEXPECTED_RESPONSE_SCHEMA']
 ]){
  const rows=services();mutate(rows);
  const r=await injector(fetchPages(rows));
  assert.equal(r.status,expected);
  assert.equal(r.count,0);
  assert.doesNotMatch(JSON.stringify(r),/SECRET/);
 }
});
test('invalid coordinates, invalid leading-zero code strings, incorrect values fail',async()=>{
 for(const [mutate,expected] of [
  [rows=>{rows[0].latitude=NaN;},'INVALID_COORDINATES'],
  [rows=>{rows[0].longitude=181;},'INVALID_COORDINATES'],
  [rows=>{rows[0].legacy_5digit_code=6426;},'INVALID_HEALTH_SERVICE_ROW'],
  [rows=>{rows[0].legacy_5digit_code=12345;},'INVALID_HEALTH_SERVICE_ROW'],
  [rows=>{rows[0].legacy_9digit_code=123456789;},'INVALID_HEALTH_SERVICE_ROW'],
  [rows=>{rows[0].legacy_9digit_code='123';},'INVALID_HEALTH_SERVICE_ROW'],
  [rows=>{rows[0].village_no=1;},'INVALID_HEALTH_SERVICE_ROW'],
  [rows=>{rows[0].health_service_code='';},'INVALID_HEALTH_SERVICE_ROW']
 ]){
  const rows=services();mutate(rows);
  const r=await injector(fetchPages(rows));
  assert.equal(r.status,expected);
 }
});
test('offset, limit, total, row count and extra root fields checked each page',async()=>{
 const rows=services();
 for(const [payload,expected] of [
  [{items:rows.slice(0,10),total:18,limit:10,offset:1},'INVALID_PAGINATION_ENVELOPE'],
  [{items:rows.slice(0,10),total:18,limit:100,offset:0},'INVALID_PAGINATION_ENVELOPE'],
  [{items:rows.slice(0,9),total:18,limit:10,offset:0},'PAGINATION_ROW_COUNT_MISMATCH'],
  [{items:rows.slice(0,10),total:18,limit:10,offset:0,token:'SECRET'},'INVALID_PAGINATION_ENVELOPE'],
  [{items:rows.slice(0,10),total:101,limit:10,offset:0},'TOTAL_LIMIT_EXCEEDED']
 ]){
  const r=await injector(async()=>json(payload));
  assert.equal(r.status,expected);
  assert.equal(r.count,0);
 }
});
test('changed total and broken second-page offset fail closed',async()=>{
 const rows=services();
 for(const [second,expected] of [
  [response(rows.slice(10,18),19,10),'PAGINATION_TOTAL_CHANGED'],
  [response(rows.slice(10,18),18,20),'INVALID_PAGINATION_ENVELOPE'],
  [response(rows.slice(10,17),18,10),'PAGINATION_ROW_COUNT_MISMATCH']
 ]){
  let call=0;
  const out=await injector(async()=>++call===1?response(rows.slice(0,10),18,0):second);
  assert.equal(call,2);assert.equal(out.status,expected);assert.equal(out.count,0);
 }
});
test('all limits bounded and fail closed without status PASS',async()=>{
 const oversized=await injector(async()=>json({items:services().slice(0,10),total:18,limit:10,offset:0},200,{'content-length':'300000'}));
 assert.equal(oversized.status,'RESPONSE_TOO_LARGE');
 const invalid=await injector(async()=>new Response('bad json',{headers:{'content-type':'application/json'}}));
 assert.equal(invalid.status,'INVALID_JSON');
 const wrongType=await injector(async()=>new Response('<html>SECRET</html>',{headers:{'content-type':'text/html'}}));
 assert.equal(wrongType.status,'UNEXPECTED_CONTENT_TYPE');
 const cap=await injector(async()=>new Response(' '.repeat(150000),{headers:{'content-type':'application/json'}}));
 assert.equal(cap.status,'RESPONSE_TOO_LARGE');
});
test('101+ records rejected before second page and no extra requests',async()=>{
 let calls=0;
 const out=await injector(async()=>{
  calls++;return response(services(10),101,0);
 });
 assert.equal(calls,1);assert.equal(out.status,'TOTAL_LIMIT_EXCEEDED');
});
test('no token passed through flags, no raw output or other live endpoints',async()=>{
 for(const argv of [
  ['live-fetch','--endpoint','health-services'],
  ['live-fetch','--endpoint','health-services','--token','SECRET'],
  ['live-fetch','--endpoint','health-services','--acknowledge-authorized-use','--output','raw.json'],
  ['live-fetch','--endpoint','health-services','--acknowledge-authorized-use','--max-pages','3'],
  ['live-fetch','--endpoint','volunteer-family','--acknowledge-authorized-use'],
  ['live-fetch','--endpoint','volunteer-tenure','--acknowledge-authorized-use']
 ]){
  const messages=[];
  assert.equal(await main(argv,s=>messages.push(s)),2);
  assert.doesNotMatch(messages.join(''),/SECRET|raw\.json/);
 }
});
test('mock-only CLI integration: one confirmation, one token entry, two fake pages',async()=>{
 const io=tty(),out=[];
 let requests=0;
 const fetchImpl=fetchPages();
 const pending=main(['live-fetch','--endpoint','health-services','--acknowledge-authorized-use'],
  x=>out.push(x),{...io,fetchImpl:async(url,options)=>{requests++;return fetchImpl(url,options);}});
 io.input.emit('data',Buffer.from(CONFIRM_HEALTH_SERVICES_PHRASE+'\r'));
 await new Promise(resolve=>setImmediate(resolve));
 io.input.emit('data',Buffer.from(TOKEN+'\r'));
 assert.equal(await pending,0);
 assert.equal(requests,2);
 const result=JSON.parse(out.join(''));
 assert.equal(result.count,18);assert.equal(result.pagesFetched,2);
 assert.doesNotMatch(out.join(''),/TEST_ONLY|SYNTHETIC_SERVICE/);
});
