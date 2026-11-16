import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const receiver=readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8');
const manifest=readFileSync(new URL('../apps-script/appsscript.json',import.meta.url),'utf8');
const updater=readFileSync(new URL('../scripts/update-existing-web-app-final.ps1',import.meta.url),'utf8');
const gitBlob=text=>{
 const normalized=text.replace(/\r\n/g,'\n');
 return createHash('sha1').update('blob '+Buffer.byteLength(normalized,'utf8')+'\0')
  .update(normalized,'utf8').digest('hex');
};

test('T009D legacy V3 updater remains pinned to former F009 source and rejects F010 receiver',()=>{
 const receiverBlob=gitBlob(receiver);
 const manifestBlob=gitBlob(manifest);
 assert.notEqual(receiverBlob,'f7d878389fe46cfde8619f75a1f9746f45b469a3'); // F010 must use a NEW guarded updater
 assert.equal(manifestBlob,'a8134a3237b2dce1f54ce16a943fbe3e232ce436');
 assert.match(updater,/\$oldCodeBlob = 'abc71275ab30dca1f57d1d0e33b8c2773452a194'/);
 assert.ok(updater.includes("$reviewedNewCodeBlob = 'f7d878389fe46cfde8619f75a1f9746f45b469a3'"));
 assert.ok(updater.includes("$reviewedManifestBlob = '"+manifestBlob+"'"));
});

test('T009D V3 updater is guarded: remote backup, exact preimage, existing deployment only, and flag checks',()=>{
 for(const required of [
  "THAIPHC_RECEIVER_ENABLED","THAIPHC_WRITE_ENABLED",
  "list-deployments","@('pull')","@('push','--force')",
  "'update-deployment',$target.deploymentId",
  "Remote project backup","Remote source does not match the known T010 preimage",
  "BOTH flags OFF","Read-Host","$oldCodeBlob",
  "Code.gs","appsscript.json","git -C $repo status --porcelain"
 ])assert.ok(updater.includes(required),required);
 assert.doesNotMatch(updater,/\b(?:create-deployment|clasp\s+deploy|Set-ExecutionPolicy|Invoke-RestMethod|Invoke-WebRequest)\b/);
 assert.doesNotMatch(updater,/AKfycbw6FbaK1XM2AEVt0vokP2Ssz|14yQGRu3EOFVae_IgD/);
 assert.doesNotMatch(updater,/\b(?:THAIPHC_HMAC_KEY_B64|Authorization:\s*Bearer|--token)\b/);
});

test('T009D receiver extends columns only for newly created sheets; never expands an existing tab',()=>{
 const start=receiver.indexOf('function tphWrite_(b,spreadsheetId)');
 assert.ok(start>0);
 const newSheet=receiver.indexOf('if(!sheet){',start);
 const expand=receiver.indexOf('sheet.insertColumnsAfter(currentColumns,headers.length-currentColumns)',newSheet);
 const endIf=receiver.indexOf('const colCount=headers.length',newSheet);
 assert.ok(newSheet>=start&&expand>newSheet&&expand<endIf);
 assert.ok(receiver.includes('sheet.getMaxColumns()'));
 assert.ok(receiver.includes("props.getProperty('THAIPHC_WRITE_ENABLED')!=='true'"));
 assert.ok(receiver.includes("props.getProperty('THAIPHC_RECEIVER_ENABLED')!=='true'"));
});
