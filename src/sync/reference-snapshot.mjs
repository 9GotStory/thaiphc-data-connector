// T009D — bounded, manually authorized read-only reference snapshot collector.
// CAUTION: on success "rows" contains IN-MEMORY source reference values.
// NEVER console.log, write to disk, paste into GitHub or auto-POST these rows.
// No Apps Script requests, no Sheet mutations, no person/gender endpoints.
import {buildRequest} from '../cli/endpoints.mjs';
import {LIVE_ORIGIN,readBoundedJson,validateRows} from '../cli/live-fetch.mjs';
import {validateVillageResponse} from '../cli/live-villages.mjs';
import {validatePage} from '../cli/live-health-services.mjs';
import {isCandidateRealBearer} from '../cli/live-tty.mjs';
import {projectReferenceRows} from './reference-projection.mjs';

export const SNAPSHOT_CONFIRM='READ REFERENCE SNAPSHOT 5406';
const ALLOWED=new Set(['subdistricts','villages','health-services']);
const MAX_PAGES=10,PAGE_SIZE=10,TIMEOUT_MS=10000;
const observed={subdistricts:8,villages:85,'health-services':18};
const statusOnly=(endpoint,status,calls=0)=>Object.freeze({
 mode:'READ_ONLY_REFERENCE_MEMORY',endpoint,status,
 networkRequests:calls,appsScriptPosts:0,sheetsWrites:0,
 transferApproved:false
});
function acceptedRequest(endpoint,offset){
 const req=endpoint==='health-services'?
  buildRequest(endpoint,{offset,pageSize:PAGE_SIZE}):buildRequest(endpoint);
 const u=new URL(req.path+'?'+req.query,LIVE_ORIGIN);
 if(u.origin!==LIVE_ORIGIN||u.protocol!=='https:'||u.pathname!==req.path||
    !u.search.startsWith('?')||u.username||u.password||u.hash)
  throw Error('REFERENCE_REQUEST_SCOPE_REJECTED');
 if(endpoint==='subdistricts'&&u.search!=='?district_code=5406')
  throw Error('REFERENCE_REQUEST_SCOPE_REJECTED');
 if(endpoint==='villages'&&u.search!=='?province_code=54&district_code=5406')
  throw Error('REFERENCE_REQUEST_SCOPE_REJECTED');
 if(endpoint==='health-services'){
  if(u.searchParams.get('offset')!==String(offset)||
     u.searchParams.get('limit')!=='10'||
     u.searchParams.get('province_code')!=='54'||
     u.searchParams.get('district_code')!=='5406'||
     u.searchParams.getAll('health_service_type_ids_exclude').length!==3)
   throw Error('REFERENCE_REQUEST_SCOPE_REJECTED');
 }
 return u.href;
}
async function pageRead(url,token,fetchImpl){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),TIMEOUT_MS);
 timer.unref?.();
 try{
  const r=await fetchImpl(url,{
   method:'GET',redirect:'error',credentials:'omit',cache:'no-store',
   referrerPolicy:'no-referrer',signal:controller.signal,
   headers:{Accept:'application/json',Authorization:'Bearer '+token}
  });
  if(!r||!Number.isSafeInteger(r.status))return {status:'INVALID_HTTP_RESPONSE'};
  if(r.status===401)return {status:'HTTP_401'};
  if(r.status===403)return {status:'HTTP_403'};
  if(r.status!==200)return {status:'HTTP_REJECTED'};
  const parsed=await readBoundedJson(r);
  return parsed.error?{status:parsed.error}:{data:parsed.data};
 }catch{return {status:controller.signal.aborted?'REQUEST_TIMED_OUT':'REQUEST_FAILED'};}
 finally{clearTimeout(timer);}
}
/**
 * Requires an explicit confirmation from caller BEFORE bearer is requested.
 * The returned source rows remain memory-only; this does NOT authorize sending
 * them to Apps Script. For a true sync, provider transfer rights and a separate
 * Product Owner gate must be independently verified.
 */
export async function collectReferenceSnapshot({
 endpoint,confirm,getToken,fetchImpl=globalThis.fetch,manifest
}={}){
 if(!ALLOWED.has(endpoint))return statusOnly(endpoint??null,'REFERENCE_ONLY_ENDPOINT_REQUIRED');
 if(typeof confirm!=='function'||typeof getToken!=='function'||
    typeof fetchImpl!=='function'||!manifest)
  return statusOnly(endpoint,'REQUIRED_DEPENDENCY_MISSING');
 let calls=0,token;
 try{
  if(await confirm()!==SNAPSHOT_CONFIRM)
   return statusOnly(endpoint,'CONFIRMATION_REQUIRED');
  token=await getToken();
  if(!isCandidateRealBearer(token))
   return statusOnly(endpoint,'INVALID_TOKEN_FORMAT');
  const rows=[],seen=new Set();
  let total=null,pagesFetched=0;
  for(let page=0;page<(endpoint==='health-services'?MAX_PAGES:1);page++){
   const offset=page*PAGE_SIZE;
   const url=acceptedRequest(endpoint,offset);
   calls++;
   const result=await pageRead(url,token,fetchImpl);
   if(result.status)return statusOnly(endpoint,result.status,calls);
   const data=result.data;
   if(endpoint==='subdistricts'){
    const error=validateRows(data);
    if(error)return statusOnly(endpoint,error,calls);
    rows.push(...data.items);
   }else if(endpoint==='villages'){
    const checked=validateVillageResponse(data);
    if(checked.error)return statusOnly(endpoint,checked.error,calls);
    rows.push(...data.items);
   }else{
    const checked=validatePage(data,offset,seen,total);
    if(checked.error)return statusOnly(endpoint,checked.error,calls);
    total??=data.total;
    rows.push(...data.items);
   }
   pagesFetched++;
   if(endpoint!=='health-services'||rows.length===total)break;
  }
  if(rows.length===0||
     (endpoint==='health-services'&&rows.length!==total))
   return statusOnly(endpoint,'SNAPSHOT_INCOMPLETE_OR_EMPTY',calls);
  // Ensures strict T003 observed field names, scope, source key uniqueness,
  // nullable semantics and bounded size WITHOUT transferring anything.
  const projected=projectReferenceRows(endpoint,rows,manifest);
  if(projected.rowCount!==rows.length)
   return statusOnly(endpoint,'SNAPSHOT_COUNT_MISMATCH',calls);
  return Object.freeze({
   mode:'READ_ONLY_REFERENCE_MEMORY',status:'SNAPSHOT_VALIDATED_IN_MEMORY',
   endpoint,rowCount:rows.length,
   observedCountMatches:rows.length===observed[endpoint],
   pagesFetched,
   paginationComplete:endpoint==='health-services'?rows.length===total:null,
   completeness: endpoint==='health-services'?
    'SOURCE_TOTAL_CHECKED':'UNPAGINATED_SOURCE_HAS_NO_TOTAL',
   transferApproved:false,networkRequests:calls,appsScriptPosts:0,sheetsWrites:0,
   // SENSITIVE REFERENCE CONTENT: in-process ONLY, NEVER print/log/export.
   rows
  });
 }catch{return statusOnly(endpoint,'SNAPSHOT_REJECTED',calls);}
 finally{token=undefined;}
}
