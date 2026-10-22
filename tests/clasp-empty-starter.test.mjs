import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {classifyPulledProject,STARTER_FILE} from '../scripts/verify-pulled-apps-script.mjs';

const sample='function myFunction() {\n  \n}\n'; // 29-byte empty starter as operator observed
function fixture(files,fn) {
  const dir=mkdtempSync(join(tmpdir(),'thaiphc-t012-'));
  try {
    for(const [name,value] of Object.entries(files)) {
      const dest=join(dir,name);
      if(value===null)mkdirSync(dest);
      else writeFileSync(dest,value);
    }
    return fn(dir);
  } finally {
    rmSync(dir,{recursive:true,force:true});
  }
}
const base={'.clasp.json':'{"scriptId":"FAKE_ID"}','appsscript.json':'{"runtimeVersion":"V8"}'};

test('T012 recognize no prior source, manifest-only project',()=>{
 fixture(base,dir=>assert.equal(classifyPulledProject(dir),'EMPTY'));
});
test('T012 recognize exactly one Thai-language empty myFunction starter, without modifying it',()=>{
 fixture({...base,[STARTER_FILE]:sample},dir=>{
  const before=readFileSync(join(dir,STARTER_FILE));
  assert.equal(classifyPulledProject(dir),'DEFAULT_STARTER');
  assert.deepEqual(readFileSync(join(dir,STARTER_FILE)),before);
 });
});
test('T012 allow compact whitespace-only empty myFunction',()=>{
 fixture({...base,[STARTER_FILE]:'\nfunction   myFunction ( ) \n { \n  }\r\n'},dir=>{
  assert.equal(classifyPulledProject(dir),'DEFAULT_STARTER');
 });
});
test('T012 deny Thai starter with any function body, even if filename matches',()=>{
 const candidates=[
  "function myFunction(){SpreadsheetApp.openById('someid')}",
  'function myFunction(){return 1}',
  'function myFunction(){};doPost=(e)=>({})',
  'function myFunction(){/*comment*/}',
  'function myFunction(){} // comment',
  'function myFunction(){}\nfunction extra(){}',
 ];
 for(const content of candidates){
  fixture({...base,[STARTER_FILE]:content},dir=>{
   assert.throws(()=>classifyPulledProject(dir),/UNEXPECTED_REMOTE_SOURCE/);
  });
 }
});
test('T012 deny unexpected English file even when default starter',()=>{
 fixture({...base,'Code.js':sample},dir=>{
  assert.throws(()=>classifyPulledProject(dir),/UNEXPECTED_REMOTE_SOURCE/);
 });
});
test('T012 deny two source files even when one is empty starter',()=>{
 fixture({...base,[STARTER_FILE]:sample,'other.js':'const running=true;'},dir=>{
  assert.throws(()=>classifyPulledProject(dir),/UNEXPECTED_REMOTE_SOURCE/);
 });
});
test('T012 deny subdirectories and other unknown pulled artifacts',()=>{
 fixture({...base,files:null},dir=>{
  assert.throws(()=>classifyPulledProject(dir),/UNEXPECTED_REMOTE_SOURCE/);
 });
});
test('T012 deny missing manifest or local clasp identity',()=>{
 fixture({'.clasp.json':'{}',[STARTER_FILE]:sample},dir=>{
  assert.throws(()=>classifyPulledProject(dir),/MISSING_EXPECTED_STAGING_FILES/);
 });
 fixture({'appsscript.json':'{}',[STARTER_FILE]:sample},dir=>{
  assert.throws(()=>classifyPulledProject(dir),/MISSING_EXPECTED_STAGING_FILES/);
 });
});
test('T012 deny oversized starter despite whitespace-only-looking body',()=>{
 fixture({...base,[STARTER_FILE]:'function myFunction(){'+(' '.repeat(129))+'}'},dir=>{
  assert.throws(()=>classifyPulledProject(dir),/UNEXPECTED_REMOTE_SOURCE/);
 });
});
test('T012 subprocess exits nonzero for unfamiliar source, no changes to files',()=>{
 fixture({...base,'untrusted.js':'const secret=123;'},dir=>{
  const scriptPath=new URL('../scripts/verify-pulled-apps-script.mjs',import.meta.url);
  const result=spawnSync(process.execPath,[fileURLToPath(scriptPath),dir],{encoding:'utf8'});
  assert.equal(result.status,2);
  assert.match(result.stderr,/REMOTE_PREFLIGHT_STOP/);
  assert.equal(readFileSync(join(dir,'untrusted.js'),'utf8'),'const secret=123;');
 });
});
test('T012 deploy PS backs up BEFORE classifier and removes only verified empty temporary starter',()=>{
 const src=readFileSync(new URL('../scripts/deploy-existing-apps-script.ps1',import.meta.url),'utf8');
 const backupPos=src.indexOf("Copy-Item -LiteralPath $file.FullName -Destination $destination -Force");
 const checkPos=src.indexOf("verify-pulled-apps-script.mjs");
 const removePos=src.indexOf("Remove-Item -LiteralPath (Join-Path $staging 'รหัส.js') -Force");
 const copyPos=src.indexOf("Copy-Item -LiteralPath $source -Destination (Join-Path $staging 'Code.gs')");
 const pushPos=src.indexOf("Invoke-Clasp -ClaspArgs @('push','--force')");
 assert.ok(backupPos>=0&&backupPos<checkPos&&checkPos<removePos&&removePos<copyPos&&copyPos<pushPos);
 assert.match(src,/if \(\$audit -ceq 'DEFAULT_STARTER'\)/);
 assert.match(src,/elseif \(\$audit -cne 'EMPTY'\)/);
 assert.match(src,/if \(\$LASTEXITCODE -ne 0\)/);
 assert.match(src,/Existing remote code detected. STOP/);
 assert.doesNotMatch(src,/Remove-Item\s+-LiteralPath\s+\$backup/);
 assert.match(src,/Only Code\.gs \+ appsscript\.json will be pushed/);
 assert.match(src,/Not dev-receiver\.gs/);
});
