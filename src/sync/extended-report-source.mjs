// Feature 010: manually authorized READ-ONLY ThaiPHC snapshot verifier for
// five report APIs. No persistence. In-memory person rows are NEVER returned;
// auditExtendedSnapshot only emits aggregate status, not persons or identifiers.
import {buildRequest} from '../cli/endpoints.mjs';
import {LIVE_ORIGIN,readBoundedJson} from '../cli/live-fetch.mjs';
import {isCandidateRealBearer} from '../cli/live-tty.mjs';
import {auditExtendedSnapshot,EXTENDED_REPORT_ENDPOINTS} from './extended-report-audit.mjs';

export const EXTENDED_AUDIT_CONFIRM='AUDIT FIVE REPORTS READ ONLY 5406';
const MAX_PAGES=250,PAGE_SIZE=10,TIMEOUT_MS=10000;
const summary=(endpoint,status,requests=0)=>Object.freeze({
 mode:'EXTENDED_REPORT_SOURCE_READ_ONLY',endpoint,status,
 sourceNetworkRequests:requests,appsScriptPosts:0,
 sheetsWrites:0,writeAuthorized:false,rawRowsReturned:false
});
async function internalRead({
 endpoint,confirm,getToken,manifest,fetchImpl=globalThis.fetch
}={},includeInternalPages=false){
 if(!EXTENDED_REPORT_ENDPOINTS.includes(endpoint))
  return summary(endpoint??null,'UNSUPPORTED_EXTENDED_ENDPOINT');
 if(typeof confirm!=='function'||typeof getToken!=='function'||!manifest||
    typeof fetchImpl!=='function')return summary(endpoint,'MISSING_DEPENDENCY');
 let token,requests=0;
 try{
  if(await confirm()!==EXTENDED_AUDIT_CONFIRM)
   return summary(endpoint,'CONFIRMATION_REQUIRED');
  token=await getToken();
  if(!isCandidateRealBearer(token))return summary(endpoint,'INVALID_BEARER');
  const pages=[];
  let sourceTotal=null,limit=null;
  for(let page=1;page<=MAX_PAGES;page++){
   const request=buildRequest(endpoint,{page,pageSize:PAGE_SIZE});
   const url=new URL(request.path+'?'+request.query,LIVE_ORIGIN);
   if(url.origin!==LIVE_ORIGIN||url.protocol!=='https:'||
      url.pathname!==request.path||url.search!=='?'+request.query||
      url.username||url.password||url.hash)
    return summary(endpoint,'REQUEST_SCOPE_REJECTED',requests);
   const controller=new AbortController();
   const timer=setTimeout(()=>controller.abort(),TIMEOUT_MS);
   timer.unref?.();
   let body;
   try{
    requests++;
    const response=await fetchImpl(url.href,{
     method:'GET',redirect:'error',credentials:'omit',cache:'no-store',
     referrerPolicy:'no-referrer',signal:controller.signal,
     headers:{Accept:'application/json',Authorization:'Bearer '+token}
    });
    if(!response||response.status!==200)
     return summary(endpoint,response?.status===401?'HTTP_401':
      response?.status===403?'HTTP_403':'SOURCE_HTTP_ERROR',requests);
    const read=await readBoundedJson(response);
    if(read.error)return summary(endpoint,read.error,requests);
    body=read.data;
    const reported=endpoint==='assignments'?body?.pagination?.total:body?.total;
    if(!Number.isSafeInteger(reported)||reported<0||reported>2500||
       !Array.isArray(body?.items))
     return summary(endpoint,'INVALID_PAGE_ENVELOPE',requests);
    if(sourceTotal===null){sourceTotal=reported;limit=Math.max(1,Math.ceil(reported/PAGE_SIZE));}
    if(reported!==sourceTotal||page>limit)
     return summary(endpoint,'SOURCE_TOTAL_CHANGED',requests);
    // Avoid retaining the credential on any page object.
    pages.push(body);
    if(page===limit){
     const audited=auditExtendedSnapshot(endpoint,pages,manifest);
     const safe=Object.freeze({...audited,sourceNetworkRequests:requests,
       mode:'EXTENDED_REPORT_SOURCE_READ_ONLY',appsScriptPosts:0,
       sheetsWrites:0,writeAuthorized:false,rawRowsReturned:false});
     // This field is NEVER returned from the public read-only CLI. It exists
     // solely for a separately confirmed, restricted signed staging path.
     return includeInternalPages?Object.freeze({safe,pages}):safe;
    }
   }catch{
    return summary(endpoint,controller.signal.aborted?'REQUEST_TIMED_OUT':
      'SOURCE_REQUEST_FAILED',requests);
   }finally{clearTimeout(timer);}
  }
  return summary(endpoint,'PAGE_LIMIT_REACHED',requests);
 }catch{
  return summary(endpoint,'SOURCE_AUDIT_REJECTED',requests);
 }finally{token=undefined;}
}

// Public audit returns ONLY redacted aggregate metadata; never source records.
export async function readExtendedReport(options){
 return internalRead(options,false);
}
// Explicitly private future transfer path. Caller must never print the pages.
// No write authorization, GAS request or persistence is performed here.
export async function collectExtendedForPrivateStaging(options){
 return internalRead(options,true);
}
