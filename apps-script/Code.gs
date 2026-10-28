/**
 * ThaiPHC Manual Sync — new receiver SOURCE ONLY.
 * Copy into the user's existing standalone Apps Script project AFTER review.
 * Default: no request accepted, no Sheets mutation, no auto-deploy.
 * Script Properties (set privately by operator):
 * THAIPHC_RECEIVER_ENABLED = true    (enable signed validate-only)
 * THAIPHC_WRITE_ENABLED = true       (separate authorized write gate)
 * THAIPHC_SPREADSHEET_ID = actual destination ID
 * THAIPHC_HMAC_KEY_B64 = random 32-byte key in standard base64
 *
 * IMPORTANT: GAS Web Apps do not expose arbitrary Authorization headers through
 * doPost(e); HMAC is carried inside the JSON body, never in a URL/query.
 */
const THAIPHC_SOURCE_SCHEMAS = {
  "subdistricts": {
    "tab": "Subdistricts",
    "key": "code",
    "max": 20,
    "names": [
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
    "kinds": [
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
    "max": 150,
    "names": [
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
    "kinds": [
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
    "max": 100,
    "names": [
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
    "kinds": [
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
const THAIPHC_COLUMNS_EXTRA = [
  '_schema_version','_sync_run_id','_source_key','_fetched_at_utc',
  '_quality_status','_field_presence_json','_last_seen_run_id','_row_digest'
];
const THAIPHC_WIRE_KEYS = ['version','timestamp','nonce','payloadB64','signature'];
const THAIPHC_BATCH_KEYS = [
  'schemaVersion','mode','endpoint','scope','runId','fetchedAtUtc',
  'sourceFieldNames','rows'
];
const THAIPHC_ROW_KEYS = ['key','values','presence'];
const THAIPHC_MAX_BODY = 700000;
const THAIPHC_MAX_CELL = 32767;
function tphHas_(o,k){return Object.prototype.hasOwnProperty.call(o,k);}
function tphObj_(o){return o!==null&&typeof o==='object'&&!Array.isArray(o)&&
 (Object.getPrototypeOf(o)===Object.prototype||Object.getPrototypeOf(o)===null);}
function tphKeys_(o,expected){
 return tphObj_(o)&&Object.keys(o).length===expected.length&&
 Object.keys(o).every(k=>expected.indexOf(k)!==-1);
}
function tphText_(v){
 return typeof v==='string'&&v.length<=THAIPHC_MAX_CELL&&
 !/[\u0000-\u001f\u007f]/.test(v)&&!/^\s*[=+\-@]/.test(v);
}
function tphFail_(code){throw new Error(code);}
function tphCompare_(a,b){
 if(!Array.isArray(a)||!Array.isArray(b)||a.length!==32||b.length!==32)return false;
 let v=0;for(let i=0;i<32;i++)v|=(a[i]&255)^(b[i]&255);
 return v===0;
}
function tphResponse_(status,extra){
 const reply={protocol:'THAIPHC_SYNC_V1',status,
  accepted:status==='VALIDATED'||status==='COMMITTED',
  sheetsWrites:status==='COMMITTED'?(extra.sheetsWrites||0):0};
 if(status==='VALIDATED'||status==='COMMITTED'){
  reply.endpoint=extra.endpoint;
  reply.rowCount=extra.rowCount;
  reply.inserted=extra.inserted||0;
  reply.updated=extra.updated||0;
  reply.unchanged=extra.unchanged||0;
 }
 return ContentService.createTextOutput(JSON.stringify(reply))
  .setMimeType(ContentService.MimeType.JSON);
}
// doGet intentionally does not reveal configuration or enable any diagnostics.
function doGet(){return tphResponse_('METHOD_DISABLED',{});}
/**
 * HTTP entrance: fail closed by default. Apps Script ContentService usually
 * returns HTTP 200 even on logical failure; callers MUST check accepted/status.
 */
function doPost(e){
 const props=PropertiesService.getScriptProperties();
 if(props.getProperty('THAIPHC_RECEIVER_ENABLED')!=='true')
  return tphResponse_('INGRESS_DISABLED',{});
 let lock=null;
 try{
  const raw=e&&e.postData&&e.postData.contents;
  if(typeof raw!=='string'||raw.length===0||raw.length>THAIPHC_MAX_BODY)
   return tphResponse_('INVALID_ENVELOPE',{});
  const wire=JSON.parse(raw);
  if(!tphKeys_(wire,THAIPHC_WIRE_KEYS)||
     wire.version!=='THAIPHC_SYNC_V1'||
     !Number.isSafeInteger(wire.timestamp)||
     Math.abs(Date.now()-wire.timestamp)>300000||
     typeof wire.nonce!=='string'||!/^[A-Za-z0-9_-]{16,64}$/.test(wire.nonce)||
     typeof wire.payloadB64!=='string'||wire.payloadB64.length>550000||
     !/^[A-Za-z0-9+/]+={0,2}$/.test(wire.payloadB64)||
     typeof wire.signature!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(wire.signature))
   return tphResponse_('INVALID_ENVELOPE',{});
  const secret=props.getProperty('THAIPHC_HMAC_KEY_B64');
  if(typeof secret!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(secret))
   return tphResponse_('NOT_CONFIGURED',{});
  const signing='THAIPHC_SYNC_V1\n'+wire.timestamp+'\n'+wire.nonce+'\n'+wire.payloadB64;
  const expected=Utilities.computeHmacSha256Signature(
   Utilities.newBlob(signing).getBytes(),Utilities.base64Decode(secret));
  if(!tphCompare_(expected,Utilities.base64Decode(wire.signature)))
   return tphResponse_('AUTH_FAILED',{});
  const batch=JSON.parse(Utilities.newBlob(Utilities.base64Decode(wire.payloadB64))
   .getDataAsString('UTF-8'));
  // Extended reports use a separate PRIVATE workbook and an independent
  // person-data enable switch. Existing three reference routes are unchanged.
  const isReport=batch&&typeof batch.mode==='string'&&
   ['report-start','report-chunk','report-finalize'].includes(batch.mode);
  const validated=isReport?tphReportValidate_(batch):tphValidate_(batch);
  if((validated.mode==='commit'||isReport)&&
     props.getProperty('THAIPHC_WRITE_ENABLED')!=='true')
   return tphResponse_('WRITE_DISABLED',{});
  if(isReport&&props.getProperty('THAIPHC_PERSON_DATA_WRITE_ENABLED')!=='true')
   return tphResponse_('PERSON_DATA_WRITE_DISABLED',{});
  lock=LockService.getScriptLock();
  if(!lock.tryLock(10000))return tphResponse_('LOCK_BUSY',{});
  // Short-lived replay guard; not a durable request ledger. Keyed upsert provides
  // idempotency for identical source snapshots, but old-data rollback needs controls.
  const cache=CacheService.getScriptCache();
  const replayKey='tph-nonce-'+wire.nonce;
  if(cache.get(replayKey))return tphResponse_('REPLAY_REJECTED',{});
  cache.put(replayKey,'1',600);
  if(validated.mode==='validate')
   return tphResponse_('VALIDATED',{endpoint:validated.endpoint,rowCount:validated.rows.length});
  if(isReport)return tphRHandle_(validated,props);
  if(props.getProperty('THAIPHC_SPREADSHEET_ID')===null||
     !/^[A-Za-z0-9_-]{25,120}$/.test(props.getProperty('THAIPHC_SPREADSHEET_ID')))
   return tphResponse_('NOT_CONFIGURED',{});
  const result=tphWrite_(validated,props.getProperty('THAIPHC_SPREADSHEET_ID'));
  return tphResponse_('COMMITTED',result);
 }catch(_){
  // Never echo source records, token, configuration, native exception or IDs.
  return tphResponse_('REJECTED',{});
 }finally{
  if(lock)try{lock.releaseLock();}catch(_){}
 }
}
function tphCell_(kind,value,state){
 if(state==='ABSENT')return value===null;
 if(state==='NULL')return value===null&&(kind==='null_only'||kind==='string_or_null');
 if(state!=='VALUE'||value===null||kind==='null_only')return false;
 if(kind==='string'||kind==='string_or_null')return tphText_(value);
 if(kind==='integer')return Number.isSafeInteger(value);
 if(kind==='number')return typeof value==='number'&&Number.isFinite(value);
 if(kind==='object'||kind==='array'){
  if(!tphText_(value))return false;
  try{
   const decoded=JSON.parse(value);
   return kind==='array'?Array.isArray(decoded):tphObj_(decoded);
  }catch(_){return false;}
 }
 return false;
}
function tphScope_(api,o){
 if(api==='subdistricts')
  return typeof o.code==='string'&&/^54060[1-8]$/.test(o.code)&&
   o.district_code==='5406';
 if(api==='villages')
  return typeof o.code==='string'&&/^54060[1-8]\d{3}$/.test(o.code)&&
   o.province_code==='54'&&o.district_code==='5406'&&
   o.subdistrict_code===o.code.slice(0,6);
 if(api==='health-services'){
  try{
   const province=JSON.parse(o.province),district=JSON.parse(o.district);
   const subdistrict=JSON.parse(o.subdistrict);
   return province.province_code==='54'&&district.district_code==='5406'&&
    /^54060[1-8]$/.test(subdistrict.subdistrict_code)&&
    typeof o.health_service_code==='string'&&o.health_service_code.length>0&&
    typeof o.latitude==='number'&&o.latitude>=-90&&o.latitude<=90&&
    typeof o.longitude==='number'&&o.longitude>=-180&&o.longitude<=180;
  }catch(_){return false;}
 }
 return false;
}
/**
 * Pure validator, called only AFTER signature verification.
 * No Google Sheets access or mutation.
 */
function tphValidate_(b){
 if(!tphKeys_(b,THAIPHC_BATCH_KEYS)||
    b.schemaVersion!=='0.1.0'||(b.mode!=='validate'&&b.mode!=='commit')||
    !tphKeys_(b.scope,['provinceCode','districtCode'])||
    b.scope.provinceCode!=='54'||b.scope.districtCode!=='5406'||
    !/^[A-Za-z0-9_-]{8,64}$/.test(b.runId||'')||
    typeof b.fetchedAtUtc!=='string'||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(b.fetchedAtUtc)||
    !Number.isFinite(Date.parse(b.fetchedAtUtc)))
  tphFail_('INVALID_BATCH');
 if(!tphHas_(THAIPHC_SOURCE_SCHEMAS,b.endpoint))
  tphFail_('DATASET_DISABLED');
 const spec=THAIPHC_SOURCE_SCHEMAS[b.endpoint];
 if(!Array.isArray(b.sourceFieldNames)||
    b.sourceFieldNames.length!==spec.names.length||
    b.sourceFieldNames.some((x,i)=>x!==spec.names[i])||
    !Array.isArray(b.rows)||b.rows.length===0||b.rows.length>spec.max)
  tphFail_('INVALID_BATCH');
 const seen=new Set(),rows=[];
 for(const r of b.rows){
  if(!tphKeys_(r,THAIPHC_ROW_KEYS)||!Array.isArray(r.values)||
     r.values.length!==spec.names.length||!tphKeys_(r.presence,spec.names)||
     !tphText_(r.key)||r.key.length===0)
   tphFail_('INVALID_ROW');
  const keyIdx=spec.names.indexOf(spec.key);
  if(r.values[keyIdx]!==r.key||r.presence[spec.key]!=='VALUE'||
     seen.has(r.key))tphFail_('INVALID_KEY');
  seen.add(r.key);
  const byName=Object.create(null);
  for(let j=0;j<spec.names.length;j++){
   const name=spec.names[j];
   if(!tphCell_(spec.kinds[j],r.values[j],r.presence[name]))
    tphFail_('INVALID_CELL');
   byName[name]=r.values[j];
  }
  if(!tphScope_(b.endpoint,byName))tphFail_('SCOPE_MISMATCH');
  rows.push({key:r.key,values:r.values,presence:r.presence});
 }
 return {mode:b.mode,endpoint:b.endpoint,spec,rows,runId:b.runId,
  fetchedAtUtc:b.fetchedAtUtc};
}
function tphHex_(bytes){
 return bytes.map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');
}
function tphSourceRow_(item,b){
 const p=JSON.stringify(item.presence);
 if(!tphText_(p))tphFail_('INVALID_PRESENCE');
 const raw=JSON.stringify([item.values,item.presence]);
 const digest=tphHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
  Utilities.newBlob(raw).getBytes()));
 return item.values.map(v=>v===null?'':v).concat([
  '0.1.0',b.runId,item.key,b.fetchedAtUtc,'VALID',p,b.runId,digest
 ]);
}
/**
 * One configured destination spreadsheet; never opens/edits any other tabs.
 * Existing keyed rows are updated in place and missing keys appended; no deletes.
 * Not a transaction: backing up the Sheet before first enable is mandatory.
 */
function tphWrite_(b,spreadsheetId){
 const spreadsheet=SpreadsheetApp.openById(spreadsheetId),spec=b.spec;
 const headers=spec.names.concat(THAIPHC_COLUMNS_EXTRA);
 let sheet=spreadsheet.getSheetByName(spec.tab);
 if(!sheet){
  sheet=spreadsheet.insertSheet(spec.tab);
  // A newly inserted Google Sheet may have only 26 default columns.
  // Villages requires 20 source + 8 metadata = 28; grow ONLY this newly
  // created target tab before accessing any out-of-bounds header range.
  // Never resize or mutate an existing unrelated/user-authored sheet.
  const currentColumns=sheet.getMaxColumns();
  if(currentColumns<headers.length)
   sheet.insertColumnsAfter(currentColumns,headers.length-currentColumns);
  sheet.getRange(1,1,1,headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  const textColumns=[];
  for(let c=0;c<spec.names.length;c++){
   if(spec.kinds[c]==='string'||spec.kinds[c]==='string_or_null'||
      spec.kinds[c]==='null_only'||spec.kinds[c]==='object'||spec.kinds[c]==='array')
    textColumns.push(c+1);
  }
  for(let c=spec.names.length+1;c<=headers.length;c++)textColumns.push(c);
  for(const c of textColumns){
   sheet.getRange(2,c,Math.max(1,sheet.getMaxRows()-1),1).setNumberFormat('@');
  }
 }
 const colCount=headers.length;
 if(sheet.getLastColumn()!==colCount||sheet.getLastRow()<1)
  tphFail_('HEADER_MISMATCH');
 const currentHeader=sheet.getRange(1,1,1,colCount).getValues()[0];
 if(currentHeader.some((x,i)=>x!==headers[i]))tphFail_('HEADER_MISMATCH');
 const rowCount=sheet.getLastRow()-1;
 if(rowCount>5000)tphFail_('DESTINATION_TOO_LARGE');
 const existing=rowCount?sheet.getRange(2,1,rowCount,colCount).getValues():[];
 const keyPos=spec.names.length+2; // _source_key (0-based position)
 const digestPos=spec.names.length+7; // _row_digest (0-based)
 const index=new Map();
 for(let i=0;i<existing.length;i++){
  const key=existing[i][keyPos];
  if(typeof key!=='string'||key.length===0||index.has(key))
   tphFail_('INVALID_EXISTING_KEY');
  index.set(key,i+2);
 }
 let inserted=0,updated=0,unchanged=0;
 const additions=[];
 for(const item of b.rows){
  const values=tphSourceRow_(item,b);
  const at=index.get(item.key);
  if(at===undefined){
   additions.push(values);inserted++;
  }else if(existing[at-2][digestPos]===values[digestPos]){
   unchanged++;
  }else{
   // Existing data rows are individually updated; unrelated rows never rewritten.
   sheet.getRange(at,1,1,colCount).setValues([values]);updated++;
  }
 }
 if(additions.length){
  const start=sheet.getLastRow()+1;
  if(start+additions.length-1>sheet.getMaxRows())
   sheet.insertRowsAfter(sheet.getMaxRows(),start+additions.length-1-sheet.getMaxRows());
  sheet.getRange(start,1,additions.length,colCount).setValues(additions);
 }
 SpreadsheetApp.flush();
 return {endpoint:b.endpoint,rowCount:b.rows.length,sheetsWrites:updated+(inserted?1:0),
  inserted,updated,unchanged};
}
