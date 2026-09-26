// Integration test in an isolated copy. Never edits the user's real notes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {once} from 'node:events';
import {ROOT} from '../server.mjs';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'attention-reader-check-'));
fs.copyFileSync(path.join(ROOT,'server.mjs'),path.join(temp,'server.mjs'));
fs.cpSync(path.join(ROOT,'content'),path.join(temp,'content'),{recursive:true});
fs.cpSync(path.join(ROOT,'dist'),path.join(temp,'dist'),{recursive:true});
fs.copyFileSync(path.join(ROOT,'AGENTS.md'),path.join(temp,'AGENTS.md'));
fs.symlinkSync(path.join(ROOT,'node_modules'),path.join(temp,'node_modules'));
const {startServer}=await import(pathToFileURL(path.join(temp,'server.mjs')));
const server=startServer(0);
await once(server,'listening');
const url='http://127.0.0.1:'+server.address().port;
const controller=new AbortController();
let stream;
const events=[];
async function until(fn){
 const end=Date.now()+7000;
 while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,80));}
 throw Error('Timed out waiting for expected change');
}
try{
 const response=await fetch(url+'/api/events',{signal:controller.signal});
 stream=(async()=>{try{for await(const buf of response.body)events.push(Buffer.from(buf).toString());}catch(e){if(e.name!=='AbortError')throw e;}})();
 const original=await (await fetch(url+'/api/paper')).json();
 assert.equal(original.blocks.length,154);
 for(const asset of ['/','/app.js','/style.css','/katex/katex.min.css','/katex/fonts/KaTeX_Main-Regular.woff2','/guide','/download/chinese.md','/paper.pdf',...original.blocks.filter(b=>b.kind==='figure').map(b=>'/assets/'+b.id+'.png')]){
  const res=await fetch(url+asset);assert.equal(res.status,200,asset);await res.arrayBuffer();
 }
 const pdf=await fetch(url+'/paper.pdf',{headers:{Range:'bytes=0-9'}});
 assert.equal(pdf.status,206);assert.ok((await pdf.text()).startsWith('%PDF'));
 assert.equal((await fetch(url+'/api/paper',{method:'POST'})).status,405);
 const file=path.join(temp,'content/paper.zh.md'),baseline=fs.readFileSync(file,'utf8');
 const fence=String.fromCharCode(96).repeat(3);
 const note={id:'integration-note',kind:'user',quote:'序列转换模型',question:'验证注释写入链路',answer:'仅在隔离测试副本中使用。\n\n$QK^T$'};
 const updated=baseline.replace('<!-- block:abstract-p2 -->',fence+'annotation\n'+JSON.stringify(note)+'\n'+fence+'\n\n<!-- block:abstract-p2 -->');
 fs.writeFileSync(file+'.tmp',updated);fs.renameSync(file+'.tmp',file);
 await until(()=>events.join('').includes('event: updated'));
 let data=await (await fetch(url+'/api/paper')).json();
 assert.ok(data.blocks.find(b=>b.id==='abstract-p1').notes.some(n=>n.id==='integration-note'&&n.html.includes('katex')));
 const goodRevision=data.revision;
 assert.notEqual(goodRevision,original.revision);
 fs.writeFileSync(file,updated+'\n'+fence+'annotation\n{');
 await until(()=>events.join('').includes('event: content-error'));
 data=await (await fetch(url+'/api/paper')).json();
 assert.equal(data.revision,goodRevision);assert.ok(data.error);
 fs.writeFileSync(file,baseline);
 await until(()=>events.join('').includes('event: recovered'));
 data=await (await fetch(url+'/api/paper')).json();
 assert.equal(data.revision,original.revision);assert.equal(data.error,null);
 assert.ok(fs.readdirSync(path.join(temp,'.history')).length>=3);
 console.log('PASS: 所有本地资源与 PDF 分段读取；原子文件替换 → 批注解析 → 更新推送；无效编辑保留原页面数据；修复后恢复；历史快照保存。');
}finally{
 controller.abort();await stream;
 server.closeAllConnections();server.close();
 fs.rmSync(temp,{recursive:true,force:true});
}
