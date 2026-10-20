// T005: strictly one read-only authorized GET for ThaiPHC Song subdistrict lookup.
// This module has no output/persistence side-effects and returns aggregate-only status.
import {buildRequest} from './endpoints.mjs';
import {CONFIRM_PHRASE,isCandidateRealBearer} from './live-tty.mjs';

export const LIVE_ORIGIN='https://api-thaiphc.hss.moph.go.th';
const MAX_RESPONSE_BYTES=128*1024;
const MAX_RECORDS=100;
const TIMEOUT_MS=10000;
const FIELDS=new Set([
 'code','id','name_th','name_en','postal_code','label',
 'district_code','district_name_th','district_name_en',
 'province_code','province_name_th','province_name_en'
]);

function summary(status,httpStatus=null,count=0){
 return Object.freeze({mode:'LIVE_READ_ONLY',endpoint:'subdistricts',
  status,success:status==='PASS',httpStatus,count});
}

function validateRows(payload){
 if(!payload||typeof payload!=='object'||Array.isArray(payload)||
   !Array.isArray(payload.items)||Object.keys(payload).some(key=>key!=='items'))
   return 'UNEXPECTED_RESPONSE_SCHEMA';
 if(payload.items.length>MAX_RECORDS)return 'RECORD_LIMIT_EXCEEDED';
 const observed=new Set();
 for(const row of payload.items){
   if(!row||typeof row!=='object'||Array.isArray(row)||
     Object.keys(row).some(key=>!FIELDS.has(key)))return 'UNEXPECTED_RESPONSE_SCHEMA';
   if(typeof row.code!=='string'||!/^5406\d{2}$/.test(row.code)||
      row.id!==row.code||row.district_code!=='5406'||
      typeof row.name_th!=='string')return 'INVALID_LOOKUP_ROW';
   if(observed.has(row.code))return 'DUPLICATE_SOURCE_KEY';
   observed.add(row.code);
   for(const [key,value] of Object.entries(row)){
     if(!['code','id','district_code'].includes(key)&&
       !(typeof value==='string'||value===null))return 'UNEXPECTED_RESPONSE_SCHEMA';
     if(typeof value==='string'&&value.length>512)return 'FIELD_TOO_LONG';
   }
   if(row.province_code!==undefined&&row.province_code!==null&&row.province_code!=='54')
     return 'GEOGRAPHIC_SCOPE_MISMATCH';
 }
 return null;
}

export async function readBoundedJson(response){
 const contentType=response.headers?.get?.('content-type')?.toLowerCase()||'';
 if(!/^application\/(?:json|[a-z0-9.+-]+\+json)(?:\s*;|$)/.test(contentType))
   return {error:'UNEXPECTED_CONTENT_TYPE'};
 const reportedLength=response.headers?.get?.('content-length');
 if(reportedLength!==null&&reportedLength!==undefined){
   if(!/^\d+$/.test(reportedLength)||Number(reportedLength)>MAX_RESPONSE_BYTES)
     return {error:'RESPONSE_TOO_LARGE'};
 }
 if(!response.body||typeof response.body.getReader!=='function')
   return {error:'MISSING_RESPONSE_BODY'};
 const reader=response.body.getReader();const chunks=[];let total=0;
 try{
   while(true){
     const {done,value}=await reader.read();
     if(done)break;
     if(!(value instanceof Uint8Array))return {error:'INVALID_RESPONSE_CHUNK'};
     total+=value.byteLength;
     if(total>MAX_RESPONSE_BYTES){await reader.cancel().catch(()=>{});return {error:'RESPONSE_TOO_LARGE'};}
     chunks.push(value);
   }
   const joined=new Uint8Array(total);let offset=0;
   for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.byteLength;}
   const jsonText=new TextDecoder('utf-8',{fatal:true}).decode(joined);
   joined.fill(0);
   try{return {data:JSON.parse(jsonText)};}
   catch{return {error:'INVALID_JSON'};}
 }catch{return {error:'RESPONSE_READ_FAILED'};}
 finally{try{reader.releaseLock();}catch{/* reader may already be cancelled */}}
}

export async function liveFetchSubdistricts({confirm,getToken,fetchImpl=globalThis.fetch}={}){
  if(typeof confirm!=='function'||typeof getToken!=='function'||typeof fetchImpl!=='function')
    throw new Error('LIVE_DEPENDENCY_REQUIRED');
  // No credential is requested and no network call is attempted before confirmation.
  const agreed=await confirm();
  if(agreed!==CONFIRM_PHRASE)return summary('CONFIRMATION_REQUIRED');
  let token;
  try{
    token=await getToken();
    if(!isCandidateRealBearer(token))return summary('INVALID_TOKEN_FORMAT');
    const request=buildRequest('subdistricts');
    if(request.path!=='/api/v1/lookups/subdistricts'||
       request.query!=='district_code=5406')return summary('REQUEST_SCOPE_REJECTED');
    const url=new URL(request.path+'?'+request.query,LIVE_ORIGIN);
    if(url.protocol!=='https:'||url.origin!==LIVE_ORIGIN||
       url.pathname!=='/api/v1/lookups/subdistricts'||url.search!=='?district_code=5406')
      return summary('REQUEST_SCOPE_REJECTED');
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),TIMEOUT_MS);
    timeout.unref?.();
    try{
      const response=await fetchImpl(url.href,{
        method:'GET',redirect:'error',credentials:'omit',cache:'no-store',
        referrerPolicy:'no-referrer',signal:controller.signal,
        headers:{Accept:'application/json',Authorization:'Bearer '+token}
      });
      if(!response||!Number.isSafeInteger(response.status))return summary('INVALID_HTTP_RESPONSE');
      if(response.status===401)return summary('HTTP_401',401);
      if(response.status===403)return summary('HTTP_403',403);
      if(response.status!==200)return summary('HTTP_ERROR',response.status);
      const parsed=await readBoundedJson(response);
      if(parsed.error)return summary(parsed.error,200);
      const error=validateRows(parsed.data);
      if(error)return summary(error,200);
      return summary('PASS',200,parsed.data.items.length);
    }catch{return summary(controller.signal.aborted?'REQUEST_TIMED_OUT':'REQUEST_FAILED_OR_TIMED_OUT');}
    finally{clearTimeout(timeout);}
  }finally{
    token=undefined;
  }
}
