"""Recreate the English reading blocks and original figure crops.
Requires beautifulsoup4 and pymupdf; source HTML must be the matching arXiv v7.
Usage: python extract_source.py /path/to/1706.03762v7.html
Never writes the Chinese translation or annotations.
"""
from pathlib import Path
import sys, re, json, hashlib, unicodedata, copy
import fitz
from bs4 import BeautifulSoup, NavigableString

ROOT = Path(__file__).resolve().parents[1]
# ROOT is .../05_逐篇论文精读/01_Attention/双语阅读网站
PDF = ROOT.parents[2] / '01_论文原文/01_attention_1706_03762.pdf'
soup = BeautifulSoup(Path(sys.argv[1]).read_text(), 'html.parser')
doc = fitz.open(PDF)
assets = ROOT/'dist/assets'
assets.mkdir(parents=True, exist_ok=True)

def norm(t):
    t = unicodedata.normalize('NFKD', t)
    return re.sub(r'[^a-z0-9]', '', t.lower())
pages = [norm(p.get_text()) for p in doc]
def page_for(text, default=1):
    sample = norm(re.sub(r'\$[^$]+\$', '', text))[:95]
    if len(sample)>20:
        for i,p in enumerate(pages):
            if sample in p: return i+1
    return default

footnotes=[]
def md(node):
    if isinstance(node, NavigableString): return str(node)
    if node.name=='math':
        tex=node.get('alttext','')
        return '$'+tex+'$'
    cls=node.get('class',[])
    if 'ltx_note' in cls:
        text = node.select_one('.ltx_note_content')
        if text:
            item=copy.copy(text)
            for tag in item.select('.ltx_note_mark'): tag.decompose()
            value=md(item).strip()
            if value and value not in footnotes: footnotes.append(value)
            return f' [footnote {footnotes.index(value)+1}]'
        return ''
    if 'ltx_tag_equation' in cls: return ''
    if node.name=='table' and any('ltx_equation' in c for c in cls):
        eqs=[m.get('alttext','') for m in node.select('math')]
        number=node.select_one('.ltx_tag_equation')
        eq=' \\\\ '.join(eqs)
        if len(eqs)>1: eq='\\begin{aligned}'+eq+'\\end{aligned}'
        if number: eq+='\\tag{'+number.get_text().strip('() ')+'}'
        return '\n\n$$\n'+eq+'\n$$\n\n'
    value=''.join(md(ch) for ch in node.children)
    if node.name=='a':
        href=node.get('href','')
        if href.startswith('#'): return value
        if href.startswith('http'): return '['+value+']('+href+')'
    if node.name=='br': return '\n'
    if node.name=='p': return value+'\n\n'
    if node.name in ('em','i'): return '*'+value+'*'
    if node.name in ('strong','b'): return '**'+value+'**'
    return value

# Crop each original figure/table from the local PDF, including vector artwork.
# Coordinates are PDF points; captions are rendered as selectable bilingual text.
crops = {
 'S3.F1':(3,(188,65,422,399)),
 'S3.F2':(4,(137,68,477,262)),
 'S4.T1':(6,(115,110,498,191)),
 'S6.T2':(8,(126,94,486,247)),
 'S6.T3':(9,(105,125,512,389)),
 'S6.T4':(10,(142,93,470,241)),
 'Sx1.F3':(13,(113,92,506,306)),
 'Sx1.F4':(14,(110,160,510,610)),
 'Sx1.F5':(15,(110,185,510,599)),
}
# Print text positions for crop review. Crops refined against rendered originals.
for n in [3,4,6,8,9,10,13,14,15]:
    p=doc[n-1]
    review = ROOT/'scripts/pdf-review'
    review.mkdir(exist_ok=True)
    p.get_pixmap(matrix=fitz.Matrix(1,1)).save(str(review/f'page-{n:02d}-review.png'))
    print('PAGE',n,[(tuple(round(x,1) for x in b[:4]), b[4][:65].replace('\n',' ')) for b in p.get_text('blocks') if b[4].startswith(('Figure','Table'))])
for id,(p,rect) in crops.items():
    doc[p-1].get_pixmap(matrix=fitz.Matrix(3,3),clip=fitz.Rect(rect)).save(str(assets/(id+'.png')))

blocks=[]
def add(id, text, kind='paragraph', page=1, level=None):
    text=re.sub(r'[ \t]+',' ',text)
    text=re.sub(r'\n{3,}','\n\n',text).strip()
    block={'id':id,'kind':kind,'page':page_for(text,page),'en':text}
    if level: block['level']=level
    blocks.append(block)

add('title','Attention Is All You Need','title')
add('authors','Ashish Vaswani · Noam Shazeer · Niki Parmar · Jakob Uszkoreit · Llion Jones · Aidan N. Gomez · Łukasz Kaiser · Illia Polosukhin\n\nGoogle Brain · Google Research · University of Toronto\n\n31st Conference on Neural Information Processing Systems (NIPS 2017), Long Beach, CA, USA.','metadata')
abstract=soup.select_one('.ltx_abstract')
add('abstract','Abstract','heading',1,2)
for i,p in enumerate(abstract.select('p.ltx_p')): add('abstract-p'+str(i+1),md(p))
lastpage=2
for el in soup.select('section'):
    # walk all relevant DOM nodes once below instead
    pass
