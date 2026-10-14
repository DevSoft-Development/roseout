"use client";
import {useRef,useState} from "react";
export function SignaturePad({onSave,disabled}:{onSave:(pngBase64:string)=>Promise<void>;disabled?:boolean}){
 const canvas=useRef<HTMLCanvasElement>(null);
 const drawing=useRef(false),[signed,setSigned]=useState(false),[busy,setBusy]=useState(false);
 function xy(e:React.PointerEvent<HTMLCanvasElement>){
  const box=e.currentTarget.getBoundingClientRect();
  return {x:(e.clientX-box.left)*e.currentTarget.width/box.width,
   y:(e.clientY-box.top)*e.currentTarget.height/box.height};
 }
 function begin(e:React.PointerEvent<HTMLCanvasElement>){
  if(disabled||busy)return;
  e.currentTarget.setPointerCapture(e.pointerId);
  const p=xy(e),c=canvas.current?.getContext("2d");
  if(!c)return;
  c.strokeStyle="#111827";c.lineWidth=2.5;c.lineCap="round";
  c.beginPath();c.moveTo(p.x,p.y);drawing.current=true;
 }
 function move(e:React.PointerEvent<HTMLCanvasElement>){
  if(!drawing.current)return;
  const p=xy(e),c=canvas.current?.getContext("2d");
  c?.lineTo(p.x,p.y);c?.stroke();setSigned(true);
 }
 function end(){drawing.current=false;}
 function clear(){
  canvas.current?.getContext("2d")?.clearRect(0,0,640,200);setSigned(false);
 }
 async function save(){
  if(!signed||busy||disabled||!canvas.current)return;
  setBusy(true);
  try{await onSave(canvas.current.toDataURL("image/png").split(",")[1]);}
  finally{setBusy(false);}
 }
 return <div className="space-y-2 rounded-lg border p-3">
  <p className="font-semibold">Optional electronic signature</p>
  <p className="text-xs">Sign only if you wish to include a signature with your purchase agreement. Your payment remains subject to Stripe authorization.</p>
  <canvas ref={canvas} width={640} height={200}
   aria-label="Draw your signature" role="img" className="h-36 w-full touch-none rounded-lg border bg-white"
   onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end}/>
  <div className="flex gap-2">
   <button type="button" className="rounded-lg border px-3 py-2" disabled={busy||disabled} onClick={clear}>Clear</button>
   <button type="button" className="rounded-lg bg-slate-900 px-3 py-2 text-white disabled:opacity-40" disabled={!signed||busy||disabled} onClick={save}>Save signature</button>
  </div>
 </div>;
}
