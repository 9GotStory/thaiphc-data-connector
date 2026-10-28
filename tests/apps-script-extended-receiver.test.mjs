import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,createHash,randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {planExtendedBatches} from '../src/sync/extended-batch-plan.mjs';
const manifest=JSON.parse(readFileSync(new URL('../docs/sheets-schema.json',import.meta.url),'utf8'));

const base=readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8');
const extended=readFileSync(new URL('../apps-script/ReportReceiver.gs',import.meta.url),'utf8');
const key=Buffer.alloc(32,24).toString('base64');
const originalId='ORIGINAL_REFERENCE_SHEET_1234567890123';
const privateId='PRIVATE_RESTRICTED_REPORT_SHEET_1234567890123';
function sheet(name){
 const data=[],s={name,data,maxColumns:26,maxRows:1000,hidden:false};
 s.getLastRow=()=>data.length;s.getLastColumn=()=>Math.max(0,...data.map(r=>r.length));
 s.getMaxColumns=()=>s.maxColumns;s.getMaxRows=()=>s.maxRows;
 s.getName=()=>name;s.hideSheet=()=>{s.hidden=true};s.showSheet=()=>{s.hidden=false};
 s.setFrozenRows=()=>{};
 s.insertColumnsAfter=(_n,count)=>{s.maxColumns+=count};
 s.insertRowsAfter=(_n,count)=>{s.maxRows+=count};
 s.getRange=(row,col,rs=1,cs=1)=>{
  assert.ok(row>0&&col>0&&col+cs-1<=s.maxColumns);
  return {
   getValue:()=>data[row-1]?.[col-1]??'',
   getValues:()=>Array.from({length:rs},(_,i)=>Array.from({length:cs},(_,j)=>data[row-1+i]?.[col-1+j]??'')),
   setValue:v=>{while(data.length<row)data.push([]);data[row-1][col-1]=v},
   setValues:values=>{
    assert.equal(values.length,rs);
    for(let i=0;i<rs;i++){
     assert.equal(values[i].length,cs);
     while(data.length<row+i)data.push([]);
     for(let j=0;j<cs;j++)data[row-1+i][col-1+j]=values[i][j];
    }
   },
   setNumberFormat:()=>{}
  };
 };
 return s;
}
function harness(){
 const props=new Map(),original=new Map([['ชีต1',sheet('ชีต1')]]),restricted=new Map(),cache=new Map();
 const config=(target,id)=>({getSheetByName:n=>target.get(n)??null,
  insertSheet:n=>{if(target.has(n))throw Error('DUPLICATE');const s=sheet(n);target.set(n,s);return s}});
 const services={
  PropertiesService:{getScriptProperties:()=>({getProperty:k=>props.get(k)??null})},
  SpreadsheetApp:{openById:id=>id===privateId?config(restricted,id):
   id===originalId?config(original,id):(()=>{throw Error('BAD_SHEET_ID')})(),
   flush:()=>{}},
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
  CacheService:{getScriptCache:()=>({get:k=>cache.get(k)??null,
   put:(k,v)=>cache.set(k,v)})},
  Utilities:{
   base64Decode:s=>Array.from(Buffer.from(s,'base64')),
   newBlob:s=>({getBytes:()=>Array.from(Buffer.from(s,'utf8')),
    getDataAsString:()=>typeof s==='string'?s:Buffer.from(s).toString('utf8')}),
   computeHmacSha256Signature:(data,secret)=>Array.from(createHmac('sha256',Buffer.from(secret))
    .update(Buffer.from(data)).digest()),
   DigestAlgorithm:{SHA_256:'sha256'},
   computeDigest:(_alg,data)=>Array.from(createHash('sha256').update(Buffer.from(data)).digest())
  },
  ContentService:{MimeType:{JSON:'application/json'},createTextOutput:s=>({
   content:s,setMimeType(){return this},getContent(){return this.content}
  })}
 };
 const context=vm.createContext(services);
 vm.runInContext(base+'\n'+extended,context,{filename:'receiver-with-reports.gs',timeout:3000});
 return {props,original,restricted,post:payload=>{
  const payloadB64=Buffer.from(JSON.stringify(payload),'utf8').toString('base64');
  const timestamp=Date.now(),nonce=randomBytes(18).toString('base64url');
  const signature=createHmac('sha256',Buffer.from(key,'base64'))
   .update('THAIPHC_SYNC_V1\n'+timestamp+'\n'+nonce+'\n'+payloadB64).digest('base64');
  return JSON.parse(context.doPost({postData:{contents:JSON.stringify({
   version:'THAIPHC_SYNC_V1',timestamp,nonce,payloadB64,signature
  })}}).getContent());
 }};
}
function setup(h,{person=true,dest=privateId}={}){
 h.props.set('THAIPHC_RECEIVER_ENABLED','true');
 h.props.set('THAIPHC_WRITE_ENABLED','true');
 h.props.set('THAIPHC_HMAC_KEY_B64',key);
 h.props.set('THAIPHC_SPREADSHEET_ID',originalId);
 h.props.set('THAIPHC_REPORT_SPREADSHEET_ID',dest);
 if(person)h.props.set('THAIPHC_PERSON_DATA_WRITE_ENABLED','true');
}
function plan(api='assignments',count=27){
 const fieldsSpec=manifest.datasets.find(d=>d.api===api).fields
  .filter(f=>f.pii_policy==='ALLOW_ONLY_IF_DATASET_APPROVED');
 const fields=fieldsSpec.map(f=>f.column);
 const values=i=>Object.fromEntries(fieldsSpec.map(f=>[
  f.column,f.observed_kind==='null_only'?null:
   f.observed_kind==='boolean'?true:
   ['male','female'].includes(f.column)?6:
   f.column==='total'?12:
   f.observed_kind==='integer'?10:
   f.column==='provinceCode'?'54':
   f.column==='districtCode'?'5406':
   f.column==='subdistrictCode'?'540601':
   f.column==='villageCode'?'540601'+String(i+1).padStart(3,'0'):
   f.column==='villageNo'?String(i+1):
   ['male','female'].includes(f.column)?6:
   f.column==='total'?12:'ACTIVE'
 ]));
 return planExtendedBatches({
  mode:'IN_MEMORY_MINIMIZED_REPORT_NOT_SENT',endpoint:api,
  runId:'test-private-run-1',rowCount:count,
  privacyState:api==='volunteer-family'?'UNVERIFIED_RELATION_KEY_WRITE_HOLD':
   api==='volunteer-gender'?'AGGREGATE_STORAGE_APPROVAL_REQUIRED':
   'PERSON_DATA_STORAGE_APPROVAL_REQUIRED',
  sourceIdentityStrategy:api==='volunteer-family'?'RUN_SCOPED_SNAPSHOT_ORDINAL_NO_UPSERT':
   api==='volunteer-gender'?'VILLAGE_CODE':'HMAC_SHA256_PERSON_ID',
  destinationSchema:fields,
  rows:Array.from({length:count},(_,i)=>({key:api==='volunteer-family'?
   'snapshot_test-private-run-1_'+String(i+1).padStart(5,'0'):
   api==='volunteer-gender'?'540601'+String(i+1).padStart(3,'0'):
   'h1_'+String(i).padStart(64,'0'),values:values(i)})),
  writeAuthorized:false,appsScriptPosts:0,sheetsWrites:0
 });
}
function batch(p,mode,chunk){
 const root={schemaVersion:'0.2.0',mode,endpoint:p.endpoint,
  scope:{provinceCode:'54',districtCode:'5406'},runId:p.runId};
 if(mode==='report-start')return {...root,
  sourceIdentityStrategy:p.runFingerprint.sourceIdentityStrategy,
  sourceRows:p.sourceRows,chunkCount:p.chunkCount,
  destinationFields:p.destinationFields,chunkDigests:p.runFingerprint.chunkDigests,
  manifestDigest:p.manifestDigest};
 if(mode==='report-chunk')return {...root,manifestDigest:p.manifestDigest,
  ordinal:chunk.ordinal,rowOffset:chunk.rowOffset,rowCount:chunk.rowCount,
  digest:chunk.digest,rows:chunk.rows};
 return {...root,manifestDigest:p.manifestDigest};
}
test('F010 private report endpoint is disabled unless ALL independent switches enabled',()=>{
 for(const scenario of [
  {setup:false,expected:'INGRESS_DISABLED'},
  {person:false,expected:'PERSON_DATA_WRITE_DISABLED'},
  {dest:originalId,expected:'REPORT_DESTINATION_NOT_CONFIGURED'}
 ]){
  const h=harness(),p=plan('assignments',1);
  if(scenario.setup!==false)setup(h,scenario);
  assert.equal(h.post(batch(p,'report-start')).status,scenario.expected);
  assert.equal(h.restricted.size,0);assert.equal(h.original.size,1);
 }
});
test('F010 staging 27 rows cannot publish before every signed chunk is present',()=>{
 const h=harness();setup(h);const p=plan();
 assert.equal(h.post(batch(p,'report-start')).status,'REPORT_STARTED');
 assert.equal(h.restricted.size,1);
 const temp=[...h.restricted.values()][0];
 assert.equal(temp.hidden,true);
 assert.equal(h.post(batch(p,'report-chunk',p.chunks[0])).status,'REPORT_CHUNK_STAGED');
 assert.equal(h.post(batch(p,'report-finalize')).status,'REPORT_INCOMPLETE_STOP');
 assert.equal(h.restricted.has('_ThaiPHCReportCurrent'),false);
 assert.equal(h.post(batch(p,'report-chunk',p.chunks[0])).status,'REPORT_CHUNK_ORDER_STOP');
 assert.equal(h.post(batch(p,'report-chunk',p.chunks[1])).status,'REPORT_CHUNK_STAGED');
 assert.equal(h.post(batch(p,'report-finalize')).status,'REPORT_FINALIZED');
 assert.equal(temp.getLastRow(),29);
 const pointer=h.restricted.get('_ThaiPHCReportCurrent');
 assert.equal(pointer.data[1][0],'assignments');
 assert.equal(pointer.data[1][3],27);
 assert.equal(pointer.data[1][4],p.manifestDigest);
 assert.equal(temp.hidden,false);
 assert.equal(h.original.size,1);assert.equal(h.original.get('ชีต1').getLastRow(),0);
});
test('F010 tampering one staged cell prevents digest-validated publication',()=>{
 const h=harness();setup(h);const p=plan('assignments',2);
 h.post(batch(p,'report-start'));
 assert.equal(h.post(batch(p,'report-chunk',p.chunks[0])).status,'REPORT_CHUNK_STAGED');
 const tab=[...h.restricted.values()][0];
 tab.data[2][tab.data[1].indexOf('status')]='MODIFIED';
 assert.equal(h.post(batch(p,'report-finalize')).status,'REJECTED');
 assert.equal(h.restricted.has('_ThaiPHCReportCurrent'),false);
});
test('F010 family run-scoped snapshot identity supported without person upsert',()=>{
 const h=harness();setup(h);const p=plan('volunteer-family',2);
 assert.equal(h.post(batch(p,'report-start')).status,'REPORT_STARTED');
 assert.equal(h.post(batch(p,'report-chunk',p.chunks[0])).status,'REPORT_CHUNK_STAGED');
 assert.equal(h.post(batch(p,'report-finalize')).status,'REPORT_FINALIZED');
 assert.equal(h.restricted.has('_ThaiPHCReportCurrent'),true);
});
test('F010 forged unallowlisted PII column denied before any Sheets write',()=>{
 const h=harness();setup(h);const p=plan('assignments',1);
 const b=batch(p,'report-start');b.destinationFields=[...b.destinationFields,'citizenId'];
 assert.equal(h.post(b).status,'REJECTED');
 assert.equal(h.restricted.size,0);
});

