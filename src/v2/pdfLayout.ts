/** PDF.js-only geometry interpretation. No document-specific words or page numbers. */
export type PositionedPdfItem = {
  str?: string; hasEOL?: boolean; transform?: number[]; height?: number; width?: number;
};
type Line = { text: string; x: number; y: number; size: number; right: number; items: PositionedPdfItem[] };
function median(values: number[]) {
  const sorted = [...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)] ?? 0;
}
export function positionedPdfMarkdown(items: PositionedPdfItem[]): string | null {
  const ink = items.filter(i => i.str?.trim());
  if (!ink.length) return '';
  if (ink.some(i => !i.transform || i.transform.length < 6 || i.transform.some(n => !Number.isFinite(n))
    || Math.abs(i.transform[1]) > .1 || Math.abs(i.transform[2]) > .1)) return null;
  let lines: Line[] = [];
  // Keep explicit whitespace runs: tight justified/font-change gaps can still
  // separate words, even when geometry alone would join them.
  for (const item of items.filter(i=>i.str && i.transform?.length===6)) {
    const t=item.transform!, size=Math.abs(t[3]), x=t[4];
    const right=x+(item.width??item.str!.length*size*.5);
    const existing=lines.find(l=>Math.abs(l.y-t[5])<Math.max(1,size*.12));
    if(existing){existing.items.push(item);existing.x=Math.min(existing.x,x);existing.right=Math.max(existing.right,right);existing.size=Math.max(existing.size,size);}
    else lines.push({text:'',x,y:t[5],size,right,items:[item]});
  }
  // Attach raised note numbers to their actual baseline before reading-order
  // sorting, rather than emitting them ahead of the preceding sentence.
  for(const line of [...lines]) {
    const text=line.items.map(i=>i.str).join('').trim();
    if(!/^\d{1,3}(?:\s+\d{1,3})*$/.test(text))continue;
    const target=lines.filter(l=>l!==line && line.size<l.size*.8 && line.y-l.y>l.size*.12
      && line.y-l.y<l.size*.7 && line.x>=l.x && line.x<=l.right+l.size)
      .sort((a,b)=>Math.abs(a.right-line.x)-Math.abs(b.right-line.x))[0];
    if(target){target.items.push(...line.items.map(i=>({...i,str:i.str?.replace(/\d/g,d=>'⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)])})));lines=lines.filter(l=>l!==line);}
  }
  for(const line of lines){
    const runs=line.items.sort((a,b)=>a.transform![4]-b.transform![4]);
    let right=line.x;
    for(const item of runs){
      const gap=item.transform![4]-right;
      if(gap>line.size*4 && line.text.length>25 && item.str!.trim().length>25)return null;
      const separator=line.text && !/\s$/.test(line.text) && !/^\s|^[.,;:!?)}\]⁰¹²³⁴⁵⁶⁷⁸⁹]/.test(item.str!) && gap>line.size*.12?' ':'';
      line.text+=separator+item.str!;right=Math.max(right,item.transform![4]+(item.width??item.str!.length*line.size*.5));
    }
    line.text=line.text.replace(/\s+/g,' ').trim();
  }
  lines=lines.filter(l=>l.text);
  if(lines.length<3)return null;
  lines.sort((a,b)=>b.y-a.y);
  const bodySize=median(lines.filter(l=>l.text.length>35).map(l=>l.size));
  if(!bodySize)return null;
  const body=lines.filter(l=>Math.abs(l.size-bodySize)<bodySize*.08 && l.text.length>35);
  const gaps=body.slice(1).map((l,i)=>body[i].y-l.y).filter(g=>g>bodySize*.7 && g<bodySize*1.8);
  const leading=median(gaps)||bodySize*1.25;
  const bodyBottom=Math.min(...body.map(l=>l.y));
  const retained=lines.filter((l,i)=>{
    const short=l.text.split(/\s+/).length<=12 && l.text.length<=90;
    const isolatedTop=i===0 && lines[1] && l.y-lines[1].y>leading*2;
    const headerNumber=/(?:^[^\p{L}\d\s]?\d{1,5}\s|\s\d{1,5}$)/u.test(l.text);
    // Only the isolated top line qualifies as furniture. Small figure labels
    // and captions above body text must remain available to the reader.
    if(isolatedTop && short && (l.size<bodySize*.94 || (headerNumber && l.size<=bodySize*1.05)))return false;
    const pageNumber=/^(?:\d{1,5}|[ivxlcdmIl]{1,8})$/i.test(l.text);
    return !(pageNumber && l.y<bodyBottom-bodySize*2 && l.size<=bodySize*1.05);
  });
  const margin=median(body.map(l=>l.x));
  const bodyWidth=median(body.map(l=>l.right-l.x));
  const numbered=(s:string)=>/^\d+(?:(?:\.\d+)+|[.)])\s+/.test(s);
  const hangingLine=(s:string)=>numbered(s)||/^[-*•●▪"«]\s+/.test(s);
  const blocks:string[]=[];let pending:string[]=[];let kind:'heading'|'body'='body';let hangingX:number|null=null;
  function flush(){if(pending.length)blocks.push((kind==='heading'?'## ':'')+pending.join(' '));pending=[];hangingX=null;}
  for(let i=0;i<retained.length;i++){
    const line=retained[i],prev=retained[i-1],next=retained[i+1];
    const gap=prev?prev.y-line.y:Infinity;
    const large=line.size>bodySize*1.25;
    const isolatedShort=(!prev || prev.size<=bodySize*1.1) && (line.right-line.x)<bodyWidth*.8
      && line.text.split(/\s+/).length<=10 && !/[.!?:;,]$/.test(line.text)
      && gap>leading*1.7 && next && line.y-next.y<leading*2.2
      && (Math.abs(line.x-margin)<bodySize*.7 || (numbered(next.text) && line.x<=margin));
    const heading=large||Boolean(isolatedShort);
    const nextKind=heading?'heading':'body';
    const hangingContinuation=hangingX!==null && line.x>hangingX+bodySize*.4 && gap<=leading*1.3;
    const indented=!hangingContinuation && line.x-margin>bodySize*.7 && line.x-margin<bodySize*3;
    const changedSize=prev && Math.abs(prev.size-line.size)>bodySize*.15;
    if(nextKind!==kind || (!heading&&(gap>leading*1.3 || indented || hangingLine(line.text) || changedSize)))flush();
    kind=nextKind;
    if(hangingLine(line.text))hangingX=line.x;
    pending.push(line.text.replace(/^[•●▪]\s+/,'- '));
  }
  flush();
  return blocks.join('\n\n')+'\n';
}
