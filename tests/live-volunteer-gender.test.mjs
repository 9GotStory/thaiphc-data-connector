import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {CONFIRM_VOLUNTEER_GENDER_PHRASE,confirmLiveUseFromTTY} from '../src/cli/live-tty.mjs';
import {LIVE_ORIGIN} from '../src/cli/live-fetch.mjs';
import {liveFetchVolunteerGender} from '../src/cli/live-volunteer-gender.mjs';
import {main} from '../src/cli/index.mjs';

const TOKEN='TEST_ONLY_SYNTHETIC_TOKEN_1234567890';
const COUNTS=[11,12,17,12,13,10,4,6];
const endpoint='/api/v1/reports/volunteer-gender';
function rows(n=85){
 const result=[];
 for(let i=0;i<8&&result.length<n;i++){
  const sub='54060'+(i+1);
  for(let v=1;v<=COUNTS[i]&&result.length<n;v++){
   result.push({
    provinceCode:'54',provinceName:'SYNTHETIC_PROVINCE',
    districtCode:'5406',districtName:'SYNTHETIC_DISTRICT',
    subdistrictCode:sub,subdistrictName:'SYNTHETIC_SUBDISTRICT',
    villageCode:sub+String(v).padStart(3,'0'),villageNo:String(v),
    villageName:'SYNTHETIC_VILLAGE',total:19,male:3,female:16
   });
  }
 }
 if(result.length!==n)throw Error('SYNTHETIC_ROWS_OUTSIDE_TEST_LIMIT');
 return result;
}
const json=(o,status=200,headers={})=>new Response(JSON.stringify(o),{
 status,headers:{'content-type':'application/json',...headers}
});
const envelope=(items,total,page)=>({success:true,message:'Success',items,total,page,pageSize:10});
function fakePages(items=rows(),total=items.length){
 let number=0;
 return async(url,options)=>{
  number++;
  const u=new URL(url);
  assert.equal(u.origin,LIVE_ORIGIN);
  assert.equal(u.pathname,endpoint);
  assert.equal(u.search,'?page='+number+'&pageSize=10&province=54&district=5406');
  assert.equal(options.method,'GET');
  assert.equal(options.redirect,'error');
  assert.equal(options.credentials,'omit');
  assert.equal(options.cache,'no-store');
  assert.equal(options.referrerPolicy,'no-referrer');
  assert.equal(options.headers.Accept,'application/json');
  assert.equal(options.headers.Authorization,'Bearer '+TOKEN);
  assert.equal(options.signal.aborted,false);
  return json(envelope(items.slice((number-1)*10,number*10),total,number));
 };
}
function invoke(fetchImpl,{confirm=async()=>CONFIRM_VOLUNTEER_GENDER_PHRASE,getToken=async()=>TOKEN}={}){
 return liveFetchVolunteerGender({confirm,getToken,fetchImpl});
}
class FakeTTY extends EventEmitter{
 constructor(){super();this.isTTY=true;this.isRaw=false;this.paused=false;this.history=[];}
 setRawMode(v){this.isRaw=v;this.history.push(v);}
 pause(){this.paused=true;}
 resume(){this.paused=false;}
 isPaused(){return this.paused;}
}
function tty(){
 const input=new FakeTTY(),messages=[];
 return {input,output:{isTTY:true,write(x){messages.push(x);return true;}},messages};
}
test('T008 synthetic 85 rows use observed 12 fields without person-level records',()=>{
 const x=rows();
 assert.equal(x.length,85);
 assert.ok(x.every(v=>Object.keys(v).length===12));
 assert.ok(x.every(v=>v.villageName==='SYNTHETIC_VILLAGE'));
});
test('T008 85 villages require 9 sequential GETs with exact query/headers; district aggregate only',async()=>{
 let calls=0;
 const fetch=fakePages();
 const result=await invoke(async(url,opts)=>{calls++;return fetch(url,opts);});
 assert.equal(calls,9);
 assert.deepEqual(result,{
  mode:'LIVE_READ_ONLY',endpoint:'volunteer-gender',status:'PASS',
  success:true,httpStatus:200,count:85,totalRows:85,pagesFetched:9,
  volunteerTotal:1615,maleTotal:255,femaleTotal:1360
 });
 assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC|TEST_ONLY|villageCode|villageNo|villageName|Authorization/);
});
test('T008 zero, exact-ten and 20 rows finish after minimum pages',async()=>{
 for(const n of [0,10,20]){
  let calls=0,fetch=fakePages(rows(n));
  const r=await invoke(async(url,opts)=>{calls++;return fetch(url,opts);});
  assert.equal(r.status,'PASS');
  assert.equal(r.count,n);
  assert.equal(r.totalRows,n);
  assert.equal(calls,Math.max(1,Math.ceil(n/10)));
 }
});
test('T008 confirmation uses hidden TTY and distinct phrase',async()=>{
 const io=tty(),pending=confirmLiveUseFromTTY(io,'volunteer-gender');
 const buf=Buffer.from(CONFIRM_VOLUNTEER_GENDER_PHRASE+'\r');
 io.input.emit('data',buf);
 assert.equal(await pending,CONFIRM_VOLUNTEER_GENDER_PHRASE);
 assert.ok(buf.every(b=>b===0));
 assert.deepEqual(io.input.history,[true,false]);
 assert.ok(io.messages.join('').includes('FETCH VOLUNTEER GENDER 5406'));
 await assert.rejects(()=>confirmLiveUseFromTTY(io,'volunteer-family'),/LIVE_CONFIRMATION_SCOPE_REJECTED/);
});
test('T008 wrong confirmation does not request token or HTTP',async()=>{
 let tokenCount=0,networkCount=0;
 const r=await invoke(async()=>{networkCount++;return json(envelope([],0,1));},{
  confirm:async()=> 'FETCH VILLAGES 5406',
  getToken:async()=>{tokenCount++;return TOKEN;}
 });
 assert.equal(r.status,'CONFIRMATION_REQUIRED');
 assert.equal(tokenCount,0);assert.equal(networkCount,0);
});
test('T008 invalid token fails before request',async()=>{
 let n=0;
 const r=await invoke(async()=>{n++;throw Error('SHOULD_NOT_FETCH');},{
  getToken:async()=> 'MOCK_ONLY_BAD'
 });
 assert.equal(r.status,'INVALID_TOKEN_FORMAT');
 assert.equal(n,0);
});
test('T008 401/403/unexpected HTTP statuses never disclose body or partially claim PASS',async()=>{
 for(const [http,status] of [[401,'HTTP_401'],[403,'HTTP_403'],[500,'HTTP_ERROR'],[302,'HTTP_ERROR']]){
  let calls=0;
  const r=await invoke(async()=>{calls++;return new Response('PRIVATE_UPSTREAM_BODY',{status:http});});
  assert.equal(calls,1);assert.equal(r.httpStatus,http);assert.equal(r.status,status);
  assert.equal(r.count,0);
  assert.equal('maleTotal' in r,false);
  assert.doesNotMatch(JSON.stringify(r),/PRIVATE_UPSTREAM_BODY|TEST_ONLY/);
 }
});
test('T008 second page HTTP error does not expose partial aggregates',async()=>{
 let calls=0;
 const items=rows(20);
 const r=await invoke(async()=>{
  calls++;
  return calls===1?json(envelope(items.slice(0,10),20,1)):
   new Response('PRIVATE_UPSTREAM_BODY',{status:403});
 });
 assert.equal(calls,2);assert.equal(r.status,'HTTP_403');
 assert.equal(r.count,0);assert.equal('volunteerTotal' in r,false);
});
test('T008 missing, extra or wrong response envelope fields are rejected',async()=>{
 const base=envelope(rows(10),10,1);
 for(const mutate of [
  p=>{p.unexpected='SECRET_PERSON';},
  p=>{delete p.message;},
  p=>{p.success='true';},
  p=>{p.message=null;},
  p=>{p.page=2;},
  p=>{p.pageSize=100;},
  p=>{p.total='10';}
 ]){
  const payload=structuredClone(base);mutate(payload);
  const r=await invoke(async()=>json(payload));
  assert.equal(r.status,'INVALID_PAGINATION_ENVELOPE');
  assert.equal(r.count,0);
  assert.doesNotMatch(JSON.stringify(r),/SECRET_PERSON/);
 }
});
test('T008 total changes, missing rows or wrong page are blocked without partial totals',async()=>{
 const items=rows(20);
 for(const [second,expected] of [
  [envelope(items.slice(10),19,2),'PAGINATION_TOTAL_CHANGED'],
  [envelope(items.slice(10,19),20,2),'PAGINATION_ROW_COUNT_MISMATCH'],
  [envelope(items.slice(10),20,3),'INVALID_PAGINATION_ENVELOPE']
 ]){
  let calls=0;
  const result=await invoke(async()=>++calls===1?
    json(envelope(items.slice(0,10),20,1)):json(second));
  assert.equal(calls,2);assert.equal(result.status,expected);
  assert.equal(result.count,0);assert.equal('maleTotal' in result,false);
 }
});
test('T008 record cap 151 rejects on first page',async()=>{
 let calls=0;
 const r=await invoke(async()=>{calls++;return json(envelope(rows(10),151,1));});
 assert.equal(r.status,'TOTAL_LIMIT_EXCEEDED');assert.equal(calls,1);
});
test('T008 duplicate village key across pages rejected',async()=>{
 const items=rows(20);items[10].villageCode=items[0].villageCode;
 const r=await invoke(fakePages(items));
 assert.equal(r.status,'DUPLICATE_VILLAGE_CODE');
 assert.equal(r.count,0);
});
test('T008 wrong district/subdistrict/village-code relation rejected',async()=>{
 for(const modify of [
  a=>{a[0].provinceCode='55';},
  a=>{a[0].districtCode='5407';},
  a=>{a[0].subdistrictCode='540609';},
  a=>{a[0].villageCode='540699999';}
 ]){
  const items=rows(10);modify(items);
  const r=await invoke(fakePages(items));
  assert.equal(r.status,'GEOGRAPHIC_SCOPE_MISMATCH');
  assert.equal(r.count,0);
 }
});
test('T008 wrong codes, name types, unknown 13th field are rejected without leaking content',async()=>{
 for(const [mutate,status,field] of [
  [a=>{a[0].villageCode=540601001;},'INVALID_GENDER_ROW','villageCode'],
  [a=>{a[0].villageName='';},'INVALID_GENDER_ROW','villageName'],
  [a=>{a[0].villageNo='';},'INVALID_GENDER_ROW','villageNo'],
  [a=>{a[0].villageNo='1-3';},'PASS',null],
  [a=>{a[0].villageName='\nSECRET';},'INVALID_GENDER_ROW','villageName'],
  [a=>{a[0].citizenId='SECRET_PERSON';},'UNEXPECTED_RESPONSE_SCHEMA',null]
 ]){
  const items=rows(10);mutate(items);
  const r=await invoke(fakePages(items));
  assert.equal(r.status,status);
  if(field){assert.equal(r.invalidField,field);assert.equal(r.page,1);assert.equal(r.rowIndex,0);}
  assert.doesNotMatch(JSON.stringify(r),/SECRET_PERSON|SYNTHETIC_VILLAGE|TEST_ONLY/);
 }
});
test('T008 negative, fractional, string or mismatched gender metrics are blocked',async()=>{
 for(const [mutate,status,field] of [
  [a=>{a[0].male=-1;},'INVALID_GENDER_METRIC','male'],
  [a=>{a[0].female=0.5;},'INVALID_GENDER_METRIC','female'],
  [a=>{a[0].total='19';},'INVALID_GENDER_METRIC','total'],
  [a=>{a[0].male=4;},'GENDER_TOTAL_MISMATCH',null],
  [a=>{a[0].male=Number.MAX_SAFE_INTEGER;},'GENDER_TOTAL_MISMATCH',null]
 ]){
  const items=rows(10);mutate(items);
  const r=await invoke(fakePages(items));
  assert.equal(r.status,status);
  if(field)assert.equal(r.invalidField,field);
  assert.equal(r.count,0);
 }
});
test('T008 safe integer running totals prevent arithmetic overflow',async()=>{
 const items=rows(10);
 for(const row of items){
  row.male=Number.MAX_SAFE_INTEGER-10;row.female=0;row.total=row.male;
 }
 const r=await invoke(fakePages(items));
 assert.equal(r.status,'AGGREGATE_OVERFLOW');
 assert.equal(r.count,0);
});
test('T008 shared JSON size/content-type rules still bound each page',async()=>{
 const payload=envelope(rows(10),10,1);
 for(const [response,status] of [
  [json(payload,200,{'content-length':'200000'}),'RESPONSE_TOO_LARGE'],
  [new Response('<html>SENSITIVE</html>',{headers:{'content-type':'text/html'}}),'UNEXPECTED_CONTENT_TYPE'],
  [new Response('invalid json',{headers:{'content-type':'application/json'}}),'INVALID_JSON'],
  [new Response(' '.repeat(150000),{headers:{'content-type':'application/json'}}),'RESPONSE_TOO_LARGE']
 ]){
  const r=await invoke(async()=>response);
  assert.equal(r.status,status);assert.equal(r.count,0);
  assert.doesNotMatch(JSON.stringify(r),/SENSITIVE/);
 }
});
test('T008 no token/URL/export flags, no person endpoints or custom page controls',async()=>{
 for(const argv of [
  ['live-fetch','--endpoint','volunteer-gender'],
  ['live-fetch','--endpoint','volunteer-gender','--acknowledge-authorized-use','--token','SECRET_TOKEN'],
  ['live-fetch','--endpoint','volunteer-gender','--acknowledge-authorized-use','--max-pages','2'],
  ['live-fetch','--endpoint','volunteer-gender','--acknowledge-authorized-use','--output','raw.csv'],
  ['live-fetch','--endpoint','volunteer-gender','--acknowledge-authorized-use','--url','https://evil.invalid'],
  ['live-fetch','--endpoint','assignments','--acknowledge-authorized-use'],
  ['live-fetch','--endpoint','volunteer-family','--acknowledge-authorized-use'],
  ['live-fetch','--endpoint','resigned-volunteers','--acknowledge-authorized-use'],
  ['live-fetch','--endpoint','volunteer-tenure','--acknowledge-authorized-use']
 ]){
  const out=[];
  assert.equal(await main(argv,x=>out.push(x)),2);
  assert.equal(out.length,1);
  assert.doesNotMatch(out.join(''),/SECRET_TOKEN|raw\.csv|evil\.invalid/);
 }
});
test('T008 CLI integration uses one hidden confirmation/token and nine synthetic GETs',async()=>{
 const io=tty(),messages=[];
 let calls=0;
 const fake=fakePages();
 const p=main(['live-fetch','--endpoint','volunteer-gender','--acknowledge-authorized-use'],
  x=>messages.push(x),{...io,fetchImpl:async(url,options)=>{calls++;return fake(url,options);}});
 const confirm=Buffer.from(CONFIRM_VOLUNTEER_GENDER_PHRASE+'\r');
 io.input.emit('data',confirm);
 await new Promise(resolve=>setImmediate(resolve));
 const bearer=Buffer.from(TOKEN+'\r');
 io.input.emit('data',bearer);
 assert.equal(await p,0);
 assert.equal(calls,9);
 assert.ok(confirm.every(x=>x===0));assert.ok(bearer.every(x=>x===0));
 const result=JSON.parse(messages.join(''));
 assert.equal(result.status,'PASS');
 assert.equal(result.count,85);
 assert.equal(result.volunteerTotal,1615);
 assert.doesNotMatch(messages.join(''),/SYNTHETIC_|TEST_ONLY|villageCode|Authorization/);
});
