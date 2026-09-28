import {afterEach,describe,expect,it,vi} from 'vitest';
import {extractPdfWithAnydoc} from './anydocPdf';
let outcomes: ('load'|'convert'|'ok')[]=[];
let count=0;
class FakeWorker {
  onmessage: ((event:unknown)=>void)|null=null;
  onerror: ((event:unknown)=>void)|null=null;
  terminate() {}
  constructor(){count++;}
  postMessage({id}:{id:number}) {
    const outcome=outcomes.shift();
    queueMicrotask(()=> {
      if(outcome==='load') this.onerror?.({message:'load failed'});
      else this.onmessage?.({data:outcome==='convert'?{id,error:{code:'CONVERSION_FAILED',message:'bad PDF'}}:{id,markdown:'Text'}});
    });
  }
}
function setup(next:typeof outcomes) {
 outcomes=next;count=0;
 vi.stubGlobal('Worker',FakeWorker);
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,headers:new Headers({'Content-Type':'text/javascript'})}));
}
afterEach(()=>vi.unstubAllGlobals());
describe('AnyDoc asset recovery',()=>{
 it('retries a loading failure once, refreshing the worker cache',async()=>{
  setup(['load','ok']);
  await expect(extractPdfWithAnydoc(new File(['PDF'],'x.pdf'))).resolves.toEqual(['Text']);
  expect(count).toBe(2);expect(fetch).toHaveBeenCalledWith(expect.any(String),expect.objectContaining({cache:'reload'}));
 });
 it('does not retry conversion errors',async()=>{
  setup(['convert']);
  await expect(extractPdfWithAnydoc(new File(['PDF'],'x.pdf'))).rejects.toThrow('bad PDF');
  expect(count).toBe(1);expect(fetch).not.toHaveBeenCalled();
 });
 it('bounds permanent failures to two attempts',async()=>{
  setup(['load','load']);
  await expect(extractPdfWithAnydoc(new File(['PDF'],'x.pdf'))).rejects.toMatchObject({code:'ASSET_LOAD_FAILED'});
  expect(count).toBe(2);
 });
});
