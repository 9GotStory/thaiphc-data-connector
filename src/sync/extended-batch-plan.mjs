// Feature 010 — OFFLINE staging protocol planner, no GET/POST or persistence.
// Do NOT log/export returned envelopes; they contain minimized, still sensitive
// locality/status data. This is not an authorized receiver or live sender.
import {createHash} from 'node:crypto';
const VERSION='THAIPHC_REPORT_STAGE_V1',CHUNK_ROWS=25,MAX_CHUNKS=100;
const CHUNK_UTF8_MAX=125000,MAX_ROWS=2500;
const sha=data=>createHash('sha256').update(data,'utf8').digest('hex');
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const fail=()=>{throw Error('EXTENDED_BATCH_PLAN_REJECTED')};
const approvedStatuses=new Set([
 'AGGREGATE_STORAGE_APPROVAL_REQUIRED','SMALL_CELL_PRIVACY_REVIEW_REQUIRED',
 'PERSON_DATA_STORAGE_APPROVAL_REQUIRED','UNVERIFIED_RELATION_KEY_WRITE_HOLD'
]);
/** Plan a complete immutable NEW snapshot; never append directly to accepted tabs.
 * Future receiver must stage every chunk, verify this digest, then finalize as
 * ONE snapshot after separate permissions and independent readback.
 */
export function planExtendedBatches(minimized){
 if(!plain(minimized)||minimized.mode!=='IN_MEMORY_MINIMIZED_REPORT_NOT_SENT'||
    minimized.writeAuthorized!==false||minimized.appsScriptPosts!==0||
    minimized.sheetsWrites!==0||!approvedStatuses.has(minimized.privacyState)||
    !Array.isArray(minimized.rows)||minimized.rows.length===0||
    minimized.rows.length>MAX_ROWS||minimized.rows.length!==minimized.rowCount||
    !Array.isArray(minimized.destinationSchema)||
    !/^[A-Za-z0-9_-]{8,64}$/.test(minimized.runId??'')||
    !/^(?:volunteer-gender|assignments|volunteer-family|resigned-volunteers|volunteer-tenure)$/.test(minimized.endpoint??''))
  fail();
 const schema=new Set(minimized.destinationSchema);
 if(!schema.size||schema.size!==minimized.destinationSchema.length)fail();
 const chunks=[],seen=new Set();
 for(let offset=0;offset<minimized.rows.length;offset+=CHUNK_ROWS){
  const slice=minimized.rows.slice(offset,offset+CHUNK_ROWS);
  const rows=slice.map(r=>{
   if(!plain(r)||typeof r.key!=='string'||r.key.length<5||
      seen.has(r.key)||!plain(r.values))fail();
   seen.add(r.key);
   if(Object.keys(r.values).length!==schema.size||
      Object.keys(r.values).some(k=>!schema.has(k)))fail();
   for(const v of Object.values(r.values)){
    if(v!==null&&typeof v!=='string'&&typeof v!=='boolean'&&
       !(typeof v==='number'&&Number.isFinite(v)))fail();
    if(typeof v==='string'&&
       (v.length>32767||/[\u0000-\u001f\u007f]/.test(v)||
        /^\s*[=+\-@]/.test(v)))fail();
   }
   return {key:r.key,values:r.values};
  });
  const serialized=JSON.stringify(rows);
  if(Buffer.byteLength(serialized,'utf8')>CHUNK_UTF8_MAX)fail();
  chunks.push(Object.freeze({
   ordinal:chunks.length+1,rowOffset:offset,rowCount:rows.length,
   digest:sha(serialized),rows:Object.freeze(rows)
  }));
 }
 if(chunks.length===0||chunks.length>MAX_CHUNKS)fail();
 const manifest={
  version:VERSION,endpoint:minimized.endpoint,runId:minimized.runId,
  sourceIdentityStrategy:minimized.sourceIdentityStrategy,
  sourceRows:minimized.rowCount,chunkCount:chunks.length,
  destinationFields:minimized.destinationSchema,
  chunkDigests:chunks.map(c=>c.digest)
 };
 const digest=sha(JSON.stringify(manifest));
 return Object.freeze({
  mode:'OFFLINE_REPORT_CHUNK_PLAN_NOT_SENT',version:VERSION,
  endpoint:minimized.endpoint,runId:minimized.runId,
  destinationFields:Object.freeze([...minimized.destinationSchema]),
  sourceRows:minimized.rowCount,
  chunkCount:chunks.length,chunkRowsLimit:CHUNK_ROWS,
  chunkBytesLimit:CHUNK_UTF8_MAX,
  manifestDigest:digest,
  chunks:Object.freeze(chunks),
  runFingerprint:Object.freeze({...manifest,digest}),
  publishMethod:minimized.endpoint==='volunteer-family'?
   'FULL_SNAPSHOT_REPLACEMENT_ONLY_NO_UPSERT':
   'STAGED_COMPLETE_SNAPSHOT_ONLY',
  transferApproved:false,writeAuthorized:false,
  sourceNetworkRequests:0,appsScriptPosts:0,sheetsWrites:0
 });
}
