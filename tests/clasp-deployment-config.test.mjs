import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const cfg=JSON.parse(read('config/thaiphc-targets.json'));
const ps=read('scripts/deploy-existing-apps-script.ps1');

test('T011 tracks exactly the approved 3 non-secret destination IDs',()=>{
 assert.equal(cfg.scriptId,'131WvR9DXpBFlh4snqGQG3VVV5ljkqcysRK_s0-HaKwQDnzpZs2UfCkE6');
 assert.equal(cfg.deploymentId,'AKfycbwVnsHsWXRP_VliCUmOQ0bpRaHqjlR8YDe_JFUf39hRtBBiTknpXaGDESZTzCfQYLmDlg');
 assert.equal(cfg.spreadsheetId,'14yQGRu3EOFVae_IgDR4A3uEGqaza6a2bAhX-DYx68lA');
 assert.deepEqual(Object.keys(cfg).sort(),['deploymentId','description','scriptId','spreadsheetId'].sort());
 assert.doesNotMatch(JSON.stringify(cfg),/token|bearer|HMAC_KEY|password|secret\s*:/i);
});
test('T011 deployment tool reads IDs only from versioned config',()=>{
 assert.match(ps,/config\\thaiphc-targets\.json/);
 assert.match(ps,/\$target\.scriptId/);
 assert.match(ps,/\$target\.deploymentId/);
 assert.match(ps,/\$target\.spreadsheetId/);
 assert.doesNotMatch(ps,/131WvR9DXpBFlh4snqGQG3VVV5ljkqcysRK_s0-HaKwQDnzpZs2UfCkE6|AKfycbwVnsHsWXRP|14yQGRu3EOFVae_IgDR4A3uEGqaza6a2bAhX-DYx68lA/);
});
test('T011 installation is manual/interactive, no new project/deployment',()=>{
 assert.match(ps,/Read-Host 'After verifying BOTH switches are OFF, type OFF'/);
 assert.match(ps,/Read-Host 'Type PUSH/);
 assert.match(ps,/Read-Host 'Type UPDATE/);
 assert.match(ps,/@\('push','--force'\)/);
 assert.match(ps,/update-deployment/);
 assert.match(ps,/list-deployments/);
 assert.doesNotMatch(ps,/create-deployment|create-script/);
 assert.match(ps,/\[switch\]\$PushOnly/);
});
test('T011 stages only Code.gs and appsscript.json; blocks existing remote source',()=>{
 assert.match(ps,/apps-script\\Code\.gs/);
 assert.match(ps,/apps-script\\appsscript\.json/);
 assert.match(ps,/Only Code\.gs \+ appsscript\.json will be pushed/);
 assert.match(ps,/Not dev-receiver\.gs/);
 assert.match(ps,/Existing remote code detected\. STOP/);
 assert.match(ps,/@\('pull'\)/);
 assert.match(ps,/Remote source backup/);
});
test('T011 requires clean main, unchanged SHA-reviewed receiver, CI and safe script flags',()=>{
 assert.match(ps,/branch','--show-current/);
 assert.match(ps,/--untracked-files=no/);
 assert.match(ps,/abc71275ab30dca1f57d1d0e33b8c2773452a194/);
 assert.match(ps,/a8134a3237b2dce1f54ce16a943fbe3e232ce436/);
 assert.match(ps,/THAIPHC_RECEIVER_ENABLED/);
 assert.match(ps,/THAIPHC_WRITE_ENABLED/);
 assert.match(ps,/& npm\.cmd --prefix \$repo test/);
});
test('T011 never writes a live spreadsheet or reads ThaiPHC records',()=>{
 assert.doesNotMatch(ps,/(?:SpreadsheetApp|UrlFetchApp|Bearer|ThaiPHC API GET)\s*\./);
 assert.doesNotMatch(ps,/\.env|THAIPHC_HMAC_KEY_B64\s*=/);
});
