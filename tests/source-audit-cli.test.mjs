import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFileSync} from 'node:fs';
import {main} from '../src/cli/index.mjs';
import {syntheticReferenceRow} from '../src/sync/synthetic-reference-row.mjs';

const manifest=JSON.parse(readFileSync(new URL('../docs/sheets-schema.json',import.meta.url),'utf8'));
const TOKEN='TEST_ONLY_SYNTHETIC_BEARER_0123456789';
const ARGS=endpoint=>['audit-source','--endpoint',endpoint,'--acknowledge-authorized-use'];
function row(api,i=1){
 const r=syntheticReferenceRow(api,manifest);
 if(api==='subdistricts'){
  r.code='54060'+i;r.id=r.code;
 }else if(api==='villages'){
  r.code='540601'+String(i).padStart(3,'0');
  r.id=r.code;r.village_code_8digit='540601'+String(i).padStart(2,'0');
  r.village_no=i;r.label=r.name_th;
 }else{
  r.health_service_code='SYNTHETIC-HS-'+i;
  r.health_service_type={id:'SYNTHETIC',name_th:'SYNTHETIC',name_en:null};
  r.province={province_code:'54',province_name_th:'SYNTHETIC',province_name_en:null};
  r.district={district_code:'5406',district_name_th:'SYNTHETIC',district_name_en:null};
  r.subdistrict={subdistrict_code:'540601',subdistrict_name_th:'SYNTHETIC',subdistrict_name_en:null};
 }
 return r;
}
const respond=(payload)=>new Response(JSON.stringify(payload),
 {status:200,headers:{'content-type':'application/json'}});
