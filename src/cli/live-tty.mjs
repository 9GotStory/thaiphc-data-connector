// T005: explicit interactive TTY entry. Never read real tokens from argv, env, files, stdin pipes.
const CONFIRM_PHRASE='FETCH SUBDISTRICTS 5406';
const CONFIRM_VILLAGES_PHRASE='FETCH VILLAGES 5406';
const CONFIRM_HEALTH_SERVICES_PHRASE='FETCH HEALTH SERVICES 5406';
const CONFIRM_VOLUNTEER_GENDER_PHRASE='FETCH VOLUNTEER GENDER 5406';
const REAL_BEARER=/^[A-Za-z0-9._~+/-]+={0,}$/;

export {CONFIRM_PHRASE,CONFIRM_VILLAGES_PHRASE,CONFIRM_HEALTH_SERVICES_PHRASE,CONFIRM_VOLUNTEER_GENDER_PHRASE};

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

export async function confirmLiveUseFromTTY(io={},endpoint='subdistricts'){
  const expected=endpoint==='subdistricts'?CONFIRM_PHRASE:
    endpoint==='villages'?CONFIRM_VILLAGES_PHRASE:
    endpoint==='health-services'?CONFIRM_HEALTH_SERVICES_PHRASE:
    endpoint==='volunteer-gender'?CONFIRM_VOLUNTEER_GENDER_PHRASE:null;
  if(!expected)throw new Error('LIVE_CONFIRMATION_SCOPE_REJECTED');
  const phrase=await readHiddenLine({...io,
    label:'Read-only bounded request(s), district 5406. Type '+expected+' to confirm (hidden): ',
    maxChars:64,allowSpaces:true,timeoutMs:30000});
  if(phrase!==expected)throw new Error('LIVE_CONFIRMATION_REJECTED');
  return phrase;
}

export async function readRealBearerFromTTY(io={}){
  const value=await readHiddenLine({...io,
    label:'Paste authorized Bearer TOKEN VALUE only (hidden; not the word Bearer): ',
    maxChars:8192,timeoutMs:60000});
  if(!isCandidateRealBearer(value))throw new Error('INVALID_BEARER_TOKEN_FORMAT');
  return value;
}


// T009D: separate explicit authorization for synthetic-only destination test.
// This prompt does NOT authorize a real ThaiPHC source-row transfer or Sheets write.
export async function confirmSyntheticValidateFromTTY(io={}){
 const expected='POST SYNTHETIC VALIDATE 5406';
 const answer=await readHiddenLine({...io,
  label:'SYNTHETIC validate-only POST to existing Web App V3 (no Sheets write). Type '+expected+' (hidden): ',
  maxChars:64,allowSpaces:true,timeoutMs:30000
 });
 if(answer!==expected)throw Error('SYNTHETIC_VALIDATE_NOT_CONFIRMED');
 return expected;
}
export async function readDestinationHmacFromTTY(io={}){
 const key=await readHiddenLine({...io,
  label:'Paste destination HMAC key (44-char standard base64, hidden, not ThaiPHC bearer): ',
  maxChars:44,timeoutMs:60000
 });
 if(!/^[A-Za-z0-9+/]{43}=$/.test(key))throw Error('DESTINATION_HMAC_INVALID');
 return key;
}


// T009D: operator-approved READ-ONLY source readiness audit.
// The phrase does not authorize sending source rows downstream or writing Sheets.
export async function confirmReferenceAuditFromTTY(io={}){
 const phrase='READ REFERENCE SNAPSHOT 5406';
 const answer=await readHiddenLine({...io,
  label:'Read-only reference schema audit for 5406 (source rows stay in memory). Type '+phrase+' (hidden): ',
  maxChars:64,allowSpaces:true,timeoutMs:30000
 });
 if(answer!==phrase)throw Error('REFERENCE_AUDIT_NOT_CONFIRMED');
 return phrase;
}


// Transfer of actual reference rows to the existing receiver for schema
// validation ONLY (mode=validate). Never authorizes mode=commit / Sheets write.
export async function confirmReferenceValidateTransferFromTTY(io={}){
 const phrase='TRANSFER REFERENCE VALIDATE 5406';
 const answer=await readHiddenLine({...io,
  label:'Real reference rows will be POSTed to pinned Web App V3 for validate-only; no Sheets writes. Type '+phrase+' (hidden): ',
  maxChars:64,allowSpaces:true,timeoutMs:30000
 });
 if(answer!==phrase)throw Error('REFERENCE_TRANSFER_NOT_CONFIRMED');
 return phrase;
}


