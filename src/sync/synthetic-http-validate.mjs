// T018: Synthetic-only HTTP protocol state machine for a FUTURE validate sender.
// Deliberately NO fetch, user-supplied HTTP adapter, CLI entrypoint, or external I/O.
// Sensitive base64 payload never leaves process memory or appears in the result.
import targets from '../../config/thaiphc-targets.json' with {type:'json'};

const VERSION='THAIPHC_SYNC_V1';
const ALLOWED=new Set(['subdistricts','villages','health-services']);
const BATCH_KEYS=['schemaVersion','mode','endpoint','scope','runId','fetchedAtUtc','sourceFieldNames','rows'];
const WIRE_KEYS=['version','timestamp','nonce','payloadB64','signature'];
const BASE_KEYS=['protocol','status','accepted','sheetsWrites'];
const SUCCESS_KEYS=BASE_KEYS.concat(['endpoint','rowCount','inserted','updated','unchanged']);
const ERROR_STATUSES=new Set([
 'INGRESS_DISABLED','INVALID_ENVELOPE','NOT_CONFIGURED','AUTH_FAILED',
 'WRITE_DISABLED','LOCK_BUSY','REPLAY_REJECTED','REJECTED','METHOD_DISABLED'
]);
const MAX_REPLY_BYTES=16*1024;
const MAX_ENVELOPE_CHARS=700000;
const own=(o,k)=>Object.hasOwn(o,k);
const plain=o=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&
 (Object.getPrototypeOf(o)===Object.prototype||Object.getPrototypeOf(o)===null);
const keys=(o,fields)=>plain(o)&&Object.keys(o).length===fields.length&&
 Object.keys(o).every(k=>fields.includes(k));
function reject(){throw new Error('SYNTHETIC_HTTP_INPUT_REJECTED');}
const WEB_APP_URL='https://script.google.com/macros/s/'+targets.deploymentId+'/exec';
if(!/^AKfycb[A-Za-z0-9_-]{40,120}$/.test(targets.deploymentId))reject();

