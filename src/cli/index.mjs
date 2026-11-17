#!/usr/bin/env node
// T005: explicit manual live read-only GET is opt-in; default commands remain offline.
import { ENDPOINTS, endpointNames } from './endpoints.mjs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { syntheticTransport } from './transport.mjs';
import { collectOffline } from './runner.mjs';
import { readMockOnlyTokenFromTTY, simulateMockBearerSession } from './manual-bearer.mjs';
import { confirmLiveUseFromTTY, readRealBearerFromTTY } from './live-tty.mjs';
import { liveFetchSubdistricts } from './live-fetch.mjs';
import { liveFetchVillages } from './live-villages.mjs';
import { liveFetchHealthServices } from './live-health-services.mjs';
import { liveFetchVolunteerGender } from './live-volunteer-gender.mjs';
import { buildSyncPlan } from '../sync/preflight.mjs';
import sheetManifest from '../../docs/sheets-schema.json' with {type:'json'};
import {randomBytes,createHmac} from 'node:crypto';
import {syntheticReferenceRow} from '../sync/synthetic-reference-row.mjs';
import {buildOfflineValidateEnvelope,buildOfflineCommitEnvelope} from '../sync/offline-validate-envelope.mjs';
import {sendSyntheticValidate,sendReferenceValidate} from '../sync/manual-validate-transport.mjs';
import {confirmSyntheticValidateFromTTY,readDestinationHmacFromTTY} from './live-tty.mjs';
import {confirmReferenceAuditFromTTY,confirmReferenceValidateTransferFromTTY} from './live-tty.mjs';
import {collectReferenceSnapshot,SNAPSHOT_CONFIRM} from '../sync/reference-snapshot.mjs';
import {sendReferenceCommit,commitPhrase} from '../sync/manual-commit-transport.mjs';
import {confirmReferenceCommitFromTTY,selectReferenceCommitFromTTY,
        confirmReferenceCommitSelectionFromTTY} from './live-tty.mjs';
import {readStoredHmac,setupStoredHmac} from './windows-hmac-store.mjs';
import {buildFinalUatReleasePlan} from '../release/final-uat-plan.mjs';
import finalTargets from '../../config/thaiphc-targets.json' with {type:'json'};
import {readExtendedReport,collectExtendedForPrivateStaging} from '../sync/extended-report-source.mjs';
import {projectMinimizedExtendedSnapshot} from '../sync/extended-minimized-projection.mjs';
import {planExtendedBatches} from '../sync/extended-batch-plan.mjs';
import {sendExtendedReport,extendedCommitPhrase} from '../sync/extended-report-transport.mjs';
import {confirmExtendedSourcePreparationFromTTY,confirmExtendedPrivateWriteFromTTY} from './live-tty.mjs';
import {confirmExtendedAuditFromTTY} from './live-tty.mjs';

