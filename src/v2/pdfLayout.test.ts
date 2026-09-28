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
