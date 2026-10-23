// Mounted volumes can be root-owned. Initialize only our state files, then drop privileges.
import {mkdir,chown} from 'node:fs/promises';
import path from 'node:path';
const directory=process.env.STATE_DIR||'/app/runtime';
if(process.getuid?.()===0){await mkdir(directory,{recursive:true});await chown(directory,1000,1000);for(const name of ['operations.json','operations.json.tmp','ai-usage.json','ai-usage.json.tmp']){try{await chown(path.join(directory,name),1000,1000)}catch(e){if(e.code!=='ENOENT')throw e}}process.setgroups([]);process.setgid(1000);process.setuid(1000)}
await import('./server.mjs');
