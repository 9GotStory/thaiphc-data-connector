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
import {randomBytes} from 'node:crypto';
import {syntheticReferenceRow} from '../sync/synthetic-reference-row.mjs';
import {buildOfflineValidateEnvelope} from '../sync/offline-validate-envelope.mjs';
import {sendSyntheticValidate,sendReferenceValidate} from '../sync/manual-validate-transport.mjs';
import {confirmSyntheticValidateFromTTY,readDestinationHmacFromTTY} from './live-tty.mjs';
import {confirmReferenceAuditFromTTY,confirmReferenceValidateTransferFromTTY} from './live-tty.mjs';
import {collectReferenceSnapshot,SNAPSHOT_CONFIRM} from '../sync/reference-snapshot.mjs';

const HELP='ThaiPHC Node.js 24 Manual Connector\nCommands: help | sync-plan [--endpoint ID] | inspect [--endpoint ID] | validate [--endpoint ID] | dry-run [--endpoint ID] [--max-pages N] | auth-mock [--endpoint subdistricts] | live-fetch --endpoint subdistricts|villages|health-services|volunteer-gender --acknowledge-authorized-use | send-validate --synthetic --endpoint subdistricts|villages|health-services --acknowledge-synthetic-post | audit-source --endpoint subdistricts|villages|health-services --acknowledge-authorized-use | send-reference-validate --endpoint subdistricts|villages|health-services --acknowledge-reference-validate\nLive-fetch requires interactive confirmation + manually pasted authorized Bearer token; bounded read-only lookups/reports (health services max 10 pages, volunteer gender max 15 pages); aggregate-only output. No Google Sheets/App Script writes. sync-plan is manifest-only and never sends rows.\nSource audit makes only explicitly confirmed ThaiPHC read-only GET(s), keeps rows in memory and outputs counts/schema/completeness metadata only; it never sends rows to Apps Script or Sheets.\nsend-reference-validate is a separately approved opt-in real-row, validate-only HTTPS POST with exact snapshot count/schema gates. Receiver must be separately approved to enable; never use for commit.\nDefault commands and auth-mock remain fully offline. send-validate is an explicit REAL HTTPS POST of one SYNTHETIC-only validate batch to existing Web App V3, gated by hidden TTY confirmation + privately entered destination HMAC key (never ThaiPHC bearer); use only after separate live UAT approval. No commit or Sheets writes. No --token, --output, --url, or multi-endpoint live calls.';
function parseArgs(argv){
  const [command='help',...tail]=argv;
  if(!['help','inspect','validate','dry-run','auth-mock','live-fetch','sync-plan','send-validate','audit-source','send-reference-validate'].includes(command))throw Error('UNSUPPORTED_COMMAND');
  let endpoint='all',maxPages=10,acknowledged=false,synthetic=false,sendAcknowledged=false,referenceAcknowledged=false;
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
  if(acknowledged&&!['live-fetch','audit-source'].includes(command))throw Error('ACKNOWLEDGEMENT_ONLY_FOR_LIVE');
  if(referenceAcknowledged&&command!=='send-reference-validate')throw Error('REFERENCE_ACK_ONLY_FOR_SEND');
  if((synthetic||sendAcknowledged)&&command!=='send-validate')
    throw Error('SYNTHETIC_FLAGS_ONLY_FOR_SEND');
  if(command==='send-validate'){
    if(!synthetic||!sendAcknowledged||
      !['subdistricts','villages','health-services'].includes(endpoint)||
      tail.includes('--max-pages')||acknowledged)
      throw Error('SEND_VALIDATE_SCOPE_NOT_CONFIRMED');
  }
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
  if(command==='send-reference-validate'){
    if(!['subdistricts','villages','health-services'].includes(endpoint)||
      !referenceAcknowledged||acknowledged||synthetic||sendAcknowledged||
      tail.includes('--max-pages'))
      throw Error('REFERENCE_TRANSFER_SCOPE_OR_ACK_REQUIRED');
  }
  return {command,endpoint,maxPages};
}
export async function main(argv=process.argv.slice(2),write=console.log,tty={}){
  try{
    const parsed=parseArgs(argv);
    if(parsed.command==='help'){write(HELP);return 0;}
    if(parsed.command==='sync-plan'){
      write(JSON.stringify(buildSyncPlan(parsed.endpoint),null,2));
      return 0; // Report generated; status HOLD explicitly forbids downstream writes.
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
