#!/usr/bin/env node
// Offline simulation only: no credential parser, no disk writes, no live network client.
import { ENDPOINTS, endpointNames } from './endpoints.mjs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { syntheticTransport } from './transport.mjs';
import { collectOffline } from './runner.mjs';

const HELP='ThaiPHC T004 OFFLINE ONLY\nCommands: help | inspect [--endpoint ID] | validate [--endpoint ID] | dry-run [--endpoint ID] [--max-pages N]\nAll simulations use synthetic records; no bearer credentials, API calls or Google Sheets writes.\n--live, --token, --output, unknown flags and unknown endpoints are forbidden.';
function parseArgs(argv){
  const [command='help',...tail]=argv;
  if(!['help','inspect','validate','dry-run'].includes(command))throw Error('UNSUPPORTED_COMMAND');
  let endpoint='all',maxPages=10;
  for(let i=0;i<tail.length;i++){
    const arg=tail[i];
    if(arg==='--endpoint'){
      if(i===tail.length-1)throw Error('MISSING_ENDPOINT');
      endpoint=tail[++i];
    }else if(arg==='--max-pages'){
      if(i===tail.length-1)throw Error('MISSING_MAX_PAGES');
      const raw=tail[++i];
      if(!/^\d+$/.test(raw))throw Error('INVALID_MAX_PAGES');
      maxPages=Number(raw);
    }else throw Error('UNSUPPORTED_FLAG');
  }
  if(!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>250)throw Error('INVALID_MAX_PAGES');
  if(endpoint!=='all'&&!Object.hasOwn(ENDPOINTS,endpoint))throw Error('UNKNOWN_ENDPOINT');
  if((command==='help'||command==='inspect')&&tail.some(x=>x==='--max-pages'))throw Error('UNSUPPORTED_FLAG');
  return {command,endpoint,maxPages};
}
export async function main(argv=process.argv.slice(2),write=console.log){
  try{
    const parsed=parseArgs(argv);
    if(parsed.command==='help'){write(HELP);return 0;}
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
    write('CLI_REJECTED: consult help (offline simulation only)');
    return 2;
  }
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  process.exitCode=await main();
}
