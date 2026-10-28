// F010: strictly ordered, one-attempt-per-stage extended report transport.
// Real POSTs only after a separately operator-approved final UAT window.
// No automatic retry or rollback, even after a timeout/unknown receipt.
import {createHmac,randomBytes,createHash} from 'node:crypto';
import targets from '../../config/thaiphc-targets.json' with {type:'json'};

const VERSION='THAIPHC_SYNC_V1',CHUNK_VERSION='THAIPHC_REPORT_STAGE_V1';
const ENDPOINTS=new Set(['volunteer-gender','assignments','volunteer-family','resigned-volunteers','volunteer-tenure']);
const POST_TIMEOUT=30000,MAX_RESPONSE=8192;
const TARGET='https://script.google.com/macros/s/'+targets.deploymentId+'/exec';
const sha=x=>createHash('sha256').update(x,'utf8').digest('hex');
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const error=()=>{throw Error('EXTENDED_TRANSFER_INPUT_REJECTED')};
const short=(endpoint,status,posts=0,requests=0,additional={})=>Object.freeze({
 mode:'MANUAL_EXTENDED_REPORT_STAGE',endpoint,status,accepted:false,
 appsScriptPosts:posts,networkRequests:requests,
 destinationReadbackVerified:false,...additional
});
function ensurePlan(plan){
 if(!plain(plan)||plan.mode!=='OFFLINE_REPORT_CHUNK_PLAN_NOT_SENT'||
    !ENDPOINTS.has(plan.endpoint)||plan.transferApproved!==false||
    plan.writeAuthorized!==false||plan.appsScriptPosts!==0||
    plan.sheetsWrites!==0||!Array.isArray(plan.chunks)||
    plan.chunkCount!==plan.chunks.length||plan.chunkCount<1||
    plan.chunkCount>100||!Number.isSafeInteger(plan.sourceRows)||
    plan.sourceRows<1||plan.sourceRows>2500||
    !plain(plan.runFingerprint)||!Array.isArray(plan.destinationFields)||
    !/^[a-f0-9]{64}$/.test(plan.manifestDigest)||!/^[-_A-Za-z0-9]{8,64}$/.test(plan.runId))
  error();
 const finger=plan.runFingerprint;
 if(finger.version!==CHUNK_VERSION||finger.endpoint!==plan.endpoint||
    finger.runId!==plan.runId||finger.sourceRows!==plan.sourceRows||
    finger.chunkCount!==plan.chunkCount||
    JSON.stringify(finger.destinationFields)!==JSON.stringify(plan.destinationFields)||
    JSON.stringify(finger.chunkDigests)!==JSON.stringify(plan.chunks.map(c=>c.digest))||
    sha(JSON.stringify({version:finger.version,endpoint:finger.endpoint,runId:finger.runId,
      sourceIdentityStrategy:finger.sourceIdentityStrategy,sourceRows:finger.sourceRows,
      chunkCount:finger.chunkCount,destinationFields:finger.destinationFields,
      chunkDigests:finger.chunkDigests}))!==plan.manifestDigest)
   error();
 for(const [index,c] of plan.chunks.entries()){
  if(!plain(c)||c.ordinal!==index+1||c.rowOffset!==index*25||
     c.rowCount!==Math.min(25,plan.sourceRows-c.rowOffset)||
     !Array.isArray(c.rows)||c.rows.length!==c.rowCount||
     sha(JSON.stringify(c.rows))!==c.digest)error();
 }
 if(!/^AKfycb[A-Za-z0-9_-]{40,120}$/.test(targets.deploymentId)||
    new URL(TARGET).origin!=='https://script.google.com')error();
}
function sign(payload,keyB64,now=Date.now()){
 if(typeof keyB64!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(keyB64))error();
 const key=Buffer.from(keyB64,'base64');
 if(key.length!==32||key.toString('base64')!==keyB64)error();
 const timestamp=now,nonce=randomBytes(18).toString('base64url');
 const payloadB64=Buffer.from(JSON.stringify(payload),'utf8').toString('base64');
 if(payloadB64.length>550000)error();
 const signature=createHmac('sha256',key)
  .update(VERSION+'\n'+timestamp+'\n'+nonce+'\n'+payloadB64,'utf8').digest('base64');
 const wire={version:VERSION,timestamp,nonce,payloadB64,signature};
 if(JSON.stringify(wire).length>700000)error();
 return wire;
}
/** In-memory signable source for one stage. No HTTP and no authority granted. */
export function buildExtendedReportWire(plan,stage,keyB64){
 ensurePlan(plan);
 const base={schemaVersion:'0.2.0',mode:stage==='start'?'report-start':
  stage==='finalize'?'report-finalize':'report-chunk',
  endpoint:plan.endpoint,scope:{provinceCode:'54',districtCode:'5406'},
  runId:plan.runId};
 let payload;
 if(stage==='start'){
  payload={...base,sourceIdentityStrategy:plan.runFingerprint.sourceIdentityStrategy,
   sourceRows:plan.sourceRows,chunkCount:plan.chunkCount,
   destinationFields:plan.destinationFields,
   chunkDigests:plan.runFingerprint.chunkDigests,
   manifestDigest:plan.manifestDigest};
 }else if(stage==='finalize')
  payload={...base,manifestDigest:plan.manifestDigest};
 else if(Number.isSafeInteger(stage)&&stage>=1&&stage<=plan.chunkCount){
  const c=plan.chunks[stage-1];
  payload={...base,manifestDigest:plan.manifestDigest,
   ordinal:c.ordinal,rowOffset:c.rowOffset,rowCount:c.rowCount,
   digest:c.digest,rows:c.rows};
 }else error();
 return sign(payload,keyB64);
}
function safeRedirect(uri){
 if(typeof uri!=='string'||uri.length>4096)return false;
 try{
  const url=new URL(uri);
  return url.protocol==='https:'&&url.hostname==='script.googleusercontent.com'&&
   url.username===''&&url.password===''&&url.hash===''&&url.pathname==='/macros/echo';
 }catch{return false;}
}
async function responseBody(res){
 const h=res?.headers?.get?.('content-type')??'';
 if(!/^application\/json(?:\s*;|$)/i.test(h))error();
 const len=res.headers.get('content-length');
 if(len!==null&&(!/^\d+$/.test(len)||Number(len)>MAX_RESPONSE))error();
 if(!res.body||typeof res.body.getReader!=='function')error();
 const rd=res.body.getReader();let size=0;const parts=[];
 try{
  for(;;){
   const {done,value}=await rd.read();
   if(done)break;
   if(!(value instanceof Uint8Array))error();
   size+=value.byteLength;if(size>MAX_RESPONSE)error();
   parts.push(value);
  }
  const combined=Buffer.concat(parts.map(x=>Buffer.from(x)));
  return JSON.parse(combined.toString('utf8'));
 }finally{try{rd.releaseLock()}catch{}}
}
async function onePost(wire,expected,plan,fetchImpl,stage){
 let requests=0;
 const signal=new AbortController();
 const timeout=setTimeout(()=>signal.abort(),POST_TIMEOUT);timeout.unref?.();
 try{
  requests++;
  let res=await fetchImpl(TARGET,{method:'POST',redirect:'manual',
   credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',
   headers:{Accept:'application/json','Content-Type':'application/json'},
   signal:signal.signal,body:JSON.stringify(wire)});
  if(res?.status===302||res?.status===303){
   const location=res.headers?.get?.('location');
   if(!safeRedirect(location))return {ok:false,requests};
   try{await res.body?.cancel?.()}catch{}
   requests++;
   res=await fetchImpl(location,{method:'GET',redirect:'error',credentials:'omit',
    cache:'no-store',referrerPolicy:'no-referrer',headers:{Accept:'application/json'},
    signal:signal.signal});
  }
  if(res?.status!==200)return {ok:false,requests};
  const result=await responseBody(res);
  if(!plain(result)||result.protocol!==VERSION||result.status!==expected||
     result.accepted!==true||result.endpoint!==plan.endpoint||
     result.runId!==plan.runId||!Number.isSafeInteger(result.sheetsWrites)||
     result.sheetsWrites<1||result.sheetsWrites>3)
   return {ok:false,requests};
  if(expected==='REPORT_CHUNK_STAGED'){
   if(result.ordinal!==stage)return {ok:false,requests};
  }
  if(expected==='REPORT_FINALIZED'&&result.rowCount!==plan.sourceRows)
   return {ok:false,requests};
  return {ok:true,requests};
 }catch{return {ok:false,requests};}
 finally{clearTimeout(timeout)}
}
export const extendedCommitPhrase=p=>
 'TRANSFER EXTENDED '+p.endpoint+' '+p.sourceRows+' ROWS 5406';