class FakeTTY extends EventEmitter{
 constructor(){super();this.isTTY=true;this.isRaw=false;this.paused=false;}
 setRawMode(x){this.isRaw=x;}
 pause(){this.paused=true;}
 resume(){this.paused=false;}
 isPaused(){return this.paused;}
}
function tty({confirmation='READ REFERENCE SNAPSHOT 5406',token=TOKEN,fetchImpl}={}){
 const input=new FakeTTY(),prompts=[];
 const output={isTTY:true,write(value){
  prompts.push(value);
  if(value.includes('Type READ REFERENCE SNAPSHOT'))
   queueMicrotask(()=>input.emit('data',Buffer.from(confirmation+'\r')));
  if(value.includes('Paste authorized Bearer'))
   queueMicrotask(()=>input.emit('data',Buffer.from(token+'\r')));
  return true;
 }};
 return {input,output,fetchImpl,prompts};
}
async function call(endpoint,fetchImpl,controls={}){
 const logged=[],io=tty({...controls,fetchImpl});
 const code=await main(ARGS(endpoint),msg=>logged.push(msg),io);
 return {code,logged,io,report:JSON.parse(logged[0])};
}
test('T009D source audit CLI checks complete 8 subdistrict rows and prints no source rows',async()=>{
 const rows=Array.from({length:8},(_,i)=>row('subdistricts',i+1));
 let calls=0;
 const {code,report,logged,io}=await call('subdistricts',async(url,init)=>{
  calls++;const u=new URL(url);
  assert.equal(u.pathname,'/api/v1/lookups/subdistricts');
  assert.equal(u.search,'?district_code=5406');
  assert.equal(init.method,'GET');assert.equal(init.redirect,'error');
  assert.equal(init.credentials,'omit');
  assert.equal(init.headers.Authorization,'Bearer '+TOKEN);
  return respond({items:rows});
 });
 assert.equal(code,0);assert.equal(calls,1);
 assert.equal(report.status,'SOURCE_SCHEMA_VALIDATED');
 assert.equal(report.rowCount,8);
 assert.equal(report.pagesFetched,1);
 assert.equal(report.observedCountMatches,true);
 assert.equal(report.completeness,'UNPAGINATED_SOURCE_HAS_NO_TOTAL');
 assert.equal(report.transferApproved,false);
 assert.equal(report.destinationWriteApproved,false);
 assert.equal(report.appsScriptPosts,0);assert.equal(report.sheetsWrites,0);
 assert.equal('rows' in report,false);
 assert.doesNotMatch(logged.join(''),/TEST_ONLY|Bearer|SYNTHETIC|payloadB64|signature|code:|items/);
 assert.equal(io.input.isRaw,false);
});
test('T009D source audit CLI validates unpaginated villages but does not claim complete source total',async()=>{
 const rows=Array.from({length:85},(_,i)=>{
  const sub=Math.floor(i/15)+1;
  const n=i%15+1,r=row('villages',n);
  const six='54060'+sub;
  r.code=six+String(n).padStart(3,'0');
  r.id=r.code;r.village_code_8digit=six+String(n).padStart(2,'0');
  r.subdistrict_code=six;
  return r;
 });
 const {code,report}=await call('villages',async()=>respond({items:rows}));
 assert.equal(code,0);assert.equal(report.rowCount,85);
 assert.equal(report.status,'SOURCE_SCHEMA_VALIDATED');
 assert.equal(report.observedCountMatches,true);
 assert.equal(report.completeness,'UNPAGINATED_SOURCE_HAS_NO_TOTAL');
 assert.equal('rows' in report,false);
});
test('T009D source audit CLI checks all 18 health service rows across 10+8 pages',async()=>{
 const rows=Array.from({length:18},(_,i)=>row('health-services',i+1));
 let calls=0;
 const {code,report}=await call('health-services',async(url)=>{
  const u=new URL(url),offset=calls++*10;
  assert.equal(u.searchParams.get('offset'),String(offset));
  assert.equal(u.searchParams.get('limit'),'10');
  return respond({items:rows.slice(offset,offset+10),total:18,limit:10,offset});
 });
 assert.equal(code,0);assert.equal(calls,2);
 assert.equal(report.status,'SOURCE_SCHEMA_VALIDATED');
 assert.equal(report.rowCount,18);
 assert.equal(report.pagesFetched,2);
 assert.equal(report.completeness,'SOURCE_TOTAL_CHECKED');
 assert.equal(report.networkRequests,2);
 assert.equal(report.appsScriptPosts,0);assert.equal(report.sheetsWrites,0);
});
test('T009D unexpected count exits with warning and still no transfer',async()=>{
 const {code,report}=await call('subdistricts',async()=>
  respond({items:Array.from({length:7},(_,i)=>row('subdistricts',i+1))}));
 assert.equal(code,2);
 assert.equal(report.status,'SOURCE_SCHEMA_VALIDATED');
 assert.equal(report.observedCountMatches,false);
 assert.equal(report.transferApproved,false);
 assert.equal(report.sheetsWrites,0);
});
test('T009D refuses unapproved endpoints and unsupported flags before any real request',async()=>{
 const commands=[
  ['audit-source'],
  ['audit-source','--endpoint','villages'],
  ['audit-source','--endpoint','volunteer-gender','--acknowledge-authorized-use'],
  ['audit-source','--endpoint','assignments','--acknowledge-authorized-use'],
  ['audit-source','--endpoint','villages','--acknowledge-authorized-use','--output','raw.json'],
  ['audit-source','--endpoint','villages','--acknowledge-authorized-use','--url','https://fake.invalid'],
  ['audit-source','--endpoint','villages','--acknowledge-authorized-use','--max-pages','3'],
  ['audit-source','--endpoint','villages','--acknowledge-authorized-use','--token','secret'],
  ['audit-source','--endpoint','villages','--acknowledge-authorized-use','--synthetic'],
 ];
 let calls=0;
 for(const args of commands){
  const logs=[];
  const exit=await main(args,x=>logs.push(x),{fetchImpl:async()=>{calls++;}});
  assert.equal(exit,2);assert.equal(calls,0);
  assert.doesNotMatch(logs.join(''),/raw.json|fake.invalid|secret/);
 }
});
test('T009D denied TTY confirmation stops before bearer prompt and source GET',async()=>{
 let calls=0;
 const {code,logged,io}=await call('villages',async()=>{
  calls++;return respond({items:[]});
 },{confirmation:'NO'});
 assert.equal(code,2);assert.equal(calls,0);
 assert.equal(logged[0],'CLI_REJECTED: consult help (no request was executed)');
 assert.ok(io.prompts.every(x=>!x.includes('Paste authorized Bearer')));
});
test('T009D schema failure redacts source text and exposes only bounded status',async()=>{
 const rows=[row('villages')];rows[0].citizenId='PRIVATE_PERSON_NOT_ALLOWED';
 const {code,report,logged}=await call('villages',async()=>respond({items:rows}));
 assert.equal(code,2);assert.notEqual(report.status,'SOURCE_SCHEMA_VALIDATED');
 assert.equal('rows' in report,false);
 assert.equal('items' in report,false);
 assert.equal(report.appsScriptPosts,0);assert.equal(report.sheetsWrites,0);
 assert.doesNotMatch(logged.join(''),/PRIVATE_PERSON|citizenId|TEST_ONLY/);
});
