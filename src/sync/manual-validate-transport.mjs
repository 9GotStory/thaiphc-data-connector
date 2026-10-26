// T009D — actual, opt-in HTTPS transport for T017 validate-only reference batches.
// NEVER called by tests with real network; cannot write Sheets or send mode=commit.
// No arbitrary destination URL, redirects with body, retries, bearer tokens or output logs.
import targets from '../../config/thaiphc-targets.json' with {type:'json'};
import {
 inspectPreparedForValidate,isSafeGoogleContentRedirect,simulateValidateHttp
} from './synthetic-http-validate.mjs';

export const SYNTHETIC_VALIDATE_CONFIRM='POST SYNTHETIC VALIDATE 5406';
const WEB_APP_URL='https://script.google.com/macros/s/'+targets.deploymentId+'/exec';
const REPLY_LIMIT=16*1024, TIMEOUT_MS=10000;
const isPlain=o=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&
 (Object.getPrototypeOf(o)===Object.prototype||Object.getPrototypeOf(o)===null);
const reply=(status,endpoint=null,requests=0,posts=0,httpStatus=null,rowCount=0)=>
 Object.freeze({
  mode:'MANUAL_VALIDATE_ONLY',status,accepted:status==='VALIDATED',
  endpoint,rowCount,networkRequests:requests,appsScriptPosts:posts,
  sheetsWrites:0,httpStatus
 });
const safeHeaders=res=>{
 if(!res||!Number.isSafeInteger(res.status)||typeof res.headers?.get!=='function')
  throw Error('INVALID_HTTP_RESPONSE');
 const h={};
 for(const key of ['location','content-type','content-length']){
  const v=res.headers.get(key);
  if(v!==null)h[key]=v;
 }
 return h;
};
async function responseBody(res){
 const length=res.headers.get('content-length');
 if(length!==null&&(!/^(0|[1-9]\d*)$/.test(length)||Number(length)>REPLY_LIMIT))
  throw Error('RESPONSE_TOO_LARGE');
 if(!res.body||typeof res.body.getReader!=='function')throw Error('INVALID_HTTP_BODY');
 const reader=res.body.getReader();
 const chunks=[];let bytes=0;
 try{
  while(true){
   const {done,value}=await reader.read();
   if(done)break;
   if(!(value instanceof Uint8Array))throw Error('INVALID_HTTP_CHUNK');
   bytes+=value.byteLength;
   if(bytes>REPLY_LIMIT)throw Error('RESPONSE_TOO_LARGE');
   chunks.push(value);
  }
  const collected=new Uint8Array(bytes);let offset=0;
  for(const chunk of chunks){collected.set(chunk,offset);offset+=chunk.byteLength;}
  try{return new TextDecoder('utf-8',{fatal:true}).decode(collected);}
  finally{collected.fill(0);}
 }finally{
  try{await reader.cancel();}catch{/* consumed or aborted */}
  try{reader.releaseLock();}catch{/* already released */}
 }
}
function pinnedTarget(){
 if(!/^AKfycb[A-Za-z0-9_-]{40,120}$/.test(targets.deploymentId))
  throw Error('INVALID_DEPLOYMENT_TARGET');
 const u=new URL(WEB_APP_URL);
 if(u.origin!=='https://script.google.com'||
    u.pathname!=='/macros/s/'+targets.deploymentId+'/exec'||
    u.search!==''||u.hash!=='')throw Error('INVALID_DEPLOYMENT_TARGET');
 return WEB_APP_URL;
}
const methodOptions=(signal,method,body)=>({
 method,redirect:method==='POST'?'manual':'error',
 credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',signal,
 headers:method==='POST'?{
  Accept:'application/json','Content-Type':'application/json'
 }:{Accept:'application/json'},
 ...(method==='POST'?{body}:{}),
});
/**
 * Real network capability, explicitly dormant until operator invokes it.
 * "prepared" MUST be generated from synthetic rows by an authorized caller;
 * future real row transfers need an additional explicit approval/gate.
 * Returns REDACTED metadata only; no payload, Google redirect token or exception.
 */
export async function sendSyntheticValidate({prepared,acknowledgement,fetchImpl=globalThis.fetch}={}){
 let endpoint=null;
 try{
  ({endpoint}=inspectPreparedForValidate(prepared));
  if(acknowledgement!==SYNTHETIC_VALIDATE_CONFIRM)
   return reply('MANUAL_CONFIRMATION_REQUIRED',endpoint);
  if(typeof fetchImpl!=='function')return reply('TRANSPORT_UNAVAILABLE',endpoint);
  const target=pinnedTarget();
  // Timestamp freshness was verified by shared preflight. No POST retries.
  const body=JSON.stringify(prepared.envelope);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),TIMEOUT_MS);
  timer.unref?.();
  let requests=0,posts=0,httpStatus=null;
  try{
   requests++;posts++;
   const first=await fetchImpl(target,methodOptions(controller.signal,'POST',body));
   httpStatus=first?.status??null;
   const firstHeaders=safeHeaders(first);
   let steps=[];
   if(first.status===302||first.status===303){
    // Validate BEFORE issuing the only follow-up request. The location is
    // never printed or returned and is not trusted merely because it is HTTPS.
    if(!isSafeGoogleContentRedirect(firstHeaders.location))
     return reply('REDIRECT_REJECTED',endpoint,requests,posts,httpStatus);
    steps=[{status:first.status,headers:firstHeaders,body:''}];
    try{await first.body?.cancel?.();}catch{/* ignore redirect HTML */}
    requests++;
    const second=await fetchImpl(firstHeaders.location,
     methodOptions(controller.signal,'GET'));
    httpStatus=second?.status??null;
    const secondHeaders=safeHeaders(second);
    if(second.status!==200){
     return reply('HTTP_REJECTED',endpoint,requests,posts,httpStatus);
    }
    steps.push({status:second.status,headers:secondHeaders,
     body:await responseBody(second)});
   }else{
    if(first.status!==200)
     return reply([301,307,308].includes(first.status)?
      'REDIRECT_REJECTED':'HTTP_REJECTED',endpoint,requests,posts,httpStatus);
    steps=[{status:first.status,headers:firstHeaders,body:await responseBody(first)}];
   }
   // Reuse existing, tested strict response parser; it never emits the source
   // rows, signed envelope, Google Location query or server response text.
   const checked=simulateValidateHttp({prepared,exchanges:steps});
   return reply(checked.status,endpoint,requests,posts,httpStatus,checked.rowCount);
  }catch{
   return reply(controller.signal.aborted?'REQUEST_TIMED_OUT':'REQUEST_FAILED',
    endpoint,requests,posts,httpStatus);
  }finally{clearTimeout(timer);}
 }catch{
  return reply('INPUT_REJECTED',endpoint);
 }
}
