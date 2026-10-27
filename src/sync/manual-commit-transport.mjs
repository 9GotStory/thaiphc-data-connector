// T009D: DORMANT manual real-reference COMMIT transport.
// No network except one separately approved invocation; never retry unknown writes.
// COMMITTED is only a receipt. A manually confirmed inventory and later
// independent destination readback are mandatory; a re-sync is NEVER automatic.
import targets from '../../config/thaiphc-targets.json' with {type:'json'};
import manifest from '../../docs/sheets-schema.json' with {type:'json'};
import {projectReferenceRows} from './reference-projection.mjs';
import {isSafeGoogleContentRedirect} from './synthetic-http-validate.mjs';

const VERSION='THAIPHC_SYNC_V1';
const WEB_APP_URL='https://script.google.com/macros/s/'+targets.deploymentId+'/exec';
const COUNTS=Object.freeze({subdistricts:8,villages:85,'health-services':18});
const KEY_RE=/^[A-Za-z0-9_-]{25,120}$/;
const REPLY_MAX=16384,POST_TIMEOUT=10000;
const WIRE_KEYS=['version','timestamp','nonce','payloadB64','signature'];
const PAYLOAD_KEYS=['schemaVersion','mode','endpoint','scope','runId','fetchedAtUtc','sourceFieldNames','rows'];
const SUCCESS_KEYS=['protocol','status','accepted','sheetsWrites','endpoint','rowCount','inserted','updated','unchanged'];
const ERROR_KEYS=['protocol','status','accepted','sheetsWrites'];
const DENIED=new Set(['INGRESS_DISABLED','INVALID_ENVELOPE','NOT_CONFIGURED',
  'AUTH_FAILED','WRITE_DISABLED','LOCK_BUSY','REPLAY_REJECTED','METHOD_DISABLED']);
const plain=o=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&
 (Object.getPrototypeOf(o)===Object.prototype||Object.getPrototypeOf(o)===null);
const exact=(o,keys)=>plain(o)&&Object.keys(o).length===keys.length&&
 keys.every(k=>Object.hasOwn(o,k));
function fail(){throw Error('COMMIT_INPUT_REJECTED');}
export const commitPhrase=endpoint=>
 'COMMIT '+endpoint+' '+COUNTS[endpoint]+' ROWS 5406';
