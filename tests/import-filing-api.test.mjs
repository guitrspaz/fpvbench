import {test,expect,beforeEach,afterEach} from '@jest/globals';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from '../src/server.mjs';
import {createStore} from '../src/store.mjs';
import {createMemoryRepository} from './helpers/memory-repository.mjs';
import {createFilingService} from '../src/import-filing.mjs';
let root,folder,server,base;
const request=(path,input,method='POST',headers={})=>fetch(base+path,{method,headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(input)});
beforeEach(async()=>{
 root=await mkdtemp(join(tmpdir(),'fpvbench-filing-api-'));folder=join(root,'records');await mkdir(folder);
 await writeFile(join(folder,'synthetic.ridlog'),'synthetic bytes');
 server=await createServer({dataDir:join(root,'workspace'),storeFactory:directory=>createStore(directory,{repositoryFactory:createMemoryRepository}),filingFactory:(directory,options)=>createFilingService(directory,{...options,defaultFolder:folder})});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
});
afterEach(async()=>{await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});});
test('explicit scans stay read-only until selected tokens are imported and config stays out of backups',async()=>{
 expect(await(await fetch(base+'/api/filing/scan')).json()).toBeNull();
 expect((await request('/api/filing/settings',{folder,includeSubfolders:true},'PATCH')).status).toBe(200);
 expect(await(await fetch(base+'/api/filing/scan')).json()).toBeNull();
 const scanned=await request('/api/filing/scan',{});expect(scanned.status).toBe(200);const scan=await scanned.json();
 expect(scan.summary.newOriginals).toBe(1);
 expect((await(await fetch(base+'/api/state')).json()).flightLogs).toHaveLength(0);
 const imported=await request('/api/filing/import',{scanId:scan.id,fileIds:[scan.files[0].id]});expect(imported.status).toBe(200);
 expect((await imported.json()).results[0]).toMatchObject({ok:true,routing:'unassigned'});
 expect((await(await fetch(base+'/api/filing/scan')).json()).summary.newOriginals).toBe(0);
 const backup=await(await fetch(base+'/api/export')).text();expect(backup).not.toContain(folder);expect(backup).not.toContain('filing-config');
});
test('origin, input, token and body constraints reject before any file import',async()=>{
 expect((await request('/api/filing/scan',{},'POST',{Origin:'https://foreign.example'})).status).toBe(403);
 expect((await request('/api/filing/scan',{folder})).status).toBe(400);
 expect((await request('/api/filing/settings',{watch:true},'PATCH')).status).toBe(400);
 expect((await request('/api/filing/import',{scanId:'unknown',fileIds:['../synthetic.ridlog']})).status).toBe(409);
 expect((await request('/api/filing/scan',{extra:'x'.repeat(2000)})).status).toBe(413);
 expect((await(await fetch(base+'/api/state')).json()).flightLogs).toHaveLength(0);
});
