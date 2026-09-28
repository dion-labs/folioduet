import { describe, expect, it } from 'vitest';
import { highlightParts, textDifferences } from './differences';
const changed = (text:string, ranges:{start:number;end:number}[]) => ranges.map(r=>text.slice(r.start,r.end));
describe('difference highlighting',()=>{
  it('aligns repeated words without marking the unchanged suffix',()=>{
    const a='one two one three', b='one one three';
    const d=textDifferences(a,b)!;
    expect(changed(a,d.referenceRanges)).toEqual(['two']);
    expect(d.actualRanges).toEqual([]);
  });
  it('shows both sides of substitutions including punctuation and case',()=>{
    const a='Hello, world.', b='hello brave world!';
    const d=textDifferences(a,b)!;
    expect(changed(a,d.referenceRanges)).toEqual(['Hello',',','.']);
    expect(changed(b,d.actualRanges)).toEqual(['hello','brave','!']);
  });
  it('ignores whitespace, handles empty text and preserves Unicode offsets',()=>{
    expect(textDifferences('a\n\nb','a b')?.referenceRanges).toEqual([]);
    expect(changed('🌿 café',textDifferences('','🌿 café')!.actualRanges)).toEqual(['🌿','café']);
    expect(textDifferences('','')).toEqual({referenceRanges:[],actualRanges:[]});
  });
  it('splits a changed word across formatting runs without dropping text',()=>{
    const ranges=[{start:2,end:7}];
    expect(highlightParts('a par',0,ranges)).toEqual([{text:'a ',changed:false},{text:'par',changed:true}]);
    expect(highlightParts('ty.',5,ranges)).toEqual([{text:'ty',changed:true},{text:'.',changed:false}]);
  });
  it('bounds work for large inputs',()=>expect(textDifferences('a '.repeat(6001),'a')).toBeNull());
});
