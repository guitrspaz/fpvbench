import {test,expect,beforeEach,afterEach,jest} from '@jest/globals';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createServer} from '../src/server.mjs';
import {createStore} from '../src/store.mjs';
import {createMemoryRepository} from './helpers/memory-repository.mjs';
import {createAirdataService} from '../src/airdata.mjs';
import {createFilingService} from '../src/import-filing.mjs';
let root,folder,server,base,fetchImpl;
const request=(path,input,headers={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(input)});
beforeEach(async()=>{
 root=await mkdtemp(join(tmpdir(),'fpvbench-bulk-api-'));folder=join(root,'records');await mkdir(folder);
 const bytes=Buffer.alloc(16);Buffer.from([0x55,0x4c,0x6f,0x67,1,0x12,0x35]).copy(bytes);await writeFile(join(folder,'synthetic.ulg'),bytes);
 fetchImpl=jest.fn(()=>{throw new Error('No provider call is allowed.');});
 server=await createServer({dataDir:join(root,'workspace'),storeFactory:dir=>createStore(dir,{repositoryFactory:createMemoryRepository}),airdataFactory:(dir,options)=>createAirdataService(dir,{...options,fetchImpl}),filingFactory:(dir,options)=>createFilingService(dir,{...options,defaultFolder:folder})});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
});
afterEach(async()=>{await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});});
test('manual bulk endpoint works without credentials and clears folder review without rescanning',async()=>{
 const scan=await(await request('/api/filing/scan',{})).json();
 const imported=await(await request('/api/filing/import',{scanId:scan.id,fileIds:[scan.files[0].id]})).json();
 const id=imported.results[0].logId;expect(imported.scan.summary.airdataToReview).toBe(1);
 const response=await request('/api/flight-logs/mark-uploaded',{ids:[id]});expect(response.status).toBe(200);
 expect(await response.json()).toEqual({selected:1,updated:1,alreadyUploaded:0});
 const refreshed=await(await fetch(base+'/api/filing/scan')).json();expect(refreshed.id).toBe(scan.id);expect(refreshed.summary.airdataToReview).toBe(0);expect(refreshed.files[0].airdata.state).toBe('manual-sent');
 expect((await(await fetch(base+'/api/airdata/settings')).json()).available).toBe(false);expect(fetchImpl).not.toHaveBeenCalled();
});
test('origin, JSON body, bounded input and fields are checked before any mark',async()=>{
 expect((await request('/api/flight-logs/mark-uploaded',{ids:[]}, {Origin:'https://foreign.example'})).status).toBe(403);
 for(const body of [{ids:[]},{ids:['missing'],all:true},{ids:Array(1001).fill('id')}])expect((await request('/api/flight-logs/mark-uploaded',body)).status).toBe(400);
 expect((await request('/api/flight-logs/mark-uploaded',{ids:['missing']})).status).toBe(404);
 expect((await request('/api/flight-logs/mark-uploaded',{extra:'x'.repeat(70000)})).status).toBe(413);
 expect((await(await fetch(base+'/api/state')).json()).flightLogs).toEqual([]);expect(fetchImpl).not.toHaveBeenCalled();
});
