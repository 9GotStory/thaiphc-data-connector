// T004C: MOCK TOKEN ONLY. No network, OAuth, browser access or real Bearer acceptance.
import {buildRequest} from './endpoints.mjs';
import {createMockTransport,isMockTransport,syntheticTransport} from './transport.mjs';
import {collectOffline} from './runner.mjs';

const FAKE_TOKEN=/^MOCK_ONLY_[A-Za-z0-9_-]{8,64}$/;
const MAX_CHARACTERS=96;

export function isMockOnlyToken(candidate){
  return typeof candidate==='string' && FAKE_TOKEN.test(candidate);
}

// Requires an actual interactive TTY. setRawMode suppresses kernel echo.
// NOTE: JS strings cannot be guaranteed wiped from runtime memory; real tokens are forbidden.
export async function readMockOnlyTokenFromTTY({
  input=process.stdin,output=process.stderr,timeoutMs=30000
}={}){
  if(!input?.isTTY||!output?.isTTY||typeof input.setRawMode!=='function'||
     typeof input.on!=='function'||typeof input.removeListener!=='function'||
     typeof output.write!=='function')throw new Error('SECURE_TTY_REQUIRED');
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>120000)
    throw new Error('INVALID_INPUT_TIMEOUT');

  return new Promise((resolve,reject)=>{
    const wasRaw=Boolean(input.isRaw);
    const wasPaused=typeof input.isPaused==='function'?input.isPaused():false;
    let chars=[];let finished=false;let timer;
    const finish=(err)=>{
      if(finished)return;
      finished=true;
      clearTimeout(timer);
      input.removeListener('data',onData);
      input.removeListener('end',onEnd);
      input.removeListener('error',onError);
      try{input.setRawMode(wasRaw);}catch{err=new Error('TTY_RESTORE_FAILED');}
      if(wasPaused&&typeof input.pause==='function')input.pause();
      try{output.write('\n');}catch{err=new Error('TTY_OUTPUT_FAILED');}
      const candidate=chars.join('');
      chars.fill('');chars=[];
      if(err){reject(err);return;}
      if(!isMockOnlyToken(candidate)){reject(new Error('MOCK_ONLY_TOKEN_REQUIRED'));return;}
      resolve(candidate);
    };
    const onError=()=>finish(new Error('TTY_INPUT_ERROR'));
    const onEnd=()=>finish(new Error('TTY_INPUT_ENDED'));
    const onData=(chunk)=>{
      const bytes=Buffer.isBuffer(chunk)?chunk:null;
      const data=String(chunk);
      try {
        for(const char of data){
          if(char==='\r'||char==='\n'){finish();return;}
          if(char==='\u0003'||char==='\u0004'||char==='\u001b'){
            finish(new Error('TTY_CANCELLED'));return;
          }
          if(char==='\u007f'||char==='\b'){chars.pop();continue;}
          if(char.charCodeAt(0)<32||char.charCodeAt(0)>126){
            finish(new Error('INVALID_MOCK_TOKEN_INPUT'));return;
          }
          if(chars.length>=MAX_CHARACTERS){
            finish(new Error('MOCK_TOKEN_INPUT_TOO_LONG'));return;
          }
          chars.push(char);
        }
      }finally{if(bytes)bytes.fill(0);}
    };
    try{
      input.setRawMode(true);
      input.on('data',onData);
      input.on('end',onEnd);
      input.on('error',onError);
      output.write('Synthetic token only (MOCK_ONLY_...), no real ThaiPHC token: ');
      if(typeof input.resume==='function')input.resume();
      timer=setTimeout(()=>finish(new Error('TTY_INPUT_TIMEOUT')),timeoutMs);
      timer.unref?.();
    }catch{
      finish(new Error('TTY_INITIALIZATION_FAILED'));
    }
  });
}

function defaultMockResponder(){
  const synthetic=syntheticTransport('subdistricts');
  return createMockTransport(async(request)=>{
    if(request.method!=='GET'||request.endpoint!=='subdistricts'||
       request.path!=='/api/v1/lookups/subdistricts'||request.redirect!=='error'||
       !request.headers||typeof request.headers.Authorization!=='string'||
       !isMockOnlyToken(request.headers.Authorization.slice(7))||
       !request.headers.Authorization.startsWith('Bearer ')){
       return {status:403,body:{}};
    }
    return synthetic({endpoint:request.endpoint,path:request.path,query:request.query,
      page:request.page,offset:request.offset,pageSize:request.pageSize});
  });
}

// This constructs an Authorization header exclusively inside an injected in-process mock.
// It cannot issue a live request and returns counts/errors only, never source rows or the token.
export async function simulateMockBearerSession({
  endpoint='subdistricts',getToken,mockResponder=defaultMockResponder()
}={}){
  if(endpoint!=='subdistricts')throw new Error('MOCK_ENDPOINT_DENIED');
  if(typeof getToken!=='function')throw new Error('MOCK_TOKEN_PROVIDER_REQUIRED');
  if(!isMockTransport(mockResponder))throw new Error('BRANDED_MOCK_REQUIRED');
  let token;
  try{
    token=await getToken();
    if(!isMockOnlyToken(token))throw new Error('REAL_BEARER_TOKEN_FORBIDDEN');
    const req=buildRequest('subdistricts');
    if(req.path!=='/api/v1/lookups/subdistricts')throw new Error('MOCK_PATH_REJECTED');
    const transport=createMockTransport(async(request)=>{
      if(request.endpoint!=='subdistricts'||request.path!==req.path||request.query!==req.query)
        return {status:403,body:{}};
      return mockResponder(Object.freeze({
        endpoint:request.endpoint,path:req.path,query:req.query,
        page:request.page,offset:request.offset,pageSize:request.pageSize,
        method:'GET',redirect:'error',
        headers:Object.freeze({Authorization:'Bearer '+token})
      }));
    });
    const result=await collectOffline('subdistricts',{
      transport,pageSize:10,maxPages:1,maxRetries:0
    });
    return Object.freeze({...result,mode:'SYNTHETIC_BEARER_MOCK_ONLY'});
  }finally{
    token=undefined;
  }
}
