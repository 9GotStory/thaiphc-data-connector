// F010 final release candidate: a deterministic, OFFLINE-ONLY planning gate.
// This module never reads credentials, calls ThaiPHC, or communicates with GAS/Sheets.
// A plan is NOT authorization for a live read or write.
const REFERENCE = Object.freeze([
  Object.freeze({api:'subdistricts',tab:'Subdistricts',observedRows:8,phase:'PREVIOUSLY_ACCEPTED_RECHECK_ONLY',sourceTotal:'UNPAGINATED_NO_AUTHORITATIVE_TOTAL',key:'code'}),
  Object.freeze({api:'villages',tab:'Villages',observedRows:85,phase:'PREVIOUSLY_ACCEPTED_RECHECK_ONLY',sourceTotal:'UNPAGINATED_NO_AUTHORITATIVE_TOTAL',key:'code'}),
  Object.freeze({api:'health-services',tab:'HealthServices',observedRows:18,phase:'PREVIOUSLY_ACCEPTED_RECHECK_ONLY',sourceTotal:'PAGINATED_TOTAL_REQUIRED',key:'health_service_code'})
]);
const PERSON = Object.freeze(['assignments','volunteer-family','resigned-volunteers','volunteer-tenure']);
const METADATA = Object.freeze([
  '_schema_version','_sync_run_id','_source_key','_fetched_at_utc',
  '_quality_status','_field_presence_json','_last_seen_run_id','_row_digest'
]);
function reject(){throw Error('FINAL_RELEASE_CONTRACT_INVALID');}
function validObject(x){return x!==null&&typeof x==='object'&&!Array.isArray(x);}
function validIdentifier(x){return typeof x==='string'&&/^[A-Za-z0-9_-]{20,160}$/.test(x);}
export function buildFinalUatReleasePlan(manifest,targets){
  if(!validObject(manifest)||!validObject(targets)||!Array.isArray(manifest.datasets)||
     manifest.datasets.length!==8||!Array.isArray(manifest.metadata_columns)||
     manifest.metadata_columns.length!==METADATA.length)reject();
  if(!validIdentifier(targets.spreadsheetId)||!validIdentifier(targets.scriptId)||
     !validIdentifier(targets.deploymentId)||
     !targets.deploymentId.startsWith('AKfy'))reject();
  const metadata=manifest.metadata_columns.map(x=>x?.name);
  if(JSON.stringify(metadata)!==JSON.stringify(METADATA))reject();
  const byName=new Map();
  for(const dataset of manifest.datasets){
    if(!validObject(dataset)||typeof dataset.api!=='string'||byName.has(dataset.api)||
       !Array.isArray(dataset.fields)||dataset.fields.length===0)reject();
    byName.set(dataset.api,dataset);
  }
  for(const policy of REFERENCE){
    const data=byName.get(policy.api);
    if(!data||data.tab!==policy.tab||data.gate!=='ELIGIBLE_AFTER_APPROVAL'||
       !Array.isArray(data.candidate)||data.candidate.length!==1||
       data.candidate[0]!==policy.key||data.fields.some(f=>!f.source_field||!f.column))
      reject();
  }
  const gender=byName.get('volunteer-gender');
  if(!gender||gender.tab!=='VolunteerGender'||
     gender.gate!=='ELIGIBLE_AFTER_PRIVACY_REVIEW')reject();
  for(const api of PERSON){
    if(!byName.has(api)||byName.get(api).gate!=='PERSON_DATA_APPROVAL_REQUIRED')
      reject();
  }
  return Object.freeze({
    mode:'FINAL_UAT_RELEASE_PLAN_OFFLINE',
    status:'FINAL_UAT_EXECUTION_NOT_AUTHORIZED',
    sourceOfTruth:'PINNED_REPOSITORY_MANIFEST_ONLY',
    targetConfiguration:'PINNED_IDENTIFIERS_PRESENT_NOT_LIVE_VERIFIED',
    // These counts are historical guards, not current source API totals.
    referenceDatasets:Object.freeze(REFERENCE.map(d=>Object.freeze({...d,countsAreHistorical:true,liveReadback:'NOT_CHECKED_BY_PLAN'}))),
    restrictedDatasets:Object.freeze(['volunteer-gender',...PERSON].map(api=>Object.freeze({
      api,status:'PRIVATE_SNAPSHOT_APPROVAL_REQUIRED',
      command:'private-report-commit',snapshotMode:'COMPLETE_VERSIONED_SNAPSHOT',
      sourceGeographyReconciliationRequired:api==='volunteer-family',
      liveReadback:'NOT_CHECKED_BY_PLAN'
    }))),
    finalWindow:Object.freeze({
      independentlyApproveSourceRights:true,
      explicitProductOwnerWriteAuthorizationRequired:true,
      verifyLiveScriptPropertiesAndTarget:true,
      verifyDestinationBeforeEachAttempt:true,
      separateRestrictedReportWorkbookRequired:true,
      accessAndRetentionApprovalRequired:true,
      oneInvocationPerApprovedReport:true,
      onePostAttemptPerSignedStage:true,
      neverRetryUnknownOutcome:true,
      independentSheetsReadbackRequired:true,
      requiredSwitches:Object.freeze([
        'THAIPHC_RECEIVER_ENABLED','THAIPHC_WRITE_ENABLED',
        'THAIPHC_PERSON_DATA_WRITE_ENABLED'
      ]),
      allThreeSwitchesOffBeforeUpdateAndAfterEveryAttempt:true,
      verifyAllThreeAcceptedReferencesWithoutResending:true
    }),
    sourceNetworkRequests:0,appsScriptPosts:0,sheetsWrites:0,
    liveVerificationPerformed:false,writeAuthorized:false
  });
}
