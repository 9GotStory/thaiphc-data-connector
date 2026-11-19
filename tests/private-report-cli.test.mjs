import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EventEmitter} from 'node:events';
import {createHmac} from 'node:crypto';
import {main} from '../src/cli/index.mjs';
const manifest=JSON.parse(readFileSync(new URL('../docs/sheets-schema.json',import.meta.url),'utf8'));
const key=Buffer.alloc(32,33).toString('base64');
const token='FAKE_REPORT_SOURCE_BEARER_1234567890123';
const phrasePrepare='PREPARE PRIVATE REPORT assignments 5406';
const phraseCommit='TRANSFER EXTENDED assignments 1 ROWS 5406';
const body=x=>new Response(JSON.stringify(x),{status:200,headers:{'content-type':'application/json'}});
class MockTTY extends EventEmitter {
 constructor(){super();this.isTTY=true;this.isRaw=false;}
 setRawMode(x){this.isRaw=x;}
 isPaused(){return false;}
 pause(){}resume(){}
}
function record(){
 const d=manifest.datasets.find(x=>x.api==='assignments'),out={};
 for(const field of d.fields){
  out[field.source_field]=field.observed_kind==='null_only'?null:
   field.observed_kind==='boolean'?true:
   ['integer','integer_or_null'].includes(field.observed_kind)?1:'SYNTHETIC';
 }
 out.id='TEST_PRIVATE_ID_0001';
 out.citizenId='SENSITIVE_ID_NOT_FOR_SHEETS';
 out.firstName='PRIVATE_NAME_NOT_FOR_SHEETS';
 out.districtCode='5406';out.provinceCode='54';out.subdistrictCode='540601';
 out.villageNo='1';return out;
}
test('F010 complete private-report-commit CLI fake GET->HMAC staged POST->readback pending, no personal output',async()=>{
 const input=new MockTTY(),outputs=[],sent=[];
 const output={isTTY:true,write(text){
  if(text.includes('PREPARE PRIVATE REPORT'))
   queueMicrotask(()=>input.emit('data',Buffer.from(phrasePrepare+'\r')));
  if(text.includes('Paste authorized Bearer'))
   queueMicrotask(()=>input.emit('data',Buffer.from(token+'\r')));
  if(text.includes('TRANSFER EXTENDED'))
   queueMicrotask(()=>input.emit('data',Buffer.from(phraseCommit+'\r')));
  return true;
 }};
 const fakeFetch=async(url,options)=>{
  if(options.method==='GET'&&new URL(url).origin==='https://api-thaiphc.hss.moph.go.th'){
   assert.equal(options.headers.Authorization,'Bearer '+token);
   assert.equal(new URL(url).searchParams.get('districtCode'),'5406');
   return body({items:[record()],provinces:[],
    pagination:{page:1,limit:10,total:1,pages:1}});
  }
  assert.equal(options.method,'POST');
  const wire=JSON.parse(options.body);
  assert.deepEqual(Object.keys(wire).sort(),['version','timestamp','nonce','payloadB64','signature'].sort());
  const signed=createHmac('sha256',Buffer.from(key,'base64'))
   .update('THAIPHC_SYNC_V1\n'+wire.timestamp+'\n'+wire.nonce+'\n'+wire.payloadB64).digest('base64');
  assert.equal(signed,wire.signature);
  const msg=JSON.parse(Buffer.from(wire.payloadB64,'base64'));
  assert.equal(msg.endpoint,'assignments');
  assert.equal(msg.scope.districtCode,'5406');
  const serialized=JSON.stringify(msg);
  assert.doesNotMatch(serialized,/SENSITIVE_ID_NOT_FOR_SHEETS|PRIVATE_NAME_NOT_FOR_SHEETS|TEST_PRIVATE_ID_0001/);
  sent.push(msg.mode);
  return body({
   protocol:'THAIPHC_SYNC_V1',
   status:msg.mode==='report-start'?'REPORT_STARTED':
    msg.mode==='report-chunk'?'REPORT_CHUNK_STAGED':'REPORT_FINALIZED',
   accepted:true,endpoint:'assignments',runId:msg.runId,
   sheetsWrites:msg.mode==='report-start'?2:msg.mode==='report-finalize'?3:1,
   ...(msg.mode==='report-chunk'?{ordinal:msg.ordinal}:{}),
   rowCount:msg.mode==='report-start'?0:msg.mode==='report-chunk'?msg.rowCount:1
  });
 };
 const tty={input,output,readStoredHmac:()=>key,fetchImpl:fakeFetch};
 const code=await main(['private-report-commit','--endpoint','assignments',
  '--acknowledge-private-transfer'],t=>outputs.push(t),tty);
 assert.equal(code,2);
 assert.deepEqual(sent,['report-start','report-chunk','report-finalize']);
 assert.equal(outputs.length,1);
 const result=JSON.parse(outputs[0]);
 assert.equal(result.status,'REPORT_FINALIZED_READBACK_REQUIRED');
 assert.equal(result.rowCount,1);
 assert.equal(result.appsScriptPosts,3);
 assert.equal(result.sourceNetworkRequests,1);
 assert.equal(result.destinationReadbackVerified,false);
 assert.equal(result.accepted,false);
 assert.equal(input.isRaw,false);
 assert.doesNotMatch(JSON.stringify(result),/PRIVATE_NAME|SENSITIVE_ID|Bearer|payloadB64|signature/);
});
test('F010 private commit refuses unknown input/endpoint before source request and without token prompt',async()=>{
 let calls=0;
 const tty={fetchImpl:async()=>{calls++;throw Error('NO_REQUEST')}};
 for(const argv of [
  ['private-report-commit','--endpoint','assignments'],
  ['private-report-commit','--endpoint','villages','--acknowledge-private-transfer'],
  ['private-report-commit','--endpoint','assignments','--acknowledge-private-transfer','--output','rows.json'],
  ['private-report-commit','--endpoint','volunteer-family','--acknowledge-private-transfer','--token','secret']
 ]){
  const outputs=[];
  assert.equal(await main(argv,t=>outputs.push(t),tty),2);
  assert.equal(calls,0);
  assert.match(outputs.join(''),/CLI_REJECTED/);
 }
});
