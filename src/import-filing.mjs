import {constants} from 'node:fs';
import {lstat,open,opendir,realpath} from 'node:fs/promises';
import {join,resolve,dirname,sep,isAbsolute} from 'node:path';
import {homedir} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {AppError} from './errors.mjs';
import {objectInput,textField} from './workspace-validation.mjs';
import {readPrivateJson,writePrivateJson} from './ai-private-files.mjs';
import {supportsLogFilename} from './log-import.mjs';

const CONFIG='.filing-config.json';
const defaults={entries:5000,files:2000,depth:8,bytes:2*1024**3,ms:30000,ttlMs:30*60*1000,fileBytes:25*1024*1024};
const fingerprint=info=>[info.dev,info.ino,info.size,info.mtimeMs,info.ctimeMs];
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const within=(root,path)=>path===root||path.startsWith(root+sep);
class ScanLimit extends Error {}
function normalizeFolder(value) {
  textField(value,'folder',{required:true,max:4096});
  const expanded=value==='~'?homedir():value.startsWith('~/')?join(homedir(),value.slice(2)):value;
  if(!isAbsolute(expanded))throw new AppError('Choose an absolute folder path or a path beginning with ~/.');
  return resolve(expanded);
}

/** Explicit folder scans and imports. Source folders are never modified; scans and paths are computer-local. */
export async function createFilingService(dataDir,{store,defaultFolder=join(homedir(),'Documents','FlightRecords'),limits:overrides={},now=Date.now}={}) {
  const limits={...defaults,...overrides};
  let config={version:1,folder:normalizeFolder(defaultFolder),includeSubfolders:true},locked=false,closed=false,busy=false,active=Promise.resolve(),snapshot=null;
  try {
    const saved=await readPrivateJson(dataDir,CONFIG);
    if(saved) {
      if(Object.keys(saved).sort().join()!=='folder,includeSubfolders,version'||saved.version!==1||typeof saved.includeSubfolders!=='boolean'||normalizeFolder(saved.folder)!==saved.folder)throw new Error('Invalid filing config');
      config=saved;
    }
  }catch{locked=true;}
  const settings=()=>({folder:config.folder,includeSubfolders:config.includeSubfolders,locked,busy,reason:locked?'Folder settings are unreadable. Preserve the private configuration before repair.':null});
  const exclusive=operation=>{
    if(closed||locked||busy)return Promise.reject(new AppError(closed?'Import filing is closed.':locked?settings().reason:'Another folder operation is running. Wait for it to finish.',409));
    busy=true;
    const result=Promise.resolve().then(operation).finally(()=>{busy=false;});
    active=result.catch(()=>{});return result;
  };
  async function prepareRoot(folder) {
    let info,canonical;
    try {info=await lstat(folder);canonical=await realpath(folder);}
    catch{throw new AppError('Choose an existing readable local folder.');}
    if(!info.isDirectory()||info.isSymbolicLink())throw new AppError('Choose a regular folder, not a symbolic link.');
    const privateRoot=await realpath(dataDir);
    if(within(privateRoot,canonical))throw new AppError('Choose a source folder outside the FPVBench workspace.');
    return {root:canonical,rootIdentity:[info.dev,info.ino],workspaceRoot:privateRoot};
  }
  async function checkRoot(scan) {
    const info=await lstat(scan.root);
    if(!info.isDirectory()||info.isSymbolicLink()||!same([info.dev,info.ino],scan.rootIdentity)||await realpath(scan.root)!==scan.root)throw new AppError('The source folder changed. Scan it again.',409);
  }
  async function safeRead(scan,file,capture=false,budget=null,retried=false) {
    await checkRoot(scan);
    const path=resolve(scan.root,file.relativePath);
    if(!within(scan.root,path)||path===scan.root||await realpath(dirname(path))!==dirname(path))throw new AppError('The source path changed. Scan it again.',409);
    const info=await lstat(path);
    if(!info.isFile()||info.isSymbolicLink()||info.size<1||info.size>limits.fileBytes)throw new AppError('Choose a nonempty regular log file up to 25 MiB.');
    const before=fingerprint(info);
    if(file.fingerprint&&!same(file.fingerprint,before))throw new AppError('This file changed since scanning. Scan it again.',409);
    if(budget&&budget.bytes+info.size>limits.bytes)throw new ScanLimit('Scan stopped at the total byte limit.');
    const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
    try {
      if(!same(fingerprint(await handle.stat()),before))throw new AppError('The source file changed. Scan it again.',409);
      const hash=createHash('sha256'),chunks=[],buffer=Buffer.alloc(65536);let size=0;
      for(;;) {
        if(budget&&now()-budget.started>=limits.ms)throw new ScanLimit('Scan stopped at the time limit.');
        const {bytesRead}=await handle.read(buffer,0,buffer.length,null);if(!bytesRead)break;
        size+=bytesRead;
        if(size>limits.fileBytes)throw new AppError('The file grew beyond the import size limit. Scan again.',409);
        if(budget){budget.bytes+=bytesRead;if(budget.bytes>limits.bytes)throw new ScanLimit('Scan stopped at the total byte limit.');}
        const part=buffer.subarray(0,bytesRead);hash.update(part);if(capture)chunks.push(Buffer.from(part));
      }
      const sha256=hash.digest('hex'),after=fingerprint(await handle.stat()),pathAfter=fingerprint(await lstat(path));
      if(size!==info.size||!same(after,pathAfter)||await realpath(dirname(path))!==dirname(path))throw new AppError('The source file changed. Scan it again.',409);
      await checkRoot(scan);
      if(!same(after,before)) {
        // Some filesystems finish local file hydration by changing ctime during the first read.
        // A scan may retry once, requiring identical bytes and stable metadata on the second pass.
        if(!capture&&budget&&!retried&&same(after.slice(0,4),before.slice(0,4)))return safeRead(scan,{...file,fingerprint:after,sha256},false,budget,true);
        throw new AppError('The source file changed. Scan it again.',409);
      }
      if(file.sha256&&file.sha256!==sha256)throw new AppError('The file contents changed. Scan again.',409);
      return {sha256,fingerprint:before,byteLength:size,modifiedAt:new Date(info.mtimeMs).toISOString(),...(capture?{bytes:Buffer.concat(chunks,size)}:{})};
    }finally{await handle.close();}
  }
  function current() {
    if(snapshot&&now()>=snapshot.expiresMs)snapshot=null;
    return snapshot;
  }
  function report() {
    const scan=current();if(!scan)return null;
    const state=store.getState(),catalog=new Map(state.flightLogs.map(log=>[log.sha256,log]));
    const unassigned=new Set(),newHashes=new Set();
    const files=scan.files.map(file=>{
      const log=file.sha256?catalog.get(file.sha256):null;
      if(log?.aircraftId===null)unassigned.add(log.id);
      if(!log&&file.sha256)newHashes.add(file.sha256);
      return {id:file.id,relativePath:file.relativePath,byteLength:file.byteLength,modifiedAt:file.modifiedAt??null,sha256:file.sha256??null,duplicateOf:file.duplicateOf??null,error:file.error??null,errorCode:file.errorCode??null,
        libraryState:file.error?'blocked':log?'imported':'new',importable:!file.error&&!log&&!file.duplicateOf,
        logId:log?.id??null,aircraftId:log?.aircraftId??null,aircraftName:log?state.aircraft.find(aircraft=>aircraft.id===log.aircraftId)?.name??null:null};
    });
    return {id:scan.id,folder:scan.folder,includeSubfolders:scan.includeSubfolders,scannedAt:scan.scannedAt,expiresAt:new Date(scan.expiresMs).toISOString(),complete:scan.complete,warnings:[...scan.warnings],skipped:{...scan.skipped},files,
      summary:{newOriginals:newHashes.size,alreadyImportedFiles:files.filter(file=>file.logId).length,extraCopies:files.filter(file=>file.duplicateOf).length,unassignedImports:unassigned.size,blockedFiles:files.filter(file=>file.error).length}};
  }
  return {
    getSettings:async()=>settings(),
    /** Save only a location preference; never scan or import on a settings save. */
    updateSettings:input=>exclusive(async()=>{
      objectInput(input,['folder','includeSubfolders']);
      const next={...config};
      if(Object.hasOwn(input,'folder'))next.folder=normalizeFolder(input.folder);
      if(Object.hasOwn(input,'includeSubfolders')) {
        if(typeof input.includeSubfolders!=='boolean')throw new AppError('Choose whether to include subfolders.');
        next.includeSubfolders=input.includeSubfolders;
      }
      await prepareRoot(next.folder);await writePrivateJson(dataDir,CONFIG,next);config=next;snapshot=null;return settings();
    }),
    getScan:report,
    /** Hash a bounded folder snapshot without decoding files, importing records, or contacting providers. */
    scanFolder:()=>exclusive(async()=>{
      const root=await prepareRoot(config.folder),started=now();
      const scan={...root,id:randomUUID(),folder:config.folder,includeSubfolders:config.includeSubfolders,scannedAt:new Date(started).toISOString(),expiresMs:started+limits.ttlMs,files:[],warnings:[],complete:true,skipped:{hidden:0,unsupported:0,symlinks:0,subfolders:0,errors:0,workspace:0}};
      snapshot=null;
      const budget={entries:0,files:0,bytes:0,started},seen=new Map();
      const partial=message=>{scan.complete=false;if(!scan.warnings.includes(message))scan.warnings.push(message);};
      async function walk(relativeDir='',depth=0) {
        if(now()-started>=limits.ms)throw new ScanLimit('Scan stopped at the time limit.');
        const directory=join(scan.root,relativeDir);
        if(await realpath(directory)!==directory){scan.skipped.symlinks++;partial('A folder changed during scanning; scan again.');return;}
        let entries=[];
        try {
          const handle=await opendir(directory);
          for await(const entry of handle) {
            if(budget.entries>=limits.entries)throw new ScanLimit('Scan stopped at the directory-entry limit.');
            budget.entries++;entries.push(entry);
          }
        }catch(error){if(error instanceof ScanLimit)throw error;if(!relativeDir)throw new AppError('The source folder could not be read.');scan.skipped.errors++;partial('A subfolder could not be read.');return;}
        entries.sort((a,b)=>a.name.localeCompare(b.name));
        for(const entry of entries) {
          if(now()-started>=limits.ms)throw new ScanLimit('Scan stopped at the time limit.');
          if(entry.name.startsWith('.')){scan.skipped.hidden++;continue;}
          const rel=join(relativeDir,entry.name),path=join(scan.root,rel);
          if(within(scan.workspaceRoot,path)){scan.skipped.workspace++;continue;}
          let info;try{info=await lstat(path);}catch{scan.skipped.errors++;partial('A folder entry could not be read.');continue;}
          if(info.isSymbolicLink()){scan.skipped.symlinks++;continue;}
          if(info.isDirectory()) {
            if(!config.includeSubfolders){scan.skipped.subfolders++;continue;}
            if(depth>=limits.depth){scan.skipped.subfolders++;partial('The subfolder depth limit was reached.');continue;}
            await walk(rel,depth+1);continue;
          }
          if(!info.isFile()||!supportsLogFilename(entry.name)){scan.skipped.unsupported++;continue;}
          if(budget.files>=limits.files)throw new ScanLimit('Scan stopped at the candidate-file limit.');
          budget.files++;
          const file={id:randomUUID(),relativePath:rel,byteLength:info.size};
          try {
            Object.assign(file,await safeRead(scan,file,false,budget));
            if(seen.has(file.sha256))file.duplicateOf=seen.get(file.sha256);else seen.set(file.sha256,rel);
          }catch(error){
            if(error instanceof ScanLimit)throw error;
            const unavailable=error.code==='EDEADLK'||(process.platform==='darwin'&&error.errno===-11);
            file.errorCode=unavailable?'EDEADLK':typeof error.code==='string'&&/^[A-Z_]{1,40}$/.test(error.code)?error.code:null;
            file.error=error instanceof AppError?error.message:unavailable?'macOS could not make this file available locally. In Finder, download or keep the folder downloaded, then scan again.':['EACCES','EPERM'].includes(error.code)?'Folder access was denied. Allow the background Node process access to this folder in macOS Privacy & Security, then scan again.':'This file could not be safely read. Scan again.';
          }
          scan.files.push(file);
        }
      }
      try{await walk();await checkRoot(scan);}catch(error){if(error instanceof ScanLimit)partial(error.message);else throw error;}
      snapshot=scan;return report();
    }),
    /** Import explicitly selected scan tokens, rechecking source identity and bytes before each new record. */
    importFiles:input=>exclusive(async()=>{
      objectInput(input,['scanId','fileIds','sourceDevice']);
      const scan=current();
      if(!scan||input.scanId!==scan.id)throw new AppError('This scan expired or changed. Scan the folder again.',409);
      if(!Array.isArray(input.fileIds)||!input.fileIds.length||input.fileIds.length>20||input.fileIds.some(id=>typeof id!=='string'||!scan.files.some(file=>file.id===id)))throw new AppError('Choose 1 to 20 files from the current scan.');
      const sourceDevice=textField(input.sourceDevice??'','sourceDevice',{max:200}),results=[];
      for(const id of new Set(input.fileIds)) {
        const file=scan.files.find(file=>file.id===id);
        try {
          const existing=store.getState().flightLogs.find(log=>log.sha256===file.sha256);
          if(existing){results.push({fileId:id,ok:true,duplicate:true,logId:existing.id});continue;}
          if(file.error||file.duplicateOf)throw new AppError('Select the readable first copy of this original.');
          const {bytes}=await safeRead(scan,file,true);
          const imported=await store.importLog({filename:file.relativePath.split(sep).at(-1),sourceDevice,contentBase64:bytes.toString('base64')});
          results.push({fileId:id,ok:true,duplicate:imported.duplicate,logId:imported.flightLog.id,aircraftId:imported.flightLog.aircraftId,routing:imported.routing});
        }catch(error){results.push({fileId:id,ok:false,error:error instanceof AppError?error.message:'This file could not be imported. It may have changed; scan again.'});}
      }
      return {results,scan:await report()};
    }),
    async close(){closed=true;await active;},
  };
}
