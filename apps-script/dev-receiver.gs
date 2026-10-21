// T009D: NOT DEPLOYABLE as an ingestion service. Source-only local/mock receiver.
// doPost always denies. validateMockBatch_ is for synthetic Node VM tests only.
// No SpreadsheetApp, UrlFetchApp, PropertiesService or request authentication.
const T009D_MOCK_SCHEMAS = {
  "subdistricts": {
    "tab": "Subdistricts",
    "key": "code",
    "maxRows": 20,
    "columns": [
      "code",
      "id",
      "name_th",
      "name_en",
      "postal_code",
      "label",
      "district_code",
      "district_name_th",
      "district_name_en",
      "province_code",
      "province_name_th",
      "province_name_en"
    ],
    "types": [
      "string",
      "string",
      "string",
      "string",
      "string",
      "string",
      "string",
      "string",
      "string",
      "null_only",
      "null_only",
      "null_only"
    ]
  },
  "villages": {
    "tab": "Villages",
    "key": "code",
    "maxRows": 150,
    "columns": [
      "code",
      "village_code_8digit",
      "id",
      "name_th",
      "name_en",
      "village_no",
      "metro_status",
      "label",
      "subdistrict_code",
      "subdistrict_name_th",
      "subdistrict_name_en",
      "district_code",
      "district_name_th",
      "district_name_en",
      "province_code",
      "province_name_th",
      "province_name_en",
      "health_service_code",
      "health_service_name_th",
      "health_service_name_en"
    ],
    "types": [
      "string",
      "string",
      "string",
      "string",
      "null_only",
      "integer",
      "null_only",
      "string",
      "string",
      "string",
      "string",
      "string",
      "string",
      "string",
      "string",
      "string",
      "string",
      "string_or_null",
      "string_or_null",
      "null_only"
    ]
  },
  "health-services": {
    "tab": "HealthServices",
    "key": "health_service_code",
    "maxRows": 100,
    "columns": [
      "health_service_code",
      "health_service_name_th",
      "health_service_name_en",
      "legacy_5digit_code",
      "legacy_9digit_code",
      "village_no",
      "latitude",
      "longitude",
      "health_service_type",
      "province",
      "district",
      "subdistrict",
      "service_areas",
      "created_at",
      "updated_at",
      "deleted_at"
    ],
    "types": [
      "string",
      "string",
      "null_only",
      "string",
      "string",
      "string",
      "number",
      "number",
      "object",
      "object",
      "object",
      "object",
      "array",
      "string",
      "string",
      "null_only"
    ]
  }
};
const T009D_KEYS = ['mode','intent','contractVersion','schemaVersion','endpoint',
 'tab','scope','destinationContract','snapshotCompleteness','writeAllowed',
 'sourceFieldNames','rowCount','rows'];
function t009dHas_(value,key){
 return Object.prototype.hasOwnProperty.call(value,key);
}
function t009dPlain_(obj){
 return obj!==null&&typeof obj==='object'&&!Array.isArray(obj);
}
function t009dExactKeys_(obj,keys){
 if(!t009dPlain_(obj))return false;
 const actual=Object.keys(obj);
 return actual.length===keys.length&&actual.every(k=>keys.indexOf(k)!==-1);
}
function t009dSafeText_(x){
 return typeof x==='string'&&x.length<=32767&&
  !/[\u0000-\u001f\u007f]/.test(x)&&
  !/^\s*[=+\-@]/.test(x);
}
function t009dValidCell_(value,state,kind){
 if(state==='ABSENT'||state==='NULL'){
  return value===null&&(state==='ABSENT'||
   kind==='null_only'||kind==='string_or_null');
 }
 if(state!=='VALUE'||value===null||kind==='null_only')return false;
 if(kind==='string'||kind==='string_or_null')return t009dSafeText_(value);
 if(kind==='integer')return typeof value==='number'&&Number.isSafeInteger(value);
 if(kind==='number')return typeof value==='number'&&Number.isFinite(value);
 if(kind==='object'||kind==='array'){
  if(!t009dSafeText_(value))return false;
  try{
   const parsed=JSON.parse(value);
   return kind==='array'?Array.isArray(parsed):t009dPlain_(parsed);
  }catch(_){return false;}
 }
 return false;
}
function t009dInScope_(ep,byName){
 if(ep==='subdistricts')
  return byName.code&&/^54060[1-8]$/.test(byName.code)&&
   byName.district_code==='5406';
 if(ep==='villages')
  return byName.code&&/^54060[1-8]\d{3}$/.test(byName.code)&&
   byName.subdistrict_code===byName.code.slice(0,6)&&
   byName.province_code==='54'&&byName.district_code==='5406';
 if(ep==='health-services'){
  try{
   const province=JSON.parse(byName.province);
   const district=JSON.parse(byName.district);
   const subdistrict=JSON.parse(byName.subdistrict);
   return province.province_code==='54'&&district.district_code==='5406'&&
    /^54060[1-8]$/.test(subdistrict.subdistrict_code)&&
    typeof byName.health_service_code==='string'&&
    byName.health_service_code.length>0&&
    typeof byName.latitude==='number'&&byName.latitude>=-90&&byName.latitude<=90&&
    typeof byName.longitude==='number'&&byName.longitude>=-180&&byName.longitude<=180;
  }catch(_){return false;}
 }
 return false;
}
function t009dReject_(code){
 return {mode:'SYNTHETIC_ONLY',status:'MOCK_REJECTED',
  reason:code,rowsValidated:0,writeAllowed:false,sheetsWrites:0,
  appsScriptPosts:0,actualIngress:false};
}
/**
 * Internal mock-only validator; does not return, log, mutate or retain row values.
 * No deployed endpoint invokes this function. Not an authentication boundary.
 */