const HELP='ThaiPHC Node.js 26 Manual Connector\nCommands: help | release-plan | sync-plan [--endpoint ID] | inspect [--endpoint ID] | validate [--endpoint ID] | dry-run [--endpoint ID] [--max-pages N] | auth-mock [--endpoint subdistricts] | live-fetch --endpoint subdistricts|villages|health-services|volunteer-gender --acknowledge-authorized-use | send-validate --synthetic --endpoint subdistricts|villages|health-services --acknowledge-synthetic-post | audit-source --endpoint subdistricts|villages|health-services --acknowledge-authorized-use | audit-extended --endpoint volunteer-gender|assignments|volunteer-family|resigned-volunteers|volunteer-tenure --acknowledge-authorized-use | private-report-commit --endpoint volunteer-gender|assignments|volunteer-family|resigned-volunteers|volunteer-tenure --acknowledge-private-transfer | send-reference-validate --endpoint subdistricts|villages|health-services --acknowledge-reference-validate | send-reference-commit --endpoint subdistricts|villages|health-services --acknowledge-reference-commit | commit-menu | hmac-setup\nLive-fetch requires interactive confirmation + manually pasted authorized Bearer token; bounded read-only lookups/reports (health services max 10 pages, volunteer gender max 15 pages); aggregate-only output. No Google Sheets/App Script writes. sync-plan is manifest-only and never sends rows.\nSource audit makes only explicitly confirmed ThaiPHC read-only GET(s), keeps rows in memory and outputs counts/schema/completeness metadata only; it never sends rows to Apps Script or Sheets.\naudit-extended is an opt-in READ-ONLY five-report source audit; person rows remain in memory, never printed or sent to Sheets.\nprivate-report-commit is a separately approved FINAL UAT route ONLY, and requires reviewed V3 ReportReceiver.gs, a RESTRICTED Sheet (separate by default; reusing the original needs owner-only sharing verification and exact same-workbook approval), all 3 write switches, exact full-source/row-count private TTY confirmations, staged digests and independent Sheet readback. Never retry uncertain outcomes.\nsend-reference-validate is a separately approved opt-in real-row, validate-only HTTPS POST with exact snapshot count/schema gates. Receiver must be separately approved to enable; never use for commit.\nUse hmac-setup ONCE on Windows to store the existing Web App HMAC in CurrentUser DPAPI outside the repo; commit-menu shows all 8 API topics, but only the 3 reference datasets can reach a separately approved write. READ ONLY and PERSON DATA HOLD menu items always stop with zero network. Eligible datasets require menu selection, Y, and private ThaiPHC bearer. Never run a real commit without separate PO one-endpoint authorization and independent destination inventory. The Sheet ID and Web App URL are pinned in config. After COMMITTED independently read back Sheet; never auto-retry unknown outcomes.\nrelease-plan is an OFFLINE-ONLY readiness checklist, NOT a live test or permission to commit. It verifies pinned identifiers and schema gates, marks all 111 accepted reference rows for re-read only, and lists the five private snapshots, all three OFF switches and one POST attempt per signed stage. It produces ZERO network calls.\nDefault commands and auth-mock remain fully offline. send-validate is an explicit REAL HTTPS POST of one SYNTHETIC-only validate batch to existing Web App V3, gated by hidden TTY confirmation + privately entered destination HMAC key (never ThaiPHC bearer); use only after separate live UAT approval. No commit or Sheets writes. No --token, --output, --url, or multi-endpoint live calls.';
function parseArgs(argv){
  const [command='help',...tail]=argv;
  if(!['help','release-plan','inspect','validate','dry-run','auth-mock','live-fetch','sync-plan','send-validate','audit-source','audit-extended','private-report-commit','send-reference-validate','send-reference-commit','commit-menu','hmac-setup'].includes(command))throw Error('UNSUPPORTED_COMMAND');
  let endpoint='all',maxPages=10,acknowledged=false,synthetic=false,sendAcknowledged=false,referenceAcknowledged=false,commitAcknowledged=false,privateAcknowledged=false;
  for(let i=0;i<tail.length;i++){
    const arg=tail[i];
    if(arg==='--endpoint'){
      if(i===tail.length-1)throw Error('MISSING_ENDPOINT');
      endpoint=tail[++i];
    }else if(arg==='--acknowledge-authorized-use'){
      if(acknowledged)throw Error('DUPLICATE_ACKNOWLEDGEMENT');
      acknowledged=true;
    }else if(arg==='--synthetic'){
      if(synthetic)throw Error('DUPLICATE_SYNTHETIC_FLAG');
      synthetic=true;
    }else if(arg==='--acknowledge-synthetic-post'){
      if(sendAcknowledged)throw Error('DUPLICATE_SYNTHETIC_ACK');
      sendAcknowledged=true;
    }else if(arg==='--acknowledge-reference-validate'){
      if(referenceAcknowledged)throw Error('DUPLICATE_REFERENCE_ACK');
      referenceAcknowledged=true;
    }else if(arg==='--acknowledge-reference-commit'){
      if(commitAcknowledged)throw Error('DUPLICATE_COMMIT_ACK');
      commitAcknowledged=true;
    }else if(arg==='--acknowledge-private-transfer'){
      if(privateAcknowledged)throw Error('DUPLICATE_PRIVATE_TRANSFER_ACK');
      privateAcknowledged=true;
    }else if(arg==='--max-pages'){
      if(i===tail.length-1)throw Error('MISSING_MAX_PAGES');
      const raw=tail[++i];
      if(!/^\d+$/.test(raw))throw Error('INVALID_MAX_PAGES');
      maxPages=Number(raw);
    }else throw Error('UNSUPPORTED_FLAG');
  }
  if(!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>250)throw Error('INVALID_MAX_PAGES');
  if(endpoint!=='all'&&!Object.hasOwn(ENDPOINTS,endpoint))throw Error('UNKNOWN_ENDPOINT');
  if((command==='help'||command==='inspect'||command==='auth-mock'||command==='live-fetch'||command==='sync-plan')&&tail.some(x=>x==='--max-pages'))throw Error('UNSUPPORTED_FLAG');
  if(acknowledged&&!['live-fetch','audit-source','audit-extended'].includes(command))throw Error('ACKNOWLEDGEMENT_ONLY_FOR_LIVE');
  if(referenceAcknowledged&&command!=='send-reference-validate')throw Error('REFERENCE_ACK_ONLY_FOR_SEND');
  if(commitAcknowledged&&command!=='send-reference-commit')throw Error('COMMIT_ACK_ONLY_FOR_COMMIT');
  if(privateAcknowledged&&command!=='private-report-commit')throw Error('PRIVATE_ACK_ONLY_FOR_PRIVATE_REPORT');
  if((synthetic||sendAcknowledged)&&command!=='send-validate')
    throw Error('SYNTHETIC_FLAGS_ONLY_FOR_SEND');
  if(command==='send-validate'){
    if(!synthetic||!sendAcknowledged||
      !['subdistricts','villages','health-services'].includes(endpoint)||
      tail.includes('--max-pages')||acknowledged)
      throw Error('SEND_VALIDATE_SCOPE_NOT_CONFIRMED');
  }
  if((command==='commit-menu'||command==='hmac-setup'||command==='release-plan')&&tail.length!==0)
    throw Error('MENU_OR_SETUP_TAKES_NO_FLAGS');
  if(command==='auth-mock'){
    if(endpoint==='all')endpoint='subdistricts';
    if(endpoint!=='subdistricts')throw Error('MOCK_ENDPOINT_DENIED');
  }
  if(command==='live-fetch'){
    if(!['subdistricts','villages','health-services','volunteer-gender'].includes(endpoint)||!acknowledged)throw Error('LIVE_SCOPE_OR_ACK_REQUIRED');
  }
  if(command==='audit-source'){
    if(!['subdistricts','villages','health-services'].includes(endpoint)||!acknowledged||
      tail.includes('--max-pages')||synthetic||sendAcknowledged)
      throw Error('REFERENCE_AUDIT_SCOPE_OR_ACK_REQUIRED');
  }
  if(command==='audit-extended'){
    if(!['volunteer-gender','assignments','volunteer-family',
      'resigned-volunteers','volunteer-tenure'].includes(endpoint)||!acknowledged||
       tail.includes('--max-pages')||synthetic||sendAcknowledged||
       referenceAcknowledged||commitAcknowledged)
      throw Error('EXTENDED_AUDIT_SCOPE_OR_ACK_REQUIRED');
  }
  if(command==='private-report-commit'){
    if(!['volunteer-gender','assignments','volunteer-family',
      'resigned-volunteers','volunteer-tenure'].includes(endpoint)||
      !privateAcknowledged||acknowledged||synthetic||sendAcknowledged||
      referenceAcknowledged||commitAcknowledged||
      tail.includes('--max-pages')||tail.includes('--output')||
      tail.includes('--token'))
      throw Error('PRIVATE_REPORT_SCOPE_OR_ACK_REQUIRED');
  }
  if(command==='send-reference-validate'){
    if(!['subdistricts','villages','health-services'].includes(endpoint)||
      !referenceAcknowledged||acknowledged||synthetic||sendAcknowledged||
      tail.includes('--max-pages'))
      throw Error('REFERENCE_TRANSFER_SCOPE_OR_ACK_REQUIRED');
  }
  if(command==='send-reference-commit'){
    if(!['subdistricts','villages','health-services'].includes(endpoint)||
      !commitAcknowledged||acknowledged||synthetic||sendAcknowledged||
      referenceAcknowledged||tail.includes('--max-pages'))
      throw Error('COMMIT_SCOPE_OR_ACK_REQUIRED');
  }
  return {command,endpoint,maxPages};
}
export async function main(argv=process.argv.slice(2),write=console.log,tty={}){
  try{
    const parsed=parseArgs(argv);
    if(parsed.command==='help'){write(HELP);return 0;}
    if(parsed.command==='release-plan'){
      write(JSON.stringify(buildFinalUatReleasePlan(sheetManifest,finalTargets),null,2));
      return 0; // Offline plan only; a PASS never authorizes a real request.
    }
    if(parsed.command==='sync-plan'){
      write(JSON.stringify(buildSyncPlan(parsed.endpoint),null,2));
      return 0; // Report generated; status HOLD explicitly forbids downstream writes.
    }
    if(parsed.command==='hmac-setup'){
      try{
        const setup=tty.setupStoredHmac??setupStoredHmac;
        setup({...tty});
        write('HMAC_STORED_CURRENT_USER_DPAPI');
        return 0;
      }catch{
        write('HMAC_SETUP_FAILED: use Windows interactive terminal');
        return 2;
      }
    }
    if(parsed.command==='private-report-commit'){
      const endpoint=parsed.endpoint;
      // Refuse live ThaiPHC GET until the local protected HMAC exists.
      let hmac;
      try{
        const load=tty.readStoredHmac??readStoredHmac;
        hmac=load({...tty});
        if(typeof hmac!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(hmac))
          throw Error('HMAC_STORE_INVALID');
      }catch{
        write('HMAC_STORE_NOT_READY: use the existing protected Windows user store');
        return 2;
      }
      await confirmExtendedSourcePreparationFromTTY(tty,endpoint);
      const collected=await collectExtendedForPrivateStaging({
        endpoint,manifest:sheetManifest,
        confirm:async()=> 'AUDIT FIVE REPORTS READ ONLY 5406',
        getToken:()=>readRealBearerFromTTY(tty),
        fetchImpl:tty.fetchImpl??globalThis.fetch
      });
      const safe=collected?.safe??collected;
      if(!Array.isArray(collected?.pages)||![
        'AGGREGATE_STORAGE_APPROVAL_REQUIRED',
        'SMALL_CELL_PRIVACY_REVIEW_REQUIRED',
        'PERSON_DATA_STORAGE_APPROVAL_REQUIRED',
        'UNVERIFIED_RELATION_KEY_WRITE_HOLD'
      ].includes(safe?.status)){
        write(JSON.stringify({mode:'MANUAL_EXTENDED_REPORT_STAGE',endpoint,
          status:'SOURCE_NOT_READY',sourceStatus:safe?.status??'UNKNOWN',
          sourceNetworkRequests:safe?.sourceNetworkRequests??0,
          appsScriptPosts:0,sheetsWrites:0,accepted:false},null,2));
        return 2;
      }
      // Domain separation: never use an external national ID/UUID as a sheet key.
      const privacyKeyB64=createHmac('sha256',Buffer.from(hmac,'base64'))
        .update('THAIPHC_F010_PSEUDONYM_DERIVE_5406','utf8')
        .digest('base64');
      const runId='private-'+randomBytes(12).toString('hex');
      const minimized=projectMinimizedExtendedSnapshot({
        endpoint,pages:collected.pages,manifest:sheetManifest,
        privacyKeyB64,runId
      });
      const plan=planExtendedBatches(minimized);
      const acknowledgement=await confirmExtendedPrivateWriteFromTTY(
        tty,extendedCommitPhrase(plan));
      const result=await sendExtendedReport({
        plan,keyB64:hmac,acknowledgement,
        fetchImpl:tty.fetchImpl??globalThis.fetch
      });
      write(JSON.stringify({...result,
        sourceNetworkRequests:safe.sourceNetworkRequests},null,2));
      // A successful report-finalized reply still needs separate target readback.
      return 2;
    }
    if(parsed.command==='send-reference-commit'||parsed.command==='commit-menu'){
      // Operator separately confirms the live destination Script Properties
      // and PO first-write window before invoking this dangerous command.
      let endpoint=parsed.endpoint;
      if(parsed.command==='commit-menu'){
        const selected=await selectReferenceCommitFromTTY(tty);
        if(selected.status!=='COMMIT_SELECTION'){
          write(JSON.stringify({
            mode:'MANUAL_REFERENCE_COMMIT_MENU',
            status:selected.status,
            ...(selected.endpoint?{endpoint:selected.endpoint}:{}),
            sourceNetworkRequests:0,appsScriptPosts:0,sheetsWrites:0,
            writeOutcome:'NOT_ATTEMPTED'
          },null,2));
          return 2; // READ_ONLY and PERSON_DATA_HOLD never open commit path.
        }
        endpoint=selected.endpoint;
      }
      const count={subdistricts:8,villages:85,'health-services':18}[endpoint];
      const confirmation=parsed.command==='commit-menu'?
        await confirmReferenceCommitSelectionFromTTY(tty,endpoint,count):
        await confirmReferenceCommitFromTTY(tty,endpoint,count);
      if(confirmation!==commitPhrase(endpoint))
        throw Error('COMMIT_CONFIRM_MISMATCH');
      // Fail CLOSED before ThaiPHC GET if DPAPI setup is absent/invalid.
      let keyB64;
      try{
        const load=tty.readStoredHmac??readStoredHmac;
        keyB64=load({...tty});
        if(typeof keyB64!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(keyB64))
          throw Error('HMAC_STORE_INVALID');
      }catch{
        write('HMAC_STORE_NOT_READY: run npm.cmd run cli -- hmac-setup once');
        return 2;
      }
      const snapshot=await collectReferenceSnapshot({
        endpoint,
        confirm:async()=>SNAPSHOT_CONFIRM,
        getToken:()=>readRealBearerFromTTY(tty),
        fetchImpl:tty.fetchImpl??globalThis.fetch,
        manifest:sheetManifest
      });
      const sourceCalls=snapshot.networkRequests;
      const ready=snapshot.status==='SNAPSHOT_VALIDATED_IN_MEMORY'&&
        snapshot.rowCount===count&&snapshot.observedCountMatches===true&&
        (endpoint!=='health-services'||
          (snapshot.paginationComplete===true&&
           snapshot.completeness==='SOURCE_TOTAL_CHECKED'));
      if(!ready){
        write(JSON.stringify({
          mode:'MANUAL_REFERENCE_COMMIT',endpoint,
          status:'SOURCE_NOT_READY',sourceStatus:snapshot.status,
          sourceNetworkRequests:sourceCalls,appsScriptPosts:0,
          writeOutcome:'NOT_ATTEMPTED',destinationReadbackVerified:false
        },null,2));
        return 2;
      }
      const prepared=buildOfflineCommitEnvelope({
        endpoint,rows:snapshot.rows,manifest:sheetManifest,
        keyB64,runId:'manual-'+randomBytes(12).toString('hex'),
        fetchedAtUtc:new Date().toISOString()
      });
      const result=await sendReferenceCommit({
        prepared,snapshot,acknowledgement:confirmation,
        fetchImpl:tty.fetchImpl??globalThis.fetch
      });
      write(JSON.stringify({...result,sourceNetworkRequests:sourceCalls},null,2));
      // COMMITTED is not independently reconciled to the real Sheet.
      return 2;
    }
    if(parsed.command==='send-reference-validate'){
      // Real-source validate-only transfer is not an authorization to write.
      // Needs separately approved receiver activation; CLI cannot toggle flags.
      const acknowledged=await confirmReferenceValidateTransferFromTTY(tty);
      const snapshot=await collectReferenceSnapshot({
        endpoint:parsed.endpoint,
        confirm:async()=>SNAPSHOT_CONFIRM,
        getToken:()=>readRealBearerFromTTY(tty),
        fetchImpl:tty.fetchImpl??globalThis.fetch,
        manifest:sheetManifest
      });
      const ready=snapshot.status==='SNAPSHOT_VALIDATED_IN_MEMORY'&&
        snapshot.observedCountMatches===true&&
        (parsed.endpoint!=='health-services'||
         (snapshot.paginationComplete===true&&
          snapshot.completeness==='SOURCE_TOTAL_CHECKED'));
      if(!ready){
        write(JSON.stringify({
          mode:'MANUAL_REFERENCE_VALIDATE_ONLY',endpoint:parsed.endpoint,
          status:'SOURCE_NOT_READY',sourceStatus:snapshot.status,
          sourceNetworkRequests:snapshot.networkRequests,
          appsScriptPosts:0,sheetsWrites:0,
          destinationWriteApproved:false
        },null,2));
        return 2;
      }
      const keyB64=await readDestinationHmacFromTTY(tty);
      const prepared=buildOfflineValidateEnvelope({
        endpoint:parsed.endpoint,rows:snapshot.rows,
        manifest:sheetManifest,keyB64,
        runId:'reference-'+randomBytes(12).toString('hex'),
        fetchedAtUtc:new Date().toISOString()
      });
      const result=await sendReferenceValidate({
        prepared,snapshot,acknowledgement:acknowledged,
        fetchImpl:tty.fetchImpl??globalThis.fetch
      });
      write(JSON.stringify(result,null,2));
      return result.status==='VALIDATED'?0:2;
    }
    if(parsed.command==='audit-extended'){
      const result=await readExtendedReport({
        endpoint:parsed.endpoint,
        confirm:()=>confirmExtendedAuditFromTTY(tty),
        getToken:()=>readRealBearerFromTTY(tty),
        fetchImpl:tty.fetchImpl??globalThis.fetch,
        manifest:sheetManifest
      });
      // Strictly safe summary: readExtendedReport never returns source rows.
      write(JSON.stringify(result,null,2));
      return result.status==='AGGREGATE_STORAGE_APPROVAL_REQUIRED'||
        result.status==='PERSON_DATA_STORAGE_APPROVAL_REQUIRED'||
        result.status==='UNVERIFIED_RELATION_KEY_WRITE_HOLD'||
        result.status==='SMALL_CELL_PRIVACY_REVIEW_REQUIRED'?0:2;
    }
    if(parsed.command==='audit-source'){
      const snapshot=await collectReferenceSnapshot({
        endpoint:parsed.endpoint,
        confirm:()=>confirmReferenceAuditFromTTY(tty),
        getToken:()=>readRealBearerFromTTY(tty),
        fetchImpl:tty.fetchImpl??globalThis.fetch,
        manifest:sheetManifest
      });
      // EXPLICIT safe allowlist: never JSON.stringify(snapshot), it carries raw
      // source reference rows in the memory-only success case.
      const success=snapshot.status==='SNAPSHOT_VALIDATED_IN_MEMORY';
      const report={
        mode:'REFERENCE_AUDIT_READ_ONLY',endpoint:parsed.endpoint,
        status:success?'SOURCE_SCHEMA_VALIDATED':snapshot.status,
        ...(success?{
          rowCount:snapshot.rowCount,
          pagesFetched:snapshot.pagesFetched,
          observedCountMatches:snapshot.observedCountMatches,
          completeness:snapshot.completeness
        }:{}),
        networkRequests:snapshot.networkRequests,
        appsScriptPosts:0,sheetsWrites:0,
        transferApproved:false,
        destinationWriteApproved:false
      };
      write(JSON.stringify(report,null,2));
      return success&&snapshot.observedCountMatches?0:2;
    }
    if(parsed.command==='send-validate'){
      // This command is a REAL opt-in POST, never invoked by CI with real fetch.
      // Stage B live Web App testing still requires Product Owner approval.
      const confirmation=await confirmSyntheticValidateFromTTY(tty);
      const keyB64=await readDestinationHmacFromTTY(tty);
      const prepared=buildOfflineValidateEnvelope({
        endpoint:parsed.endpoint,
        rows:[syntheticReferenceRow(parsed.endpoint,sheetManifest)],
        manifest:sheetManifest,keyB64,
        runId:'synthetic-'+randomBytes(8).toString('hex'),
        fetchedAtUtc:new Date().toISOString()
      });
      const result=await sendSyntheticValidate({
        prepared,acknowledgement:confirmation,
        fetchImpl:tty.fetchImpl??globalThis.fetch
      });
      write(JSON.stringify(result,null,2));
      return result.status==='VALIDATED'?0:2;
    }
    if(parsed.command==='live-fetch'){
      const liveRunner={subdistricts:liveFetchSubdistricts,villages:liveFetchVillages,'health-services':liveFetchHealthServices,'volunteer-gender':liveFetchVolunteerGender}[parsed.endpoint];
      const result=await liveRunner({
        confirm:()=>confirmLiveUseFromTTY(tty,parsed.endpoint),
        getToken:()=>readRealBearerFromTTY(tty),
        fetchImpl:tty.fetchImpl??globalThis.fetch
      });
      write(JSON.stringify(result,null,2));
      return result.status==='PASS'?0:2;
    }
    if(parsed.command==='auth-mock'){
      const summary=await simulateMockBearerSession({
        endpoint:parsed.endpoint,
        getToken:()=>readMockOnlyTokenFromTTY(tty)
      });
      write(JSON.stringify(summary,null,2));
      return summary.status==='COMPLETE'?0:2;
    }
    const targets=parsed.endpoint==='all'?endpointNames():[parsed.endpoint];
    if(parsed.command==='inspect'){
      write(JSON.stringify({mode:'OFFLINE_ONLY',endpoints:targets.map(id=>({id,path:ENDPOINTS[id].path,pagination:ENDPOINTS[id].pagination,personLevel:ENDPOINTS[id].personLevel,requiresLiveApproval:true}))},null,2));
      return 0;
    }
    const reports=[];
    for(const id of targets)reports.push(await collectOffline(id,{transport:syntheticTransport(id),maxPages:parsed.maxPages,pageSize:3}));
    write(JSON.stringify({mode:'SYNTHETIC_OFFLINE_ONLY',command:parsed.command,results:reports},null,2));
    return reports.some(r=>r.status==='PARTIAL'||r.status==='QUARANTINED')?2:0; // person-grain BLOCKED is expected
  }catch{
    // Never echo supplied arguments: they may contain accidental tokens/identifiers.
    write('CLI_REJECTED: consult help (no request was executed)');
    return 2;
  }
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  process.exitCode=await main();
}
