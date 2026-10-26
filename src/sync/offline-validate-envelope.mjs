// T017 - OFFLINE-ONLY envelope assembly. Not a network sender.
// Do not print/store the returned envelope: payloadB64 contains the injected rows.
// This module never fetches ThaiPHC, accesses Apps Script or writes Sheets.
import {createHmac, randomBytes} from 'node:crypto';
import {projectReferenceRows} from './reference-projection.mjs';

const VERSION='THAIPHC_SYNC_V1';
const INPUTS=new Set(['endpoint','rows','manifest','keyB64','runId','fetchedAtUtc','timestampMs']);
const MAX_B64=550000; // T010 receiver: maximum encoded payload size.
const MAX_BODY=700000; // T010 receiver: maximum JSON envelope length.
const RUN_ID=/^[A-Za-z0-9_-]{8,64}$/;
const UTC=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
function invalid(){throw new Error('OFFLINE_ENVELOPE_REJECTED');}

/**
 * Accepts already-in-memory, operator-injected reference rows. Source
 * authorization/snapshot completeness are NOT established by this function.
 * Returns an unsigned-for-transport gate: a signed validate-only envelope
 * in memory, with NO HTTP/CLI/file output. Sending requires separate approval.
 */
export function buildOfflineValidateEnvelope(options){
 if(options===null||typeof options!=='object'||Array.isArray(options)||
    Object.keys(options).some(key=>!INPUTS.has(key)))invalid();
 const {endpoint,rows,manifest,keyB64,runId,fetchedAtUtc,timestampMs=Date.now()}=options;
 if(typeof runId!=='string'||!RUN_ID.test(runId)||
    typeof fetchedAtUtc!=='string'||!UTC.test(fetchedAtUtc)||
    !Number.isFinite(Date.parse(fetchedAtUtc))||
    !Number.isSafeInteger(timestampMs)||timestampMs<=0||
    !manifest||manifest.version!=='0.1.0'||
    typeof keyB64!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(keyB64))
  invalid();
 const key=Buffer.from(keyB64,'base64');
 if(key.length!==32||key.toString('base64')!==keyB64)invalid();
 const projected=projectReferenceRows(endpoint,rows,manifest);
 if(projected.rowCount===0||projected.rowCount!==projected.rows.length||
    projected.writeAllowed!==false||projected.appsScriptPosts!==0||
    projected.networkRequests!==0||projected.sheetsWrites!==0)invalid();
 const payload={
  schemaVersion:'0.1.0',mode:'validate',endpoint,
  scope:{provinceCode:'54',districtCode:'5406'},
  runId,fetchedAtUtc,sourceFieldNames:projected.sourceFieldNames,
  rows:projected.rows
 };
 const payloadB64=Buffer.from(JSON.stringify(payload),'utf8').toString('base64');
 if(payloadB64.length>MAX_B64)invalid();
 const nonce=randomBytes(18).toString('base64url');
 const signature=createHmac('sha256',key)
  .update(VERSION+'\n'+timestampMs+'\n'+nonce+'\n'+payloadB64,'utf8')
  .digest('base64');
 const envelope={version:VERSION,timestamp:timestampMs,nonce,payloadB64,signature};
 if(JSON.stringify(envelope).length>MAX_BODY)invalid();
 return Object.freeze({
  status:'OFFLINE_ONLY_NOT_SENT',transferApproved:false,
  endpoint,rowCount:projected.rowCount,
  networkRequests:0,appsScriptPosts:0,sheetsWrites:0,
  // Sensitive in later authorized uses; never log/copy to GitHub.
  envelope:Object.freeze(envelope)
 });
}
