import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const blob=x=>{
 const text=x.replace(/\r\n/g,'\n');
 return createHash('sha1').update('blob '+Buffer.byteLength(text,'utf8')+'\0')
  .update(text,'utf8').digest('hex');
};
const code=readFileSync(new URL('../apps-script/Code.gs',import.meta.url),'utf8');
const report=readFileSync(new URL('../apps-script/ReportReceiver.gs',import.meta.url),'utf8');
const manifest=readFileSync(new URL('../apps-script/appsscript.json',import.meta.url),'utf8');
const updater=readFileSync(new URL('../scripts/update-f010-existing-v3-final.ps1',import.meta.url),'utf8');
test('F010 existing-V3 updater pins ALL THREE exact reviewed files and approved prior preimage',()=>{
 assert.equal(blob(code),'e542d585d4d4840836c9f1114ac350081ebe5952');
 assert.equal(blob(report),'16915ad2164a3dc9d78f5820a1b042c2150cc663');
 assert.equal(blob(manifest),'a8134a3237b2dce1f54ce16a943fbe3e232ce436');
 for(const pin of [
  "oldCodeBlob='f7d878389fe46cfde8619f75a1f9746f45b469a3'",
  "newCodeBlob='"+blob(code)+"'",
  "newReportBlob='"+blob(report)+"'",
  "manifestBlob='"+blob(manifest)+"'"
 ])assert.ok(updater.includes(pin),pin);
});
test('F010 updater is fail-closed, 3-OFF, backup-first and existing-deployment-only',()=>{
 for(const text of [
  "THAIPHC_RECEIVER_ENABLED","THAIPHC_WRITE_ENABLED",
  "THAIPHC_PERSON_DATA_WRITE_ENABLED","THAIPHC_REPORT_SPREADSHEET_ID",
  "list-deployments","@('pull')","Source backup",
  "Remote V3 source is NOT the expected preimage",
  "'update-deployment',$target.deploymentId",
  "'Code.gs'","'ReportReceiver.gs'","'appsscript.json'",
  "BOTH flags" // This is updated below to ALL THREE audit
 ])if(text!=='BOTH flags')assert.ok(updater.includes(text),text);
 assert.match(updater,/all THREE flags OFF/);
 assert.doesNotMatch(updater,/\bcreate-deployment\b|New-Deployment|Invoke-RestMethod|Invoke-WebRequest/);
 assert.doesNotMatch(updater,/AKfycbw6FbaK1XM2AEVt0vokP2Ssz|14yQGRu3EOFVae_IgD/);
});
test('F010 receiver requires exact owner-only approval for the reference-workbook destination and honors the private person switch',()=>{
 assert.ok(code.includes("props.getProperty('THAIPHC_PERSON_DATA_WRITE_ENABLED')!=='true'"));
 assert.ok(report.includes("dest===reference"));
 assert.ok(report.includes("THAIPHC_SAME_WORKBOOK_APPROVAL"));
 assert.ok(report.includes("'OWNER_ONLY_5406_APPROVED'"));
 assert.ok(report.includes("TPH_REPORT_CURRENT='_ThaiPHCReportCurrent'"));
 assert.ok(report.includes("tphRHash_(JSON.stringify(part))!==m.chunkDigests[ord]"));
 assert.ok(report.includes("THE LAST PUBLICATION ACTION"));
 assert.doesNotMatch(report,/\b(?:doPost|doGet)\s*\(/);
});

test('F010 reviewed blob pins tolerate CRLF only and still reject changed source',()=>{
 for(const text of [code,report,manifest]){
  const lf=text.replace(/\r\n/g,'\n');
  assert.equal(blob(lf),blob(lf.replace(/\n/g,'\r\n')));
  assert.notEqual(blob(lf+'// changed\n'),blob(lf));
 }
});
