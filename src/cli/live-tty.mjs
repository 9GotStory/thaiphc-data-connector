// T005: explicit interactive TTY entry. Never read real tokens from argv, env, files, stdin pipes.
const CONFIRM_PHRASE='FETCH SUBDISTRICTS 5406';
const REAL_BEARER=/^[A-Za-z0-9._~+/-]+={0,}$/;

export {CONFIRM_PHRASE};

export function isCandidateRealBearer(value){
  return typeof value==='string'&&value.length>=16&&value.length<=8192&&
    REAL_BEARER.test(value)&&!value.startsWith('MOCK_ONLY_')&&!value.startsWith('Bearer');
}

function readHiddenLine({input=process.stdin,output=process.stderr,label,maxChars,allowSpaces=false,timeoutMs=60000}={}){
  if(input?.isTTY!==true||output?.isTTY!==true||typeof input.setRawMode!=='function'||
    typeof input.on!=='function'||typeof input.removeListener!=='function'||
    typeof output.write!=='function')throw new Error('SECURE_INTERACTIVE_TTY_REQUIRED');
  if(!Number.isSafeInteger(maxChars)||maxChars<1||maxChars>8192||
    !Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>120000)
    throw new Error('INVALID_TTY_BOUND');

  return new Promise((resolve,reject)=>{
    let done=false,characters=[],timer;
    const previousRaw=Boolean(input.isRaw);
    const previouslyPaused=typeof input.isPaused==='function'?input.isPaused():false;
    const finish=(error)=>{
      if(done)return;
      done=true;
      clearTimeout(timer);
      input.removeListener('data',onData);
      input.removeListener('end',onEnd);
      input.removeListener('error',onError);
      try{input.setRawMode(previousRaw);}catch{error=new Error('TTY_RESTORE_FAILED');}
      if(previouslyPaused&&typeof input.pause==='function')input.pause();
      try{output.write('\n');}catch{error=new Error('TTY_OUTPUT_FAILED');}
      const value=characters.join('');
      characters.fill('');characters=[];
      if(error){reject(error);return;}
      resolve(value);
    };
    const onEnd=()=>finish(new Error('TTY_INPUT_ENDED'));
    const onError=()=>finish(new Error('TTY_INPUT_FAILED'));
    const onData=(chunk)=>{
      const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(String(chunk),'utf8');
      try{
        for(const byte of bytes){
          if(byte===10||byte===13){finish();break;}
          if(byte===3||byte===4||byte===27){finish(new Error('TTY_INPUT_CANCELLED'));break;}
          if(byte===127||byte===8){characters.pop();continue;}
          if((byte<33&&!(allowSpaces&&byte===32))||byte>126){finish(new Error('TTY_INVALID_CHARACTER'));break;}
          if(characters.length>=maxChars){finish(new Error('TTY_TOO_LONG'));break;}
          characters.push(String.fromCharCode(byte));
        }
      }finally{bytes.fill(0);}
    };
    try{
      input.setRawMode(true);
      input.on('data',onData);
      input.on('end',onEnd);
      input.on('error',onError);
      output.write(label);
      if(typeof input.resume==='function')input.resume();
      timer=setTimeout(()=>finish(new Error('TTY_INPUT_TIMEOUT')),timeoutMs);
      timer.unref?.();
    }catch{finish(new Error('TTY_SETUP_FAILED'));}
  });
}

export async function confirmLiveUseFromTTY(io={}){
  const phrase=await readHiddenLine({...io,
    label:'Read-only one request, district 5406. Type FETCH SUBDISTRICTS 5406 to confirm (hidden): ',
    maxChars:64,allowSpaces:true,timeoutMs:30000});
  if(phrase!==CONFIRM_PHRASE)throw new Error('LIVE_CONFIRMATION_REJECTED');
  return phrase;
}

export async function readRealBearerFromTTY(io={}){
  const value=await readHiddenLine({...io,
    label:'Paste authorized Bearer TOKEN VALUE only (hidden; not the word Bearer): ',
    maxChars:8192,timeoutMs:60000});
  if(!isCandidateRealBearer(value))throw new Error('INVALID_BEARER_TOKEN_FORMAT');
  return value;
}
