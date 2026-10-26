// T007: explicit, bounded, read-only health-service reference pagination.
// Synthetic CI only. No raw rows, file export, personal endpoints, Apps Script or Sheets.
import {buildRequest} from './endpoints.mjs';
import {LIVE_ORIGIN,readBoundedJson} from './live-fetch.mjs';
import {CONFIRM_HEALTH_SERVICES_PHRASE,isCandidateRealBearer} from './live-tty.mjs';

const PAGE_SIZE=10;
const MAX_PAGES=10;
const MAX_TOTAL=100;
const TIMEOUT_MS=10000;
const SUBDISTRICTS=new Set(Array.from({length:8},(_,i)=>'54060'+(i+1)));
const ROW_FIELDS=new Set([
 'health_service_code','health_service_name_th','health_service_name_en',
 'legacy_5digit_code','legacy_9digit_code','village_no','latitude','longitude',
 'health_service_type','province','district','subdistrict','service_areas',
 'created_at','updated_at','deleted_at'
]);
const TYPE_FIELDS=['id','name_th','name_en'];
const PROVINCE_FIELDS=['province_code','province_name_th','province_name_en'];
const DISTRICT_FIELDS=['district_code','district_name_th','district_name_en'];
const SUBDISTRICT_FIELDS=['subdistrict_code','subdistrict_name_th','subdistrict_name_en'];
const AREA_FIELDS=['id','subdistrict_code','subdistrict_name_th','village_nos','is_primary'];

