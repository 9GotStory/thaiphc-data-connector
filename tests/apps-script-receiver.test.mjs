import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHmac,createHash,randomBytes} from 'node:crypto';
import vm from 'node:vm';
import {projectReferenceRows} from '../src/sync/reference-projection.mjs';

const script=readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8');
const manifest=JSON.parse(readFileSync(new URL('../docs/sheets-schema.json',import.meta.url),'utf8'));
const secret=Buffer.alloc(32,19).toString('base64');
const decodedSchema=Object.fromEntries(manifest.datasets
 .filter(d=>['subdistricts','villages','health-services'].includes(d.api))
 .map(d=>[d.api,{tab:d.tab,key:d.candidate[0],names:d.fields.map(f=>f.column),
  kinds:d.fields.map(f=>f.observed_kind)}]));
function sample(api,index=1){
 const d=manifest.datasets.find(x=>x.api===api),r=Object.create(null);
 for(const f of d.fields){
  const k=f.observed_kind,name=f.source_field;
  if(k==='null_only'||k==='string_or_null')r[name]=null;
  else if(k==='string')r[name]='SYNTHETIC';
  else if(k==='integer')r[name]=index;
  else if(k==='number')r[name]=0;
  else if(k==='object')r[name]={label:'SYNTHETIC'};
  else if(k==='array')r[name]=[];
  else throw Error('UNKNOWN_SYNTHETIC_KIND');
 }
 if(api==='subdistricts'){
  r.code='54060'+index;r.id=r.code;r.district_code='5406';
 }else if(api==='villages'){
  r.code='540601'+String(index).padStart(3,'0');
  r.id=r.code;r.village_code_8digit='540601'+String(index).padStart(2,'0');
  r.province_code='54';r.district_code='5406';r.subdistrict_code='540601';
 }else{
  r.health_service_code='H-'+index;
  r.legacy_5digit_code='00001';r.legacy_9digit_code='000000001';
  r.province={province_code:'54'};
  r.district={district_code:'5406'};
  r.subdistrict={subdistrict_code:'540601'};
  r.health_service_type={id:'TEST'};
  r.service_areas=[{village_nos:['01','02']}];
  r.village_no='หมู่ 3';r.latitude=0;r.longitude=0;
 }
 return r;
}
function batch(api='villages',records=[sample(api)]){
 const p=projectReferenceRows(api,records,manifest);
 return {schemaVersion:'0.1.0',mode:'validate',endpoint:api,
  scope:{provinceCode:'54',districtCode:'5406'},
  runId:'synthetic-run-0001',fetchedAtUtc:'2026-10-21T10:00:00.000Z',
  sourceFieldNames:p.sourceFieldNames,rows:p.rows};
}
function wire(payload,opts={}){
 const b64=Buffer.from(JSON.stringify(payload),'utf8').toString('base64');
 const timestamp=opts.timestamp??Date.now();
 const nonce=opts.nonce??randomBytes(18).toString('base64url');
 const signature=createHmac('sha256',Buffer.from(secret,'base64'))
  .update('THAIPHC_SYNC_V1\n'+timestamp+'\n'+nonce+'\n'+b64)
  .digest('base64');
 return JSON.stringify({version:'THAIPHC_SYNC_V1',timestamp,nonce,
  payloadB64:b64,signature});
}
function makeSheet(name,head=[]){
 const data=head.length?[head.slice()]:[];
 const record={name,data,frozen:0,maxCols:26,columnsAdded:0};
 record.getLastRow=()=>data.length;
 record.getLastColumn=()=>data.reduce((max,r)=>Math.max(max,r.length),0);
 record.getMaxRows=()=>1000;
 record.getMaxColumns=()=>record.maxCols;
 record.insertColumnsAfter=(position,count)=>{
  assert.equal(position,record.maxCols);
  assert.ok(Number.isSafeInteger(count)&&count>0);
  record.maxCols+=count;
  record.columnsAdded+=count;
 };
 record.insertRowsAfter=()=>{};
 record.setFrozenRows=n=>{record.frozen=n;};
 record.getRange=(r,c,rows,cols)=>{
  assert.ok(c>=1&&cols>=1&&c+cols-1<=record.maxCols,'RANGE_OUTSIDE_GRID_COLUMNS');
  return ({
  getValues:()=>Array.from({length:rows},(_,i)=>
   Array.from({length:cols},(_,j)=>data[r+i-1]?.[c+j-1]??'')),
  setNumberFormat:()=>{},
  setValues:values=>{
   assert.equal(values.length,rows);
   for(let i=0;i<rows;i++){
    assert.equal(values[i].length,cols);
    while(data.length<r+i)data.push([]);
    for(let j=0;j<cols;j++)data[r+i-1][c+j-1]=values[i][j];
   }
  }
 });
 };
 return record;
}
function harness(){
 const props=new Map(),sheets=new Map([['ชีต1',makeSheet('ชีต1')]]),cache=new Map();
 const events={open:0,lock:0,flush:0};
 const services={
  PropertiesService:{getScriptProperties:()=>({getProperty:key=>props.get(key)??null})},
  LockService:{getScriptLock:()=>({
   tryLock:()=>{events.lock++;return true;},releaseLock:()=>{}
  })},
  CacheService:{getScriptCache:()=>({
   get:key=>cache.get(key)??null,
   put:(key,value)=>{cache.set(key,value);}
  })},
  SpreadsheetApp:{
   openById:id=>{
    events.open++;
    if(id!=='FAKE_DESTINATION_ID_123456789012345678901')throw Error('INVALID_TEST_SHEET');
    return {getSheetByName:name=>sheets.get(name)??null,
      insertSheet:name=>{
       if(sheets.has(name))throw Error('DUPLICATE_SHEET');
       const sheet=makeSheet(name);sheets.set(name,sheet);return sheet;
      }};
   },flush:()=>{events.flush++;}
  },
  Utilities:{
   newBlob:value=>{
    const buffer=typeof value==='string'?Buffer.from(value,'utf8'):Buffer.from(value.map(x=>x&255));
    return {getBytes:()=>Array.from(buffer),getDataAsString:()=>buffer.toString('utf8')};
   },
   base64Decode:value=>Array.from(Buffer.from(value,'base64')),
   computeHmacSha256Signature:(message,key)=>Array.from(
    createHmac('sha256',Buffer.from(key)).update(Buffer.from(message)).digest()),
   DigestAlgorithm:{SHA_256:'sha256'},
   computeDigest:(_alg,data)=>Array.from(createHash('sha256').update(Buffer.from(data)).digest())
  },
  ContentService:{
   MimeType:{JSON:'application/json'},
   createTextOutput:text=>({
    text,contentType:null,
    setMimeType(type){this.contentType=type;return this;},
    getContent(){return this.text;}
   })
  }
 };
 const context=vm.createContext(services);
 vm.runInContext(script,context,{filename:'Code.gs',timeout:2000});
 return {
  props,sheets,events,source:()=>JSON.parse(JSON.stringify(vm.runInContext('THAIPHC_SOURCE_SCHEMAS',context))),
  get:()=>JSON.parse(context.doGet().getContent()),
  post:body=>JSON.parse(context.doPost({postData:{contents:body}}).getContent())
 };
}
function allow(h,{write=false}={}){
 h.props.set('THAIPHC_RECEIVER_ENABLED','true');
 h.props.set('THAIPHC_HMAC_KEY_B64',secret);
 h.props.set('THAIPHC_SPREADSHEET_ID','FAKE_DESTINATION_ID_123456789012345678901');
 if(write)h.props.set('THAIPHC_WRITE_ENABLED','true');
}
test('T010 source schemas pinned to all and only 3 T003 draft reference datasets',()=>{
 const s=harness().source();
 assert.deepEqual(Object.keys(s),['subdistricts','villages','health-services']);
 for(const [api,d] of Object.entries(s)){
  assert.deepEqual(d.names,decodedSchema[api].names);
  assert.deepEqual(d.kinds,decodedSchema[api].kinds);
  assert.equal(d.tab,decodedSchema[api].tab);
  assert.equal(d.key,decodedSchema[api].key);
 }
});
test('T010 default fail closed for any HTTP POST, zero Sheet reads/writes',()=>{
 const h=harness();
 assert.equal(h.post(wire(batch())).status,'INGRESS_DISABLED');
 assert.equal(h.post('{bad json}').status,'INGRESS_DISABLED');
 assert.equal(h.events.open,0);
 assert.equal(h.sheets.size,1);
});
test('T010 doGet permanently disables diagnostics',()=>{
 assert.equal(harness().get().status,'METHOD_DISABLED');
});
test('T010 authenticated validate-only works without opening Spreadsheet',()=>{
 for(const api of ['subdistricts','villages','health-services']){
  const h=harness();allow(h);
  const res=h.post(wire(batch(api)));
  assert.equal(res.status,'VALIDATED');
  assert.equal(res.accepted,true);
  assert.equal(res.rowCount,1);
  assert.equal(res.endpoint,api);
  assert.equal(res.sheetsWrites,0);
  assert.equal(h.events.open,0);
 }
});
test('T010 fake signatures and wrong shared key cannot authenticate',()=>{
 const h=harness();allow(h);
 const request=JSON.parse(wire(batch()));
 request.signature='A'.repeat(43)+'=';
 assert.equal(h.post(JSON.stringify(request)).status,'AUTH_FAILED');
 h.props.set('THAIPHC_HMAC_KEY_B64',Buffer.alloc(32,3).toString('base64'));
 assert.equal(h.post(wire(batch())).status,'AUTH_FAILED');
 assert.equal(h.events.open,0);
});
test('T010 rejects old and future timestamps',()=>{
 const h=harness();allow(h);
 for(const offset of [-3600000,3600000]){
  assert.equal(h.post(wire(batch(),{timestamp:Date.now()+offset})).status,'INVALID_ENVELOPE');
 }
});
test('T010 replayed signed request rejected, even when validating only',()=>{
 const h=harness();allow(h);
 const request=wire(batch(),{nonce:'fixed_unique_nonce_123456'});
 assert.equal(h.post(request).status,'VALIDATED');
 assert.equal(h.post(request).status,'REPLAY_REJECTED');
 assert.equal(h.events.open,0);
});
test('T010 malformed envelope and oversized contents rejected safely',()=>{
 const h=harness();allow(h);
 for(const input of ['{}','invalid','x'.repeat(700001),JSON.stringify({timestamp:1})]){
  const out=h.post(input);
  assert.equal(out.accepted,false);
  assert.equal(h.events.open,0);
 }
});
test('T010 out of scope, forbidden person/village-gender endpoint and unexpected field fail',()=>{
 for(const change of [
  x=>{x.scope.districtCode='5407';},
  x=>{x.endpoint='assignments';},
  x=>{x.endpoint='volunteer-gender';},
  x=>{x.sourceFieldNames[0]='CitizenId';},
  x=>{x.rows[0].presence.citizenId='VALUE';},
  x=>{x.rows[0].key='OTHER';}
 ]){
  const h=harness();allow(h);
  const p=batch();change(p);
  assert.equal(h.post(wire(p)).status,'REJECTED');
  assert.equal(h.events.open,0);
 }
});
test('T010 refuses formula text and nested JSON wrong types',()=>{
 for(const [api,name,bad] of [
  ['villages','name_th','=NOW()'],
  ['villages','village_no','2'],
  ['health-services','service_areas','{}'],
  ['health-services','province','{"province_code":"55"}']
 ]){
  const h=harness();allow(h);const p=batch(api);
  p.rows[0].values[p.sourceFieldNames.indexOf(name)]=bad;
  assert.equal(h.post(wire(p)).status,'REJECTED');
  assert.equal(h.events.open,0);
 }
});
test('T010 no real Sheet write until separate THAIPHC_WRITE_ENABLED property',()=>{
 const h=harness();allow(h);
 const p=batch();p.mode='commit';
 assert.equal(h.post(wire(p)).status,'WRITE_DISABLED');
 assert.equal(h.events.open,0);
});
test('T010 signed commit to fake sheet creates only proposed tab and leaves ชีต1 intact',()=>{
 const h=harness();allow(h,{write:true});
 const p=batch('villages',[sample('villages',1),sample('villages',2)]);p.mode='commit';
 const reply=h.post(wire(p));
 assert.equal(reply.status,'COMMITTED');
 assert.equal(reply.inserted,2);assert.equal(reply.updated,0);
 assert.equal(h.sheets.size,2);
 assert.ok(h.sheets.has('ชีต1'));
 const tab=h.sheets.get('Villages');
 assert.equal(tab.data.length,3);
 assert.equal(tab.maxCols,28);
 assert.equal(tab.columnsAdded,2); // real Google Sheets starts at 26 columns
 assert.equal(h.sheets.get('ชีต1').columnsAdded,0);
 assert.equal(tab.data[1][0],'540601001');
 assert.equal(tab.data[2][0],'540601002');
 assert.equal(tab.data[1][p.sourceFieldNames.indexOf('name_en')],'');
 assert.equal(tab.data[1][p.sourceFieldNames.length+2],'540601001');
 assert.equal(h.events.open,1);
});
test('T010 retry with new nonce does not duplicate same keys; subset never deletes existing rows',()=>{
 const h=harness();allow(h,{write:true});
 const p=batch('subdistricts',[sample('subdistricts',1),sample('subdistricts',2)]);p.mode='commit';
 assert.equal(h.post(wire(p)).inserted,2);
 assert.equal(h.post(wire(p)).unchanged,2);
 const q=batch('subdistricts',[sample('subdistricts',1)]);q.mode='commit';
 const res=h.post(wire(q));
 assert.equal(res.status,'COMMITTED');
 assert.equal(res.inserted,0);
 assert.equal(h.sheets.get('Subdistricts').data.length,3);
});
test('T010 changed keyed row updates in place without rewriting unrelated rows',()=>{
 const h=harness();allow(h,{write:true});
 const p=batch('villages',[sample('villages',1),sample('villages',2)]);p.mode='commit';
 h.post(wire(p));
 const changed=sample('villages',1);changed.name_th='NEW_SYNTHETIC_VALUE';
 const q=batch('villages',[changed]);q.mode='commit';
 const response=h.post(wire(q));
 assert.equal(response.updated,1);assert.equal(response.inserted,0);
 const tab=h.sheets.get('Villages').data;
 assert.equal(tab.length,3);
 assert.equal(tab[1][q.sourceFieldNames.indexOf('name_th')],'NEW_SYNTHETIC_VALUE');
 assert.equal(tab[2][q.sourceFieldNames.indexOf('name_th')],'SYNTHETIC');
});
test('T010 bad existing headers block write instead of editing existing tab',()=>{
 const h=harness();allow(h,{write:true});
 const bad=makeSheet('Villages',['UNRELATED_DATA']);h.sheets.set('Villages',bad);
 const p=batch();p.mode='commit';
 assert.equal(h.post(wire(p)).status,'REJECTED');
 assert.deepEqual(bad.data,[['UNRELATED_DATA']]);
 assert.equal(h.sheets.get('ชีต1').data.length,0);
});
test('T010 all three synthetic source projections can be committed to mock sheets',()=>{
 const h=harness();allow(h,{write:true});
 for(const api of ['subdistricts','villages','health-services']){
  const p=batch(api);p.mode='commit';
  const res=h.post(wire(p));
  assert.equal(res.status,'COMMITTED');
  assert.equal(res.inserted,1);
  assert.equal(res.sheetsWrites,1);
 }
 assert.deepEqual(Array.from(h.sheets.keys()),['ชีต1','Subdistricts','Villages','HealthServices']);
 assert.equal(h.sheets.get('Subdistricts').columnsAdded,0);
 assert.equal(h.sheets.get('Villages').columnsAdded,2);
 assert.equal(h.sheets.get('HealthServices').columnsAdded,0);
});
test('T010 never hardcodes user spreadsheet/script/deployment IDs or logs source data',()=>{
 assert.doesNotMatch(script,/131WvR9DXpBFlh4snqGQG3VVV5ljkqcysRK_s0-HaKwQDnzpZs2UfCkE6|AKfycbwVnsHsWXRP|14yQGRu3EOFVae_IgDR4A3uEGqaza6a2bAhX-DYx68lA/);
 assert.doesNotMatch(script,/\b(?:Logger|console)\s*\./);
 assert.doesNotMatch(script,/\bUrlFetchApp\s*\./);
});
