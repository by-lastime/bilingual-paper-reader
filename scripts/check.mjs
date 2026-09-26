import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {ROOT,loadPaper,parseBlocks,parseNotes,render} from '../server.mjs';
const paper=loadPaper();
assert.equal(paper.blocks.length,154);
assert.equal(paper.blocks.filter(b=>b.kind==='reference').length,40);
assert.equal(paper.blocks.filter(b=>b.kind==='figure').length,9);
const digest=crypto.createHash('sha256').update(fs.readFileSync(paper.source.pdfPath)).digest('hex');
assert.equal(digest,paper.source.sha256,'原始 PDF 校验和变化');
for(const b of paper.blocks){
 assert.ok(b.en.trim()&&b.zh.trim(),'空白段落 '+b.id);
 assert.ok(b.page>=1&&b.page<=15,'页序 '+b.id);
 assert.ok(!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(b.zh),'非法控制字符 '+b.id);
 for(const text of [b.en,b.zh]){
  for(const m of text.matchAll(/!\[[^\]]*\]\((\/assets\/[^)]+)\)/g))assert.ok(fs.existsSync(path.join(ROOT,'dist',m[1])),'缺少图像 '+m[1]);
 }
 for(const n of b.notes)if(n.quote)assert.ok(b.zh.includes(n.quote),'批注引用不存在 '+n.id);
}
for(const file of ['dist/app.js','server.mjs','scripts/start.mjs'])execFileSync(process.execPath,['--check',path.join(ROOT,file)]);
assert.throws(()=>parseBlocks('<!-- block:a -->\nx\n<!-- block:a -->\ny'),/重复/);
const fence=String.fromCharCode(96).repeat(3);
const n={id:'test-note',quote:'word',question:'真实问题',answer:'answer\n\n$QK^T$'};
const parsed=parseNotes('word\n\n'+fence+'annotation\n'+JSON.stringify(n)+'\n'+fence);
assert.equal(parsed.notes.length,1);assert.equal(parsed.body,'word');
assert.ok(parsed.notes[0].html.includes('katex'));
assert.throws(()=>parseNotes(fence+'annotation\n{"id":'),/尚未闭合/);
assert.ok(!render('<script>alert(1)</script>').includes('<script>'));
assert.ok(!render('[unsafe](javascript:alert(1))').includes('href="javascript:'));
console.log('PASS: 154 对阅读块，40 条文献，5 幅图与 4 张表；所有公式可渲染，批注格式和引用有效，原始 PDF 校验和一致。');
