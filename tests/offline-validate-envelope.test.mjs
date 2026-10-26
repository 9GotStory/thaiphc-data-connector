import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import vm from 'node:vm';
import {buildOfflineValidateEnvelope} from '../src/sync/offline-validate-envelope.mjs';

const manifest=JSON.parse(readFileSync(new URL('../docs/sheets-schema.json',import.meta.url),'utf8'));
const receiver=readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8');
const keyB64=Buffer.alloc(32,19).toString('base64'); // synthetic secret only
const timestampMs=Date.now();
const fetchedAtUtc=new Date(timestampMs).toISOString();
const runId='synthetic-run-0001';
function sample(endpoint,index=1){
 const def=manifest.datasets.find(d=>d.api===endpoint);
 const row=Object.create(null);
 for(const field of def.fields){
  const k=field.observed_kind,n=field.source_field;
  if(k==='null_only'||k==='string_or_null')row[n]=null;
  else if(k==='string')row[n]='SYNTHETIC';
  else if(k==='integer')row[n]=index;
  else if(k==='number')row[n]=0;
  else if(k==='object')row[n]={label:'SYNTHETIC'};
  else if(k==='array')row[n]=[];
  else throw Error('INVALID_SYNTHETIC_KIND');
 }
 if(endpoint==='subdistricts'){
  row.code='54060'+index;row.id=row.code;row.district_code='5406';
 }else if(endpoint==='villages'){
  row.code='540601'+String(index).padStart(3,'0');row.id=row.code;
  row.village_code_8digit='540601'+String(index).padStart(2,'0');
  row.subdistrict_code='540601';row.province_code='54';row.district_code='5406';
 }else if(endpoint==='health-services'){
  row.health_service_code='SYNTHETIC-HS-'+index;
  row.legacy_5digit_code='00001';row.legacy_9digit_code='000000001';
  row.province={province_code:'54'};row.district={district_code:'5406'};
  row.subdistrict={subdistrict_code:'540601'};
  row.health_service_type={id:'SYNTHETIC'};row.service_areas=[];
  row.village_no='หมู่ 4';row.latitude=0;row.longitude=0;
 }
 return row;
}
const options=(endpoint='villages',rows=[sample(endpoint)])=>({
 endpoint,rows,manifest,keyB64,runId,fetchedAtUtc,timestampMs
});
const payload=out=>JSON.parse(Buffer.from(out.envelope.payloadB64,'base64').toString('utf8'));

function receiverValidateOnly(){
 let sheetOpens=0,cache=new Set();
 const props=new Map([
  ['THAIPHC_RECEIVER_ENABLED','true'],
  ['THAIPHC_WRITE_ENABLED','false'],
  ['THAIPHC_HMAC_KEY_B64',keyB64]
 ]);
 const context=vm.createContext({
  PropertiesService:{getScriptProperties:()=>({getProperty:name=>props.get(name)??null})},
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},
  CacheService:{getScriptCache:()=>({
   get:key=>cache.has(key)?'1':null,
   put:key=>{cache.add(key);}
  })},
  SpreadsheetApp:{openById:()=>{sheetOpens++;throw Error('SHEETS_ACCESS_FORBIDDEN');}},
  Utilities:{
   newBlob:v=>{const buf=typeof v==='string'?Buffer.from(v,'utf8'):Buffer.from(v.map(n=>n&255));
    return {getBytes:()=>[...buf],getDataAsString:()=>buf.toString('utf8')};},
   base64Decode:v=>[...Buffer.from(v,'base64')],
   computeHmacSha256Signature:(message,key)=>[...createHmac('sha256',Buffer.from(key)).update(Buffer.from(message)).digest()]
  },
  ContentService:{
   MimeType:{JSON:'application/json'},
   createTextOutput:value=>({setMimeType(){return this;},getContent(){return value;}})
  }
 });
 vm.runInContext(receiver,context,{filename:'Code.gs',timeout:2000});
 return {
  post:wire=>JSON.parse(context.doPost({postData:{contents:JSON.stringify(wire)}}).getContent()),
  sheetOpens:()=>sheetOpens
 };
}

