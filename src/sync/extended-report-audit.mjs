// Feature 010: OFFLINE / injected full-page audit for the five ThaiPHC reports.
// Raw person/family rows may be present in CALLER memory. Never print, serialize,
// send, persist, or return raw records. No API access, GAS or Sheets writes here.
const ENDPOINTS=Object.freeze({
 'volunteer-gender':{class:'AGGREGATE',key:['provinceCode','districtCode','villageCode'],tab:'VolunteerGender',gate:'ELIGIBLE_AFTER_PRIVACY_REVIEW'},
 assignments:{class:'PERSON',key:['id'],tab:'Assignments',gate:'PERSON_DATA_APPROVAL_REQUIRED'},
 'volunteer-family':{class:'PERSON_RELATION',key:[],tab:'VolunteerFamily',gate:'PERSON_DATA_APPROVAL_REQUIRED'},
 'resigned-volunteers':{class:'PERSON',key:['id'],tab:'ResignedVolunteers',gate:'PERSON_DATA_APPROVAL_REQUIRED'},
 'volunteer-tenure':{class:'PERSON',key:['id'],tab:'VolunteerTenure',gate:'PERSON_DATA_APPROVAL_REQUIRED'}
});
const PAGE_SIZE=10,MAX_PAGES=250,MAX_TOTAL=2500,MAX_FIELDS=32;
const has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const integer=x=>Number.isSafeInteger(x)&&x>=0;
const safeString=x=>typeof x==='string'&&x.length<=32767&&
 !/[\u0000-\u001f\u007f]/.test(x)&&!/^\s*[=+\-@]/.test(x);
function status(api,code,stats={}){
 return Object.freeze({mode:'EXTENDED_REPORT_AUDIT_OFFLINE',endpoint:api,
  status:code,writeAuthorized:false,sourceNetworkRequests:0,
  appsScriptPosts:0,sheetsWrites:0,...stats});
}
function assertManifest(api,manifest){
 const policy=ENDPOINTS[api];
 if(!policy||!obj(manifest)||!Array.isArray(manifest.datasets)||
    manifest.datasets.length!==8)throw Error('EXTENDED_AUDIT_MANIFEST_INVALID');
 const d=manifest.datasets.find(x=>x.api===api);
 if(!d||d.tab!==policy.tab||d.gate!==policy.gate||
    !Array.isArray(d.fields)||d.fields.length<3||
    d.fields.length>MAX_FIELDS||
    JSON.stringify(d.candidate)!==JSON.stringify(policy.key)||
    new Set(d.fields.map(x=>x.source_field)).size!==d.fields.length||
    d.fields.some(x=>!safeString(x.source_field)||!safeString(x.column)||
      !['RESTRICTED_DEFAULT_OMIT','ALLOW_ONLY_IF_DATASET_APPROVED'].includes(x.pii_policy)))
  throw Error('EXTENDED_AUDIT_MANIFEST_INVALID');
 return {policy,d};
}
function validValue(value,kind){
 if(value===null)return ['null_only','string_or_null'].includes(kind);
 if(kind==='null_only')return false;
 if(kind==='string'||kind==='string_or_null')return safeString(value);
 if(kind==='integer')return integer(value);
 if(kind==='number')return typeof value==='number'&&Number.isFinite(value);
 if(kind==='boolean')return typeof value==='boolean';
 return false;
}
function checkPage(endpoint,page,index,total){
 if(!obj(page)||!Array.isArray(page.items))return 'INVALID_PAGE_ENVELOPE';
 const actualTotal=endpoint==='assignments'?page.pagination?.total:page.total;
 if(!integer(actualTotal)||actualTotal>MAX_TOTAL)return 'INVALID_PAGE_ENVELOPE';
 if(endpoint==='assignments'){
  const p=page.pagination;
  if(!Array.isArray(page.provinces)||!obj(p)||!integer(p.total)||
     !integer(p.page)||!integer(p.limit)||!integer(p.pages)||
     p.total>MAX_TOTAL||
     p.page!==index+1||p.limit!==PAGE_SIZE||
     p.pages!==Math.ceil(p.total/PAGE_SIZE))
   return 'INVALID_ASSIGNMENTS_PAGINATION';
 }else if(page.success!==true||typeof page.message!=='string'||
    page.page!==index+1||page.pageSize!==PAGE_SIZE)
  return 'INVALID_REPORT_PAGINATION';
 if(total!==null&&actualTotal!==total)return 'SOURCE_TOTAL_CHANGED';
 if(page.items.length!==Math.min(PAGE_SIZE,Math.max(0,actualTotal-index*PAGE_SIZE)))
  return 'PAGE_COUNT_MISMATCH';
 return null;
}
/**
 * Inject all separately authorized, bounded response pages; no live fetching.
 * Does not grant source/Sheet storage authority or return raw person values.
 */
