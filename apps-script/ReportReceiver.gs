/**
 * F010 private-report receiver. Must be co-deployed in the SAME reviewed Apps
 * Script V3 as Code.gs. No doPost/doGet defined here.
 * Requires THAIPHC_PERSON_DATA_WRITE_ENABLED, RECEIVER_ENABLED, WRITE_ENABLED,
 * and dedicated THAIPHC_REPORT_SPREADSHEET_ID (MUST be a different, privately
 * shared workbook from the existing reference-data target).
 * Published report data is versioned; only _ThaiPHCReportCurrent resolves the
 * current complete snapshot. Unfinished sheets are hidden, NOT access control.
 */
const THAIPHC_REPORT_SCHEMAS = {
  "volunteer-gender": {
    "fields": [
      "provinceCode",
      "provinceName",
      "districtCode",
      "districtName",
      "subdistrictCode",
      "subdistrictName",
      "villageCode",
      "villageNo",
      "villageName",
      "total",
      "male",
      "female"
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
      "integer",
      "integer",
      "integer"
    ],
    "prefix": "RGender_",
    "identity": "VILLAGE_CODE"
  },
  "assignments": {
    "fields": [
      "provinceCode",
      "provinceNameTh",
      "districtCode",
      "districtNameTh",
      "subdistrictCode",
      "subdistrictNameTh",
      "villageNo",
      "villageName",
      "isActive",
      "status",
      "osmStatus",
      "osmShowbbody",
      "approvalStatus",
      "volunteerStatus",
      "createdAt",
      "requestDate",
      "updatedAt"
    ],
    "kinds": [
      "string",
      "string",
      "string",
      "string",
      "string",
      "string",
      "string",
      "null_only",
      "boolean",
      "string",
      "string",
      "string",
      "string",
      "string",
      "string",
      "string",
      "string"
    ],
    "prefix": "RAssign_",
    "identity": "HMAC_SHA256_PERSON_ID"
  },
  "volunteer-family": {
    "fields": [
      "provinceCode",
      "provinceName",
      "districtCode",
      "districtName",
      "subdistrictCode",
      "subdistrictName",
      "villageCode",
      "villageNo",
      "villageName",
      "gender",
      "status",
      "statusLabel"
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
      "string",
      "string",
      "string"
    ],
    "prefix": "RFamily_",
    "identity": "RUN_SCOPED_SNAPSHOT_ORDINAL_NO_UPSERT"
  },
  "resigned-volunteers": {
    "fields": [
      "retirementDate",
      "retirementReason",
      "osmStatus",
      "volunteerStatus",
      "approvalStatus",
      "provinceCode",
      "provinceName",
      "districtCode",
      "districtName",
      "subdistrictCode",
      "subdistrictName",
      "villageCode",
      "villageNo",
      "villageName"
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
      "string",
      "string",
      "string",
      "string",
      "string"
    ],
    "prefix": "RResign_",
    "identity": "HMAC_SHA256_PERSON_ID"
  },
  "volunteer-tenure": {
    "fields": [
      "startYear",
      "tenureYears",
      "osmYear",
      "approvalDate",
      "retirementDate",
      "retirementReason",
      "osmStatus",
      "provinceCode",
      "provinceName",
      "districtCode",
      "districtName",
      "subdistrictCode",
      "subdistrictName",
      "villageCode",
      "villageNo",
      "villageName"
    ],
    "kinds": [
      "integer",
      "integer",
      "integer",
      "string",
      "null_only",
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
      "string"
    ],
    "prefix": "RTenure_",
    "identity": "HMAC_SHA256_PERSON_ID"
  }
};
const TPH_REPORT_PROTOCOL='THAIPHC_REPORT_STAGE_V1';
const TPH_REPORT_FIELDS=['districtCode'];
const TPH_REPORT_CURRENT='_ThaiPHCReportCurrent';
const TPH_REPORT_CURRENT_HEADERS=['endpoint','run_id','snapshot_sheet','row_count','manifest_digest'];
function tphRFail_(){throw new Error('REPORT_REJECTED');}
function tphRHash_(s){
 return tphHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
   Utilities.newBlob(s).getBytes()));
}
function tphRExact_(obj,fields){return tphKeys_(obj,fields);}
function tphRSchema_(endpoint){
 if(!tphHas_(THAIPHC_REPORT_SCHEMAS,endpoint))tphRFail_();
 return THAIPHC_REPORT_SCHEMAS[endpoint];
}
function tphRName_(endpoint,runId){
 const spec=tphRSchema_(endpoint);
 if(!/^[A-Za-z0-9_-]{8,64}$/.test(runId))tphRFail_();
 const name=spec.prefix+runId;
 if(name.length>95)tphRFail_();
 return name;
}
function tphRResponse_(status,body){
 const obj={protocol:'THAIPHC_SYNC_V1',status,
  accepted:['REPORT_STARTED','REPORT_CHUNK_STAGED','REPORT_FINALIZED'].indexOf(status)!==-1,
  endpoint:body.endpoint,runId:body.runId,
  sheetsWrites:body.sheetsWrites||0};
 if(body.ordinal)obj.ordinal=body.ordinal;
 if(body.rowCount!==undefined)obj.rowCount=body.rowCount;
 return ContentService.createTextOutput(JSON.stringify(obj))
  .setMimeType(ContentService.MimeType.JSON);
}
function tphRManifest_(b){
 const spec=tphRSchema_(b.endpoint);
 if(!Array.isArray(b.destinationFields)||
    JSON.stringify(b.destinationFields)!==JSON.stringify(spec.fields)||
    b.sourceIdentityStrategy!==spec.identity||
    !Number.isSafeInteger(b.sourceRows)||b.sourceRows<1||b.sourceRows>2500||
    !Number.isSafeInteger(b.chunkCount)||b.chunkCount!==Math.ceil(b.sourceRows/25)||
    !Array.isArray(b.chunkDigests)||b.chunkDigests.length!==b.chunkCount||
    b.chunkDigests.some(x=>typeof x!=='string'||!/^[a-f0-9]{64}$/.test(x)))
  tphRFail_();
 const m={version:TPH_REPORT_PROTOCOL,endpoint:b.endpoint,runId:b.runId,
  sourceIdentityStrategy:b.sourceIdentityStrategy,
  sourceRows:b.sourceRows,chunkCount:b.chunkCount,
  destinationFields:b.destinationFields,chunkDigests:b.chunkDigests};
 return m;
}
function tphReportValidate_(b){
 if(!tphObj_(b)||b.schemaVersion!=='0.2.0'||
    !['report-start','report-chunk','report-finalize'].includes(b.mode)||
    !/^[A-Za-z0-9_-]{8,64}$/.test(b.runId||'')||
    !tphRExact_(b.scope,['provinceCode','districtCode'])||
    b.scope.provinceCode!=='54'||b.scope.districtCode!=='5406')
  tphRFail_();
 const spec=tphRSchema_(b.endpoint);
 if(b.mode==='report-start'){
  if(!tphRExact_(b,['schemaVersion','mode','endpoint','scope','runId',
       'sourceIdentityStrategy','sourceRows','chunkCount','destinationFields',
       'chunkDigests','manifestDigest']))tphRFail_();
  const m=tphRManifest_(b);
  if(tphRHash_(JSON.stringify(m))!==b.manifestDigest)tphRFail_();
 }else if(b.mode==='report-chunk'){
  if(!tphRExact_(b,['schemaVersion','mode','endpoint','scope','runId',
     'manifestDigest','ordinal','rowOffset','rowCount','digest','rows'])||
     !Number.isSafeInteger(b.ordinal)||b.ordinal<1||b.ordinal>100||
     !Number.isSafeInteger(b.rowOffset)||b.rowOffset!==(b.ordinal-1)*25||
     !Number.isSafeInteger(b.rowCount)||b.rowCount<1||b.rowCount>25||
     !Array.isArray(b.rows)||b.rows.length!==b.rowCount||
     !/^[a-f0-9]{64}$/.test(b.digest||'')||
     !/^[a-f0-9]{64}$/.test(b.manifestDigest||''))
    tphRFail_();
  const seen=new Set();
  for(const row of b.rows){
   if(!tphRExact_(row,['key','values'])||
      !tphText_(row.key)||row.key.length<5||seen.has(row.key)||
      !tphRExact_(row.values,spec.fields))tphRFail_();
   seen.add(row.key);
   for(let i=0;i<spec.fields.length;i++){
    const field=spec.fields[i],v=row.values[field],kind=spec.kinds[i];
    const nullable=(b.endpoint==='volunteer-gender'&&
      ['male','female','total'].includes(field))||
      kind==='null_only'||kind==='string_or_null';
    if(v===null){if(!nullable)tphRFail_();}
    else if(kind==='integer'&&!Number.isSafeInteger(v))tphRFail_();
    else if(kind==='boolean'&&typeof v!=='boolean')tphRFail_();
    else if((kind==='string'||kind==='string_or_null')&&!tphText_(v))tphRFail_();
    else if(!['integer','boolean','string','string_or_null'].includes(kind))
      tphRFail_();
   }
   if(row.values.districtCode!=='5406')tphRFail_();
   if(b.endpoint==='volunteer-gender'){
    if(row.key!==row.values.villageCode||
      !/^54060[1-8]\d{3}$/.test(row.key)||
      row.values.provinceCode!=='54')tphRFail_();
    const male=row.values.male,female=row.values.female,total=row.values.total;
    if(male===null||female===null){
     if(male!==null||female!==null)tphRFail_();
    }else if(!Number.isSafeInteger(male)||!Number.isSafeInteger(female)||
      male<5||female<5||!Number.isSafeInteger(total)||
      male+female!==total)tphRFail_();
   }else if(b.endpoint==='volunteer-family'){
    if(row.key!=='snapshot_'+b.runId+'_'+
       String(b.rowOffset+1+b.rows.indexOf(row)).padStart(5,'0'))tphRFail_();
   }else if(!/^h1_[a-f0-9]{64}$/.test(row.key))tphRFail_();
  }
  if(tphRHash_(JSON.stringify(b.rows))!==b.digest)tphRFail_();
 }else{
  if(!tphRExact_(b,['schemaVersion','mode','endpoint','scope','runId',
      'manifestDigest']))tphRFail_();
  if(!/^[a-f0-9]{64}$/.test(b.manifestDigest||''))tphRFail_();
 }
 return b;
}
function tphRReportSheet_(ss,endpoint,runId){
 return ss.getSheetByName(tphRName_(endpoint,runId));
}
function tphRLoad_(sheet,b){
 if(!sheet||sheet.getLastRow()<2||sheet.getRange(2,1,1,1).getValue()!=='_source_key')tphRFail_();
 const info=JSON.parse(sheet.getRange(1,1).getValue());
 if(info.manifestDigest!==b.manifestDigest||info.runId!==b.runId||
    info.endpoint!==b.endpoint||info.status!=='STAGING')tphRFail_();
 const manifest=tphRManifest_(info.manifest);
 if(tphRHash_(JSON.stringify(manifest))!==b.manifestDigest)tphRFail_();
 return manifest;
}
function tphRHandle_(b,props){
 const dest=props.getProperty('THAIPHC_REPORT_SPREADSHEET_ID');
 const reference=props.getProperty('THAIPHC_SPREADSHEET_ID');
 if(typeof dest!=='string'||!/^[A-Za-z0-9_-]{25,120}$/.test(dest)||
    dest===reference) return tphRResponse_('REPORT_DESTINATION_NOT_CONFIGURED',b);
 const ss=SpreadsheetApp.openById(dest),spec=tphRSchema_(b.endpoint);
 let sheet=tphRReportSheet_(ss,b.endpoint,b.runId);
 if(b.mode==='report-start'){
  if(sheet)return tphRResponse_('REPORT_ALREADY_EXISTS_STOP',b);
  sheet=ss.insertSheet(tphRName_(b.endpoint,b.runId));
  const columns=spec.fields.length+2;
  if(sheet.getMaxColumns()<columns)
   sheet.insertColumnsAfter(sheet.getMaxColumns(),columns-sheet.getMaxColumns());
  const meta={endpoint:b.endpoint,runId:b.runId,manifestDigest:b.manifestDigest,
   status:'STAGING',manifest:({
    version:TPH_REPORT_PROTOCOL,endpoint:b.endpoint,runId:b.runId,
    sourceIdentityStrategy:b.sourceIdentityStrategy,sourceRows:b.sourceRows,
    chunkCount:b.chunkCount,destinationFields:b.destinationFields,
    chunkDigests:b.chunkDigests
   })};
  sheet.getRange(1,1).setValue(JSON.stringify(meta));
  sheet.getRange(2,1,1,columns).setValues([['_source_key'].concat(spec.fields,['__canonical_json'])]);
  sheet.setFrozenRows(2);
  // Preserve province, district and village identifiers as plain text.
  for(let c=1;c<=columns;c++){
   if(c===1||c===columns||!['integer','boolean'].includes(spec.kinds[c-2]))
    sheet.getRange(3,c,Math.max(1,sheet.getMaxRows()-2),1).setNumberFormat('@');
  }
  sheet.hideSheet();
  SpreadsheetApp.flush();
  return tphRResponse_('REPORT_STARTED',{...b,sheetsWrites:2,rowCount:0});
 }
 const m=tphRLoad_(sheet,b);
 if(b.mode==='report-chunk'){
  if(b.ordinal>m.chunkCount||b.digest!==m.chunkDigests[b.ordinal-1]||
     b.rowOffset+b.rowCount>m.sourceRows||
     b.rowCount!==Math.min(25,m.sourceRows-b.rowOffset))
    tphRFail_();
  // Exactly-once forward progress; replay/ambiguous outcomes require readback.
  if(sheet.getLastRow()!==b.rowOffset+2)
    return tphRResponse_('REPORT_CHUNK_ORDER_STOP',b);
  const colCount=spec.fields.length+2;
  const block=b.rows.map(r=>[r.key].concat(spec.fields.map(f=>r.values[f]===null?'':r.values[f]),[JSON.stringify(r)]));
  if(sheet.getMaxRows()<sheet.getLastRow()+block.length)
    sheet.insertRowsAfter(sheet.getMaxRows(),sheet.getLastRow()+block.length-sheet.getMaxRows());
  sheet.getRange(b.rowOffset+3,1,b.rowCount,colCount).setValues(block);
  SpreadsheetApp.flush();
  return tphRResponse_('REPORT_CHUNK_STAGED',{...b,sheetsWrites:1});
 }
 // Never mark active unless EVERY staged chunk and digest has been independently
 // reconstructed from the persisted snapshot (not from received requests).
 if(sheet.getLastRow()!==m.sourceRows+2)
  return tphRResponse_('REPORT_INCOMPLETE_STOP',b);
 const cols=spec.fields.length+2;
 const staged=sheet.getRange(3,1,m.sourceRows,cols).getValues();
 const keys=new Set();
 for(let i=0;i<staged.length;i++){
  const key=staged[i][0];
  if(typeof key!=='string'||keys.has(key))tphRFail_();
  keys.add(key);
 }
 for(let start=0,ord=0;start<staged.length;start+=25,ord++){
  const part=staged.slice(start,start+25).map(r=>{
   // Canonical JSON preserves NULL vs empty-string distinction. Independent
   // per-column comparison ensures sheet rows match the signed source bytes.
   const canonical=JSON.parse(r[cols-1]);
   if(!tphRExact_(canonical,['key','values'])||canonical.key!==r[0]||
      !tphRExact_(canonical.values,spec.fields))tphRFail_();
   for(let j=0;j<spec.fields.length;j++){
    const v=canonical.values[spec.fields[j]],expected=v===null?'':v;
    if(r[j+1]!==expected)tphRFail_();
   }
   return canonical;
  });
  if(tphRHash_(JSON.stringify(part))!==m.chunkDigests[ord])
   return tphRResponse_('REPORT_STAGED_DIGEST_MISMATCH_STOP',b);
 }
 let current=ss.getSheetByName(TPH_REPORT_CURRENT);
 if(!current){
  current=ss.insertSheet(TPH_REPORT_CURRENT);
  current.getRange(1,1,1,5).setValues([TPH_REPORT_CURRENT_HEADERS]);
  current.setFrozenRows(1);
 }
 if(JSON.stringify(current.getRange(1,1,1,5).getValues()[0])!==
    JSON.stringify(TPH_REPORT_CURRENT_HEADERS))tphRFail_();
 let index=-1;
 const n=current.getLastRow()-1;
 if(n>0){
  const rows=current.getRange(2,1,n,5).getValues();
  for(let i=0;i<rows.length;i++){
   if(rows[i][0]===b.endpoint){
    if(index!==-1)tphRFail_();
    index=i+2;
   }
  }
 }
 // Snapshot stays private. Publish pointer last, after digest verification.
 const pointer=[b.endpoint,b.runId,sheet.getName(),m.sourceRows,b.manifestDigest];
 sheet.getRange(1,1).setValue(JSON.stringify({
  endpoint:b.endpoint,runId:b.runId,manifestDigest:b.manifestDigest,
  status:'PUBLISHED',manifest:m
 }));
 sheet.showSheet();
 SpreadsheetApp.flush();
 // THE LAST PUBLICATION ACTION: active pointer; no incomplete run is current.
 current.getRange(index<0?current.getLastRow()+1:index,1,1,5).setValues([pointer]);
 SpreadsheetApp.flush();
 return tphRResponse_('REPORT_FINALIZED',{...b,sheetsWrites:3,rowCount:m.sourceRows});
}
