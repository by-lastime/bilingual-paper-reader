const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const panes={en:$('#en-pane'),zh:$('#zh-pane')};
const readPref=(k,f)=>{try{return JSON.parse(localStorage.getItem('attention-'+k))??f;}catch{return f;}};
const savePref=(k,v)=>{try{localStorage.setItem('attention-'+k,JSON.stringify(v));}catch{}};
let mode=readPref('mode',innerWidth<650?'single':'parallel'),lang=readPref('language','zh'),size=readPref('font',17),paper,activeLang=lang,selected=null,pending=false;
let paperId=new URLSearchParams(location.search).get('paper')||readPref('paper','attention'),library=null,openNotes=[],loadSequence=0;
let syncing=false,resizeFrame,saveTimer,toastTimer,selecting=false;
const contentMap={en:new Map(),zh:new Map()};
const observer=new ResizeObserver(()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(equalize);});
function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,2500);}
async function copy(text){try{await navigator.clipboard.writeText(text);toast('已复制，粘贴到 ChatGPT 侧栏即可');}catch{toast('复制未成功，请允许浏览器访问剪贴板后重试');}}
function locate(pane){
 const items=[...pane.querySelectorAll('.block')];if(!items.length)return null;
 const top=pane.scrollTop;let item=items[0];for(const x of items){if(x.offsetTop<=top+36)item=x;else break;}
 return {id:item.dataset.block,offset:top-item.offsetTop};
}
function restore(pos){if(!pos)return;for(const key of ['en','zh']){const b=contentMap[key].get(pos.id);if(b)panes[key].scrollTop=b.offsetTop+pos.offset;}}
function equalize(){
 const pos=locate(panes[activeLang]);
 for(const id of contentMap.en.keys()){
   const a=contentMap.en.get(id),b=contentMap.zh.get(id);if(!b)continue;
   a.style.minHeight='';b.style.minHeight='';
   if(mode==='parallel'){
     const h=Math.ceil(Math.max(a.firstElementChild.getBoundingClientRect().height,b.firstElementChild.getBoundingClientRect().height))+22;
     a.style.minHeight=b.style.minHeight=h+'px';
   }
 }
 restore(pos);updateProgress();
}
function updateProgress(){
 if(!paper)return;const p=panes[activeLang],pos=locate(p);if(!pos)return;
 const idx=paper.blocks.findIndex(b=>b.id===pos.id);const pct=Math.round((idx+1)/paper.blocks.length*100);
 $('#progress').textContent=`${pct}% 已浏览`;$('#progress-fill').style.width=pct+'%';
 let heading=paper.blocks.slice(0,idx+1).filter(b=>b.kind==='heading'&&b.level<=3).at(-1);
 $$('#toc button').forEach(b=>b.classList.toggle('active',b.dataset.target===heading?.id));
 for(const key of ['en','zh'])for(const [id,el]of contentMap[key])el.classList.toggle('focused',id===pos.id);
 clearTimeout(saveTimer);saveTimer=setTimeout(()=>savePref('position-'+paperId,pos),250);
}
for(const [key,p]of Object.entries(panes)){
 ['wheel','pointerdown','touchstart','keydown'].forEach(e=>p.addEventListener(e,()=>activeLang=key,{passive:true}));
 p.addEventListener('scroll',()=>{
   if(syncing||key!==activeLang)return;
   if(mode==='parallel'){syncing=true;panes[key==='en'?'zh':'en'].scrollTop=p.scrollTop;requestAnimationFrame(()=>syncing=false);}
   updateProgress();
 },{passive:true});
}
function setMode(){
 const pos=locate(panes[activeLang]);
 $('#reader').className=`reader ${mode==='single'?'single '+lang:''}`;
 $('.language-switch').hidden=mode!=='single';$('.sync-label').hidden=mode==='single';
 $('.column-labels').className='column-labels'+(mode==='single'?' single-labels '+lang:'');
 $$('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.mode===mode));
 $$('[data-lang]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.lang===lang));
 activeLang=mode==='single'?lang:activeLang;equalize();restore(pos);savePref('mode',mode);savePref('language',lang);
}
$$('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;setMode();});
$$('[data-lang]').forEach(b=>b.onclick=()=>{lang=b.dataset.lang;setMode();});
function applyFont(){document.documentElement.style.setProperty('--body-size',size+'px');savePref('font',size);equalize();}
$('#smaller').onclick=()=>{size=Math.max(15,size-1);applyFont();};$('#larger').onclick=()=>{size=Math.min(24,size+1);applyFont();};
function setTheme(dark){
 document.body.classList.toggle('dark',dark);
 $('#theme-btn').textContent=dark?'☀ 浅色':'☾ 深色';
 $('#theme-btn').setAttribute('aria-pressed',String(dark));
 $('#theme-btn').setAttribute('aria-label',dark?'切换到浅色模式':'切换到深色模式');
 savePref('dark',dark);
}
setTheme(readPref('dark',matchMedia('(prefers-color-scheme: dark)').matches));
$('#theme-btn').onclick=()=>setTheme(!document.body.classList.contains('dark'));
function setTOC(open){
 const pos=locate(panes[activeLang]);$('#chapter-sidebar').hidden=!open;
 $('#toc-btn').setAttribute('aria-expanded',String(open));savePref('toc',open);equalize();restore(pos);
}
setTOC(readPref('toc',false));
$('#toc-btn').onclick=()=>setTOC($('#chapter-sidebar').hidden);
$('#toc-close').onclick=()=>setTOC(false);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!document.querySelector('dialog[open]'))setTOC(false);});

