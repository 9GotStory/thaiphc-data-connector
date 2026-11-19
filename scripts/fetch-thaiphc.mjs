import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import manifest from '../docs/sheets-schema.json' with {type:'json'};
import {buildRequest,ENDPOINTS,endpointNames,SCOPE} from '../src/cli/endpoints.mjs';
import {LIVE_ORIGIN,readBoundedJson} from '../src/cli/live-fetch.mjs';
import {isCandidateRealBearer,readRealBearerFromTTY} from '../src/cli/live-tty.mjs';

const pageSize=10;

export async function fetchThaiPhc(endpoint,token,{fetchImpl=globalThis.fetch}={}){
 if(!Object.hasOwn(ENDPOINTS,endpoint))throw Error('UNKNOWN_ENDPOINT');
 if(!isCandidateRealBearer(token))throw Error('INVALID_BEARER');
 const {pagination}=ENDPOINTS[endpoint];
 const fields=manifest.datasets.find(d=>d.api===endpoint).fields
  .filter(f=>f.pii_policy!=='RESTRICTED_DEFAULT_OMIT').map(f=>f.source_field);
 const items=[];
 let total;

 for(let page=1;;page++){
  const offset=items.length;
  const request=buildRequest(endpoint,pagination==='offset'?{offset,pageSize}:{page,pageSize});
  const url=new URL(request.path+'?'+request.query,LIVE_ORIGIN);
  let response;
  try{
   response=await fetchImpl(url.href,{
    method:'GET',redirect:'error',credentials:'omit',cache:'no-store',
    signal:AbortSignal.timeout(10000),
    headers:{Accept:'application/json',Authorization:'Bearer '+token}
   });
  }catch{throw Error('SOURCE_REQUEST_FAILED');}
  if(response.status!==200)throw Error('HTTP_'+response.status);
  const {data,error}=await readBoundedJson(response);
  if(error)throw Error(error);
  if(data?.success===false||!Array.isArray(data?.items)||
     data.items.some(row=>!row||typeof row!=='object'||Array.isArray(row)))
   throw Error('INVALID_SOURCE_RESPONSE');

  if(pagination==='none')total=data.items.length;
  else {
   const reported=pagination==='assignment'?data.pagination?.total:data.total;
   if(!Number.isSafeInteger(reported)||reported<0||(total!==undefined&&reported!==total))
    throw Error('INVALID_OR_CHANGED_TOTAL');
   total=reported;
   const expectedCount=Math.min(pageSize,total-offset);
   const isRequestedPage=pagination==='assignment'?data.pagination?.page===page&&data.pagination?.limit===pageSize:
    pagination==='offset'?data.offset===offset&&data.limit===pageSize:data.page===page&&data.pageSize===pageSize;
   if(!isRequestedPage||data.items.length!==expectedCount)throw Error('INCOMPLETE_SOURCE_PAGE');
  }

  for(const row of data.items){
   items.push(Object.fromEntries(fields.filter(field=>Object.hasOwn(row,field)).map(field=>[field,row[field]])));
  }
  if(items.length===total)return {endpoint,requestedDistrictCode:SCOPE.district,total,items};
 }
}

async function run(args){
 const [endpoint]=args;
 if(args.length===0||(args.length===1&&endpoint==='--help')){
  console.log('Usage: node scripts/fetch-thaiphc.mjs <endpoint>\n'+endpointNames().join('\n'));
  return;
 }
 if(args.length!==1||!Object.hasOwn(ENDPOINTS,endpoint))throw Error('UNKNOWN_ENDPOINT');
 process.stderr.write(`อ่าน ${endpoint} สำหรับอำเภอสอง (${SCOPE.district})\n`);
 const token=await readRealBearerFromTTY();
 const result=await fetchThaiPhc(endpoint,token);
 console.log(JSON.stringify(result,null,2));
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 run(process.argv.slice(2)).catch(error=>{
  const code=/^[A-Z][A-Z_0-9]{0,79}$/.test(error?.message)?error.message:'FETCH_FAILED';
  console.error('ดึงข้อมูลไม่สำเร็จ '+code);
  process.exitCode=1;
 });
}
