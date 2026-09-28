/** PDF.js-only geometry interpretation. No document-specific words or page numbers. */
export type PositionedPdfItem = {
  str?: string; hasEOL?: boolean; transform?: number[]; height?: number; width?: number;
};
type Line = { text: string; x: number; y: number; size: number; right: number };
function median(values: number[]) {
  const sorted = [...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)] ?? 0;
}
export function positionedPdfMarkdown(items: PositionedPdfItem[]): string | null {
  const ink = items.filter(i => i.str?.trim());
  if (!ink.length) return '';
  if (ink.some(i => !i.transform || i.transform.length < 6 || i.transform.some(n => !Number.isFinite(n))
    || Math.abs(i.transform[1]) > .1 || Math.abs(i.transform[2]) > .1)) return null;
  const lines: Line[] = [];
  for (const item of ink) {
    const t = item.transform!;
    const size = Math.abs(t[3]);
    const existing = lines.find(l => Math.abs(l.y-t[5]) < Math.max(1,size*.12));
    const x = t[4], right = x + (item.width ?? item.str!.length*size*.5);
    if (existing) {
      // A large gutter between prose runs may be a second column. Preserve the
      // established fallback instead of silently stitching separate columns.
      if (x-existing.right > size*4 && existing.text.length > 25 && item.str!.length > 25) return null;
      if (x < existing.x) {
        existing.text = item.str!.trim() + ' ' + existing.text; existing.x=x;
      } else {
        const gap = x-existing.right;
        const separator = gap > size*.12 && !/^[.,;:!?)}\]]/.test(item.str!) ? ' ' : '';
        existing.text += separator + item.str!.trim();
      }
      existing.right=Math.max(existing.right,right);existing.size=Math.max(existing.size,size);
    } else lines.push({text:item.str!.trim(),x,y:t[5],size,right});
  }
  if (lines.length < 3) return null;
  lines.sort((a,b)=>b.y-a.y);
  const bodySize = median(lines.filter(l=>l.text.length>35).map(l=>l.size));
  if (!bodySize) return null;
  const body = lines.filter(l=>Math.abs(l.size-bodySize)<bodySize*.08 && l.text.length>35);
  const bodyTop=Math.max(...body.map(l=>l.y)),bodyBottom=Math.min(...body.map(l=>l.y));
  const retained=lines.filter(l=>{
    if(l.size>=bodySize*.94)return true;
    const short=l.text.split(/\s+/).length<=12 && l.text.length<=90;
    const runningHeader=short && !/[.!?:;]$/.test(l.text) && l.y>bodyTop+bodySize*2;
    // Small prose below the body may be a footnote; only page numerals qualify.
    const pageNumber=/^(?:\d{1,5}|[ivxlcdmIl]{1,8})$/i.test(l.text);
    return !(runningHeader || (pageNumber && l.y<bodyBottom-bodySize*2));
  });
  const gaps=body.slice(1).map((l,i)=>body[i].y-l.y).filter(g=>g>bodySize*.7 && g<bodySize*1.8);
  const leading=median(gaps)||bodySize*1.25;
  const margin=median(body.map(l=>l.x));
  const blocks: string[]=[];
  let pending:string[]=[];let kind:'heading'|'body'='body';
  function flush(){if(pending.length)blocks.push((kind==='heading'?'## ':'')+pending.join(' '));pending=[];}
  for(let i=0;i<retained.length;i++){
    const line=retained[i],prev=retained[i-1],next=retained[i+1];
    const gap=prev?prev.y-line.y:Infinity;
    const large=line.size>bodySize*1.25;
    const isolatedShort=prev && prev.size <= bodySize*1.1 && (line.right-line.x)<median(body.map(l=>l.right-l.x))*.8 && line.text.split(/\s+/).length<=10 && !/[.!?:;,]$/.test(line.text)
      && gap>leading*1.7 && next && line.y-next.y<leading*1.8
      && Math.abs(line.x-margin)<bodySize*.7;
    const heading=large||Boolean(isolatedShort);
    const nextKind=heading?'heading':'body';
    const indented=line.x-margin>bodySize*.7 && line.x-margin<bodySize*3;
    if(nextKind!==kind || (!heading&&(gap>leading*1.65 || indented)))flush();
    kind=nextKind;
    pending.push(line.text);
  }
  flush();
  return blocks.join('\n\n')+'\n';
}