test('F010 all five report topics stage/finalize to ONLY the private workbook, independently from 111 references',()=>{
 for(const api of ['volunteer-gender','assignments','volunteer-family',
  'resigned-volunteers','volunteer-tenure']){
  const h=harness();setup(h);const p=plan(api,2);
  assert.equal(h.post(batch(p,'report-start')).status,'REPORT_STARTED',api);
  assert.equal(h.post(batch(p,'report-chunk',p.chunks[0])).status,'REPORT_CHUNK_STAGED',api);
  assert.equal(h.post(batch(p,'report-finalize')).status,'REPORT_FINALIZED',api);
  const current=h.restricted.get('_ThaiPHCReportCurrent');
  assert.equal(current.data[1][0],api);
  assert.equal(current.data[1][3],2);
  assert.equal(h.original.size,1);
  assert.equal(h.original.get('ชีต1').getLastRow(),0);
 }
});

test('F010 gender 0 male + 12 female is valid; unsuppressed nonzero count 1 remains denied',()=>{
 const h=harness();setup(h);const p=plan('volunteer-gender',1);
 const original=p.chunks[0].rows[0];
 const valid={key:original.key,values:{...original.values,male:0,female:12,total:12}};
 const plan0=planExtendedBatches({
  mode:'IN_MEMORY_MINIMIZED_REPORT_NOT_SENT',
  endpoint:'volunteer-gender',runId:'test-zero-gender-1',rowCount:1,
  privacyState:'AGGREGATE_STORAGE_APPROVAL_REQUIRED',
  destinationSchema:p.destinationFields,sourceIdentityStrategy:'VILLAGE_CODE',
  rows:[valid],writeAuthorized:false,appsScriptPosts:0,sheetsWrites:0
 });
 assert.equal(h.post(batch(plan0,'report-start')).status,'REPORT_STARTED');
 assert.equal(h.post(batch(plan0,'report-chunk',plan0.chunks[0])).status,'REPORT_CHUNK_STAGED');
 assert.equal(h.post(batch(plan0,'report-finalize')).status,'REPORT_FINALIZED');
 const tooSmall=structuredClone(batch(plan0,'report-chunk',plan0.chunks[0]));
 tooSmall.rows[0].values.male=1;tooSmall.rows[0].values.female=11;
 tooSmall.digest=createHash('sha256').update(JSON.stringify(tooSmall.rows)).digest('hex');
 assert.equal(h.post(tooSmall).status,'REJECTED');
});
test('F010 private receiver blocks invalid province or village-subdistrict mismatch even with signed batch',()=>{
 for(const invalid of [
  values=>{values.provinceCode='53'},
  values=>{values.villageCode='540602001'}
 ]){
  const h=harness();setup(h);const p=plan('volunteer-family',1);
  assert.equal(h.post(batch(p,'report-start')).status,'REPORT_STARTED');
  const forged=structuredClone(batch(p,'report-chunk',p.chunks[0]));
  invalid(forged.rows[0].values);
  forged.digest=createHash('sha256').update(JSON.stringify(forged.rows)).digest('hex');
  assert.equal(h.post(forged).status,'REJECTED');
  assert.equal(h.restricted.has('_ThaiPHCReportCurrent'),false);
 }
});