export function auditExtendedSnapshot(endpoint,pages,manifest,{smallCellThreshold=5}={}){
 const {policy,d}=assertManifest(endpoint,manifest);
 if(!Array.isArray(pages)||pages.length===0||pages.length>MAX_PAGES||
    !Number.isSafeInteger(smallCellThreshold)||smallCellThreshold<2||
    smallCellThreshold>20)throw Error('EXTENDED_AUDIT_ARGUMENT_INVALID');
 const fields=new Map(d.fields.map(f=>[f.source_field,f]));
 const restricted=d.fields.filter(f=>f.pii_policy==='RESTRICTED_DEFAULT_OMIT').map(f=>f.source_field);
 const seen=new Set(),issues=Object.create(null),typeIssues=new Map();
 let total=null,rows=0,smallCells=0,geographyIssues=0,restrictedFieldInstances=0;
 const flag=x=>{issues[x]=(issues[x]??0)+1;};
 for(const [i,page] of pages.entries()){
  const error=checkPage(endpoint,page,i,total);
  if(error)return status(endpoint,error,{pagesChecked:i,reportedTotal:total});
  if(total===null)total=endpoint==='assignments'?page.pagination.total:page.total;
  for(const row of page.items){
   rows++; // Count every observed row, including quarantined rows.
   if(!obj(row)){flag('INVALID_ROW');continue;}
   if(Object.keys(row).some(k=>!fields.has(k))){flag('UNEXPECTED_SOURCE_FIELD');continue;}
   if(row.provinceCode!=='54'||row.districtCode!=='5406'){
    flag('OUT_OF_DISTRICT');geographyIssues++;continue;
   }
   if(has(row,'subdistrictCode')&&
      (!/^54060[1-8]$/.test(String(row.subdistrictCode)))){
    flag('UNVERIFIED_SUBDISTRICT');geographyIssues++;
   }
   if(has(row,'villageCode')&&
      (!/^54060[1-8]\d{3}$/.test(String(row.villageCode))||
       (endpoint!=='volunteer-family'&&
        has(row,'subdistrictCode')&&
        String(row.villageCode).slice(0,6)!==row.subdistrictCode))){
    flag('GEOGRAPHY_INCONSISTENT');geographyIssues++;
   }
   for(const f of d.fields){
    if(!has(row,f.source_field))continue; // absent stays distinct from null
    if(!validValue(row[f.source_field],f.observed_kind)){
     flag('SOURCE_TYPE_CHANGED');
     const value=row[f.source_field];
     const observedType=value===null?'null':Array.isArray(value)?'array':typeof value;
     const key=f.source_field+'\u0000'+observedType;
     if(!typeIssues.has(key))typeIssues.set(key,{
      field:f.source_field,expectedKind:f.observed_kind,observedType,count:0
     });
     typeIssues.get(key).count++;
    }
    if(f.pii_policy==='RESTRICTED_DEFAULT_OMIT'&&
       row[f.source_field]!==null)restrictedFieldInstances++;
   }
   if(policy.key.length){
    const ids=policy.key.map(k=>row[k]);
    if(ids.some(k=>!safeString(k)||k.length===0))flag('INVALID_STABLE_KEY');
    else {
     // Memory-only: never expose an identifier or derived hash in audit results.
     const key=JSON.stringify(ids);
     if(seen.has(key))flag('DUPLICATE_STABLE_KEY');
     else seen.add(key);
    }
   }
   if(endpoint==='volunteer-gender'){
    const {total:count,male,female}=row;
    if(!integer(count)||!integer(male)||!integer(female)||
       male+female!==count)flag('INVALID_GENDER_COUNTS');
    else if([count,male,female].some(v=>v>0&&v<smallCellThreshold))
      smallCells++;
   }
  }
 }
 if(total!==rows||pages.length!==Math.max(1,Math.ceil(total/PAGE_SIZE)))
  return status(endpoint,'INCOMPLETE_SNAPSHOT',{pagesChecked:pages.length,reportedTotal:total,rowsChecked:rows});
 const stats={
  pagesChecked:pages.length,reportedTotal:total,rowsChecked:rows,
  smallCellRows:smallCells,geographyIssues,
  restrictedColumnsOmittedByDefault:restricted,
  restrictedFieldInstancesObserved:restrictedFieldInstances,
  stableIdentityVerified:policy.key.length>0,
  rawRowsReturned:false,personDataStorageAllowed:false,
  familyRelationshipIdentity:'UNVERIFIED'
 };
 const problems=Object.keys(issues);
 if(problems.length)return status(endpoint,'SCHEMA_OR_SCOPE_REVIEW_REQUIRED',
  {...stats,issueCounts:issues,sourceTypeIssues:[...typeIssues.values()]});
 if(endpoint==='volunteer-family')
  return status(endpoint,'UNVERIFIED_RELATION_KEY_WRITE_HOLD',stats);
 if(endpoint==='volunteer-gender')
  return status(endpoint,smallCells?'SMALL_CELL_PRIVACY_REVIEW_REQUIRED':
   'AGGREGATE_STORAGE_APPROVAL_REQUIRED',stats);
 return status(endpoint,'PERSON_DATA_STORAGE_APPROVAL_REQUIRED',stats);
}
export const EXTENDED_REPORT_ENDPOINTS=Object.freeze(Object.keys(ENDPOINTS));
