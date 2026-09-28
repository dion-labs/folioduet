import '../v2/installAssetRecovery';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { parsePageMarkdown } from '../hooks/useTTS';
import { buildBookStream } from '../v2/documents';
import { extractPdfMarkdown } from '../v2/pdfStream';
import type { PdfExtractor } from '../v2/types';
import { compareMarkdown } from './compare';
import { textDifferences, highlightParts, type TextRange } from './differences';
import './styles.css';

type Case = { pdfPage: number; id: string; label: string; focus: string; referenceMethod: string; referenceSha256?: string; partialStart?: boolean; partialEnd?: boolean };
type Result = { fallbackReason?: string; markdown: string; raw: string; requested: string; used: string; didFallback: boolean; elapsedMs: number; context: string };
function Highlighted({text, offset=0, ranges, side}: {text:string; offset?:number; ranges:TextRange[]; side:'reference'|'actual'}) {
  return <>{highlightParts(text,offset,ranges).map((part,i)=>part.changed
    ? <mark key={i} className={'diff-'+side} title={side==='reference'?'Missing or changed in parser output':'Added or changed by parser'}>{part.text}</mark>
    : <React.Fragment key={i}>{part.text}</React.Fragment>)}</>;
}
function Rendered({markdown, ranges, side, speech}: {markdown:string; ranges:TextRange[]; side:'reference'|'actual'; speech:boolean}) {
  let offset=0;
  return <div className="prose">{parsePageMarkdown(markdown).map((block, i) => {
    const tag = speech ? 'p' : block.type === 'code' ? 'pre' : block.type === 'table-row' || block.type === 'li' ? 'div' : block.type;
    const runs=speech?[{text:block.text,strong:false,emphasis:false,code:false}]:block.inlineRuns;
    const children=runs.map((run,j)=>{
      const start=offset; offset+=run.text.length;
      return <span key={j} style={{fontWeight:run.strong ? 700 : undefined, fontStyle:run.emphasis ? 'italic' : undefined, fontFamily:run.code ? 'monospace' : undefined}}><Highlighted text={run.text} offset={start} ranges={ranges} side={side}/></span>;
    });
    offset+=2;
    return React.createElement(tag,{key:i},children);
  })}</div>;
}
function comparisonText(markdown:string, mode:string) {
  if(mode==='markdown') return markdown;
  return parsePageMarkdown(markdown).map(b=>mode==='speech'?b.text:b.inlineRuns.map(r=>r.text).join('')).join('\n\n');
}
function Lab() {
  const [cases,setCases]=useState<Case[]>([]);
  const [selected,setSelected]=useState('');
  const [reference,setReference]=useState('');
  const [file,setFile]=useState<File|null>(null);
  const [image,setImage]=useState('');
  const [engine,setEngine]=useState<PdfExtractor>('pageecho');
  const [result,setResult]=useState<Result|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [mode,setMode]=useState<'rendered'|'markdown'|'speech'>('rendered');
  const [note,setNote]=useState('');
  const [showDifferences,setShowDifferences]=useState(true);
  const differences=useMemo(()=>result&&showDifferences?textDifferences(comparisonText(reference,mode),comparisonText(result.markdown,mode)):null,[reference,result,mode,showDifferences]);
  const [fullContext,setFullContext]=useState(false);
  const documentCache=useRef<ReturnType<typeof extractPdfMarkdown> | null>(null);
  const generation=useRef(0);
  const objectUrl=useRef('');
  const active=cases.find(c=>c.id===selected);
  useEffect(()=>{ if(import.meta.env.DEV) void fetch('/__parser-lab/manifest.json').then(r=>r.ok?r.json():null).then(m=>setCases(m?.cases??[])).catch(()=>{}); return ()=>{ if(objectUrl.current) URL.revokeObjectURL(objectUrl.current); }; },[]);
  const metrics=useMemo(()=>{try{return result?compareMarkdown(reference,result.markdown):null;}catch{return null;}},[reference,result]);
  async function choose(id:string) {
    const ticket=++generation.current; setSelected(id);setResult(null);setError('');setNote('');setBusy(false);setFile(null);setReference('');setImage('');
    if(!id)return;
    try {
      const [md,pdf]=await Promise.all([fetch('/__parser-lab/'+id+'/reference.md'),fetch('/__parser-lab/'+id+'/source.pdf')]);
      if(!md.ok||!pdf.ok)throw new Error('Reference files are unavailable.');
      const [text,bytes]=await Promise.all([md.text(),pdf.arrayBuffer()]);
      if(ticket!==generation.current)return;
      setReference(text);setFile(new File([bytes],id+'.pdf',{type:'application/pdf'}));setImage('/__parser-lab/'+id+'/source.png');
    }catch(e){if(ticket===generation.current)setError(String(e));}
  }
  async function run() {
    if(!file)return;const ticket=++generation.current;setBusy(true);setError('');setResult(null);
    try {
      const started=performance.now();
      const whole=fullContext && active && engine==='pageecho';
      if(whole && !documentCache.current) documentCache.current=fetch('/__parser-lab/source.pdf').then(async r=>{
        if(!r.ok)throw new Error('Full source PDF is unavailable.');
        return extractPdfMarkdown(new File([await r.arrayBuffer()],'source.pdf',{type:'application/pdf'}),'pageecho');
      }).catch(e=>{documentCache.current=null;throw e;});
      const extraction=whole?await documentCache.current!:await extractPdfMarkdown(file,engine);
      const pageIndex=whole?extraction.sourcePageNumbers?.indexOf(active.pdfPage):-1;
      if(whole && (pageIndex===undefined || pageIndex<0))throw new Error('No extracted content for this physical page.');
      const pages=whole?[extraction.pages[pageIndex!]]:extraction.pages;
      const stream=buildBookStream(pages,'');
      if(ticket!==generation.current)return;
      setResult({fallbackReason:extraction.fallbackReason,markdown:stream.map(b=>b.markdown).join('\n\n'),raw:pages.join('\n\n'),context:whole?'complete-document word evidence':'isolated spot PDF',requested:extraction.requested,used:extraction.used,didFallback:extraction.didFallback,elapsedMs:Math.round(performance.now()-started)});
    } catch(e){if(ticket===generation.current)setError(e instanceof Error?e.message:String(e));}
    finally{if(ticket===generation.current)setBusy(false);}
  }
  function save() {
    const data={case:active??{id:'custom'},checkedAt:new Date().toISOString(),engine,metrics,result,reference,notes:note,scope:'Spot-page comparison only; no whole-book certification.'};
    const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='parser-review-'+(selected||'custom')+'-'+engine+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function content(markdown:string, side:'reference'|'actual') {
    const ranges=(side==='reference'?differences?.referenceRanges:differences?.actualRanges)??[];
    if(mode==='markdown')return <pre className="source-text"><Highlighted text={markdown} ranges={ranges} side={side}/></pre>;
    return <Rendered markdown={markdown} ranges={ranges} side={side} speech={mode==='speech'}/>;
  }
  return <main>
    <header><a href="/">FolioDuet</a><span>READING QUALITY WORKBENCH</span><h1>From page to prose.</h1><p>Compare the source, a manually written reference, and the reader’s actual parser output.</p></header>
    <section className="controls" aria-label="Comparison controls">
      <label>Reference set<select value={selected} onChange={e=>void choose(e.target.value)}><option value="">Your own spot page</option>{cases.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
      <label>PDF engine<select value={engine} onChange={e=>{if(file)++generation.current;setEngine(e.target.value as PdfExtractor);setResult(null);setBusy(false);}}><option value="pageecho">PDF.js</option><option value="anydoc">AnyDoc · experimental</option></select></label>
      <button className="primary" disabled={!file||busy} onClick={()=>void run()}>{busy?'Parsing locally…':'Run comparison'}</button>
      <button disabled={!result} onClick={save}>Save review</button>
    </section>
    {!selected&&<section className="imports"><label>Source PDF<input type="file" accept="application/pdf" onChange={e=>{++generation.current;setFile(e.target.files?.[0]??null);setResult(null);setBusy(false);}}/></label><label>Manual Markdown<input type="file" accept=".md,.txt" onChange={async e=>{const f=e.target.files?.[0];if(f)setReference(await f.text());}}/></label><label>Page image (optional)<input type="file" accept="image/*" onChange={e=>{if(objectUrl.current)URL.revokeObjectURL(objectUrl.current);const f=e.target.files?.[0];objectUrl.current=f?URL.createObjectURL(f):'';setImage(objectUrl.current);}}/></label></section>}
    {active&&engine==='pageecho'&&<label className="context-toggle"><input type="checkbox" checked={fullContext} onChange={e=>{if(file)++generation.current;setFullContext(e.target.checked);setResult(null);setBusy(false);}}/>Use complete-document word evidence (first run reads the whole PDF)</label>}
    <p className="provenance">{active?active.focus+' · '+active.referenceMethod:'Files are processed in this browser. Choose a small PDF excerpt and the Markdown you wrote by looking at its pages.'}{active?.partialStart?' · Starts mid-paragraph.':''}{active?.partialEnd?' · Ends mid-paragraph.':''}</p>
    {error&&<p className="error" role="alert">{error}</p>}
    {result&&<p className="engine-result" role="status">Requested {result.requested==='pageecho'?'PDF.js':'AnyDoc'} · used {result.used==='pageecho'?'PDF.js':'AnyDoc'}{result.didFallback?' · FALLBACK OCCURRED':''} · {result.context} · {result.elapsedMs} ms</p>}
    {result?.fallbackReason&&<p className="error" role="status">{result.fallbackReason} PDF.js was used instead.</p>}
    {result&&!metrics&&<p className="error">Word metrics are limited to 5,000 words per side. Use a smaller spot excerpt; rendered content remains available.</p>}
    {metrics&&<section className="metrics"><div><strong>{(metrics.orderedWordAccuracy*100).toFixed(1)}%</strong><span>ordered word accuracy</span></div><div><strong>{metrics.wordEdits}</strong><span>word edits</span></div><div><strong>{metrics.actualParagraphs} / {metrics.referenceParagraphs}</strong><span>paragraphs · parser / reference</span></div><div><strong>{metrics.actualHeadings.length} / {metrics.referenceHeadings.length}</strong><span>headings · parser / reference</span></div></section>}
    <nav className="view-tabs" aria-label="Comparison view">{(['rendered','markdown','speech'] as const).map(m=><button key={m} aria-pressed={mode===m} onClick={()=>setMode(m)}>{m==='speech'?'Speech text':m==='markdown'?'Markdown':'Reading view'}</button>)}</nav>
    <div className="diff-controls"><label><input type="checkbox" checked={showDifferences} onChange={e=>setShowDifferences(e.target.checked)}/>Highlight differences</label>{result&&showDifferences&&<span><mark className="diff-reference">Missing / changed reference text</mark><mark className="diff-actual">Added / changed parser text</mark></span>}</div>
    {result&&showDifferences&&<p className="diff-help">{differences?'Highlights compare exact words, case, and punctuation. Whitespace is ignored; use Markdown to inspect formatting markers.':'Highlighting is limited to 6,000 word/punctuation tokens per side. Use a smaller excerpt.'}</p>}
    <section className="comparison"><article><h2><b>01</b> Source page</h2>{image?<a href={image} target="_blank" rel="noreferrer"><img src={image} alt={active?'Source page '+active.label:'Uploaded source page'}/></a>:<p className="empty">Add an image to inspect the printed layout.</p>}</article><article><h2><b>02</b> Manual reference</h2>{reference?content(reference,'reference'):<p className="empty">Load your independently written reference.</p>}</article><article><h2><b>03</b> Parser result</h2>{result?content(result.markdown,'actual'):<p className="empty">Run the parser to compare. Your reference never feeds the extraction.</p>}</article></section>
    {result&&<details><summary>Raw extracted Markdown before reading-stream cleanup</summary><pre className="source-text">{result.raw}</pre></details>}
    <label className="notes">Review notes<textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Record lost paragraphs, headings, furniture, hyphenation, and remaining issues…"/></label>
    <footer>Word accuracy ignores case and most punctuation. It does not certify layout, meaning, or narration. Review the page and paragraph boundaries; save the evidence before changing the parser.</footer>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Lab/>);
