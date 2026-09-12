import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface DrawerProps { open: boolean; onClose: () => void; title: string; children: ReactNode; side?: 'bottom'|'right' }
const stack: HTMLElement[] = []
let previousOverflow = ''
export default function Drawer({open,onClose,title,children,side='bottom'}: DrawerProps) {
  const ref = useRef<HTMLDivElement>(null)
  const close = useRef(onClose); close.current=onClose
  useEffect(()=>{
    const node=ref.current
    if(!open || !node) return
    const previous=document.activeElement as HTMLElement | null
    if(!stack.length) { previousOverflow=document.body.style.overflow; document.body.style.overflow='hidden' }
    stack.push(node)
    const focusable=()=>Array.from(node.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex]:not([tabindex="-1"])')).filter(el=>el.getClientRects().length>0)
    ;(focusable()[0] ?? node).focus()
    const key=(e:KeyboardEvent)=>{
      if(stack.at(-1)!==node) return
      if(e.key==='Escape') {e.preventDefault();e.stopPropagation();close.current()}
      if(e.key==='Tab') {
        const items=focusable(),first=items[0]??node,last=items.at(-1)??node
        if(e.shiftKey && (document.activeElement===first || !node.contains(document.activeElement))) {e.preventDefault();last.focus()}
        else if(!e.shiftKey && (document.activeElement===last || !node.contains(document.activeElement))) {e.preventDefault();first.focus()}
      }
    }
    const focus=(e:FocusEvent)=>{if(stack.at(-1)===node && !node.contains(e.target as Node)) (focusable()[0]??node).focus()}
    document.addEventListener('keydown',key);document.addEventListener('focusin',focus)
    return()=>{
      document.removeEventListener('keydown',key);document.removeEventListener('focusin',focus)
      stack.splice(stack.indexOf(node),1)
      if(!stack.length) document.body.style.overflow=previousOverflow
      if(previous?.isConnected) previous.focus()
    }
  },[open])
  if(!open) return null
  return createPortal(<div ref={ref} tabIndex={-1} className="fixed inset-0 z-50" data-drawer={side} role="dialog" aria-modal="true" aria-label={title}>
    <div className="absolute inset-0 bg-ink/60 backdrop-blur-[1px]" role="presentation" onClick={onClose}/>
    <div className={`absolute flex min-w-0 flex-col overflow-hidden border-line bg-panel shadow-lg ${side==='bottom'?'inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl border-t':'inset-y-0 right-0 h-full w-[min(26rem,94vw)] border-l'}`}>
      <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-2.5"><span className="text-sm font-semibold">{title}</span><button type="button" onClick={onClose} className="rounded px-3 py-1.5 text-sm text-dim">关闭</button></div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [&:has([data-capacity-feedback])]:scroll-pt-24">{children}</div>
    </div>
  </div>,document.body)
}