function openPDF(page){const src='/paper.pdf?paper='+encodeURIComponent(paperId)+'#page='+page;$('#pdf-frame').src=src;$('#pdf-external').href=src;$('#pdf-dialog').showModal();}
$('#pdf-btn').onclick=()=>{const pos=locate(panes[activeLang]);openPDF(paper?.blocks.find(b=>b.id===pos?.id)?.page||1);};
$('#help-btn').onclick=()=>$('#help-dialog').showModal();$$('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$$('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
function guide(){return `我正在这台 Mac 的本地网站阅读 ${paper.entry.title}。请先读取项目说明：\n${paper.paths.guide}\n\n中文正文与批注文件：\n${paper.paths.chinese}\n\n英文文件：\n${paper.paths.english}\n\n请在这个对话中回答论文问题。需要保存的问答直接写入中文版相应 <!-- block:段落编号 --> 段内的 annotation 代码块；按说明中的格式修改实际文件。保持正文和既有批注，保存后网站会自动更新。不得用重新生成整篇文件的方式覆盖我的其他笔记。`;} 
$('#copy-guide').onclick=()=>copy(guide());
function reference(id,quote='',language='zh'){
 const b=paper.blocks.find(x=>x.id===id);
 return `论文：${paper.entry.title}（${paper.source.arxiv||''}）\n段落编号：${id}\nPDF 第 ${b.page} 页\n选中语言：${language==='en'?'英文':'中文'}\n选中文字：${quote||'(针对这一整段)'}\n\n中文对应段落：\n${b.zh.replace(/^#+ /gm,'')}\n\n请结合原文回答我的问题，并将需要保留的问答直接写入以下文件的对应段落，作为点击划线后弹窗显示的批注：\n${paper.paths.chinese}\n首次写入前请读取格式说明：${paper.paths.guide}\n\n我的问题：`;
}
function highlightNotes(root,notes,key){
 const nodes=[],walk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.parentElement.closest('.katex')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
 while(walk.nextNode())nodes.push(walk.currentNode);
 const text=nodes.map(n=>n.textContent).join('');
 const ranges=[];
 for(const n of notes){
   const quote=key==='en'?n.enQuote:n.quote;
   if(key==='en'&&!quote)continue;
   let start=quote?text.indexOf(quote):-1,end;
   if(start<0){if(key==='en')continue;start=text.search(/\S/);if(start<0)continue;end=Math.min(start+24,text.length);}
   else end=start+quote.length;
   ranges.push({start,end,id:n.id});
 }
 let offset=0;
 for(const node of nodes){
   const end=offset+node.length;
   const hits=ranges.filter(r=>r.end>offset&&r.start<end);
   if(hits.length){
     const cuts=[...new Set([0,node.length,...hits.flatMap(r=>[Math.max(0,r.start-offset),Math.min(node.length,r.end-offset)])])].sort((a,b)=>a-b);
     const fragment=document.createDocumentFragment();
     for(let i=0;i<cuts.length-1;i++){
       const a=cuts[i],b=cuts[i+1],ids=hits.filter(r=>r.start<offset+b&&r.end>offset+a).map(r=>r.id);
       const value=node.textContent.slice(a,b);
       if(ids.length){
         const mark=document.createElement('mark');mark.className='note-highlight';mark.dataset.notes=JSON.stringify(ids);
         mark.textContent=value;mark.tabIndex=0;mark.setAttribute('role','button');mark.setAttribute('aria-haspopup','dialog');mark.setAttribute('aria-label','查看批注：'+value);fragment.append(mark);
       }else fragment.append(document.createTextNode(value));
     }
     node.replaceWith(fragment);
   }
   offset=end;
 }
}
function showNotes(ids,open=true){
 openNotes=ids;
 const target=$('#annotation-content');target.replaceChildren();
 const notes=paper.blocks.flatMap(b=>b.notes).filter(n=>ids.includes(n.id));
 for(const n of notes){
   const section=document.createElement('section');section.className='annotation-entry';
   const badge=document.createElement('span');badge.className='note-kind';badge.textContent=n.kind==='translator'?'译者注':'我的批注';
   const title=document.createElement('h2');title.textContent=n.question;
   const quote=document.createElement('blockquote');quote.className='note-quote';quote.textContent=n.quote||'整段批注';
   const answer=document.createElement('div');answer.className='note-answer';answer.innerHTML=n.html;
   section.append(badge,title,quote,answer);target.append(section);
 }
 if(!notes.length)target.textContent='这条批注已在文件中移除。';
 if(open&&!$('#annotation-dialog').open)$('#annotation-dialog').showModal();
}
function renderBlock(b,key){
 const el=document.createElement('article');el.className=`block kind-${b.kind}`;el.dataset.block=b.id;el.id=key+'-'+b.id;
 const inner=document.createElement('div');inner.className='block-inner';
 const prose=document.createElement('div');prose.className='prose';prose.innerHTML=key==='en'?b.enHtml:b.zhHtml;inner.append(prose);
 prose.querySelectorAll('table').forEach(t=>{const wrap=document.createElement('div');wrap.className='table-scroll';t.before(wrap);wrap.append(t);});
 if(b.kind!=='heading'&&b.kind!=='title'){
   const actions=document.createElement('div');actions.className='block-tools';
   for(const [label,handler]of [['引用',()=>copy(reference(b.id,'',key))],['PDF '+b.page,()=>openPDF(b.page)]]){const bt=document.createElement('button');bt.textContent=label;bt.onclick=handler;bt.setAttribute('aria-label',label+' '+b.id);actions.append(bt);}inner.append(actions);
 }
 highlightNotes(prose,b.notes,key);
 prose.addEventListener('click',e=>{const img=e.target.closest('img');if(img){$('#large-image').src=img.src;$('#large-image').alt=img.alt;$('#image-dialog').showModal();}});
 el.append(inner);contentMap[key].set(b.id,el);observer.observe(inner);return el;
}
async function refresh(){
 const sequence=++loadSequence,requested=paperId;
 const res=await fetch('/api/paper?paper='+encodeURIComponent(requested));if(!res.ok)throw Error('内容加载失败');const next=await res.json();
 if(sequence!==loadSequence||requested!==paperId)return;
 if(paper?.id===next.id&&paper?.revision===next.revision)return;
 const oldPos=paper?.id===next.id?locate(panes[activeLang]):readPref('position-'+next.id,next.id==='attention'?readPref('position',null):null)||(paper?{id:next.blocks[0].id,offset:0}:null);
 observer.disconnect();paper=next;
 for(const key of ['en','zh']){contentMap[key].clear();const frag=document.createDocumentFragment();paper.blocks.forEach(b=>frag.append(renderBlock(b,key)));$('#'+key+'-content').replaceChildren(frag);}
 if($('#annotation-dialog').open)showNotes(openNotes,false);
 document.title=paper.entry.shortTitle+' · 双语论文阅读';
 $('#current-paper').textContent=paper.entry.shortTitle||paper.entry.title;
 $('#current-paper').title=paper.entry.title;
 $('#chapter-paper-title').textContent=paper.entry.title;
 $('#pdf-title').textContent=paper.entry.title;
 $('#pdf-frame').title=paper.entry.title+' 原始 PDF';
 $$('.downloads a').forEach(a=>a.search='?paper='+encodeURIComponent(paperId));
 $('#source-info').textContent=paper.source.arxiv||'';
 $$('[data-source-paper]').forEach(el=>el.hidden=el.dataset.sourcePaper!==paperId);

 const toc=$('#toc');toc.replaceChildren();
 for(const b of paper.blocks.filter(b=>b.kind==='heading'&&b.level<=3)){
  const bt=document.createElement('button');bt.textContent=b.zh.replace(/^#+\s*/,'');bt.dataset.target=b.id;bt.className=b.level===3?'sub':'';bt.onclick=()=>{restore({id:b.id,offset:-22});updateProgress();if(innerWidth<=800)setTOC(false);history.replaceState(null,'','#'+b.id);};toc.append(bt);
 }
 $('#note-count').textContent='';const count=paper.blocks.flatMap(b=>b.notes).filter(n=>n.kind!=='translator').length;if(count)$('#note-count').textContent=`· ${count} 条批注`;
 $('#source-info').textContent=`版本：${paper.source.arxiv} · ${paper.source.revision}。原图 ${paper.source.figures} 幅，表格 ${paper.source.tables} 张。`;
 $('#notice').hidden=!paper.partial&&!paper.error;$('#notice').textContent=paper.error?'内容正在修改，暂时保留上次可用版本：'+paper.error:paper.partial?'首版预览 · 正在补齐全文':'';
 setMode();applyFont();restore(oldPos);
 if(!oldPos&&location.hash)restore({id:decodeURIComponent(location.hash.slice(1)),offset:-22});
 requestAnimationFrame(()=>{equalize();restore(oldPos);});
 $('#connection').textContent='本地文件已同步';
}
document.addEventListener('click',e=>{const mark=e.target.closest('.note-highlight');if(mark&&!window.getSelection()?.toString())showNotes(JSON.parse(mark.dataset.notes));});
document.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)&&e.target.matches('.note-highlight')){e.preventDefault();e.target.click();}});
document.addEventListener('selectionchange',()=>{
 const selection=window.getSelection();if(!selection||selection.isCollapsed){$('#selection-tools').hidden=true;return;}
 const range=selection.getRangeAt(0),start=range.startContainer.parentElement?.closest('.block'),end=range.endContainer.parentElement?.closest('.block');
 if(!start||start!==end||selection.toString().trim().length<2)return;
 selected={id:start.dataset.block,quote:selection.toString().trim(),language:start.closest('.pane').lang==='en'?'en':'zh'};$('#selection-tools').hidden=false;
});
$('#copy-selection').onpointerdown=e=>e.preventDefault();$('#copy-selection').onclick=()=>selected&&copy(reference(selected.id,selected.quote,selected.language));
document.addEventListener('pointerdown',e=>{selecting=!!e.target.closest('.pane');});
document.addEventListener('pointerup',()=>{selecting=false;if(pending){pending=false;refresh().catch(()=>{});}});
window.addEventListener('blur',()=>{selecting=false;if(pending){pending=false;refresh().catch(()=>{});}});
function scheduleRefresh(){if(selecting){pending=true;$('#connection').textContent='文件已更新，完成选字后同步';}else refresh().catch(()=>{$('#connection').textContent='更新暂未读取';});}
const events=new EventSource('/api/events');events.addEventListener('updated',e=>{if(!JSON.parse(e.data).id||JSON.parse(e.data).id===paperId)scheduleRefresh();});events.addEventListener('recovered',e=>{if(JSON.parse(e.data).id&&JSON.parse(e.data).id!==paperId)return;$('#notice').hidden=true;scheduleRefresh();});
events.addEventListener('content-error',e=>{if(JSON.parse(e.data).id&&JSON.parse(e.data).id!==paperId)return;$('#notice').hidden=false;$('#notice').textContent='内容正在修改，暂时保留上次可用版本：'+JSON.parse(e.data).message;});
events.onopen=()=>{$('#connection').textContent='本地文件已连接';scheduleRefresh();};events.onerror=()=>$('#connection').textContent='连接中断 · 正在重连';
async function loadLibrary(){
 const res=await fetch('/api/library');if(!res.ok)throw Error('论文库暂时无法读取');
 library=await res.json();
 if(!library.papers.some(p=>p.id===paperId))paperId=library.defaultPaper;
 const list=$('#paper-list');list.replaceChildren();
 for(const p of library.papers){
   const button=document.createElement('button');button.className='paper-entry';button.setAttribute('aria-current',String(p.id===paperId));button.disabled=!p.available;
   const title=document.createElement('strong');title.textContent=p.title;
   const meta=document.createElement('span');meta.textContent=[p.authors,p.year,p.id===paperId?'正在阅读':'',!p.available?'文件待补齐':''].filter(Boolean).join(' · ');
   button.append(title,meta);
   button.onclick=async()=>{
     if(p.id!==paperId){
       const pos=locate(panes[activeLang]);if(pos)savePref('position-'+paperId,pos);clearTimeout(saveTimer);
       paperId=p.id;selected=null;$('#selection-tools').hidden=true;
       savePref('paper',paperId);history.replaceState(null,'','?paper='+encodeURIComponent(paperId));
       $('#annotation-dialog').close();
       try{await refresh();}catch(e){toast(e.message);}
     }
     $('#library-dialog').close();
   };
   list.append(button);
 }
 $('#library-status').textContent=library.papers.length+' 篇论文';
}
$('#library-btn').onclick=()=>{$('#library-dialog').showModal();loadLibrary().catch(e=>$('#library-status').textContent=e.message);};
events.addEventListener('library-updated',()=>loadLibrary().then(scheduleRefresh).catch(e=>toast(e.message)));
events.addEventListener('library-error',e=>toast('论文库配置暂未更新：'+JSON.parse(e.data).message));
window.addEventListener('resize',()=>equalize());
loadLibrary().then(()=>refresh()).catch(e=>{$('#notice').hidden=false;$('#notice').textContent=e.message+'，请确认本地阅读服务正在运行。';});
