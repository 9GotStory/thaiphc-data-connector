import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {readFile} from 'node:fs/promises';
import {buildRequest} from '../src/cli/endpoints.mjs';
import {createMockTransport,syntheticTransport} from '../src/cli/transport.mjs';
import {isMockOnlyToken,readMockOnlyTokenFromTTY,simulateMockBearerSession} from '../src/cli/manual-bearer.mjs';
import {main} from '../src/cli/index.mjs';

const FAKE='MOCK_ONLY_12345678';
class FakeTTY extends EventEmitter {
  constructor(){super();this.isTTY=true;this.isRaw=false;this.rawChanges=[];this.paused=false;}
  setRawMode(v){this.isRaw=v;this.rawChanges.push(v);}
  resume(){this.paused=false;}
  pause(){this.paused=true;}
  isPaused(){return this.paused;}
}
function fakeTerminal(){
 const input=new FakeTTY();
 const messages=[];
 const output={isTTY:true,write(s){messages.push(s);return true;}};
 return {input,output,messages};
}

test('synthetic token policy rejects real-looking token and header injection',()=>{
 assert.equal(isMockOnlyToken(FAKE),true);
 for(const token of ['','Bearer '+FAKE,'eyJhbGciOiJIUzI1NiJ9.eyJhIjoxfQ.x','token-value',
   FAKE+'\r\nInjected: true','MOCK_ONLY_abc','MOCK_ONLY_'+'x'.repeat(65),42]){
   assert.equal(isMockOnlyToken(token),false);
 }
});
test('read requires interactive stdin AND stderr, never piping/redirected fallback',async()=>{
 const io=fakeTerminal();
 await assert.rejects(()=>readMockOnlyTokenFromTTY({input:{isTTY:false},output:io.output}),/SECURE_TTY_REQUIRED/);
 await assert.rejects(()=>readMockOnlyTokenFromTTY({input:io.input,output:{isTTY:false}}),/SECURE_TTY_REQUIRED/);
 assert.deepEqual(io.input.rawChanges,[]);
});
test('non-echoing raw TTY accepts only fake token and restores state',async()=>{
 const io=fakeTerminal();
 const awaiting=readMockOnlyTokenFromTTY(io);
 assert.equal(io.input.isRaw,true);
 const b=Buffer.from(FAKE+'\r');
 io.input.emit('data',b);
 const value=await awaiting;
 assert.equal(value,FAKE);
 assert.ok(b.every(v=>v===0),'incoming buffer was zeroed');
 assert.deepEqual(io.input.rawChanges,[true,false]);
 assert.equal(io.input.isRaw,false);
 assert.ok(io.messages.join('').includes('Synthetic token only'));
 assert.equal(io.messages.join('').includes(FAKE),false);
});
test('raw TTY correctly handles hidden backspace',async()=>{
 const io=fakeTerminal();
 const pending=readMockOnlyTokenFromTTY(io);
 io.input.emit('data',Buffer.from('MOCK_ONLY_1234567X\x7f8\n'));
 assert.equal(await pending,FAKE);
 assert.equal(io.messages.join('').includes(FAKE),false);
});
test('cancelled/oversized/real-like token fails with constant error and restores TTY',async()=>{
 for(const seq of ['\x03','x'.repeat(120),'eyJhbGciOiJIUzI1NiJ9.fake.fake\r','\r']){
  const io=fakeTerminal();
  const pending=readMockOnlyTokenFromTTY(io);
  io.input.emit('data',Buffer.from(seq));
  await assert.rejects(pending,/TTY_CANCELLED|MOCK_TOKEN_INPUT_TOO_LONG|MOCK_ONLY_TOKEN_REQUIRED/);
  assert.equal(io.input.isRaw,false);
  assert.equal(io.messages.join('').includes(seq),false);
 }
});
test('existing TTY raw state is restored, not hard-coded false',async()=>{
 const io=fakeTerminal();
 io.input.isRaw=true;
 const pending=readMockOnlyTokenFromTTY(io);
 io.input.emit('end');
 await assert.rejects(pending,/TTY_INPUT_ENDED/);
 assert.deepEqual(io.input.rawChanges,[true,true]);
});
test('fake token header transmitted only to allowlisted mock and not returned',async()=>{
 const synthetic=syntheticTransport('subdistricts');
 let checks=0;
 const mock=createMockTransport(async(request)=>{
  checks++;
  assert.equal(request.method,'GET');
  assert.equal(request.redirect,'error');
  assert.equal(request.endpoint,'subdistricts');
  assert.equal(request.path,'/api/v1/lookups/subdistricts');
  assert.equal(request.query,buildRequest('subdistricts').query);
  assert.deepEqual(Object.keys(request.headers),['Authorization']);
  assert.equal(request.headers.Authorization,'Bearer '+FAKE);
  return synthetic({endpoint:request.endpoint,path:request.path,query:request.query});
 });
 const r=await simulateMockBearerSession({getToken:async()=>FAKE,mockResponder:mock});
 assert.equal(checks,1);
 assert.deepEqual([r.status,r.pages,r.records],['COMPLETE',1,1]);
 assert.equal(r.mode,'SYNTHETIC_BEARER_MOCK_ONLY');
 assert.ok(!JSON.stringify(r).includes(FAKE));
 assert.equal(Object.hasOwn(r,'items'),false);
});
test('default mock responds offline and does not use global fetch',async()=>{
 const prev=globalThis.fetch;
 try{
  globalThis.fetch=()=>{throw Error('NETWORK_ATTEMPT_FORBIDDEN');};
  const r=await simulateMockBearerSession({getToken:async()=>FAKE});
  assert.equal(r.status,'COMPLETE');
  assert.equal(r.mode,'SYNTHETIC_BEARER_MOCK_ONLY');
 }finally{globalThis.fetch=prev;}
});
test('both real-credential-looking text and person endpoints are denied before mock call',async()=>{
 let invoked=false;
 const responder=createMockTransport(async()=>{invoked=true;throw Error('should never happen');});
 for(const endpoint of ['assignments','villages','health-services','volunteer-gender','volunteer-family','resigned-volunteers','volunteer-tenure']){
  let prompted=false;
  await assert.rejects(()=>simulateMockBearerSession({endpoint,getToken:async()=>{prompted=true;return FAKE;},mockResponder:responder}),/MOCK_ENDPOINT_DENIED/);
  assert.equal(prompted,false);
 }
 await assert.rejects(()=>simulateMockBearerSession({getToken:async()=> 'eyJfake.jwt.real',mockResponder:responder}),/REAL_BEARER_TOKEN_FORBIDDEN/);
 assert.equal(invoked,false);
});
test('unbranded transport cannot receive Authorization even in simulation',async()=>{
 await assert.rejects(()=>simulateMockBearerSession({getToken:async()=>FAKE,mockResponder:async()=>({status:200,body:{items:[]}})}),/BRANDED_MOCK_REQUIRED/);
});
test('mock errors/body never expose fake token or foreign names',async()=>{
 const responder=createMockTransport(async()=>{throw Error('Bearer '+FAKE+' SECRET_CITIZEN_NAME');});
 const result=await simulateMockBearerSession({getToken:async()=>FAKE,mockResponder:responder});
 assert.equal(result.status,'PARTIAL');
 assert.equal(result.issueCounts.MOCK_TRANSPORT_ERROR,1);
 assert.doesNotMatch(JSON.stringify(result),/MOCK_ONLY_|SECRET_CITIZEN_NAME/);
});
test('mock HTTP 403 is blocked without disclosing body',async()=>{
 const responder=createMockTransport(async()=>({status:403,body:{token:FAKE,name:'SECRET_NAME'}}));
 const result=await simulateMockBearerSession({getToken:async()=>FAKE,mockResponder:responder});
 assert.equal(result.status,'BLOCKED');
 assert.equal(result.issueCounts.AUTHORIZATION_REJECTED,1);
 assert.doesNotMatch(JSON.stringify(result),/MOCK_ONLY_|SECRET_NAME/);
});
test('auth-mock CLI prompts for fake token only and produces aggregate JSON',async()=>{
 const io=fakeTerminal(),out=[];
 const promise=main(['auth-mock','--endpoint','subdistricts'],s=>out.push(s),io);
 io.input.emit('data',Buffer.from(FAKE+'\r'));
 const exit=await promise;
 assert.equal(exit,0);
 const report=JSON.parse(out.join(''));
 assert.equal(report.mode,'SYNTHETIC_BEARER_MOCK_ONLY');
 assert.equal(report.status,'COMPLETE');
 assert.ok(!out.join('').includes(FAKE));
 assert.equal(io.input.isRaw,false);
});
test('auth-mock non-TTY and denied arguments are always generic failures',async()=>{
 const output=[];
 assert.equal(await main(['auth-mock'],v=>output.push(v),{input:{isTTY:false},output:{isTTY:false}}),2);
 for(const args of [
  ['auth-mock','--endpoint','villages'],
  ['auth-mock','--live'],['auth-mock','--token','REAL_SENSITIVE_VALUE'],
  ['auth-mock','--output','credentials.txt'],
  ['auth-mock','--max-pages','2']
 ]){
  const lines=[];
  const code=await main(args,v=>lines.push(v));
  assert.equal(code,2);
  assert.doesNotMatch(lines.join(''),/REAL_SENSITIVE_VALUE|credentials.txt|Bearer\s+/);
 }
 assert.ok(output.every(v=>!v.includes('token=')));
});
test('no new real HTTP client, clipboard, credentials persistence or Sheets writes',async()=>{
 const code=await readFile(new URL('../src/cli/manual-bearer.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(code,/\bhttps?:\/\/api-thaiphc\b/);
 assert.doesNotMatch(code,/\b(fetch|https\.request|http\.request|axios|SpreadsheetApp|writeFileSync|execSync|clipboard)\s*\(/);
 assert.ok(code.includes('isMockTransport(mockResponder)'));
});