function safeSummary(endpoint,status,requests=0,posts=0,httpStatus=null,other={}){
 return Object.freeze({
  mode:'MANUAL_REFERENCE_COMMIT',
  endpoint,status,accepted:false,
  networkRequests:requests,appsScriptPosts:posts,httpStatus,
  writeOutcome:posts?'STOP_VERIFY_DESTINATION':'NOT_ATTEMPTED',
  destinationReadbackVerified:false,
  recoveryStrategy:'MANUAL_RE_SYNC_AFTER_READBACK',
  ...other
 });
}
function preflight(prepared,snapshot){
 if(!exact(prepared,['status','transferApproved','endpoint','rowCount',
    'networkRequests','appsScriptPosts','sheetsWrites','envelope'])||
    prepared.status!=='OFFLINE_COMMIT_PREPARED_NOT_SENT'||
    prepared.transferApproved!==false||
    !Object.hasOwn(COUNTS,prepared.endpoint)||
    prepared.rowCount!==COUNTS[prepared.endpoint]||
    prepared.networkRequests!==0||prepared.appsScriptPosts!==0||
    prepared.sheetsWrites!==0)fail();
 const endpoint=prepared.endpoint,health=endpoint==='health-services';
 if(!snapshot||snapshot.mode!=='READ_ONLY_REFERENCE_MEMORY'||
    snapshot.status!=='SNAPSHOT_VALIDATED_IN_MEMORY'||
    snapshot.endpoint!==endpoint||snapshot.rowCount!==prepared.rowCount||
    snapshot.observedCountMatches!==true||
    snapshot.pagesFetched!==(health?2:1)||
    snapshot.networkRequests!==(health?2:1)||
    snapshot.appsScriptPosts!==0||snapshot.sheetsWrites!==0||
    snapshot.transferApproved!==false||
    snapshot.completeness!==(health?'SOURCE_TOTAL_CHECKED':'UNPAGINATED_SOURCE_HAS_NO_TOTAL')||
    (health&&snapshot.paginationComplete!==true)||
    !Array.isArray(snapshot.rows)||snapshot.rows.length!==prepared.rowCount)
   fail();
 // The destination ID is pinned in repository configuration; never request
 // an operator-supplied ID or allow any CLI destination override. Live Apps
 // Script property identity / Sheet content must still be checked externally.
 // The only TTY confirmation covers one exact endpoint, row count and district.
 if(!/^AKfycb[A-Za-z0-9_-]{40,120}$/.test(targets.deploymentId)||
    !KEY_RE.test(targets.spreadsheetId))fail();
 const dest=new URL(WEB_APP_URL);
 if(dest.origin!=='https://script.google.com'||
    dest.pathname!=='/macros/s/'+targets.deploymentId+'/exec'||dest.search||dest.hash)fail();
 const wire=prepared.envelope;
 if(!exact(wire,WIRE_KEYS)||wire.version!==VERSION||
    !Number.isSafeInteger(wire.timestamp)||Math.abs(Date.now()-wire.timestamp)>300000||
    typeof wire.nonce!=='string'||!/^[A-Za-z0-9_-]{16,64}$/.test(wire.nonce)||
    typeof wire.signature!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(wire.signature)||
    typeof wire.payloadB64!=='string'||wire.payloadB64.length>550000||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(wire.payloadB64)||
    JSON.stringify(wire).length>700000||
    Buffer.from(wire.payloadB64,'base64').toString('base64')!==wire.payloadB64)
  fail();
 const decoded=JSON.parse(Buffer.from(wire.payloadB64,'base64').toString('utf8'));
 if(!exact(decoded,PAYLOAD_KEYS)||decoded.schemaVersion!=='0.1.0'||
    decoded.mode!=='commit'||decoded.endpoint!==endpoint||
    !exact(decoded.scope,['provinceCode','districtCode'])||
    decoded.scope.provinceCode!=='54'||decoded.scope.districtCode!=='5406'||
    !/^[A-Za-z0-9_-]{8,64}$/.test(decoded.runId||'')||
    typeof decoded.fetchedAtUtc!=='string'||!Number.isFinite(Date.parse(decoded.fetchedAtUtc))||
    !Array.isArray(decoded.rows)||decoded.rows.length!==prepared.rowCount)
  fail();
 const projected=projectReferenceRows(endpoint,snapshot.rows,manifest);
 if(JSON.stringify(decoded.sourceFieldNames)!==JSON.stringify(projected.sourceFieldNames)||
    JSON.stringify(decoded.rows)!==JSON.stringify(projected.rows))
  fail();
 return endpoint;
}
const headers=method=>({
 Accept:'application/json',
 ...(method==='POST'?{'Content-Type':'application/json'}:{})
});
const options=(method,signal,body)=>({
 method,redirect:method==='POST'?'manual':'error',
 credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',
 headers:headers(method),signal,
 ...(method==='POST'?{body}:{})
});
async function boundedBody(response){
 const len=response.headers.get('content-length');
 if(len!==null&&(!/^(0|[1-9]\d*)$/.test(len)||Number(len)>REPLY_MAX))
  throw Error('BAD_LENGTH');
 if(!response.body||typeof response.body.getReader!=='function')
  throw Error('BAD_BODY');
 const reader=response.body.getReader();
 let size=0,chunks=[];
 try{
  for(;;){
   const {done,value}=await reader.read();
   if(done)break;
   if(!(value instanceof Uint8Array)||size+value.byteLength>REPLY_MAX)
    throw Error('BODY_LIMIT');
   size+=value.byteLength;chunks.push(value);
  }
  const output=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){output.set(chunk,offset);offset+=chunk.byteLength;}
  try{return new TextDecoder('utf-8',{fatal:true}).decode(output);}
  finally{output.fill(0);}
 }finally{
  chunks=[];
  try{await reader.cancel();}catch{}
  try{reader.releaseLock();}catch{}
 }
}
function parsedReply(response,text,endpoint,rowCount,requests){
 const http=response.status;
 if(http!==200)return safeSummary(endpoint,'OUTCOME_UNKNOWN_STOP',requests,1,http);
 const type=response.headers.get('content-type');
 if(typeof type!=='string'||
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(type.trim()))
  return safeSummary(endpoint,'OUTCOME_UNKNOWN_STOP',requests,1,http);
 const declared=response.headers.get('content-length');
 if(declared!==null&&Number(declared)!==Buffer.byteLength(text,'utf8'))
  return safeSummary(endpoint,'OUTCOME_UNKNOWN_STOP',requests,1,http);
 let data;
 try{data=JSON.parse(text);}catch{
  return safeSummary(endpoint,'OUTCOME_UNKNOWN_STOP',requests,1,http);
 }
 if(!plain(data)||data.protocol!==VERSION)
  return safeSummary(endpoint,'OUTCOME_UNKNOWN_STOP',requests,1,http);
 if(data.status==='COMMITTED'&&exact(data,SUCCESS_KEYS)&&
    data.accepted===true&&data.endpoint===endpoint&&data.rowCount===rowCount&&
    [data.inserted,data.updated,data.unchanged,data.sheetsWrites].every(x=>
      Number.isSafeInteger(x)&&x>=0)&&
    data.inserted+data.updated+data.unchanged===rowCount&&
    data.sheetsWrites===data.updated+(data.inserted>0?1:0)){
   return safeSummary(endpoint,'COMMIT_REPORTED_READBACK_REQUIRED',requests,1,http,{
    destinationReportedStatus:'COMMITTED',rowCount,
    reportedInserted:data.inserted,reportedUpdated:data.updated,
    reportedUnchanged:data.unchanged,reportedSheetsWrites:data.sheetsWrites,
    writeOutcome:'READBACK_AND_RECONCILIATION_REQUIRED'
   });
 }
 if(exact(data,ERROR_KEYS)&&data.accepted===false&&data.sheetsWrites===0&&
    DENIED.has(data.status)){
   return safeSummary(endpoint,'DENIED_STOP',requests,1,http,{
    destinationReportedStatus:data.status,
    writeOutcome:'REPORTED_PREWRITE_DENIAL'
   });
 }
 // In particular, REJECTED can mean a mid-write failure; do not assume rollback.
 return safeSummary(endpoint,'OUTCOME_UNKNOWN_STOP',requests,1,http);
}
/**
 * This function MUST only run after a separately approved first-write window,
 * a separately operator-reviewed destination inventory, and independent
 * PO first-write authorization. The explicit endpoint/count TTY confirmation
 * is not independent proof of the live Google Sheet or Apps Script properties.
 * One POST only, never retry, even when the response is lost or rejected.
 */