// T009D full API inventory menu. This is a COMMAND SELECTION display, NOT
// approval to write or fetch personal records. Exactly three reference
// datasets may proceed to a separately PO-authorized commit attempt.
export const REFERENCE_MENU_ITEMS=Object.freeze([
 Object.freeze({choice:'1',endpoint:'subdistricts',title:'Subdistricts / ตำบล',status:'COMMIT_GATED',rows:8}),
 Object.freeze({choice:'2',endpoint:'villages',title:'Villages / หมู่บ้าน',status:'COMMIT_GATED',rows:85}),
 Object.freeze({choice:'3',endpoint:'health-services',title:'Health Services / หน่วยบริการสุขภาพ',status:'COMMIT_GATED',rows:18}),
 Object.freeze({choice:'4',endpoint:'volunteer-gender',title:'Volunteer Gender / อสม. จำแนกตามเพศ',status:'READ_ONLY',rows:null}),
 Object.freeze({choice:'5',endpoint:'assignments',title:'Assignments / การมอบหมาย อสม.',status:'PERSON_DATA_HOLD',rows:null}),
 Object.freeze({choice:'6',endpoint:'volunteer-family',title:'Volunteer Family / ครอบครัว อสม.',status:'PERSON_DATA_HOLD',rows:null}),
 Object.freeze({choice:'7',endpoint:'resigned-volunteers',title:'Resigned Volunteers / อสม. ที่ลาออก',status:'PERSON_DATA_HOLD',rows:null}),
 Object.freeze({choice:'8',endpoint:'volunteer-tenure',title:'Volunteer Tenure / อายุงาน อสม.',status:'PERSON_DATA_HOLD',rows:null})
]);
const REFERENCE_MENU_LABEL='\nThaiPHC API (district 5406) — 8 topics\n'+
 '\n[Commit eligible only after separate PO approval]\n'+
 REFERENCE_MENU_ITEMS.slice(0,3).map(item=>
  '  '+item.choice+') '+item.title+' ('+item.rows+' observed rows) [COMMIT GATED]').join('\n')+
 '\n\n[Read only — NO COMMIT]\n'+
 '  4) Volunteer Gender / อสม. จำแนกตามเพศ [READ ONLY]\n'+
 '\n[Person-level data — APPROVAL REQUIRED; NO COMMIT]\n'+
 REFERENCE_MENU_ITEMS.slice(4).map(item=>
  '  '+item.choice+') '+item.title+' [PERSON DATA HOLD]').join('\n')+
 '\n\n  0) Cancel\nSelect 0-8: ';

// The menu itself NEVER makes any network request. Disabled selections
// produce an explicit non-writing result, not an alternative sender route.
export async function selectReferenceCommitFromTTY(io={}){
 const choice=await readHiddenLine({...io,
  label:REFERENCE_MENU_LABEL,maxChars:1,timeoutMs:30000
 });
 if(choice==='0')return Object.freeze({status:'CANCELLED'});
 const item=REFERENCE_MENU_ITEMS.find(i=>i.choice===choice);
 if(!item)throw Error('REFERENCE_MENU_INVALID_SELECTION');
 if(item.status==='READ_ONLY')
  return Object.freeze({status:'READ_ONLY_NO_COMMIT',endpoint:item.endpoint});
 if(item.status==='PERSON_DATA_HOLD')
  return Object.freeze({status:'PERSON_DATA_APPROVAL_REQUIRED',endpoint:item.endpoint});
 if(item.status!=='COMMIT_GATED'||!Number.isSafeInteger(item.rows))
  throw Error('REFERENCE_MENU_SCOPE_REJECTED');
 return Object.freeze({status:'COMMIT_SELECTION',endpoint:item.endpoint,rows:item.rows});
}
export async function confirmReferenceCommitSelectionFromTTY(io={},endpoint,rows){
 const expected={subdistricts:8,villages:85,'health-services':18};
 if(!Object.hasOwn(expected,endpoint)||expected[endpoint]!==rows)
  throw Error('REFERENCE_MENU_SCOPE_REJECTED');
 const confirm=await readHiddenLine({...io,
  label:'REAL ONE-TIME WRITE: '+endpoint+' / '+rows+
   ' rows / district 5406. Receiver may partially write; NO automatic retry. Type Y to proceed, any other key cancels: ',
  maxChars:1,timeoutMs:30000
 });
 if(confirm!=='Y')throw Error('REFERENCE_MENU_WRITE_NOT_CONFIRMED');
 return 'COMMIT '+endpoint+' '+rows+' ROWS 5406';
}

export async function confirmReferenceCommitFromTTY(io={},endpoint,rows){
 const phrase='COMMIT '+endpoint+' '+rows+' ROWS 5406';
 if(!['subdistricts','villages','health-services'].includes(endpoint)||
    ![8,85,18].includes(rows))throw Error('COMMIT_ENDPOINT_DENIED');
 const answer=await readHiddenLine({...io,
  label:'REAL GOOGLE SHEETS WRITE may partially succeed. Never retry unknown outcomes. Type '+phrase+' (hidden): ',
  maxChars:75,allowSpaces:true,timeoutMs:30000
 });
 if(answer!==phrase)throw Error('REAL_COMMIT_NOT_CONFIRMED');
 return phrase;
}
