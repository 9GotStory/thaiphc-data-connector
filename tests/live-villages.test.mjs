import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {CONFIRM_VILLAGES_PHRASE,confirmLiveUseFromTTY} from '../src/cli/live-tty.mjs';
import {LIVE_ORIGIN} from '../src/cli/live-fetch.mjs';
import {liveFetchVillages} from '../src/cli/live-villages.mjs';
import {main} from '../src/cli/index.mjs';

const TOKEN='TEST_ONLY_NOT_A_REAL_BEARER_987654321';
const COUNTS=[11,12,17,12,13,10,4,6];
function villages(){
 const data=[];
 for(let i=0;i<8;i++){
   const sub='54060'+(i+1);
   for(let n=1;n<=COUNTS[i];n++){
     const code=sub+String(n).padStart(3,'0');
     const linked=data.length<10;
     data.push({
       code,village_code_8digit:sub+String(n).padStart(2,'0'),
       id:code,name_th:'SYNTHETIC_VILLAGE_'+String(n),name_en:null,
       village_no:n,metro_status:null,label:'SYNTHETIC_VILLAGE_'+String(n),
       subdistrict_code:sub,subdistrict_name_th:'SYNTHETIC_SUBDISTRICT',
       subdistrict_name_en:'Synthetic Subdistrict',district_code:'5406',
       district_name_th:'SYNTHETIC_DISTRICT',district_name_en:'Synthetic District',
       province_code:'54',province_name_th:'SYNTHETIC_PROVINCE',
       province_name_en:'Synthetic Province',health_service_code:linked?'SYNTHETIC_HS':null,
       health_service_name_th:linked?'SYNTHETIC_SERVICE':null,health_service_name_en:null
     });
   }
 }
 return data;
}
function fakeJson(payload,status=200,extraHeaders={}){
 return new Response(JSON.stringify(payload),{status,headers:{'content-type':'application/json',...extraHeaders}});
}
function invoke(fetchImpl,{confirm=async()=>CONFIRM_VILLAGES_PHRASE,getToken=async()=>TOKEN}={}){
 return liveFetchVillages({confirm,getToken,fetchImpl});
}
class MockTTY extends EventEmitter{
 constructor(){super();this.isTTY=true;this.isRaw=false;this.history=[];this.paused=false;}
 setRawMode(v){this.isRaw=v;this.history.push(v);}
 pause(){this.paused=true;}
 resume(){this.paused=false;}
 isPaused(){return this.paused;}
}
function makeTTY(){
 const input=new MockTTY(),written=[];
 return {input,output:{isTTY:true,write(x){written.push(x);return true;}},written};
}
test('85 synthetic village references match observed distribution, 20 observed fields, no real identities',()=>{
 const items=villages();
 assert.equal(items.length,85);
 assert.ok(items.every(x=>Object.keys(x).length===20));
 assert.ok(items.every(x=>x.name_th.startsWith('SYNTHETIC')));
});
test('one read-only GET exact allowlisted path, query and Bearer; aggregate-only 85 rows',async()=>{
 let calls=0;
 const r=await invoke(async(url,opts)=>{
   calls++;
   const parsed=new URL(url);
   assert.equal(parsed.origin,LIVE_ORIGIN);
   assert.equal(parsed.pathname,'/api/v1/lookups/villages');
   assert.equal(parsed.search,'?province_code=54&district_code=5406');
   assert.equal(opts.method,'GET');
   assert.equal(opts.redirect,'error');
   assert.equal(opts.credentials,'omit');
   assert.equal(opts.cache,'no-store');
   assert.equal(opts.referrerPolicy,'no-referrer');
   assert.equal(opts.headers.Authorization,'Bearer '+TOKEN);
   assert.equal(opts.headers.Accept,'application/json');
   return fakeJson({items:villages()});
 });
 assert.equal(calls,1);
 assert.equal(r.status,'PASS');
 assert.equal(r.success,true);
 assert.equal(r.httpStatus,200);
 assert.equal(r.count,85);
 assert.equal(r.mode,'LIVE_READ_ONLY');
 assert.equal(r.endpoint,'villages');
 assert.deepEqual(Object.values(r.subdistrictCounts),COUNTS);
 assert.equal(r.healthServiceLinkedCount,10);
 assert.equal(r.healthServiceNullCount,75);
 assert.doesNotMatch(JSON.stringify(r),/SYNTHETIC_VILLAGE|TEST_ONLY_NOT_A_REAL_BEARER|Authorization/);
});
test('subdistrict and village TTY confirmations are distinct and input is hidden',async()=>{
 const t=makeTTY();
 const promise=confirmLiveUseFromTTY(t,'villages');
 const text=Buffer.from(CONFIRM_VILLAGES_PHRASE+'\r');
 t.input.emit('data',text);
 assert.equal(await promise,CONFIRM_VILLAGES_PHRASE);
 assert.ok(text.every(x=>x===0));
 assert.deepEqual(t.input.history,[true,false]);
 assert.equal(t.written.join('').includes('FETCH VILLAGES 5406'),true);
 const rejected=confirmLiveUseFromTTY(makeTTY(),'invalid');
 await assert.rejects(rejected,/LIVE_CONFIRMATION_SCOPE_REJECTED/);
});
test('confirmation refusal stops before token or network',async()=>{
 let tokenRequests=0,fetches=0;
 const out=await invoke(async()=>{fetches++;return fakeJson({items:villages()});},{
   confirm:async()=> 'FETCH SUBDISTRICTS 5406',
   getToken:async()=>{tokenRequests++;return TOKEN;}
 });
 assert.equal(out.status,'CONFIRMATION_REQUIRED');
 assert.equal(tokenRequests,0);assert.equal(fetches,0);
});
test('wrong geographic scope and village code relations must fail closed',async()=>{
 for(const [mutation,expected] of [
   [data=>{data[0].district_code='5407'},'GEOGRAPHIC_SCOPE_MISMATCH'],
   [data=>{data[0].province_code='55'},'GEOGRAPHIC_SCOPE_MISMATCH'],
   [data=>{data[0].subdistrict_code='540609'},'GEOGRAPHIC_SCOPE_MISMATCH'],
   [data=>{data[0].code='540603099'},'INVALID_VILLAGE_RELATION'],
   [data=>{data[0].village_code_8digit='54060199'},'INVALID_VILLAGE_RELATION'],
   [data=>{data[0].id='different'},'INVALID_VILLAGE_RELATION'],
   [data=>{data[0].village_no=0},'INVALID_VILLAGE_NUMBER'],
   [data=>{data[0].label='DIFFERENT'},'INVALID_VILLAGE_RELATION']
 ]){
   const data=villages();mutation(data);
   const out=await invoke(async()=>fakeJson({items:data}));
   assert.equal(out.status,expected);
   assert.equal(out.count,0);
   assert.equal('subdistrictCounts' in out,false);
 }
});
test('duplicated village keys and duplicate 8-digit codes fail',async()=>{
 const data=villages();data[1]={...data[0]};
 const out=await invoke(async()=>fakeJson({items:data}));
 assert.equal(out.status,'DUPLICATE_SOURCE_KEY');
 assert.equal(out.count,0);
});
test('unexpected fields, missing columns, incorrect types and raw person keys rejected',async()=>{
 for(const [mutation,expected] of [
   [data=>{data[0].citizenId='SYNTHETIC_PRIVATE_ID'},'UNEXPECTED_RESPONSE_SCHEMA'],
   [data=>{delete data[0].health_service_code},'UNEXPECTED_RESPONSE_SCHEMA'],
   [data=>{data[0].metro_status=true},'UNEXPECTED_RESPONSE_SCHEMA'],
   [data=>{data[0].name_th=null},'INVALID_LOOKUP_FIELD'],
   [data=>{data[0].health_service_code={object:'value'}},'UNEXPECTED_RESPONSE_SCHEMA']
 ]){
  const data=villages();mutation(data);
  const r=await invoke(async()=>fakeJson({items:data}));
  assert.equal(r.status,expected);
  assert.equal(r.success,false);
  assert.equal(r.count,0);
  assert.doesNotMatch(JSON.stringify(r),/SYNTHETIC_PRIVATE_ID/);
 }
});
test('unexpected empty, over-limit and extra envelope fields cannot be treated as complete',async()=>{
 for(const [payload,expected] of [
   [{items:[]},'UNEXPECTED_EMPTY_RESULT'],
   [{items:[...villages(),...villages()]},'RECORD_LIMIT_EXCEEDED'],
   [{items:villages(),total:85},'UNEXPECTED_RESPONSE_SCHEMA'],
   [{items:'wrong'},'UNEXPECTED_RESPONSE_SCHEMA']
 ]){
  const r=await invoke(async()=>fakeJson(payload));
  assert.equal(r.status,expected);
 }
});
test('HTTP errors and redirects return sanitized codes with no response leakage',async()=>{
 for(const [code,expected] of [[401,'HTTP_401'],[403,'HTTP_403'],[500,'HTTP_ERROR'],[302,'HTTP_ERROR']]){
  const r=await invoke(async()=>new Response('SYNTHETIC_SECRET_SERVER_BODY',{status:code}));
  assert.equal(r.status,expected);
  assert.equal(r.httpStatus,code);
  assert.doesNotMatch(JSON.stringify(r),/SECRET_SERVER_BODY/);
 }
 const redirected=await invoke(async(_url,opts)=>{
   assert.equal(opts.redirect,'error');
   throw Error('Bearer '+TOKEN+' should never leak');
 });
 assert.equal(redirected.status,'REQUEST_FAILED_OR_TIMED_OUT');
 assert.doesNotMatch(JSON.stringify(redirected),/TEST_ONLY/);
});
test('wrong media type, invalid JSON and large bodies fail closed',async()=>{
 const bad=[
   [async()=>new Response('<html>secret</html>',{headers:{'content-type':'text/html'}}),'UNEXPECTED_CONTENT_TYPE'],
   [async()=>new Response('{nope',{headers:{'content-type':'application/json'}}),'INVALID_JSON'],
   [async()=>fakeJson({items:villages()},200,{'content-length':'200000'}),'RESPONSE_TOO_LARGE'],
   [async()=>new Response(' '.repeat(150000),{headers:{'content-type':'application/json'}}),'RESPONSE_TOO_LARGE']
 ];
 for(const [fn,status] of bad){
   const r=await invoke(fn);
   assert.equal(r.status,status);
   assert.equal(r.count,0);
 }
});
test('token invalid and network exception never leaks strings and never reaches actual HTTP',async()=>{
 let used=false;
 const result=await invoke(async()=>{used=true;return fakeJson({items:villages()});},{getToken:async()=> 'MOCK_ONLY_12345678'});
 assert.equal(result.status,'INVALID_TOKEN_FORMAT');
 assert.equal(used,false);
 const original=globalThis.fetch;
 try{
   globalThis.fetch=()=>{throw Error('NETWORK_FORBIDDEN');};
   const r=await invoke(async()=>fakeJson({items:villages()}));
   assert.equal(r.status,'PASS');
 }finally{globalThis.fetch=original;}
});
test('CLI rejects extra live endpoints, missing authorization and token flags',async()=>{
 for(const args of [
   ['live-fetch','--endpoint','villages'],
   ['live-fetch','--endpoint','resigned-volunteers','--acknowledge-authorized-use'],
   ['live-fetch','--endpoint','volunteer-family','--acknowledge-authorized-use'],
   ['live-fetch','--endpoint','villages','--token','DO_NOT_SHOW'],
   ['live-fetch','--endpoint','villages','--acknowledge-authorized-use','--url','https://bad'],
   ['live-fetch','--endpoint','villages','--acknowledge-authorized-use','--output','raw.json'],
   ['live-fetch','--endpoint','villages','--acknowledge-authorized-use','--max-pages','2']
 ]){
  const messages=[];
  assert.equal(await main(args,x=>messages.push(x)),2);
  assert.doesNotMatch(messages.join(''),/DO_NOT_SHOW|raw\.json|https:\/\/bad/);
 }
});
test('CLI live villages with fake terminal and injected fake fetch makes one request',async()=>{
 const tty=makeTTY(),out=[];
 let calls=0;
 const promise=main(['live-fetch','--endpoint','villages','--acknowledge-authorized-use'],
   x=>out.push(x),{...tty,fetchImpl:async()=>{calls++;return fakeJson({items:villages()});}});
 tty.input.emit('data',Buffer.from(CONFIRM_VILLAGES_PHRASE+'\r'));
 await new Promise(resolve=>setImmediate(resolve));
 tty.input.emit('data',Buffer.from(TOKEN+'\r'));
 assert.equal(await promise,0);
 assert.equal(calls,1);
 const report=JSON.parse(out.join(''));
 assert.equal(report.count,85);
 assert.equal(report.healthServiceNullCount,75);
 assert.doesNotMatch(out.join(''),/TEST_ONLY|SYNTHETIC_VILLAGE/);
});
