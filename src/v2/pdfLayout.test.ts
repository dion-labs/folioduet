import { describe, expect, it } from 'vitest';
import { positionedPdfMarkdown } from './pdfLayout';
function line(str:string,y:number,x=50,size=12){return {str,transform:[size,0,0,size,x,y],width:str.length*5};}
describe('PDF geometry reconstruction',()=>{
  it('preserves indented paragraph boundaries instead of splitting every sentence',()=>{
    const result=positionedPdfMarkdown([
      line('A first sentence ends here. A second continues',600),
      line('on the following physical line of the paragraph.',585),
      line('An indented paragraph starts a fresh thought',570,68),
      line('and continues with enough words on its next line.',555),
    ]);
    expect(result?.split('\n\n')).toHaveLength(2);
    expect(result).toContain('paragraph.\n\nAn indented');
  });
  it('joins large wrapped headings and excludes isolated small furniture',()=>{
    const result=positionedPdfMarkdown([
      line('The Coastal',680,50,24),line('Observatory',654,50,24),
      line('A sufficiently long first paragraph begins here',600),
      line('and the flowing text continues to its conclusion.',585),
      line('vii',80,200,8),
    ]);
    expect(result).toContain('## The Coastal Observatory\n\nA sufficiently');
    expect(result).not.toContain('vii');
  });
  it('removes a small running title but keeps the real subsection',()=>{
    const result=positionedPdfMarkdown([
      line('42 Field Notes',720,50,9),
      line('The first body paragraph has many words on a line',650),
      line('and ends with a straightforward final sentence.',635),
      line('A New Method',605),
      line('The next body paragraph explains the new method',587),
      line('and keeps its own ordinary continuation intact.',572),
    ]);
    expect(result).not.toContain('Field Notes');
    expect(result).toContain('## A New Method');
  });
  it('does not discard a small note inside the body or guess rotated layouts',()=>{
    const result=positionedPdfMarkdown([
      line('The first body paragraph has many words on a line',650),
      line('A small note.',635,50,9),
      line('The next body paragraph explains the new method',610),
      line('1 A small footnote below the body.',550,50,9),
    ]);
    expect(result).toContain('A small note.');
    expect(result).toContain('1 A small footnote below the body.');
    expect(positionedPdfMarkdown([{str:'rotated',transform:[0,12,12,0,50,600]}])).toBeNull();
    expect(positionedPdfMarkdown([{str:'No coordinates'}])).toBeNull();
  });
});


describe('expanded spot-page regressions',()=>{
  it('retains explicit spaces even across tightly placed runs',()=>{
    const first=line('A fairly long opening paragraph with word',600);
    const space={...line(' ',600,first.transform[4]+first.width),width:.05};
    const next=line('boundaries preserved.',600,space.transform[4]+.05);
    const out=positionedPdfMarkdown([first,space,next,line('The next physical line has ordinary flowing prose.',585),line('The final line completes this little paragraph.',570)]);
    expect(out).toContain('word boundaries');
  });
  it('places a raised note number after its sentence instead of ahead of it',()=>{
    const out=positionedPdfMarkdown([line('The first sentence is long enough to establish prose.',600),line('The second line ends with a reference.',585),line('2',590,235,7),line('The next paragraph has plenty of ordinary words.',565)]);
    expect(out).toContain('reference.²');
    expect(out).not.toContain('2 The second');
  });
  it('retains captions above the body while removing same-size numbered furniture',()=>{
    const out=positionedPdfMarkdown([line('27 A Running Title',720),line('Fig. 4. A small caption',650,50,9),line('The first body paragraph begins below the figure.',600),line('and continues with enough words on another line.',585)]);
    expect(out).not.toContain('Running Title');expect(out).toContain('Fig. 4. A small caption');
  });
  it('recognizes the first subsection and separates hanging numbered items',()=>{
    const out=positionedPdfMarkdown([line('A New Method',660),line('The body paragraph begins with enough ordinary words.',640),line('and continues with enough words on another line.',625),line('12.1 The first numbered statement begins at the margin.',600),line('12.2 The second numbered statement has its own block.',585)]);
    expect(out).toContain('## A New Method');expect(out).toContain('margin.\n\n12.2');
  });
});

it('keeps hanging list continuations together and starts the next item',()=>{
 const out=positionedPdfMarkdown([
  line('The preceding paragraph establishes the normal left margin.',700),
  line('and keeps this second line at the same normal left margin.',685),
  line('3. A numbered item begins with several ordinary words',650,55),
  line('and continues on a hanging line of enough words.',635,72),
  line('with a further hanging continuation of the item.',620,72),
  line('4. The next item begins independently here.',605,55),
 ]);
 expect(out).toContain('words and continues');expect(out).toContain('words. with a further');
 expect(out).toContain('item.\n\n4.');
});

it('attaches multiple raised notes sharing a baseline in reading order',()=>{
 const out=positionedPdfMarkdown([
  line('An ordinary long first line establishes the paragraph.',650),
  {...line('First',635),width:25},line('4',640,75,7),
  {...line(' and second.',635,79),width:60},line('5',640,139,7),
  line('Another ordinary long line completes the paragraph.',620),
 ]);
 expect(out).toContain('First⁴ and second.⁵');expect(out).not.toContain('4 5');
});
