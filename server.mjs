import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import MarkdownIt from 'markdown-it';
import katex from 'katex';

export const ROOT=path.dirname(fileURLToPath(import.meta.url));
const CONTENT=path.join(ROOT,'content');
const md=new MarkdownIt({html:false,linkify:true,typographer:false});
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function render(text){
  const math=[];
  const prepared=text.replace(/\$\$([\s\S]*?)\$\$|(?<!\\)\$([^$\n]+?)\$/g,(match,display,inline)=>{
    const i=math.length;
    math.push(katex.renderToString(display??inline,{displayMode:display!==undefined,throwOnError:true,strict:'ignore',trust:false,output:'htmlAndMathml'}));
    return `MATHPLACEHOLDER${i}END`;
  });
  return md.render(prepared).replace(/MATHPLACEHOLDER(\d+)END/g,(_,i)=>math[Number(i)]);
}
export function parseBlocks(text){
  const markers=[...text.matchAll(/^<!-- block:([A-Za-z0-9.-]+) -->\s*$/gm)];
  const result=new Map();
  markers.forEach((m,i)=>{
    if(result.has(m[1])) throw Error('重复段落编号：'+m[1]);
    result.set(m[1],text.slice(m.index+m[0].length,markers[i+1]?.index??text.length).trim());
  });
  return result;
}
export function parseNotes(body){
  const notes=[];
  body=body.replace(/^```annotation\s*\n([\s\S]*?)^```\s*$/gm,(_,json)=>{
    let n;try{n=JSON.parse(json);}catch{throw Error('批注 JSON 格式不完整，请检查括号与引号');}
    if(!n.id||!n.question||typeof n.answer!=='string'||typeof n.quote!=='string') throw Error('批注须包含 id、quote、question 和 answer');
    if(!/^[\w.-]+$/.test(n.id)) throw Error('批注 id 只能包含字母、数字、点、横线和下划线');
    notes.push({...n,html:render(n.answer)});return '';
  });
  if(body.includes('```annotation')) throw Error('批注代码块尚未闭合');
  return {body:body.trim(),notes};
}
function localDir(value){
  const dir=path.resolve(ROOT,value);
  if(dir!==ROOT&&!dir.startsWith(ROOT+path.sep))throw Error('论文目录必须位于网站目录内');
  return dir;
}
export function loadLibrary(){
  const library=JSON.parse(fs.readFileSync(path.join(CONTENT,'library.json'),'utf8'));
  if(!Array.isArray(library.papers)||!library.papers.length)throw Error('论文库不能为空');
  const ids=new Set();
  for(const p of library.papers){
    if(!/^[a-z0-9-]+$/.test(p.id)||ids.has(p.id)||!p.title)throw Error('论文库编号或标题无效');
    ids.add(p.id);localDir(p.contentDir);localDir(p.assetsDir);
  }
  if(!ids.has(library.defaultPaper))throw Error('默认论文不存在');
  return library;
}
export function loadPaper({partial=false,id}={}){
  const library=loadLibrary();
  const entry=library.papers.find(p=>p.id===(id||library.defaultPaper));
  if(!entry)throw Error('论文不存在');
  const CONTENT=localDir(entry.contentDir);
  const metadata=JSON.parse(fs.readFileSync(path.join(CONTENT,'english.blocks.json'),'utf8'));
  const source=JSON.parse(fs.readFileSync(path.join(CONTENT,'source.json'),'utf8'));
  const enText=fs.readFileSync(path.join(CONTENT,'paper.en.md'),'utf8');
  const zhText=fs.readFileSync(path.join(CONTENT,'paper.zh.md'),'utf8');
  const en=parseBlocks(enText), zh=parseBlocks(zhText);
  const ids=new Set(metadata.map(b=>b.id));
  for(const id of [...en.keys(),...zh.keys()])if(!ids.has(id))throw Error('未知段落编号：'+id);
  const noteIds=new Set();
  const blocks=metadata.filter(b=>!partial||zh.has(b.id)).map(b=>{
    if(!en.has(b.id)||!zh.has(b.id))throw Error('缺少对应中英文段落：'+b.id);
    const {body,notes}=parseNotes(zh.get(b.id));
    for(const n of notes){if(noteIds.has(n.id))throw Error('重复批注 id：'+n.id);noteIds.add(n.id);}
    return {...b,en:en.get(b.id),zh:body,enHtml:render(en.get(b.id)).replaceAll('src="/assets/','src="/papers/'+entry.id+'/assets/'),zhHtml:render(body).replaceAll('src="/assets/','src="/papers/'+entry.id+'/assets/'),notes};
  });
  return {id:entry.id,entry,blocks,source,revision:crypto.createHash('sha256').update(enText+zhText+JSON.stringify(source)+JSON.stringify(metadata)+JSON.stringify(entry)).digest('hex').slice(0,16),updatedAt:new Date().toISOString(),paths:{chinese:path.join(CONTENT,'paper.zh.md'),english:path.join(CONTENT,'paper.en.md'),guide:path.join(ROOT,'AGENTS.md')},partial};
}
export function startServer(port=4173){
  let library=loadLibrary();
  const papers=new Map(), errors=new Map(), clients=new Set(), watchers=[];
  let timer;
  const history=path.join(ROOT,'.history');fs.mkdirSync(history,{recursive:true});
  function snapshot(entry){
    const folder=entry.id===library.defaultPaper?history:path.join(history,entry.id);
    fs.mkdirSync(folder,{recursive:true});
    for(const name of ['paper.zh.md','paper.en.md']){
      const data=fs.readFileSync(path.join(localDir(entry.contentDir),name));
      const hash=crypto.createHash('sha256').update(data).digest('hex').slice(0,16);
      const target=path.join(folder,name+'.'+hash+'.md');
      if(!fs.existsSync(target))fs.writeFileSync(target,data);
    }
  }
  function emit(event,data){for(const res of clients)res.write('event: '+event+'\ndata: '+JSON.stringify(data)+'\n\n');}
  function watch(){
    watchers.splice(0).forEach(w=>w.close());
    const dirs=new Set([CONTENT,...library.papers.map(p=>localDir(p.contentDir))]);
    for(const dir of dirs)if(fs.existsSync(dir))watchers.push(fs.watch(dir,()=>{clearTimeout(timer);timer=setTimeout(reload,350);}));
  }
  function reload(){
    try{
      const nextLibrary=loadLibrary();
      if(JSON.stringify(nextLibrary)!==JSON.stringify(library)){library=nextLibrary;watch();emit('library-updated',{});}
    }catch(e){emit('library-error',{message:e.message});return;}
    for(const entry of library.papers){
      try{
        const next=loadPaper({id:entry.id,partial:process.env.READER_PREVIEW==='1'});
        const previous=papers.get(entry.id);
        if(next.revision!==previous?.revision){snapshot(entry);papers.set(entry.id,next);emit('updated',{id:entry.id,revision:next.revision});}
        if(errors.has(entry.id)){errors.delete(entry.id);emit('recovered',{id:entry.id});}
      }catch(e){errors.set(entry.id,e.message);emit('content-error',{id:entry.id,message:e.message});}
    }
  }
  reload();watch();
  const heartbeat=setInterval(()=>emit('ping',{}),15000);
  const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.pdf':'application/pdf','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.md':'text/plain; charset=utf-8'};
  const server=http.createServer((req,res)=>{
    const host=req.headers.host?.split(':')[0];
    if(!['127.0.0.1','localhost','[::1]'].includes(host)){res.writeHead(403);return res.end('Local access only');}
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
    const url=new URL(req.url,'http://127.0.0.1');
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
    if(url.pathname==='/api/library'){
      res.setHeader('Content-Type','application/json; charset=utf-8');
      return res.end(JSON.stringify({defaultPaper:library.defaultPaper,papers:library.papers.map(({contentDir,assetsDir,...p})=>({...p,available:papers.has(p.id),error:errors.get(p.id)||null}))}));
    }
    const id=url.searchParams.get('paper')||library.defaultPaper;
    const paper=papers.get(id),error=errors.get(id)||null;
    const needsPaper=['/api/paper','/paper.pdf','/download/chinese.md','/download/english.md'].includes(url.pathname);
    if(needsPaper&&(!library.papers.some(p=>p.id===id)||!paper)){res.writeHead(404);return res.end('Paper unavailable');}
    if(url.pathname==='/api/paper'){res.setHeader('Content-Type','application/json; charset=utf-8');return res.end(JSON.stringify({...paper,error}));}
    if(url.pathname==='/api/events'){
      res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive'});res.write('event: ready\ndata: {}\n\n');clients.add(res);req.on('close',()=>clients.delete(res));return;
    }
    let file;
    if(url.pathname==='/paper.pdf')file=paper.source.pdfPath;
    else if(url.pathname==='/download/chinese.md')file=paper.paths.chinese;
    else if(url.pathname==='/download/english.md')file=paper.paths.english;
    else if(url.pathname.startsWith('/papers/')){
      const match=/^\/papers\/([a-z0-9-]+)\/assets\/(.+)$/.exec(url.pathname);
      const entry=match&&library.papers.find(p=>p.id===match[1]);
      if(!entry){res.writeHead(404);return res.end();}
      let rel;try{rel=decodeURIComponent(match[2]);}catch{res.writeHead(400);return res.end();}
      const base=localDir(entry.assetsDir);file=path.resolve(base,rel);
      if(!file.startsWith(base+path.sep)){res.writeHead(403);return res.end();}
    }
    else if(url.pathname==='/guide')file=path.join(ROOT,'AGENTS.md');
    else if(url.pathname.startsWith('/katex/')){
      const rel=decodeURIComponent(url.pathname.slice(7));file=path.resolve(ROOT,'node_modules/katex/dist',rel);
      if(!file.startsWith(path.join(ROOT,'node_modules/katex/dist')+path.sep)){res.writeHead(403);return res.end();}
    }else{
      let rel;try{rel=decodeURIComponent(url.pathname);}catch{res.writeHead(400);return res.end();}
      file=path.resolve(ROOT,'dist',rel==='/'?'index.html':'.'+rel);
      if(!file.startsWith(path.join(ROOT,'dist')+path.sep)){res.writeHead(403);return res.end();}
    }
    try{
      const stat=fs.statSync(file);if(!stat.isFile())throw Error();
      res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');
      if(url.pathname.startsWith('/download/'))res.setHeader('Content-Disposition','attachment');
      if(req.headers.range&&file.endsWith('.pdf')){
        const m=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
        if(!m){res.writeHead(416);return res.end();}
        const start=+m[1],end=m[2]?Math.min(+m[2],stat.size-1):stat.size-1;
        if(start>=stat.size||end<start){res.writeHead(416);return res.end();}
        res.writeHead(206,{'Content-Range':`bytes ${start}-${end}/${stat.size}`,'Accept-Ranges':'bytes','Content-Length':end-start+1});
        return fs.createReadStream(file,{start,end}).pipe(res);
      }
      res.setHeader('Content-Length',stat.size);if(req.method==='HEAD')return res.end();fs.createReadStream(file).pipe(res);
    }catch{res.writeHead(404);res.end('Not found');}
  });
  server.listen(port,'127.0.0.1',()=>console.log(`Attention Reader: http://127.0.0.1:${server.address().port}`));
  server.on('error',e=>{console.error(e.message);watchers.forEach(w=>w.close());clearInterval(heartbeat);});
  server.on('close',()=>{watchers.forEach(w=>w.close());clearInterval(heartbeat);clearTimeout(timer);for(const c of clients)c.end();});
  return server;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))startServer(Number(process.env.PORT||4173));