function inspectPrepared(p){
 if(!keys(p,['status','transferApproved','endpoint','rowCount','networkRequests',
              'appsScriptPosts','sheetsWrites','envelope'])||
    p.status!=='OFFLINE_ONLY_NOT_SENT'||p.transferApproved!==false||
    !ALLOWED.has(p.endpoint)||!Number.isSafeInteger(p.rowCount)||p.rowCount<1||
    p.networkRequests!==0||p.appsScriptPosts!==0||p.sheetsWrites!==0)
  reject();
 const w=p.envelope;
 if(!keys(w,WIRE_KEYS)||w.version!==VERSION||
    !Number.isSafeInteger(w.timestamp)||Math.abs(Date.now()-w.timestamp)>300000||
    typeof w.nonce!=='string'||!/^[A-Za-z0-9_-]{16,64}$/.test(w.nonce)||
    typeof w.signature!=='string'||!/^[A-Za-z0-9+/]{43}=$/.test(w.signature)||
    typeof w.payloadB64!=='string'||w.payloadB64.length>550000||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(w.payloadB64)||
    JSON.stringify(w).length>MAX_ENVELOPE_CHARS)reject();
 if(Buffer.from(w.payloadB64,'base64').toString('base64')!==w.payloadB64)reject();
 let b;
 try{b=JSON.parse(Buffer.from(w.payloadB64,'base64').toString('utf8'));}
 catch{reject();}
 if(!keys(b,BATCH_KEYS)||b.schemaVersion!=='0.1.0'||b.mode!=='validate'||
    b.endpoint!==p.endpoint||!keys(b.scope,['provinceCode','districtCode'])||
    b.scope.provinceCode!=='54'||b.scope.districtCode!=='5406'||
    !Array.isArray(b.rows)||b.rows.length!==p.rowCount||
    !Array.isArray(b.sourceFieldNames)||b.sourceFieldNames.length===0)reject();
 // This check is structural, NOT a claim of authenticated signature validation.
 return {endpoint:p.endpoint,rowCount:p.rowCount};
}
function syntheticReply(status,methods,endpoint,rowCount=0,httpStatus=null){
 return Object.freeze({
  mode:'SYNTHETIC_HTTP_ONLY',status,accepted:status==='VALIDATED',
  endpoint,rowCount:status==='VALIDATED'?rowCount:0,
  httpStatus,simulatedMethods:Object.freeze([...methods]),
  networkRequests:0,appsScriptPosts:0,sheetsWrites:0
 });
}
function responseStep(step){
 if(!keys(step,['status','headers','body'])||
    !Number.isSafeInteger(step.status)||step.status<100||step.status>599||
    !plain(step.headers)||typeof step.body!=='string'||
    Buffer.byteLength(step.body,'utf8')>MAX_REPLY_BYTES)
  reject();
 const h=Object.create(null);
 for(const [name,value] of Object.entries(step.headers)){
  const k=name.toLowerCase();
  if(!/^[a-z0-9-]+$/.test(k)||typeof value!=='string'||
     value.length>4096||own(h,k))reject();
  h[k]=value;
 }
 return {status:step.status,headers:h,body:step.body};
}
function safeGoogleRedirect(value){
 if(typeof value!=='string'||value.length>4096)return false;
 try{
  const u=new URL(value);
  return u.protocol==='https:'&&u.hostname==='script.googleusercontent.com'&&
   u.pathname==='/macros/echo'&&u.username===''&&u.password===''&&
   u.port===''&&u.hash===''&&u.search.length>1;
 }catch{return false;}
}
function resultFromBody(r,methods,endpoint,expectedRowCount){
 if(r.status!==200)return syntheticReply('HTTP_REJECTED',methods,endpoint,0,r.status);
 const contentType=r.headers['content-type'];
 if(typeof contentType!=='string'||
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(contentType.trim()))
  return syntheticReply('CONTENT_TYPE_REJECTED',methods,endpoint,0,r.status);
 const declared=r.headers['content-length'];
 if(declared!==undefined&&(!/^(?:0|[1-9]\d*)$/.test(declared)||
    Number(declared)!==Buffer.byteLength(r.body,'utf8')))
  return syntheticReply('CONTENT_LENGTH_REJECTED',methods,endpoint,0,r.status);
 let data;
 try{data=JSON.parse(r.body);}
 catch{return syntheticReply('INVALID_JSON_RESPONSE',methods,endpoint,0,r.status);}
 if(!plain(data)||data.protocol!==VERSION||
    typeof data.status!=='string'||typeof data.accepted!=='boolean'||
    data.sheetsWrites!==0)
  return syntheticReply('UNSAFE_RESPONSE',methods,endpoint,0,r.status);
 if(data.status==='COMMITTED')
  return syntheticReply('UNSAFE_COMMIT_RESPONSE',methods,endpoint,0,r.status);
 if(data.status==='VALIDATED'){
  if(!keys(data,SUCCESS_KEYS)||data.accepted!==true||
     data.endpoint!==endpoint||data.rowCount!==expectedRowCount||
     ![data.inserted,data.updated,data.unchanged].every(x=>x===0))
   return syntheticReply('UNSAFE_RESPONSE',methods,endpoint,0,r.status);
  return syntheticReply('VALIDATED',methods,endpoint,data.rowCount,r.status);
 }
 if(!keys(data,BASE_KEYS)||!ERROR_STATUSES.has(data.status)||data.accepted!==false)
  return syntheticReply('UNSAFE_RESPONSE',methods,endpoint,0,r.status);
 return syntheticReply(data.status,methods,endpoint,0,r.status);
}

/**
 * Simulate HTTP exchanges using plain synthetic response descriptions.
 * No actual request is constructed or sent; a real HTTP sender is NOT approved.
 * Never pass live service data as synthetic replies.
 */
export function simulateValidateHttp({prepared,exchanges}={}){
 const {endpoint,rowCount}=inspectPrepared(prepared);
 if(!Array.isArray(exchanges)||exchanges.length<1||exchanges.length>2)reject();
 const methods=['POST']; // pinned Web App URL, no user-selectable origin.
 // Verify the checked-in destination is the expected Google Web App shape.
 const origin=new URL(WEB_APP_URL);
 if(origin.origin!=='https://script.google.com'||
    origin.pathname!=='/macros/s/'+targets.deploymentId+'/exec'||
    origin.search!==''||origin.hash!=='')reject();
 const first=responseStep(exchanges[0]);
 if([302,303].includes(first.status)){
  if(!safeGoogleRedirect(first.headers.location)||exchanges.length!==2)
   return syntheticReply('REDIRECT_REJECTED',methods,endpoint,0,first.status);
  // Ignore any HTML redirect body; do not reflect it, nor forward POST contents.
  methods.push('GET'); // NO signed body, Authorization, credentials or retry.
  const second=responseStep(exchanges[1]);
  if([301,302,303,307,308].includes(second.status))
   return syntheticReply('REDIRECT_REJECTED',methods,endpoint,0,second.status);
  return resultFromBody(second,methods,endpoint,rowCount);
 }
 if([301,307,308].includes(first.status)||exchanges.length!==1)
  return syntheticReply('REDIRECT_REJECTED',methods,endpoint,0,first.status);
 return resultFromBody(first,methods,endpoint,rowCount);
}
