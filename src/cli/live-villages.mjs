// T006: second operator-triggered, read-only ThaiPHC reference lookup; no persistence.
// Reuses T005 bounded JSON reader and the same explicitly entered Bearer token mechanism.
import {buildRequest} from './endpoints.mjs';
import {LIVE_ORIGIN,readBoundedJson} from './live-fetch.mjs';
import {CONFIRM_VILLAGES_PHRASE,isCandidateRealBearer} from './live-tty.mjs';

const LIMIT=150;
const TIMEOUT_MS=10000;
const FIELDS=Object.freeze([
 'code','village_code_8digit','id','name_th','name_en','village_no',
 'metro_status','label','subdistrict_code','subdistrict_name_th','subdistrict_name_en',
 'district_code','district_name_th','district_name_en','province_code',
 'province_name_th','province_name_en','health_service_code',
 'health_service_name_th','health_service_name_en'
]);
const KEYS=new Set(FIELDS);
const MUST_BE_STRINGS=new Set([
 'code','village_code_8digit','id','name_th','label','subdistrict_code',
 'subdistrict_name_th','subdistrict_name_en','district_code','district_name_th',
 'district_name_en','province_code','province_name_th','province_name_en'
]);
const SUBDISTRICTS=Object.freeze(Array.from({length:8},(_,i)=>'54060'+(i+1)));

function report(status,httpStatus=null,detail=null){
 return Object.freeze({
   mode:'LIVE_READ_ONLY',endpoint:'villages',status,
   success:status==='PASS',httpStatus,count:status==='PASS'?detail.count:0,
   ...(status==='PASS'?{
     subdistrictCounts:detail.subdistrictCounts,
     healthServiceLinkedCount:detail.healthServiceLinkedCount,
     healthServiceNullCount:detail.healthServiceNullCount
   }:{})
 });
}
export function validateVillageResponse(data){
 if(!data||typeof data!=='object'||Array.isArray(data)||
    !Array.isArray(data.items)||Object.keys(data).some(key=>key!=='items'))
    return {error:'UNEXPECTED_RESPONSE_SCHEMA'};
 const items=data.items;
 if(items.length>LIMIT)return {error:'RECORD_LIMIT_EXCEEDED'};
 if(items.length===0)return {error:'UNEXPECTED_EMPTY_RESULT'};
 const seen9=new Set(),seen8=new Set();
 const counts=Object.fromEntries(SUBDISTRICTS.map(code=>[code,0]));
 let linked=0;
 for(const row of items){
   if(!row||typeof row!=='object'||Array.isArray(row))return {error:'UNEXPECTED_RESPONSE_SCHEMA'};
   const keys=Object.keys(row);
   if(keys.length!==FIELDS.length||keys.some(k=>!KEYS.has(k))||
      FIELDS.some(k=>!Object.hasOwn(row,k)))return {error:'UNEXPECTED_RESPONSE_SCHEMA'};
   if(!Number.isInteger(row.village_no)||row.village_no<1||row.village_no>99)
     return {error:'INVALID_VILLAGE_NUMBER'};
   for(const [key,value] of Object.entries(row)){
     if(key==='village_no')continue;
     if(MUST_BE_STRINGS.has(key)){
       if(typeof value!=='string'||value.length===0||value.length>512)
         return {error:'INVALID_LOOKUP_FIELD'};
     }else if(value!==null&&(typeof value!=='string'||value.length>512))
       return {error:'UNEXPECTED_RESPONSE_SCHEMA'};
   }
   if(row.province_code!=='54'||row.district_code!=='5406'||
      !SUBDISTRICTS.includes(row.subdistrict_code))return {error:'GEOGRAPHIC_SCOPE_MISMATCH'};
   const n3=String(row.village_no).padStart(3,'0');
   const n2=String(row.village_no).padStart(2,'0');
   if(row.code!==row.subdistrict_code+n3||row.id!==row.code||
      row.village_code_8digit!==row.subdistrict_code+n2||
      row.label!==row.name_th)return {error:'INVALID_VILLAGE_RELATION'};
   if(!/^\d{9}$/.test(row.code)||!/^\d{8}$/.test(row.village_code_8digit))
     return {error:'INVALID_GEOGRAPHIC_CODE'};
   if(seen9.has(row.code)||seen8.has(row.village_code_8digit))
     return {error:'DUPLICATE_SOURCE_KEY'};
   seen9.add(row.code);seen8.add(row.village_code_8digit);
   counts[row.subdistrict_code]++;
   if(row.health_service_code!==null)linked++;
 }
 return {detail:{
   count:items.length,subdistrictCounts:counts,
   healthServiceLinkedCount:linked,
   healthServiceNullCount:items.length-linked
 }};
}

export async function liveFetchVillages({confirm,getToken,fetchImpl=globalThis.fetch}={}){
 if(typeof confirm!=='function'||typeof getToken!=='function'||typeof fetchImpl!=='function')
   throw new Error('LIVE_DEPENDENCY_REQUIRED');
 const approved=await confirm();
 if(approved!==CONFIRM_VILLAGES_PHRASE)return report('CONFIRMATION_REQUIRED');
 let token;
 try{
   token=await getToken();
   if(!isCandidateRealBearer(token))return report('INVALID_TOKEN_FORMAT');
   const request=buildRequest('villages');
   if(request.path!=='/api/v1/lookups/villages'||
      request.query!=='province_code=54&district_code=5406')return report('REQUEST_SCOPE_REJECTED');
   const url=new URL(request.path+'?'+request.query,LIVE_ORIGIN);
   if(url.protocol!=='https:'||url.origin!==LIVE_ORIGIN||
      url.pathname!=='/api/v1/lookups/villages'||
      url.search!=='?province_code=54&district_code=5406')return report('REQUEST_SCOPE_REJECTED');
   const controller=new AbortController();
   const timeout=setTimeout(()=>controller.abort(),TIMEOUT_MS);
   timeout.unref?.();
   try{
     const response=await fetchImpl(url.href,{
       method:'GET',redirect:'error',credentials:'omit',cache:'no-store',
       referrerPolicy:'no-referrer',signal:controller.signal,
       headers:{Accept:'application/json',Authorization:'Bearer '+token}
     });
     if(!response||!Number.isSafeInteger(response.status))return report('INVALID_HTTP_RESPONSE');
     if(response.status===401)return report('HTTP_401',401);
     if(response.status===403)return report('HTTP_403',403);
     if(response.status!==200)return report('HTTP_ERROR',response.status);
     const parsed=await readBoundedJson(response);
     if(parsed.error)return report(parsed.error,200);
     const verified=validateVillageResponse(parsed.data);
     if(verified.error)return report(verified.error,200);
     return report('PASS',200,verified.detail);
   }catch{return report(controller.signal.aborted?'REQUEST_TIMED_OUT':'REQUEST_FAILED_OR_TIMED_OUT');}
   finally{clearTimeout(timeout);}
 }finally{token=undefined;}
}
