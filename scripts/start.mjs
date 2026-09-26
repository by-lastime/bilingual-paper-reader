import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const url='http://127.0.0.1:4173';
async function status(){
 try{
  const res=await fetch(url+'/api/paper',{signal:AbortSignal.timeout(1200)});
  if(!res.ok)return 'other';
  const json=await res.json();
  return json.paths?.chinese===path.join(root,'content/paper.zh.md')?'ready':'other';
 }catch(e){return e.code==='ECONNREFUSED'||e.cause?.code==='ECONNREFUSED'?'off':'unknown';}
}
let state=await status();
if(state==='other'||state==='unknown')throw Error('4173 端口正在被其他服务使用或尚未响应。未停止其他进程，请先检查。');
if(state==='off'){
 fs.mkdirSync(path.join(root,'.logs'),{recursive:true});
 const log=fs.openSync(path.join(root,'.logs/server.log'),'a');
 const env={...process.env};delete env.READER_PREVIEW;env.PORT='4173';
 const child=spawn(process.execPath,['server.mjs'],{cwd:root,env,detached:true,stdio:['ignore',log,log]});
 child.unref();fs.closeSync(log);
 fs.writeFileSync(path.join(root,'.logs/server.pid'),String(child.pid));
 for(let i=0;i<40;i++){await new Promise(r=>setTimeout(r,200));state=await status();if(state==='ready')break;}
 if(state!=='ready')throw Error('阅读服务未能启动，请查看 .logs/server.log');
}
if(!process.argv.includes('--no-open'))spawn('open',['-a','Google Chrome',url],{stdio:'ignore'}).unref();
console.log('Attention 双语阅读网站已就绪：'+url);
