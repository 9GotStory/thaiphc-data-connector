// T009C — pure memory-only transformation of synthetic/previously authorized
// reference rows. No transport, persistence, sheet mutation or CLI exposure.
import {inspectSyncDesign} from './preflight.mjs';

const ALLOWED=Object.freeze({
 subdistricts:{maxRows:20,key:'code'},
 villages:{maxRows:150,key:'code'},
 'health-services':{maxRows:100,key:'health_service_code'}
});
const MAX_CELL=32767;
const MAX_DEPTH=8;
const MAX_NESTED_ITEMS=150;
const SUBDISTRICT=/^54060[1-8]$/;
const VILLAGE=/^54060[1-8]\d{3}$/;
const hasOwn=(obj,key)=>Object.hasOwn(obj,key);
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
 (Object.getPrototypeOf(x)===Object.prototype||Object.getPrototypeOf(x)===null);
function reject(code){throw new Error(code);}
function stringSafe(value){
 return typeof value==='string'&&value.length<=MAX_CELL&&
  !/[\u0000-\u001f\u007f]/.test(value)&&
  !/^\s*[=+\-@]/.test(value);
}
function asJson(value,depth=0){
 if(depth>MAX_DEPTH)reject('NESTED_DEPTH_EXCEEDED');
 if(value===null)return null;
 if(typeof value==='string'){
  if(!stringSafe(value))reject('UNSAFE_TEXT');
  return value;
 }
 if(typeof value==='number'){
  if(!Number.isFinite(value))reject('INVALID_NUMBER');
  return value;
 }
 if(typeof value==='boolean')return value;
 if(Array.isArray(value)){
  if(value.length>MAX_NESTED_ITEMS)reject('NESTED_LIMIT_EXCEEDED');
  return value.map(item=>asJson(item,depth+1));
 }
 if(!plain(value))reject('INVALID_NESTED_VALUE');
 const keys=Object.keys(value).sort();
 if(keys.length>MAX_NESTED_ITEMS)reject('NESTED_LIMIT_EXCEEDED');
 const result=Object.create(null);
 for(const key of keys){
  if(!stringSafe(key))reject('INVALID_NESTED_KEY');
  result[key]=asJson(value[key],depth+1);
 }
 return result;
}
function projectField(kind,value){
 if(value===null){
  if(!['null_only','string_or_null'].includes(kind))
   reject('UNEXPECTED_NULL_FIELD');
  return null;
 }
 if(kind==='null_only')reject('UNKNOWN_NULL_ONLY_TYPE');
 if(kind==='string'||kind==='string_or_null'){
  if(!stringSafe(value))reject('INVALID_OR_UNSAFE_STRING');
  return value;
 }
 if(kind==='integer'){
  if(!Number.isSafeInteger(value))reject('INVALID_INTEGER');
  return value;
 }
 if(kind==='number'){
  if(typeof value!=='number'||!Number.isFinite(value))
   reject('INVALID_NUMBER');
  return value;
 }
 if(kind==='object'||kind==='array'){
  if(kind==='object'&&!plain(value))reject('INVALID_OBJECT');
  if(kind==='array'&&!Array.isArray(value))reject('INVALID_ARRAY');
  const text=JSON.stringify(asJson(value));
  if(typeof text!=='string'||text.length>MAX_CELL)reject('JSON_CELL_TOO_LARGE');
  return text;
 }
 reject('UNKNOWN_MANIFEST_FIELD_TYPE');
}
function inScope(endpoint,row){
 if(endpoint==='subdistricts'){
  return row.district_code==='5406'&&typeof row.code==='string'&&
   SUBDISTRICT.test(row.code);
 }
 if(endpoint==='villages'){
  return row.province_code==='54'&&row.district_code==='5406'&&
   typeof row.subdistrict_code==='string'&&SUBDISTRICT.test(row.subdistrict_code)&&
   typeof row.code==='string'&&VILLAGE.test(row.code)&&
   row.code.slice(0,6)===row.subdistrict_code;
 }
 if(endpoint==='health-services'){
  return plain(row.province)&&row.province.province_code==='54'&&
   plain(row.district)&&row.district.district_code==='5406'&&
   plain(row.subdistrict)&&SUBDISTRICT.test(row.subdistrict.subdistrict_code)&&
   typeof row.health_service_code==='string'&&row.health_service_code.length>0&&
   typeof row.latitude==='number'&&Number.isFinite(row.latitude)&&
   row.latitude>=-90&&row.latitude<=90&&
   typeof row.longitude==='number'&&Number.isFinite(row.longitude)&&
   row.longitude>=-180&&row.longitude<=180;
 }
 return false;
}
/**
 * Rows must be INJECTED BY AN AUTHORIZED CALLER. This function does NOT read source,
 * check pagination completeness, certify authorization or produce a POST payload.
 * Returned rows remain in local memory only and must not be printed/logged/exported.
 */
export function projectReferenceRows(endpoint,rows,manifest){
 if(!hasOwn(ALLOWED,endpoint))reject('REFERENCE_ONLY_ENDPOINT_REQUIRED');
 if(!Array.isArray(rows)||rows.length>ALLOWED[endpoint].maxRows)
  reject('ROW_LIMIT_EXCEEDED');
 inspectSyncDesign(manifest,endpoint); // verify all eight T003 source definitions and gates
 const definition=manifest.datasets.find(d=>d.api===endpoint);
 if(!definition||definition.gate!=='ELIGIBLE_AFTER_APPROVAL'||
    definition.candidate.length!==1||
    definition.candidate[0]!==ALLOWED[endpoint].key)
  reject('PROJECTION_MANIFEST_NOT_SUPPORTED');
 const fields=definition.fields.map(f=>f.source_field);
 const fieldSet=new Set(fields);
 const seen=new Set(),projected=[];
 let zeroCoordinateCount=0;
 for(const row of rows){
  if(!plain(row))reject('INVALID_SOURCE_ROW');
  if(Object.keys(row).some(k=>!fieldSet.has(k)))
   reject('UNEXPECTED_SOURCE_FIELD');
  if(!inScope(endpoint,row))reject('GEOGRAPHIC_SCOPE_MISMATCH');
  const key=row[ALLOWED[endpoint].key];
  if(typeof key!=='string'||!stringSafe(key)||key.length===0)
   reject('INVALID_SOURCE_KEY');
  if(seen.has(key))reject('DUPLICATE_SOURCE_KEY');
  const cells=[],presence=Object.create(null);
  for(const f of definition.fields){
   const name=f.source_field;
   if(!hasOwn(row,name)){
    if(definition.candidate.includes(name))reject('MISSING_SOURCE_KEY');
    presence[name]='ABSENT';cells.push(null);
   }else if(row[name]===null){
    presence[name]='NULL';cells.push(projectField(f.observed_kind,null));
   }else{
    presence[name]='VALUE';cells.push(projectField(f.observed_kind,row[name]));
   }
  }
  if(endpoint==='health-services'&&row.latitude===0&&row.longitude===0)
   zeroCoordinateCount++;
  seen.add(key);
  projected.push({key,values:cells,presence});
 }
 return {
  mode:'IN_MEMORY_DESIGN_ONLY',
  endpoint,tab:definition.tab,
  status:'NOT_READY_FOR_TRANSFER',destinationContract:'UNVERIFIED',
  snapshotCompleteness:'NOT_VERIFIED',writeAllowed:false,
  sourceFieldNames:fields,rows:projected,
  rowCount:projected.length,zeroCoordinateCount,
  metadataColumns:'UNIMPLEMENTED',networkRequests:0,
  appsScriptPosts:0,sheetsWrites:0
 };
}