article=soup.select_one('article') or soup
for el in article.descendants:
    if not getattr(el,'name',None): continue
    if el.find_parent(class_='ltx_abstract'): continue
    if re.fullmatch('h[2-6]',el.name) and el.find_parent('section'):
        parent=el.find_parent('section'); id=parent.get('id')
        if id:
            add(id,md(el),'heading',lastpage,min(int(el.name[1]),4))
    elif el.name=='div' and 'ltx_para' in el.get('class',[]) and el.find_parent('section'):
        if el.find_parent(class_='ltx_para') or el.find_parent('figure') or el.find_parent(class_='ltx_bibitem'): continue
        add(el['id'],md(el),page=lastpage)
        lastpage=blocks[-1]['page']
    elif el.name=='figure':
        id=el.get('id')
        if id not in crops: continue
        p=crops[id][0]
        caption=md(el.find('figcaption')).strip()
        add(id,f'![{id}](/assets/{id}.png)\n\n'+caption,'figure',p)
        blocks[-1]['page']=p
    elif el.name=='li' and 'ltx_bibitem' in el.get('class',[]):
        add(el['id'],md(el),'reference',10)

# Notes in the PDF are retained as separate reading blocks rather than lost in extraction.
add('source-footnotes','Author notes and footnotes','heading',1,2)
author_note='Equal contribution. Listing order is random. Jakob proposed replacing RNNs with self-attention and started the effort to evaluate this idea. Ashish, with Illia, designed and implemented the first Transformer models and has been crucially involved in every aspect of this work. Noam proposed scaled dot-product attention, multi-head attention and the parameter-free position representation and became the other person involved in nearly every detail. Niki designed, implemented, tuned and evaluated countless model variants in our original codebase and tensor2tensor. Llion also experimented with novel model variants, was responsible for our initial codebase, and efficient inference and visualizations. Lukasz and Aidan spent countless long days designing various parts of and implementing tensor2tensor, replacing our earlier codebase, greatly improving results and massively accelerating our research.\n\nAidan N. Gomez: Work performed while at Google Brain. Illia Polosukhin: Work performed while at Google Research.'
add('author-contributions',author_note,page=1)
for i,fn in enumerate(footnotes): add('footnote-'+str(i+1),fn,page=4 if i==0 else 8)
add('figure-attribution','Provided proper attribution is provided, Google hereby grants permission to reproduce the tables and figures in this paper solely for use in journalistic or scholarly works.','metadata')
assert len(set(b['id'] for b in blocks))==len(blocks)
# Restore clean typesetting and PDF footnote numbers (HTML renumbers them).
for b in blocks:
    b['en']=b['en'].replace('[footnote 1]','[footnote 4]').replace('[footnote 2]','[footnote 5]')
    b['en']=re.sub(r'•\s*\n\s*\n','- ',b['en'])
    if b['id']=='S3.SS2.SSS2.p3':
        b['en']=r'$$'+'\n'+r'\begin{aligned}\mathrm{MultiHead}(Q,K,V)&=\mathrm{Concat}(\mathrm{head}_1,\ldots,\mathrm{head}_h)W^O\\\mathrm{head}_i&=\mathrm{Attention}(QW_i^Q,KW_i^K,VW_i^V)\end{aligned}'+'\n$$'
    if b['id']=='footnote-1': b['en']='**Footnote 4.** '+re.sub(r'^1\s+','',b['en'])
    if b['id']=='footnote-2': b['en']='**Footnote 5.** '+re.sub(r'^2\s+','',b['en'])
    if b['id']=='S4.p5': b['page']=7
    if b['id']=='S3.SS5': b['page']=6
    if b['id']=='S5.SS4.SSS0.Px1': b['page']=8
# Split the abstract into three paired paragraphs for comfortable parallel reading.
ab=next(b for b in blocks if b['id']=='abstract-p1')
parts=re.split(r'(?=Experiments on two|On the WMT 2014 English-to-French)',ab['en'])
ix=blocks.index(ab)
blocks[ix:ix+1]=[dict(ab,id='abstract-p'+str(i+1),en=t.strip()) for i,t in enumerate(parts)]
(ROOT/'content/english.blocks.json').write_text(json.dumps(blocks,ensure_ascii=False,indent=2))
(ROOT/'content/paper.en.md').write_text('\n\n'.join('<!-- block:'+b['id']+' -->\n'+(('#'*b['level']+' ') if 'level' in b else ('# ' if b['kind']=='title' else ''))+b['en'] for b in blocks)+'\n')
(ROOT/'content/source.json').write_text(json.dumps({'title':'Attention Is All You Need','arxiv':'1706.03762v7','revision':'2023-08-02','conference':'NIPS 2017','pdfPath':str(PDF),'sha256':hashlib.sha256(PDF.read_bytes()).hexdigest(),'htmlSource':'https://arxiv.org/html/1706.03762v7','prepared':'2026-09-12','figures':5,'tables':4},ensure_ascii=False,indent=2))
print('BLOCKS',len(blocks),'FOOTNOTES',len(footnotes))