/**
 * Multi-request stage, one shot each; no retry, no readback claims.
 * Must be called after fresh, explicit operator final-UAT write authorization
 * and private target Sheet/permissions preflight. Raw envelopes never logged.
 */
export async function sendExtendedReport({
 plan,keyB64,acknowledgement,fetchImpl=globalThis.fetch
}={}){
 let endpoint=plan?.endpoint??null,posts=0,requests=0;
 try{
  ensurePlan(plan);
  if(acknowledgement!==extendedCommitPhrase(plan))
   return short(endpoint,'CONFIRMATION_REQUIRED');
  if(typeof fetchImpl!=='function')return short(endpoint,'TRANSPORT_UNAVAILABLE');
  const work=['start',...Array.from({length:plan.chunkCount},(_,i)=>i+1),'finalize'];
  for(const stage of work){
   const wire=buildExtendedReportWire(plan,stage,keyB64);
   const expected=stage==='start'?'REPORT_STARTED':
    stage==='finalize'?'REPORT_FINALIZED':'REPORT_CHUNK_STAGED';
   posts++;
   const result=await onePost(wire,expected,plan,fetchImpl,stage);
   requests+=result.requests;
   if(!result.ok)return short(endpoint,'STAGE_OUTCOME_UNKNOWN_STOP',posts,requests,{
    stage:stage==='finalize'?'finalize':stage==='start'?'start':'chunk',
    ...(typeof stage==='number'?{ordinal:stage}:{}),
    recoveryStrategy:'READBACK_AND_RECONCILE_NO_AUTOMATIC_RETRY'
   });
  }
  return short(endpoint,'REPORT_FINALIZED_READBACK_REQUIRED',posts,requests,{
   rowCount:plan.sourceRows,chunkCount:plan.chunkCount,
   manifestDigest:plan.manifestDigest,
   recoveryStrategy:'INDEPENDENT_PRIVATE_SHEET_READBACK_REQUIRED'
  });
 }catch{
  return short(endpoint,'TRANSFER_INPUT_REJECTED',posts,requests);
 }
}
