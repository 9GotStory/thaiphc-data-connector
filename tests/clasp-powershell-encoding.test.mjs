import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const ps=readFileSync(new URL('../scripts/deploy-existing-apps-script.ps1',import.meta.url),'utf8');
const helper=readFileSync(new URL('../scripts/verify-pulled-apps-script.mjs',import.meta.url),'utf8');

test('T013 Windows PowerShell deployment file contains ASCII only, preventing ANSI mojibake',()=>{
 const nonAscii=[...ps].filter(ch=>ch.charCodeAt(0)>127);
 assert.deepEqual(nonAscii,[]);
 assert.doesNotMatch(ps,/รหัส\.js|à¸£à¸«à¸±à¸ª\.js/);
});

test('T013 verified starter gets actual filesystem path, never decoded Thai literal',()=>{
 assert.match(ps,/\$starterFiles\s*=\s*@\(\$remoteFiles\s*\|\s*Where-Object\s*\{\s*\$_\.Name -cne 'appsscript\.json'\s*\}\)/);
 assert.match(ps,/\$starterFiles\.Count -ne 1/);
 assert.match(ps,/Test-Path -LiteralPath \$starterFiles\[0\]\.FullName -PathType Leaf/);
 assert.match(ps,/Remove-Item -LiteralPath \$starterFiles\[0\]\.FullName -Force -ErrorAction Stop/);
 assert.doesNotMatch(ps,/Remove-Item -LiteralPath \(Join-Path \$staging '[^']+\.js'\)/);
});

test('T013 only Node UTF-8 verifier decides whether the remote source is an empty Thai starter',()=>{
 assert.match(helper,/export const STARTER_FILE = 'รหัส\.js'/);
 assert.match(helper,/DEFAULT_STARTER\.test\(bytes\.toString\('utf8'\)\)/);
 assert.match(helper,/other\.length !== 1 \|\| other\[0\] !== STARTER_FILE/);
 assert.match(ps,/if \(\$audit -ceq 'DEFAULT_STARTER'\)/);
 assert.match(ps,/elseif \(\$audit -cne 'EMPTY'\)/);
});

test('T013 backup precedes UTF-8 verification, staged deletion, and manual push',()=>{
 const pos=[
   ps.indexOf("Copy-Item -LiteralPath $file.FullName -Destination $destination -Force"),
   ps.indexOf("$auditOutput = @(& node.exe $auditTool $staging)"),
   ps.indexOf("Remove-Item -LiteralPath $starterFiles[0].FullName -Force -ErrorAction Stop"),
   ps.indexOf("Copy-Item -LiteralPath $source -Destination (Join-Path $staging 'Code.gs')"),
   ps.indexOf("Invoke-Clasp -ClaspArgs @('push','--force')")
 ];
 assert.ok(pos.every(x=>x>=0) && pos.every((x,i)=>i===0||x>pos[i-1]));
 assert.match(ps,/Verified empty starter path mismatch\. STOP before push\./);
 assert.match(ps,/Existing remote code detected\. STOP/);
 assert.match(ps,/Read-Host 'Type PUSH/);
 assert.match(ps,/Read-Host 'Type UPDATE/);
 assert.doesNotMatch(ps,/Remove-Item -LiteralPath \$backup/);
});

test('T013 does not modify receiver code, change targets, or create a new deployment',()=>{
 assert.match(ps,/\$target\.scriptId/);
 assert.match(ps,/\$target\.deploymentId/);
 assert.match(ps,/\$target\.spreadsheetId/);
 assert.match(ps,/\$reviewedCodeBlob = 'abc71275ab30dca1f57d1d0e33b8c2773452a194'/);
 assert.match(ps,/\$reviewedManifestBlob = 'a8134a3237b2dce1f54ce16a943fbe3e232ce436'/);
 assert.match(ps,/update-deployment/);
 assert.doesNotMatch(ps,/create-deployment|create-script/);
});

test('T014 staged file allowlist is case-sensitive and independent of PowerShell sort order',()=>{
 assert.match(ps,/\$stagedFiles\.Count -ne 2/);
 assert.match(ps,/-not \(\$stagedFiles -ccontains 'Code\.gs'\)/);
 assert.match(ps,/-not \(\$stagedFiles -ccontains 'appsscript\.json'\)/);
 assert.doesNotMatch(ps,/\$stagedFiles\[\d+\]\s+-ne\s+'(?:Code\.gs|appsscript\.json)'/);
 assert.match(ps,/Where-Object \{ \$_\.Name -ne '\.clasp\.json' \}/);
});

test('T014 two-file allowlist accepts both permutations and refuses extras or wrong case',()=>{
 const exactNames=[...ps.matchAll(/-ccontains '(Code\.gs|appsscript\.json)'/g)].map(match=>match[1]);
 assert.deepEqual(exactNames,['Code.gs','appsscript.json']);
 const accepted=files=>files.length===2 && exactNames.every(name=>files.includes(name));
 assert.equal(accepted(['Code.gs','appsscript.json']),true);
 assert.equal(accepted(['appsscript.json','Code.gs']),true);
 for(const files of [
  ['Code.gs'],
  ['Code.gs','appsscript.json','dev-receiver.gs'],
  ['Code.gs','appsscript.json','.clasp.json'],
  ['code.gs','appsscript.json'],
  ['Code.gs','Appsscript.json'],
  ['nested/Code.gs','appsscript.json'],
  ['Code.gs','Code.gs'],
 ])assert.equal(accepted(files),false,files.join(', '));
});
