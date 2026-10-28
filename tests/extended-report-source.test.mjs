import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import {readExtendedReport,EXTENDED_AUDIT_CONFIRM} from '../src/sync/extended-report-source.mjs';
import {main} from '../src/cli/index.mjs';

const manifest=JSON.parse(readFileSync(new URL('../docs/sheets-schema.json',import.meta.url),'utf8'));
const TOKEN='SYNTHETIC_AUTHORIZED_BEARER_1234567890';
const respond=body=>new Response(JSON.stringify(body),{status:200,headers:{'content-type':'application/json'}});
function item(api,i){
 const r={};
 const d=manifest.datasets.find(x=>x.api===api);
 for(const field of d.fields){
  r[field.source_field]=field.observed_kind==='null_only'?null:
   field.observed_kind==='integer'?12:
   field.observed_kind==='boolean'?true:'TEST_SYNTHETIC';
 }
 r.provinceCode='54';r.districtCode='5406';
 if('id' in r)r.id='ID_ONLY_TEST_'+i;
 if('subdistrictCode' in r)r.subdistrictCode='540601';
 if('villageCode' in r)r.villageCode='540601'+String(i+1).padStart(3,'0');
 if(api==='volunteer-gender'){r.total=12;r.male=6;r.female=6;}
 return r;
}
function data(api,total=11){
 const rows=Array.from({length:total},(_,i)=>item(api,i));
 return Array.from({length:Math.ceil(total/10)},(_,i)=>{
  const base={items:rows.slice(i*10,i*10+10)};
  return api==='assignments'?{...base,provinces:[],
   pagination:{page:i+1,pages:Math.ceil(total/10),limit:10,total}}:
   {...base,success:true,message:'OK',total,page:i+1,pageSize:10};
 });
}
test('F010 real-transport surface stays strictly READ ONLY and outputs aggregate report without names',async()=>{
 for(const api of ['volunteer-gender','assignments','volunteer-family',
  'resigned-volunteers','volunteer-tenure']){
  const p=data(api),seen=[];
  const report=await readExtendedReport({
   endpoint:api,manifest,confirm:async()=>EXTENDED_AUDIT_CONFIRM,
   getToken:async()=>TOKEN,
   fetchImpl:async(url,config)=>{
    seen.push({url,method:config.method,redirect:config.redirect,
     credentials:config.credentials,authorization:config.headers.Authorization});
    const n=Number(new URL(url).searchParams.get('page'));
    return respond(p[n-1]);
   }
  });
  assert.equal(seen.length,2);
  assert.ok(seen.every(x=>x.method==='GET'&&x.redirect==='error'&&x.credentials==='omit'));
  assert.ok(seen.every(x=>new URL(x.url).origin==='https://api-thaiphc.hss.moph.go.th'));
  assert.ok(seen.every(x=>x.authorization==='Bearer '+TOKEN));
  assert.equal(report.rowsChecked,11);
  assert.equal(report.sourceNetworkRequests,2);
  assert.equal(report.appsScriptPosts,0);
  assert.equal(report.sheetsWrites,0);
  assert.equal(report.writeAuthorized,false);
  assert.equal(report.rawRowsReturned,false);
  const printable=JSON.stringify(report);
  assert.doesNotMatch(printable,/ID_ONLY_TEST|SYNTHETIC_AUTHORIZED_BEARER|TEST_SYNTHETIC/);
 }
});
test('F010 no token access or network before explicit confirmation',async()=>{
 let reads=0,calls=0;
 const v=await readExtendedReport({
  endpoint:'assignments',manifest,confirm:async()=> 'WRONG',
  getToken:async()=>{reads++;return TOKEN},
  fetchImpl:async()=>{calls++;return respond({})}
 });
 assert.equal(v.status,'CONFIRMATION_REQUIRED');assert.equal(reads,0);assert.equal(calls,0);
 assert.equal(v.sourceNetworkRequests,0);
});
test('F010 malformed source page, total mismatch and denied HTTP stop, never POST',async()=>{
 const a=data('assignments',11);
 for(const testCase of ['TOTAL_CHANGED','HTTP_403','MALFORMED']){
  let count=0;
  const out=await readExtendedReport({
   endpoint:'assignments',manifest,confirm:async()=>EXTENDED_AUDIT_CONFIRM,
   getToken:async()=>TOKEN,fetchImpl:async()=>{
    const n=count++;
    if(testCase==='HTTP_403')return new Response('{}',{status:403});
    if(testCase==='TOTAL_CHANGED'&&n===1)
     return respond({...a[n],pagination:{...a[n].pagination,total:12,pages:2}});
    if(testCase==='MALFORMED')return respond({items:[]});
    return respond(a[n]);
   }
  });
  assert.notEqual(out.status,'PERSON_DATA_STORAGE_APPROVAL_REQUIRED');
  assert.equal(out.appsScriptPosts,0);assert.equal(out.sheetsWrites,0);
  assert.equal(out.writeAuthorized,false);
 }
});
class FakeTTY extends EventEmitter {
 constructor(){super();this.isTTY=true;this.isRaw=false;}
 setRawMode(x){this.isRaw=x;}
 pause(){}
 resume(){}
 isPaused(){return false;}
}
test('F010 audit-extended CLI rejects nonallowlisted writes/tokens and exposes no commit',async()=>{
 let network=0;
 const fake={fetchImpl:async()=>{network++;throw Error('NO_NETWORK')}};
 const bad=[
  ['audit-extended','--endpoint','assignments'],
  ['audit-extended','--endpoint','villages','--acknowledge-authorized-use'],
  ['audit-extended','--endpoint','assignments','--acknowledge-authorized-use','--output','pii.json'],
  ['audit-extended','--endpoint','volunteer-family','--acknowledge-authorized-use','--token','SECRET'],
  ['audit-extended','--endpoint','assignments','--acknowledge-authorized-use','--max-pages','1']
 ];
 for(const args of bad){
  const output=[];
  assert.equal(await main(args,x=>output.push(x),fake),2);
  assert.equal(network,0);
  assert.equal(output.length,1);
  assert.match(output[0],/CLI_REJECTED/);
 }
});
test('F010 interactive CLI read-only report outputs summary only and restores TTY mode',async()=>{
 const input=new FakeTTY(),messages=[],seen=[];
 const rows=data('volunteer-gender',11);
 const output={isTTY:true,write(label){
  messages.push(label);
  if(label.includes('AUDIT FIVE REPORTS READ ONLY 5406'))
   queueMicrotask(()=>input.emit('data',Buffer.from(EXTENDED_AUDIT_CONFIRM+'\r')));
  if(label.includes('Paste authorized Bearer'))
   queueMicrotask(()=>input.emit('data',Buffer.from(TOKEN+'\r')));
  return true;
 }};
 const io={input,output,fetchImpl:async(url)=>{
  const n=Number(new URL(url).searchParams.get('page'));
  seen.push(n);return respond(rows[n-1]);
 }};
 const logs=[];
 const code=await main(['audit-extended','--endpoint','volunteer-gender',
  '--acknowledge-authorized-use'],x=>logs.push(x),io);
 assert.equal(code,0);
 assert.deepEqual(seen,[1,2]);
 const x=JSON.parse(logs[0]);
 assert.equal(x.status,'AGGREGATE_STORAGE_APPROVAL_REQUIRED');
 assert.equal(x.sheetsWrites,0);assert.equal(x.appsScriptPosts,0);
 assert.equal(input.isRaw,false);
 assert.doesNotMatch(logs.join(''),/SYNTHETIC_AUTHORIZED_BEARER|TEST_SYNTHETIC|payloadB64/);
});
