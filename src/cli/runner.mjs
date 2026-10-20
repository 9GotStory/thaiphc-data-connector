// T004: fail-closed offline-only pagination/validation. Results contain no source rows.
import { ENDPOINTS, buildRequest, SCOPE } from './endpoints.mjs';
import { isMockTransport } from './transport.mjs';

const MAX_PAGES=250;
const hasOwn=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
const validInt=x=>Number.isSafeInteger(x)&&x>=0;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function addIssue(out,code){
  out.issueCounts[code]=(out.issueCounts[code]||0)+1;
}
function result(out,status,code){
  if(code)addIssue(out,code);
  out.status=status;
  return out;
}
function checkEnvelope(d,body,req,previousTotal){
  if(!object(body)||!Array.isArray(body.items)||body.items.some(x=>!object(x)))return {error:'MALFORMED_RESPONSE'};
  if(d.pagination==='none')return {total:body.items.length,rows:body.items};
  let total;
  if(d.pagination==='assignment'){
    const p=body.pagination;
    if(!Array.isArray(body.provinces)||!object(p)||!validInt(p.total)||!validInt(p.pages)||!validInt(p.page)||!validInt(p.limit)||
       p.page!==req.page||p.limit!==req.pageSize||p.pages!==Math.ceil(p.total/req.pageSize))return {error:'MALFORMED_PAGINATION'};
    total=p.total;
  }else if(d.pagination==='offset'){
    if(!validInt(body.total)||!validInt(body.limit)||!validInt(body.offset)||
       body.limit!==req.pageSize||body.offset!==req.offset)return {error:'MALFORMED_PAGINATION'};
    total=body.total;
  }else{
    if(body.success!==true||typeof body.message!=='string'||!validInt(body.total)||
       !validInt(body.page)||!validInt(body.pageSize)||body.page!==req.page||body.pageSize!==req.pageSize)return {error:'MALFORMED_PAGINATION'};
    total=body.total;
  }
  if(previousTotal!==null&&total!==previousTotal)return {error:'TOTAL_CHANGED_BETWEEN_PAGES'};
  if(body.items.length>req.pageSize)return {error:'PAGE_OVERFLOW'};
  const start=d.pagination==='offset'?req.offset:(req.page-1)*req.pageSize;
  if(start>total||start+body.items.length>total)return {error:'INVALID_PAGE_RANGE'};
  const required=Math.min(req.pageSize,total-start);
  if(body.items.length!==required)return {error:'MISSING_PAGE_ROWS'};
  return {total,rows:body.items};
}
function rowGeoReason(row,d){
  const codeCheck=(key,val)=>{
    if(!hasOwn(row,key)||row[key]===null)return null;
    if(typeof row[key]!=='string')return 'INVALID_SCOPE_TYPE';
    return row[key]===val?null:'SCOPE_MISMATCH';
  };
  for(const [k,v] of [['provinceCode',SCOPE.province],['districtCode',SCOPE.district],['province_code',SCOPE.province],['district_code',SCOPE.district]]){
    const reason=codeCheck(k,v);if(reason)return reason;
  }
  if(d.pagination==='offset'){
    if(object(row.province)&&row.province.province_code!==SCOPE.province)return 'SCOPE_MISMATCH';
    if(object(row.district)&&row.district.district_code!==SCOPE.district)return 'SCOPE_MISMATCH';
    if(row.service_areas!==undefined&&!Array.isArray(row.service_areas))return 'INVALID_NESTED_SHAPE';
  }
  if(hasOwn(row,'villageCode')){
    if(typeof row.villageCode!=='string'||!/^\d{9}$/.test(row.villageCode))return 'INVALID_GEOGRAPHIC_CODE';
    if(typeof row.subdistrictCode==='string'&&row.villageCode.slice(0,6)!==row.subdistrictCode)return 'GEOGRAPHY_MISMATCH';
    if(row.villageCode.slice(0,4)!==SCOPE.district)return 'OUT_OF_SCOPE_VILLAGE';
    if(hasOwn(row,'villageNo')&&String(Number(row.villageCode.slice(6)))!==String(Number(row.villageNo)))return 'VILLAGE_NUMBER_MISMATCH';
  }
  if(d.pagination==='none'&&hasOwn(row,'subdistrict_code')&&hasOwn(row,'code')&&hasOwn(row,'village_no')){
    if(typeof row.code!=='string'||row.code!==row.subdistrict_code+String(row.village_no).padStart(3,'0'))return 'GEOGRAPHY_MISMATCH';
  }
  return null;
}
function verifyRowShape(endpoint,row){
  if(endpoint==='volunteer-gender'){
    if(!['total','male','female'].every(k=>validInt(row[k])))return 'INVALID_METRIC';
    if(row.male+row.female!==row.total)return 'GENDER_TOTAL_MISMATCH';
  }
  if(endpoint==='volunteer-tenure'&&['startYear','osmYear','tenureYears'].some(k=>hasOwn(row,k)&&!validInt(row[k])))return 'INVALID_YEAR_FIELD';
  if(endpoint==='health-services'&&(
    (hasOwn(row,'latitude')&&typeof row.latitude!=='number')||
    (hasOwn(row,'longitude')&&typeof row.longitude!=='number')
  ))return 'INVALID_COORDINATES';
  return null;
}
function stableKey(d,row){
  if(d.keyFields.length===0)return {error:'UNVERIFIED_ROW_KEY'};
  const keys=[];
  for(const field of d.keyFields){
    if(!hasOwn(row,field)||typeof row[field]!=='string'||row[field]==='')return {error:'MISSING_KEY'};
    keys.push(row[field]);
  }
  // Never expose keys, not even in redacted result objects.
  return {key:JSON.stringify(keys)};
}
export async function collectOffline(endpoint,{transport,pageSize=10,maxPages=250,maxRetries=2,retryDelay=async()=>{}}={}){
  const d=ENDPOINTS[endpoint];
  if(!d)throw new TypeError('UNKNOWN_ENDPOINT');
  if(!isMockTransport(transport))throw new TypeError('OFFLINE_TRANSPORT_REQUIRED');
  if(!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>MAX_PAGES)throw new TypeError('INVALID_MAX_PAGES');
  if(!Number.isSafeInteger(maxRetries)||maxRetries<0||maxRetries>3)throw new TypeError('INVALID_RETRIES');
  if(typeof retryDelay!=='function')throw new TypeError('INVALID_RETRY_DELAY');
  // Early validation of size/scope before any transport call.
  buildRequest(endpoint,{pageSize});
  const out={mode:'OFFLINE_ONLY',endpoint,status:'BLOCKED',pages:0,records:0,requestAttempts:0,issueCounts:{}};
  const seen=new Set();let expectedTotal=null;
  for(let index=0;index<maxPages;index++){
    const request=buildRequest(endpoint,{pageSize,page:d.pagination==='offset'||d.pagination==='none'?1:index+1,offset:d.pagination==='offset'?index*pageSize:0});
    let response=null;let lastReason='MOCK_TRANSPORT_ERROR';
    for(let retry=0;retry<=maxRetries;retry++){
      out.requestAttempts++;
      try{
        const candidate=await transport(request);
        if(!object(candidate)||!Number.isSafeInteger(candidate.status)){lastReason='MALFORMED_TRANSPORT';break;}
        if(candidate.status===200){response=candidate;break;}
        if([429,502,503,504].includes(candidate.status)){
          lastReason='RETRY_EXHAUSTED';
          if(retry<maxRetries){
            await retryDelay(50*Math.pow(2,retry));
            continue;
          }
          break;
        }
        return result(out,'BLOCKED',candidate.status===401||candidate.status===403?'AUTHORIZATION_REJECTED':'HTTP_ERROR');
      }catch{
        lastReason='MOCK_TRANSPORT_ERROR';
        if(retry<maxRetries){await retryDelay(50*Math.pow(2,retry));continue;}
      }
    }
    if(response===null)return result(out,'PARTIAL',lastReason);
    const checked=checkEnvelope(d,response.body,request,expectedTotal);
    if(checked.error)return result(out,'BLOCKED',checked.error);
    expectedTotal=checked.total;
    for(const row of checked.rows){
      const geo=rowGeoReason(row,d);const shape=verifyRowShape(endpoint,row);
      if(geo)addIssue(out,geo);
      if(shape)addIssue(out,shape);
      const key=stableKey(d,row);
      if(key.error)addIssue(out,key.error);
      else if(seen.has(key.key))addIssue(out,'DUPLICATE_SOURCE_KEY');
      else seen.add(key.key);
      out.records++;
    }
    out.pages++;
    if(d.pagination==='none'||out.records===expectedTotal){
      if(d.personLevel){
        addIssue(out,'PERSON_DATA_DISABLED');
        return result(out,'BLOCKED');
      }
      if(Object.keys(out.issueCounts).length)return result(out,'QUARANTINED');
      return result(out,'COMPLETE');
    }
  }
  return result(out,'PARTIAL','PAGE_LIMIT_REACHED');
}