test('T017 3 allowed endpoints assemble receiver-compatible validate-only wire without sending',()=>{
 for(const endpoint of ['subdistricts','villages','health-services']){
  const data=buildOfflineValidateEnvelope(options(endpoint));
  assert.equal(data.status,'OFFLINE_ONLY_NOT_SENT');
  assert.equal(data.transferApproved,false);
  assert.equal(data.endpoint,endpoint);
  assert.equal(data.rowCount,1);
  assert.equal(data.networkRequests,0);assert.equal(data.appsScriptPosts,0);assert.equal(data.sheetsWrites,0);
  const b=payload(data);
  assert.deepEqual(Object.keys(b),['schemaVersion','mode','endpoint','scope','runId','fetchedAtUtc','sourceFieldNames','rows']);
  assert.equal(b.schemaVersion,'0.1.0');
  assert.equal(b.mode,'validate');
  assert.deepEqual(b.scope,{provinceCode:'54',districtCode:'5406'});
  assert.equal(b.endpoint,endpoint);
  assert.deepEqual(b.sourceFieldNames,manifest.datasets.find(d=>d.api===endpoint).fields.map(f=>f.source_field));
  assert.equal(b.rows[0].values.length,b.sourceFieldNames.length);
  assert.equal(b.rows[0].presence[b.sourceFieldNames[0]],'VALUE');
  assert.equal(data.envelope.version,'THAIPHC_SYNC_V1');
  assert.match(data.envelope.nonce,/^[A-Za-z0-9_-]{24}$/);
 }
});
test('T017 HMAC-SHA256 matches exact T010 signed UTF-8 body and rejects tampering',()=>{
 const result=buildOfflineValidateEnvelope(options());
 const wire=result.envelope;
 const signing='THAIPHC_SYNC_V1\n'+wire.timestamp+'\n'+wire.nonce+'\n'+wire.payloadB64;
 assert.equal(wire.signature,createHmac('sha256',Buffer.from(keyB64,'base64')).update(signing,'utf8').digest('base64'));
 const modified={...wire,payloadB64:wire.payloadB64.replace(/^./,wire.payloadB64[0]==='A'?'B':'A')};
 assert.notEqual(modified.signature,createHmac('sha256',Buffer.from(keyB64,'base64'))
  .update('THAIPHC_SYNC_V1\n'+modified.timestamp+'\n'+modified.nonce+'\n'+modified.payloadB64).digest('base64'));
 assert.notEqual(buildOfflineValidateEnvelope(options()).envelope.nonce,wire.nonce);
});
test('T017 preserves leading zeroes, null/absent/empty distinctions and nested text',()=>{
 const village=sample('villages');
 delete village.name_en;village.name_th='';village.health_service_code=null;
 const b=payload(buildOfflineValidateEnvelope(options('villages',[village])));
 const r=b.rows[0];
 assert.equal(r.key,'540601001');
 assert.equal(r.presence.name_en,'ABSENT');
 assert.equal(r.presence.name_th,'VALUE');
 assert.equal(r.presence.health_service_code,'NULL');
 assert.equal(r.values[b.sourceFieldNames.indexOf('name_th')],'');
 assert.equal(r.values[b.sourceFieldNames.indexOf('name_en')],null);
 const health=payload(buildOfflineValidateEnvelope(options('health-services',[sample('health-services')])));
 const h=health.rows[0];
 assert.equal(h.values[health.sourceFieldNames.indexOf('legacy_9digit_code')],'000000001');
 assert.equal(h.values[health.sourceFieldNames.indexOf('latitude')],0);
 assert.equal(JSON.parse(h.values[health.sourceFieldNames.indexOf('province')]).province_code,'54');
});
test('T017 signed envelope validates in real T010 Code.gs VM with zero Sheet access',()=>{
 const h=receiverValidateOnly();
 for(const endpoint of ['subdistricts','villages','health-services']){
  const result=buildOfflineValidateEnvelope(options(endpoint));
  const response=h.post(result.envelope);
  assert.equal(response.status,'VALIDATED');
  assert.equal(response.accepted,true);
  assert.equal(response.endpoint,endpoint);
  assert.equal(response.rowCount,1);
  assert.equal(response.sheetsWrites,0);
 }
 assert.equal(h.sheetOpens(),0);
});
test('T017 refuses all unapproved dataset endpoints and any commit/transport option',()=>{
 for(const endpoint of ['volunteer-gender','assignments','volunteer-family','resigned-volunteers','volunteer-tenure','unknown']){
  assert.throws(()=>buildOfflineValidateEnvelope({...options(),endpoint}),/REFERENCE_ONLY_ENDPOINT_REQUIRED/);
 }
 for(const extras of [{mode:'commit'},{url:'https://example.invalid'},{fetchImpl:()=>{}},{token:'TEST'},{writeAllowed:true}]){
  assert.throws(()=>buildOfflineValidateEnvelope({...options(),...extras}),/OFFLINE_ENVELOPE_REJECTED/);
 }
});
test('T017 refuses empty, duplicate, malformed, out-of-scope and unsafe rows',()=>{
 const p=options();
 for(const rows of [
  [],
  [sample('villages'),sample('villages')],
  [{...sample('villages'),district_code:'9999'}],
  [{...sample('villages'),firstName:'SYNTHETIC'}],
  [{...sample('villages'),name_th:'=FORMULA()'}]
 ]) assert.throws(()=>buildOfflineValidateEnvelope({...p,rows}));
});
test('T017 refuses invalid HMAC key, run ID, timestamp, schema and date',()=>{
 const p=options();
 for(const change of [
  {keyB64:'not-a-valid-secret'},
  {keyB64:Buffer.alloc(31).toString('base64')},
  {keyB64:Buffer.alloc(32,0).toString('base64').slice(0,-1)+'!'},
  {runId:'short'},
  {runId:'secret\nleak'},
  {timestampMs:NaN},
  {timestampMs:0},
  {fetchedAtUtc:'untrusted'},
  {manifest:{...manifest,version:'9.9.9'}}
 ]) assert.throws(()=>buildOfflineValidateEnvelope({...p,...change}),/OFFLINE_ENVELOPE_REJECTED/);
});
test('T017 no network, file output, POST or Sheet write operation in envelope builder',()=>{
 const code=readFileSync(new URL('../src/sync/offline-validate-envelope.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(code,/\bfetch\s*\(|https?:\/\/|UrlFetchApp|SpreadsheetApp|writeFile|appendFile|console\.|process\.stdout|mode\s*:\s*'commit'/);
 assert.doesNotMatch(code,/\bTHAIPHC_BEARER\b/);
});