function validateMockBatch_(payload){
 try{
  if(!t009dExactKeys_(payload,T009D_KEYS))
   return t009dReject_('INVALID_ENVELOPE');
  if(payload.mode!=='SYNTHETIC_ONLY'||payload.intent!=='VALIDATE_ONLY'||
     payload.contractVersion!=='T009D-MOCK-1'||payload.schemaVersion!=='0.1.0'||
     payload.destinationContract!=='UNVERIFIED'||
     payload.snapshotCompleteness!=='NOT_VERIFIED'||
     payload.writeAllowed!==false)
   return t009dReject_('UNAUTHORIZED_MODE');
  if(!t009dExactKeys_(payload.scope,['provinceCode','districtCode'])||
     payload.scope.provinceCode!=='54'||payload.scope.districtCode!=='5406')
   return t009dReject_('SCOPE_MISMATCH');
  if(!t009dHas_(T009D_MOCK_SCHEMAS,payload.endpoint))
   return t009dReject_('DATASET_DISABLED');
  const schema=T009D_MOCK_SCHEMAS[payload.endpoint];
  if(payload.tab!==schema.tab||
     !Array.isArray(payload.sourceFieldNames)||
     payload.sourceFieldNames.length!==schema.columns.length||
     payload.sourceFieldNames.some((x,i)=>x!==schema.columns[i]))
   return t009dReject_('SCHEMA_MISMATCH');
  if(!Array.isArray(payload.rows)||payload.rows.length===0||
     payload.rows.length>schema.maxRows||
     !Number.isSafeInteger(payload.rowCount)||payload.rowCount!==payload.rows.length)
   return t009dReject_('ROW_BOUNDARY_INVALID');
  // Size cap does not permit streaming, persistence or partial accepting.
  if(JSON.stringify(payload).length>524288)
   return t009dReject_('PAYLOAD_TOO_LARGE');
  const seen=new Set();
  for(const row of payload.rows){
   if(!t009dExactKeys_(row,['key','values','presence'])||
      !Array.isArray(row.values)||row.values.length!==schema.columns.length||
      !t009dExactKeys_(row.presence,schema.columns))
    return t009dReject_('ROW_SHAPE_INVALID');
   const keyPosition=schema.columns.indexOf(schema.key);
   if(!t009dSafeText_(row.key)||row.key.length===0||
      row.values[keyPosition]!==row.key||row.presence[schema.key]!=='VALUE')
    return t009dReject_('INVALID_SOURCE_KEY');
   if(seen.has(row.key))return t009dReject_('DUPLICATE_SOURCE_KEY');
   seen.add(row.key);
   const byName=Object.create(null);
   for(let j=0;j<schema.columns.length;j++){
    const name=schema.columns[j];
    if(!t009dValidCell_(row.values[j],row.presence[name],schema.types[j]))
      return t009dReject_('INVALID_FIELD');
    byName[name]=row.values[j];
   }
   if(!t009dInScope_(payload.endpoint,byName))
    return t009dReject_('GEOGRAPHIC_SCOPE_MISMATCH');
  }
  return {mode:'SYNTHETIC_ONLY',status:'MOCK_VALIDATED',
   endpoint:payload.endpoint,tab:schema.tab,rowsValidated:payload.rows.length,
   destinationContract:'UNVERIFIED',snapshotCompleteness:'NOT_VERIFIED',
   writeAllowed:false,sheetsWrites:0,appsScriptPosts:0,actualIngress:false};
 }catch(_){
  // Absolutely no exception or source value surfaced to logs or caller.
  return t009dReject_('MOCK_VALIDATION_ERROR');
 }
}
/**
 * Public HTTP entrypoint deliberately CLOSED even if this file is deployed.
 * Never parses the request, even when called with apparently valid mock data.
 */
function doPost(_event){
 return ContentService.createTextOutput(JSON.stringify({
  status:'INGRESS_DISABLED',writeAllowed:false,sheetsWrites:0
 })).setMimeType(ContentService.MimeType.JSON);
}
