import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root=resolve(process.argv[2]||'local-evals/parser-lab');
const before=process.argv[3]||'expanded-baseline-31-full';
const after=process.argv[4]||'expanded-final-31-full';
const manifest=JSON.parse(await readFile(root+'/manifest.json','utf8'));
const rows=[];
for(const item of manifest.cases){
 const load=async dir=>JSON.parse(await readFile(`${root}/${dir}/${item.id}-pageecho.json`,'utf8')).metrics;
 rows.push({id:item.id,split:item.split||'original',imageOnly:!!item.imageOnly,before:await load(before),after:await load(after)});
}
const aggregate=selected=>{
 const totals={pages:selected.length,words:0,beforeEdits:0,afterEdits:0,beforeStructureMatches:0,afterStructureMatches:0};
 for(const row of selected){
  totals.words+=row.after.referenceWords;
  for(const side of ['before','after']){
   const m=row[side];totals[side+'Edits']+=m.wordEdits;
   if(m.actualParagraphs===m.referenceParagraphs && JSON.stringify(m.actualHeadings)===JSON.stringify(m.referenceHeadings))totals[side+'StructureMatches']++;
  }
 }
 return {...totals,beforeAccuracy:1-totals.beforeEdits/totals.words,afterAccuracy:1-totals.afterEdits/totals.words};
};
const reading=rows.filter(r=>!r.imageOnly);
const report={createdAt:new Date().toISOString(),scope:'Spot-page word agreement with manually authored references, full-document context. Not whole-book, semantic, image or narration certification.',before,after,allReading:aggregate(reading),newReading:aggregate(reading.filter(r=>r.split!=='original')),finalHoldout:aggregate(reading.filter(r=>r.split==='final-holdout')),imageOnlyControls:rows.filter(r=>r.imageOnly).map(r=>({id:r.id,actualWords:r.after.actualWords})),rows};
await writeFile(root+'/expanded-report.json',JSON.stringify(report,null,2)+'\n');
const pct=n=>(n*100).toFixed(3)+'%';
let md='# Expanded PDF.js spot-check report\n\n'+report.scope+'\n\n';
for(const key of ['allReading','newReading','finalHoldout']){const a=report[key];md+=`${key}: ${a.pages} text pages / ${a.words} reference words; ${a.beforeEdits} → ${a.afterEdits} edits; ${pct(a.beforeAccuracy)} → ${pct(a.afterAccuracy)}. Paragraph-count + exact heading-text matches: ${a.beforeStructureMatches} → ${a.afterStructureMatches}.\n\n`;}
md+='| Page | Split | Before | After | Edits after | Paragraphs parser/reference | Headings parser/reference |\n|---|---|---:|---:|---:|---:|---:|\n';
for(const r of rows)md+=`| ${r.id} | ${r.split} | ${r.imageOnly?'N/A':pct(r.before.orderedWordAccuracy)} | ${r.imageOnly?'N/A':pct(r.after.orderedWordAccuracy)} | ${r.after.wordEdits} | ${r.after.actualParagraphs}/${r.after.referenceParagraphs} | ${r.after.actualHeadings.length}/${r.after.referenceHeadings.length} |\n`;
await writeFile(root+'/expanded-report.md',md);
console.log(JSON.stringify({allReading:report.allReading,newReading:report.newReading,finalHoldout:report.finalHoldout,imageOnlyControls:report.imageOnlyControls},null,2));
