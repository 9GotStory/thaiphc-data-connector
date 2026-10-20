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

const HELP='ThaiPHC Node.js 24 Manual Connector\nCommands: help | inspect [--endpoint ID] | validate [--endpoint ID] | dry-run [--endpoint ID] [--max-pages N] | auth-mock [--endpoint subdistricts] | live-fetch --endpoint subdistricts|villages --acknowledge-authorized-use\nLive-fetch requires interactive confirmation + manually pasted authorized Bearer token; exactly one read-only GET and aggregate-only output. No Google Sheets/App Script writes.\nDefault commands and auth-mock remain fully offline. No --token, --output, --url, or multi-endpoint live calls.';
function parseArgs(argv){
  const [command='help',...tail]=argv;
  if(!['help','inspect','validate','dry-run','auth-mock','live-fetch'].includes(command))throw Error('UNSUPPORTED_COMMAND');
  let endpoint='all',maxPages=10,acknowledged=false;
  for(let i=0;i<tail.length;i++){
    const arg=tail[i];
    if(arg==='--endpoint'){
      if(i===tail.length-1)throw Error('MISSING_ENDPOINT');
      endpoint=tail[++i];
    }else if(arg==='--acknowledge-authorized-use'){
      if(acknowledged)throw Error('DUPLICATE_ACKNOWLEDGEMENT');
      acknowledged=true;
    }else if(arg==='--max-pages'){
      if(i===tail.length-1)throw Error('MISSING_MAX_PAGES');
      const raw=tail[++i];
      if(!/^\d+$/.test(raw))throw Error('INVALID_MAX_PAGES');
      maxPages=Number(raw);
    }else throw Error('UNSUPPORTED_FLAG');
  }
  if(!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>250)throw Error('INVALID_MAX_PAGES');
  if(endpoint!=='all'&&!Object.hasOwn(ENDPOINTS,endpoint))throw Error('UNKNOWN_ENDPOINT');
  if((command==='help'||command==='inspect'||command==='auth-mock'||command==='live-fetch')&&tail.some(x=>x==='--max-pages'))throw Error('UNSUPPORTED_FLAG');
  if(acknowledged&&command!=='live-fetch')throw Error('ACKNOWLEDGEMENT_ONLY_FOR_LIVE');
  if(command==='auth-mock'){
    if(endpoint==='all')endpoint='subdistricts';
    if(endpoint!=='subdistricts')throw Error('MOCK_ENDPOINT_DENIED');
  }
  if(command==='live-fetch'){
    if(!['subdistricts','villages'].includes(endpoint)||!acknowledged)throw Error('LIVE_SCOPE_OR_ACK_REQUIRED');
  }
  return {command,endpoint,maxPages};
}
export async function main(argv=process.argv.slice(2),write=console.log,tty={}){
  try{
    const parsed=parseArgs(argv);
    if(parsed.command==='help'){write(HELP);return 0;}
    if(parsed.command==='live-fetch'){
      const result=await (parsed.endpoint==='subdistricts'?liveFetchSubdistricts:liveFetchVillages)({
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
