import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';

const script=fileURLToPath(new URL('./windows/lao-autostart.ps1',import.meta.url));
test('autostart switch only creates and removes its own user Startup shortcut',
  {skip:process.platform!=='win32'},()=>{
    const dir=mkdtempSync(join(tmpdir(),'lao-startup-toggle-'));
    const safe=dir.replaceAll("'","''");
    const code=(command:string)=>execFileSync('powershell.exe',[
      '-NoProfile','-STA','-ExecutionPolicy','Bypass','-Command',
      ". '"+script.replaceAll("'","''")+"'; "+command,
    ],{encoding:'utf8',windowsHide:true,timeout:12000}).trim();
    try{
      assert.equal(code("Get-LaoTrayAutostart '"+safe+"'"),'False');
      code("Set-LaoTrayAutostart $true '"+safe+"'");
      assert.equal(code("Get-LaoTrayAutostart '"+safe+"'"),'True');
      assert.ok(existsSync(join(dir,'LAO DevSpace Monitor.lnk')));
      assert.ok(existsSync(join(dir,'LAO DevSpace Daemon.lnk')));
      code("Set-LaoTrayAutostart $false '"+safe+"'");
      assert.equal(code("Get-LaoTrayAutostart '"+safe+"'"),'False');
      assert.equal(existsSync(join(dir,'LAO DevSpace Monitor.lnk')),false);
      assert.equal(existsSync(join(dir,'LAO DevSpace Daemon.lnk')),false);
    }finally{rmSync(dir,{recursive:true,force:true});}
  });