export async function sendReferenceCommit({
 prepared,snapshot,acknowledgement,fetchImpl=globalThis.fetch
}={}){
 let endpoint=null;
 try{
  endpoint=preflight(prepared,snapshot);
  if(acknowledgement!==commitPhrase(endpoint))
   return safeSummary(endpoint,'CONFIRMATION_REQUIRED');
  if(typeof fetchImpl!=='function')return safeSummary(endpoint,'TRANSPORT_UNAVAILABLE');
  const body=JSON.stringify(prepared.envelope);
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),POST_TIMEOUT);
  timer.unref?.();
  let requests=0,posts=0,httpStatus=null;
  try{
   requests++;posts++;
   const first=await fetchImpl(WEB_APP_URL,options('POST',controller.signal,body));
   httpStatus=first?.status??null;
   if(!first||!Number.isSafeInteger(first.status)||typeof first.headers?.get!=='function')
    return safeSummary(endpoint,'OUTCOME_UNKNOWN_STOP',requests,posts,httpStatus);
   let final=first;
   if(first.status===302||first.status===303){
    const location=first.headers.get('location');
    if(!isSafeGoogleContentRedirect(location))
     return safeSummary(endpoint,'OUTCOME_UNKNOWN_STOP',requests,posts,httpStatus);
    try{await first.body?.cancel?.();}catch{}
    requests++;
    final=await fetchImpl(location,options('GET',controller.signal));
    httpStatus=final?.status??null;
    if(!final||typeof final.headers?.get!=='function')
     return safeSummary(endpoint,'OUTCOME_UNKNOWN_STOP',requests,posts,httpStatus);
   }
   if(final.status!==200)
    return safeSummary(endpoint,'OUTCOME_UNKNOWN_STOP',requests,posts,httpStatus);
   const text=await boundedBody(final);
   return parsedReply(final,text,endpoint,prepared.rowCount,requests);
  }catch{
   return safeSummary(endpoint,'OUTCOME_UNKNOWN_STOP',requests,posts,httpStatus);
  }finally{clearTimeout(timer);}
 }catch{
  return safeSummary(endpoint,'INPUT_REJECTED');
 }
}
