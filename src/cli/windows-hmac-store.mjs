// Windows-only HMAC key convenience, NOT a change to the HMAC protocol.
// DPAPI user-bound encrypted ciphertext is stored under LOCALAPPDATA outside git.
// No key in argv, environment, plaintext disk files, CLI logs or issue comments.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const PS_SCRIPT=fileURLToPath(new URL('../../scripts/hmac-current-user.ps1',import.meta.url));
const RE=/^[A-Za-z0-9+/]{43}=$/;
// This option applies only to the spawned PowerShell process. RemoteSigned
// permits a trusted local repository script on Restricted-by-default Windows
// without changing CurrentUser/LocalMachine policy; Group Policy still wins.
// Never fall back to Bypass, Unrestricted, unsigned remote downloads, or
// Set-ExecutionPolicy registry changes.
const LOCAL_SCRIPT_POLICY=['-ExecutionPolicy','RemoteSigned'];
export function readStoredHmac({platform=process.platform,spawn=spawnSync}={}){
 if(platform!=='win32')throw Error('HMAC_STORE_WINDOWS_ONLY');
 const child=spawn('powershell.exe',[
  '-NoProfile',...LOCAL_SCRIPT_POLICY,'-NonInteractive','-File',PS_SCRIPT,'-Action','get'
 ],{
  stdio:['ignore','pipe','ignore'],
  windowsHide:true,timeout:15000,maxBuffer:512,encoding:'buffer'
 });
 if(child.error||child.status!==0||!Buffer.isBuffer(child.stdout)){
  child.stdout?.fill?.(0);
  throw Error('HMAC_STORE_NOT_READY');
 }
 const key=child.stdout.toString('ascii');
 child.stdout.fill(0);
 if(!RE.test(key))throw Error('HMAC_STORE_INVALID');
 return key;
}
export function setupStoredHmac({platform=process.platform,spawn=spawnSync,
 input=process.stdin,output=process.stdout}={}){
 if(platform!=='win32')throw Error('HMAC_STORE_WINDOWS_ONLY');
 if(input?.isTTY!==true||output?.isTTY!==true)
  throw Error('SECURE_INTERACTIVE_TTY_REQUIRED');
 const result=spawn('powershell.exe',[
  '-NoProfile',...LOCAL_SCRIPT_POLICY,'-File',PS_SCRIPT,'-Action','set'
 ],{stdio:'inherit',windowsHide:false,timeout:120000});
 if(result.error||result.status!==0)throw Error('HMAC_STORE_SETUP_FAILED');
 return true;
}
