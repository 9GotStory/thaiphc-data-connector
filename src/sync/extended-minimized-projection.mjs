// Feature 010 — in-memory minimized projection for five report APIs.
// NOT a sender or grant to persist. Raw names/IDs/addresses never leave here.
// Caller must not log the original pages or re-use this result as commit authority.
import {createHmac} from 'node:crypto';
import {auditExtendedSnapshot} from './extended-report-audit.mjs';

const VALID=new Set([
 'AGGREGATE_STORAGE_APPROVAL_REQUIRED',
 'SMALL_CELL_PRIVACY_REVIEW_REQUIRED',
 'PERSON_DATA_STORAGE_APPROVAL_REQUIRED',
 'UNVERIFIED_RELATION_KEY_WRITE_HOLD'
]);
const VERSION='THAIPHC_REDACTED_REPORT_V1';
function reject(){throw Error('EXTENDED_MINIMIZATION_REJECTED');}
function keyMaterial(secret){
 if(typeof secret!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(secret))reject();
 const key=Buffer.from(secret,'base64');
 if(key.length!==32||key.toString('base64')!==secret)reject();
 return key;
}
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const string=x=>typeof x==='string'&&x.length>0&&x.length<=512;
function safeValue(v){
 if(v===null||v===undefined)return null;
 if(typeof v==='string'||typeof v==='boolean'||
    (typeof v==='number'&&Number.isFinite(v)))return v;
 reject();
}
/**
 * Minimized rows are for future RESTRICTED destination design only.
 * For family, keys are run-scoped ordinals, NOT stable relation identities;
 * a future receiver must use staging-and-swap, NEVER keyed upsert.
 */
export function projectMinimizedExtendedSnapshot({
 endpoint,pages,manifest,privacyKeyB64,runId
}={}){
 const audit=auditExtendedSnapshot(endpoint,pages,manifest);
 if(!VALID.has(audit.status))reject();
 if(!string(runId)||!/^[A-Za-z0-9_-]{8,64}$/.test(runId))reject();
 const secret=keyMaterial(privacyKeyB64);
 const definition=manifest.datasets.find(d=>d.api===endpoint);
 if(!definition||!Array.isArray(definition.fields))reject();
 const safeFields=definition.fields.filter(f=>f.pii_policy==='ALLOW_ONLY_IF_DATASET_APPROVED');
 const excluded=definition.fields.filter(f=>f.pii_policy==='RESTRICTED_DEFAULT_OMIT');
 if(safeFields.length+excluded.length!==definition.fields.length)reject();
 const rows=[];
 let suppressed=0;
 for(const page of pages)for(const source of page.items){
  if(!plain(source))reject();
  const values=Object.create(null);
  for(const field of safeFields)
   values[field.column]=safeValue(source[field.source_field]);
  if(endpoint==='volunteer-gender'){
   const {male,female,total}=source;
   if([male,female,total].some(x=>x>0&&x<5)){
    // Complementary suppression: do not reveal male/female by subtraction.
    values.male=null;values.female=null;
    if(total<5)values.total=null;
    suppressed++;
   }
  }
  const index=rows.length;
  let pseudonymousKey;
  if(endpoint==='volunteer-family'){
   // Only unique WITHIN one complete snapshot, never stable across runs.
   pseudonymousKey='snapshot_'+runId+'_'+String(index+1).padStart(5,'0');
  }else if(endpoint==='volunteer-gender'){
   pseudonymousKey=String(source.villageCode);
  }else{
   const rawId=source.id;
   if(!string(rawId))reject();
   pseudonymousKey='h1_'+createHmac('sha256',secret)
    .update(VERSION+'\u0000'+endpoint+'\u0000'+rawId,'utf8')
    .digest('hex');
  }
  rows.push(Object.freeze({
   key:pseudonymousKey,
   values:Object.freeze(values)
  }));
 }
 if(rows.length!==audit.rowsChecked)reject();
 return Object.freeze({
  mode:'IN_MEMORY_MINIMIZED_REPORT_NOT_SENT',
  endpoint,runId,
  rowCount:rows.length,
  privacyState:audit.status,
  suppressedGenderRows:suppressed,
  sourceIdentityStrategy:endpoint==='volunteer-family'?
   'RUN_SCOPED_SNAPSHOT_ORDINAL_NO_UPSERT':
   endpoint==='volunteer-gender'?'VILLAGE_CODE':
   'HMAC_SHA256_PERSON_ID',
  sourceFieldsOmitted:Object.freeze(excluded.map(f=>f.source_field)),
  destinationSchema:Object.freeze(safeFields.map(f=>f.column)),
  // Purely local in-memory data. No PII direct identifiers by policy.
  rows:Object.freeze(rows),
  writeAuthorized:false,sourceNetworkRequests:0,appsScriptPosts:0,sheetsWrites:0
 });
}