function summary(status,httpStatus=null,counts=null,diagnostic=null){
 return Object.freeze({
   mode:'LIVE_READ_ONLY',endpoint:'health-services',status,
   success:status==='PASS',httpStatus,count:status==='PASS'?counts.count:0,
   ...(status==='PASS'?{
     total:counts.total,pagesFetched:counts.pagesFetched,
     zeroCoordinateCount:counts.zeroCoordinateCount
   }:{}),
   ...(status==='INVALID_HEALTH_SERVICE_ROW'&&diagnostic?.invalidField?{
     invalidField:diagnostic.invalidField,
     pageOffset:diagnostic.pageOffset,
     rowIndex:diagnostic.rowIndex,
     ...(diagnostic.invalidField==='village_no'&&diagnostic.invalidReason?{
       invalidReason:diagnostic.invalidReason
     }:{})
   }:{})
 });
}
// village_no is opaque source text, not a numeric join key; preserve its value unchanged.
// Validate only documented JSON string type and bounded metadata safety, not invented digit shape.
function validVillageNo(value){
 return typeof value==='string'&&value.length>=1&&value.length<=64&&
   value.trim().length>0&&!/[\u0000-\u001f\u007f]/.test(value)&&
   !/^0+$/.test(value.trim());
}
// Fixed categorical diagnostics: never pass source values, lengths or fragments to output.
function classifyInvalidVillageNo(value){
 if(value===null)return 'NULL_VALUE';
 if(typeof value==='number')return 'NUMBER_TYPE';
 if(typeof value==='boolean')return 'BOOLEAN_TYPE';
 if(Array.isArray(value))return 'ARRAY_TYPE';
 if(typeof value==='object')return 'OBJECT_TYPE';
 if(typeof value==='undefined')return 'MISSING_OR_UNDEFINED';
 if(typeof value!=='string')return 'OTHER_TYPE';
 if(value==='')return 'EMPTY_STRING';
 if(value.length>64)return 'STRING_TOO_LONG';
 if(value.trim()==='')return 'BLANK_STRING';
 if(/[\u0000-\u001f\u007f]/.test(value))return 'CONTROL_CHARACTER';
 if(/^0+$/.test(value.trim()))return 'ZERO_NOT_ALLOWED';
 return 'UNCLASSIFIED_INVALID';
}
function record(v){return v!==null&&typeof v==='object'&&!Array.isArray(v);}
function exactKeys(object,expected){
 return record(object)&&Object.keys(object).length===expected.length&&
   expected.every(key=>Object.hasOwn(object,key));
}
function str(v,max=512){return typeof v==='string'&&v.length>0&&v.length<=max;}
function nullableStr(v,max=512){return v===null||str(v,max);}
function validateRow(row,seen){
 if(!record(row)||Object.keys(row).length!==ROW_FIELDS.size||
   Object.keys(row).some(key=>!ROW_FIELDS.has(key)))return 'UNEXPECTED_RESPONSE_SCHEMA';
 const checks=[
   ['health_service_code',str(row.health_service_code,64)&&/^[A-Za-z0-9_-]+$/.test(row.health_service_code)],
   ['health_service_name_th',str(row.health_service_name_th)],
   ['health_service_name_en',nullableStr(row.health_service_name_en)],
   ['legacy_5digit_code',typeof row.legacy_5digit_code==='string'&&/^\d{5}$/.test(row.legacy_5digit_code)],
   ['legacy_9digit_code',typeof row.legacy_9digit_code==='string'&&/^\d{9}$/.test(row.legacy_9digit_code)],
   ['village_no',validVillageNo(row.village_no)],
   ['created_at',str(row.created_at,80)],
   ['updated_at',str(row.updated_at,80)],
   ['deleted_at',nullableStr(row.deleted_at,80)]
 ];
 for(const [field,ok] of checks){
   if(!ok)return {
     error:'INVALID_HEALTH_SERVICE_ROW',invalidField:field,
     ...(field==='village_no'?{invalidReason:classifyInvalidVillageNo(row.village_no)}:{})
   };
 }
 if(typeof row.latitude!=='number'||!Number.isFinite(row.latitude)||
    row.latitude < -90||row.latitude > 90||
    typeof row.longitude!=='number'||!Number.isFinite(row.longitude)||
    row.longitude < -180||row.longitude > 180)return 'INVALID_COORDINATES';
 if(!exactKeys(row.health_service_type,TYPE_FIELDS)||
    !str(row.health_service_type.id,80)||
    !str(row.health_service_type.name_th)||
    !nullableStr(row.health_service_type.name_en))return 'UNEXPECTED_RESPONSE_SCHEMA';
 if(!exactKeys(row.province,PROVINCE_FIELDS)||
    !exactKeys(row.district,DISTRICT_FIELDS)||
    !exactKeys(row.subdistrict,SUBDISTRICT_FIELDS))return 'UNEXPECTED_RESPONSE_SCHEMA';
 if(row.province.province_code!=='54'||row.district.district_code!=='5406'||
    !SUBDISTRICTS.has(row.subdistrict.subdistrict_code))return 'GEOGRAPHIC_SCOPE_MISMATCH';
 for(const [field,value,nullable] of [
   ['province.province_name_th',row.province.province_name_th,false],
   ['district.district_name_th',row.district.district_name_th,false],
   ['subdistrict.subdistrict_name_th',row.subdistrict.subdistrict_name_th,false],
   ['province.province_name_en',row.province.province_name_en,true],
   ['district.district_name_en',row.district.district_name_en,true],
   ['subdistrict.subdistrict_name_en',row.subdistrict.subdistrict_name_en,true]
 ]){
   if(!(nullable?nullableStr(value):str(value)))
     return {error:'INVALID_HEALTH_SERVICE_ROW',invalidField:field};
 }
 if(!Array.isArray(row.service_areas)||row.service_areas.length>100)
   return 'UNEXPECTED_RESPONSE_SCHEMA';
 for(const area of row.service_areas){
   if(!exactKeys(area,AREA_FIELDS)||!str(area.id,80)||
      !SUBDISTRICTS.has(area.subdistrict_code)||!str(area.subdistrict_name_th)||
      typeof area.is_primary!=='boolean'||!Array.isArray(area.village_nos)||
      area.village_nos.length>100||area.village_nos.some(v=>typeof v!=='string'||!/^0*[1-9]\d{0,2}$/.test(v)))
     return 'INVALID_SERVICE_AREA';
 }
 if(seen.has(row.health_service_code))return 'DUPLICATE_SOURCE_KEY';
 seen.add(row.health_service_code);
 return null;
}

