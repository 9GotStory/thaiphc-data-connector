// T008: bounded, operator-triggered, read-only village-level gender report.
// Only district-level aggregates leave this module; never persist source rows.
import {buildRequest} from './endpoints.mjs';
import {LIVE_ORIGIN,readBoundedJson} from './live-fetch.mjs';
import {CONFIRM_VOLUNTEER_GENDER_PHRASE,isCandidateRealBearer} from './live-tty.mjs';

const PAGE_SIZE=10;
const MAX_PAGES=15;
const MAX_ROWS=PAGE_SIZE*MAX_PAGES;
const TIMEOUT_MS=10000;
const SUBDISTRICTS=new Set(Array.from({length:8},(_,i)=>'54060'+(i+1)));
const ROW_FIELDS=[
 'provinceCode','provinceName','districtCode','districtName','subdistrictCode',
 'subdistrictName','villageCode','villageNo','villageName','total','male','female'
];
const ROOT_FIELDS=['success','message','items','total','page','pageSize'];
const CODE_FIELDS=['provinceCode','districtCode','subdistrictCode','villageCode'];
const LABEL_FIELDS=['provinceName','districtName','subdistrictName','villageNo','villageName'];
function record(x){return x!==null&&typeof x==='object'&&!Array.isArray(x);}
function exactKeys(x,fields){
 return record(x)&&Object.keys(x).length===fields.length&&
  fields.every(field=>Object.hasOwn(x,field));
}
function boundedString(v,max){
 return typeof v==='string'&&v.length>0&&v.length<=max&&
  v.trim().length>0&&!/[\u0000-\u001f\u007f]/.test(v);
}
function safeNonnegative(v){return Number.isSafeInteger(v)&&v>=0;}
function problem(error,invalidField=null){
 return invalidField?{error,invalidField}:{error};
}
function summary(status,httpStatus=null,aggregate=null,problemDetail=null){
 return Object.freeze({
  mode:'LIVE_READ_ONLY',endpoint:'volunteer-gender',status,
  success:status==='PASS',httpStatus,
  count:status==='PASS'?aggregate.count:0,
  ...(status==='PASS'?{
    totalRows:aggregate.totalRows,pagesFetched:aggregate.pagesFetched,
    volunteerTotal:aggregate.volunteerTotal,
    maleTotal:aggregate.maleTotal,femaleTotal:aggregate.femaleTotal
  }:{...((problemDetail&&problemDetail.invalidField)?{
    invalidField:problemDetail.invalidField,
    page:problemDetail.page,
    rowIndex:problemDetail.rowIndex
  }:{})})
 });
}
function validateRow(row,seen,totals){
 if(!exactKeys(row,ROW_FIELDS))return problem('UNEXPECTED_RESPONSE_SCHEMA');
 for(const field of CODE_FIELDS){
  if(!boundedString(row[field],16))return problem('INVALID_GENDER_ROW',field);
 }
 for(const field of LABEL_FIELDS){
  if(!boundedString(row[field],512))return problem('INVALID_GENDER_ROW',field);
 }
 if(row.provinceCode!=='54'||row.districtCode!=='5406'||
    !SUBDISTRICTS.has(row.subdistrictCode)||
    !/^\d{9}$/.test(row.villageCode)||
    row.villageCode.slice(0,6)!==row.subdistrictCode)
    return problem('GEOGRAPHIC_SCOPE_MISMATCH');
 if(seen.has(row.villageCode))return problem('DUPLICATE_VILLAGE_CODE');
 for(const field of ['total','male','female']){
  if(!safeNonnegative(row[field]))return problem('INVALID_GENDER_METRIC',field);
 }
 const sum=row.male+row.female;
 if(!Number.isSafeInteger(sum)||sum!==row.total)
   return problem('GENDER_TOTAL_MISMATCH');
 if(!Number.isSafeInteger(totals.volunteerTotal+row.total)||
    !Number.isSafeInteger(totals.maleTotal+row.male)||
    !Number.isSafeInteger(totals.femaleTotal+row.female))
   return problem('AGGREGATE_OVERFLOW');
 seen.add(row.villageCode);
 totals.volunteerTotal+=row.total;
 totals.maleTotal+=row.male;
 totals.femaleTotal+=row.female;
 return null;
}
function validatePage(data,page,expectedTotal,seen,totals){
 if(!exactKeys(data,ROOT_FIELDS)||data.success!==true||
    !boundedString(data.message,256)||!Array.isArray(data.items)||
    !safeNonnegative(data.total)||!safeNonnegative(data.page)||
    !safeNonnegative(data.pageSize)||data.page!==page||
    data.pageSize!==PAGE_SIZE)return problem('INVALID_PAGINATION_ENVELOPE');
 if(data.total>MAX_ROWS)return problem('TOTAL_LIMIT_EXCEEDED');
 if(expectedTotal!==null&&data.total!==expectedTotal)
   return problem('PAGINATION_TOTAL_CHANGED');
 const index=(page-1)*PAGE_SIZE;
 const expectedItems=Math.min(PAGE_SIZE,Math.max(0,data.total-index));
 if(data.items.length!==expectedItems)return problem('PAGINATION_ROW_COUNT_MISMATCH');
 for(const [rowIndex,row] of data.items.entries()){
  const error=validateRow(row,seen,totals);
  if(error)return {...error,page,rowIndex};
 }
 return null;
}
export async function liveFetchVolunteerGender({
 confirm,getToken,fetchImpl=globalThis.fetch
}={}){
 if(typeof confirm!=='function'||typeof getToken!=='function'||
    typeof fetchImpl!=='function')throw new Error('LIVE_DEPENDENCY_REQUIRED');
 if(await confirm()!==CONFIRM_VOLUNTEER_GENDER_PHRASE)
   return summary('CONFIRMATION_REQUIRED');
 let token;
 try{
  token=await getToken();
  if(!isCandidateRealBearer(token))return summary('INVALID_TOKEN_FORMAT');
  let total=null,pagesFetched=0;
  const seen=new Set();
  const totals={volunteerTotal:0,maleTotal:0,femaleTotal:0};
  for(let page=1;page<=MAX_PAGES;page++){
   const request=buildRequest('volunteer-gender',{page,pageSize:PAGE_SIZE});
   const expected='page='+page+'&pageSize=10&province=54&district=5406';
   if(request.path!=='/api/v1/reports/volunteer-gender'||request.query!==expected)
     return summary('REQUEST_SCOPE_REJECTED');
   const url=new URL(request.path+'?'+request.query,LIVE_ORIGIN);
   if(url.protocol!=='https:'||url.origin!==LIVE_ORIGIN||
      url.pathname!=='/api/v1/reports/volunteer-gender'||
      url.search!=='?'+expected)return summary('REQUEST_SCOPE_REJECTED');
   const controller=new AbortController();
   const timeout=setTimeout(()=>controller.abort(),TIMEOUT_MS);
   timeout.unref?.();
   try{
    const response=await fetchImpl(url.href,{
     method:'GET',redirect:'error',credentials:'omit',cache:'no-store',
     referrerPolicy:'no-referrer',signal:controller.signal,
     headers:{Accept:'application/json',Authorization:'Bearer '+token}
    });
    if(!response||!Number.isSafeInteger(response.status))
      return summary('INVALID_HTTP_RESPONSE');
    if(response.status===401)return summary('HTTP_401',401);
    if(response.status===403)return summary('HTTP_403',403);
    if(response.status!==200)return summary('HTTP_ERROR',response.status);
    const body=await readBoundedJson(response);
    if(body.error)return summary(body.error,200);
    const failure=validatePage(body.data,page,total,seen,totals);
    if(failure)return summary(failure.error,200,null,failure);
    if(total===null)total=body.data.total;
    pagesFetched++;
    if(seen.size===total){
     return summary('PASS',200,{
      count:seen.size,totalRows:total,pagesFetched,...totals
     });
    }
   }catch{
    return summary(controller.signal.aborted?'REQUEST_TIMED_OUT':'REQUEST_FAILED_OR_TIMED_OUT');
   }finally{clearTimeout(timeout);}
  }
  return summary('PAGE_LIMIT_EXCEEDED');
 }finally{token=undefined;}
}
