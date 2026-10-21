// T009A: offline-only destination contract preflight. No network, token, row data or writes.
// This reads the checked-in T003 design manifest; it is NOT the real Apps Script contract.
import {readFileSync} from 'node:fs';

const MANIFEST_URL=new URL('../../docs/sheets-schema.json',import.meta.url);
const EXPECTED=Object.freeze({
 'assignments':['Assignments','PERSON_DATA_APPROVAL_REQUIRED'],
 'subdistricts':['Subdistricts','ELIGIBLE_AFTER_APPROVAL'],
 'villages':['Villages','ELIGIBLE_AFTER_APPROVAL'],
 'health-services':['HealthServices','ELIGIBLE_AFTER_APPROVAL'],
 'volunteer-gender':['VolunteerGender','ELIGIBLE_AFTER_PRIVACY_REVIEW'],
 'volunteer-family':['VolunteerFamily','PERSON_DATA_APPROVAL_REQUIRED'],
 'resigned-volunteers':['ResignedVolunteers','PERSON_DATA_APPROVAL_REQUIRED'],
 'volunteer-tenure':['VolunteerTenure','PERSON_DATA_APPROVAL_REQUIRED']
});
const validObject=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const nonblank=x=>typeof x==='string'&&x.length>0;
function invalid(){throw new Error('SYNC_MANIFEST_INVALID');}
export function inspectSyncDesign(manifest,endpoint='all'){
 if(!validObject(manifest)||manifest.state!=='DRAFT_DESIGN_ONLY'||
    !nonblank(manifest.version)||!Array.isArray(manifest.datasets)||
    manifest.datasets.length!==8||!Array.isArray(manifest.metadata_columns)||
    manifest.metadata_columns.length!==8)invalid();
 if(endpoint!=='all'&&!Object.hasOwn(EXPECTED,endpoint))
   throw new Error('SYNC_PLAN_ENDPOINT_NOT_SUPPORTED');
 const apiSet=new Set(),tabSet=new Set(),metadataSet=new Set();
 for(const m of manifest.metadata_columns){
  if(!validObject(m)||!nonblank(m.name)||metadataSet.has(m.name))invalid();
  metadataSet.add(m.name);
 }
 const byApi=new Map();
 for(const entry of manifest.datasets){
  if(!validObject(entry)||!nonblank(entry.api)||
     !Object.hasOwn(EXPECTED,entry.api)||apiSet.has(entry.api)||
     !nonblank(entry.tab)||tabSet.has(entry.tab)||
     entry.tab!==EXPECTED[entry.api][0]||entry.gate!==EXPECTED[entry.api][1]||
     entry.materialization!=='DESIGN_ONLY_NO_WRITES'||
     !Array.isArray(entry.candidate)||!Array.isArray(entry.fields)||
     entry.fields.length===0)invalid();
  if(entry.candidate.some(x=>!nonblank(x)))invalid();
  const columns=new Set();
  for(const f of entry.fields){
   if(!validObject(f)||!nonblank(f.source_field)||!nonblank(f.column)||
      f.source_field!==f.column||columns.has(f.column)||
      metadataSet.has(f.column)||!nonblank(f.pii_policy))invalid();
   columns.add(f.column);
  }
  if(entry.candidate.some(x=>!columns.has(x)))invalid();
  if(entry.gate==='PERSON_DATA_APPROVAL_REQUIRED'&&
     entry.fields.some(f=>!['RESTRICTED_DEFAULT_OMIT','ALLOW_ONLY_IF_DATASET_APPROVED'].includes(f.pii_policy)))invalid();
  apiSet.add(entry.api);tabSet.add(entry.tab);byApi.set(entry.api,entry);
 }
 const selection=endpoint==='all'?Object.keys(EXPECTED):[endpoint];
 const targets=selection.map(api=>{
  const e=byApi.get(api);
  if(!e)invalid();
  const blocker=e.gate==='PERSON_DATA_APPROVAL_REQUIRED'?'PERSON_DATA_DISABLED':
    e.gate==='ELIGIBLE_AFTER_PRIVACY_REVIEW'?'PRIVACY_REVIEW_REQUIRED':
    'DESTINATION_CONTRACT_REQUIRED';
  return Object.freeze({
   endpoint:api,tab:e.tab,sourceFields:e.fields.length,
   keyFields:[...e.candidate],writeAllowed:false,
   blocker,
   sourceRowTransfer:'NOT_IMPLEMENTED',
   destinationContract:'UNVERIFIED'
  });
 });
 return Object.freeze({
  mode:'OFFLINE_ONLY',command:'sync-plan',status:'HOLD',
  scope:{provinceCode:'54',districtCode:'5406'},
  schemaVersion:manifest.version,manifestState:manifest.state,
  networkRequests:0,appsScriptPosts:0,sheetsWrites:0,
  targets
 });
}
export function buildSyncPlan(endpoint='all'){
 const manifest=JSON.parse(readFileSync(MANIFEST_URL,'utf8'));
 return inspectSyncDesign(manifest,endpoint);
}