export function validatePage(data,offset,seen,expectedTotal){
 if(!exactKeys(data,['items','total','limit','offset'])||
    !Array.isArray(data.items)||!Number.isSafeInteger(data.total)||
    !Number.isSafeInteger(data.limit)||!Number.isSafeInteger(data.offset)||
    data.total<0||data.limit!==PAGE_SIZE||data.offset!==offset)
   return {error:'INVALID_PAGINATION_ENVELOPE'};
 if(data.total>MAX_TOTAL)return {error:'TOTAL_LIMIT_EXCEEDED'};
 if(expectedTotal!==null&&data.total!==expectedTotal)
   return {error:'PAGINATION_TOTAL_CHANGED'};
 const expectedCount=Math.min(PAGE_SIZE,Math.max(0,data.total-offset));
 if(data.items.length!==expectedCount)return {error:'PAGINATION_ROW_COUNT_MISMATCH'};
 let zero=0;
 for(const [rowIndex,row] of data.items.entries()){
   const problem=validateRow(row,seen);
   if(problem)return typeof problem==='string'?{error:problem}:
     {...problem,pageOffset:offset,rowIndex};
   if(row.latitude===0&&row.longitude===0)zero++;
 }
 return {zero};
}
export async function liveFetchHealthServices({confirm,getToken,fetchImpl=globalThis.fetch}={}){
 if(typeof confirm!=='function'||typeof getToken!=='function'||typeof fetchImpl!=='function')
   throw new Error('LIVE_DEPENDENCY_REQUIRED');
 const phrase=await confirm();
 if(phrase!==CONFIRM_HEALTH_SERVICES_PHRASE)return summary('CONFIRMATION_REQUIRED');
 let token;
 try{
   token=await getToken();
   if(!isCandidateRealBearer(token))return summary('INVALID_TOKEN_FORMAT');
   const seen=new Set();
   let total=null,zeroCoordinateCount=0,pagesFetched=0;
   for(let page=0;page<MAX_PAGES;page++){
     const offset=page*PAGE_SIZE;
     const request=buildRequest('health-services',{pageSize:PAGE_SIZE,offset});
     const expected=new URLSearchParams([
       ['limit','10'],['offset',String(offset)],
       ['health_service_type_ids_exclude','7310dd94-0395-48cb-845b-803279a54f6c'],
       ['health_service_type_ids_exclude','96ca3348-49c2-4d89-903b-32939fd1c95c'],
       ['health_service_type_ids_exclude','f464d614-c20e-4391-84a9-4c8edb7982a9'],
       ['province_code','54'],['district_code','5406']
     ]).toString();
     if(request.path!=='/api/v1/geo-management/health-services'||request.query!==expected)
       return summary('REQUEST_SCOPE_REJECTED');
     const url=new URL(request.path+'?'+request.query,LIVE_ORIGIN);
     if(url.protocol!=='https:'||url.origin!==LIVE_ORIGIN||
        url.pathname!=='/api/v1/geo-management/health-services'||url.search!=='?'+expected)
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
       const verified=validatePage(parsed.data,offset,seen,total);
       if(verified.error)return summary(verified.error,200,null,verified);
       if(total===null)total=parsed.data.total;
       zeroCoordinateCount+=verified.zero;
       pagesFetched++;
       if(seen.size===total){
         return summary('PASS',200,{
           count:seen.size,total,pagesFetched,zeroCoordinateCount
         });
       }
     }catch{return summary(controller.signal.aborted?'REQUEST_TIMED_OUT':'REQUEST_FAILED_OR_TIMED_OUT');}
     finally{clearTimeout(timeout);}
   }
   return summary('PAGE_LIMIT_EXCEEDED');
 }finally{token=undefined;}
}
