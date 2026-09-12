/**
 * 左栏：场景导览 + 六平面开关。
 *
 * 导览条目直接来自内容包的 `ScenePreset`（「看什么」的语义），
 * 相机数字留在 `lib/cameraPresets.ts`——内容作者不需要懂 3D 就能加一屏讲解。
 *
 * ★ v1.3 W2 两处调整，都是「站数从 3 涨到 10」逼出来的：
 *   1. **讲解文案渲染在当前站的条目里**，不再吊在整张列表下面——10 个条目之后那块
 *      卡片一定在折叠线以下，等于打开 `?tour=` 深链却读不到这一站要讲什么；
 *   2. **当前站自动滚入可视区**：深链可以直接落到第 8 站，不滚的话左栏看上去像没反应。
 */

import { useCallback, useState } from 'react'
import { scenesOfSystem, assembliesOfSystem, componentById, ancestorsOf } from '../../data'
import { LEVEL_LABEL } from '../../lib/drill'
import { useFactoryStore } from '../../store'
import RichText from '../ui/RichText'
import PlaneToggles from './PlaneToggles'

export default function TourPanel({onInspectAssembly}: {onInspectAssembly?:()=>void}) {
  const generation = useFactoryStore((s) => s.generation)
  const tourStopIdx = useFactoryStore((s) => s.tourStopIdx)
  const applyScene = useFactoryStore((s) => s.applyScene)
  const reset = useFactoryStore((s) => s.reset)
  const scenes = scenesOfSystem(generation)
  const [query,setQuery] = useState('')
  const select = useFactoryStore(s=>s.select)
  const drillTo = useFactoryStore(s=>s.drillTo)
  const selectedId = useFactoryStore(s=>s.selectedId)
  const focusPath = useFactoryStore(s=>s.focusPath)
  const matches = query.trim() ? assembliesOfSystem(generation).filter(a=>`${a.label} ${componentById(a.componentId)?.name??''}`.toLowerCase().includes(query.trim().toLowerCase())) : []
  const podModules=assembliesOfSystem(generation).filter(a=>a.id.startsWith('asm.pod.'))

  /**
   * 回调 ref：当前站的条目一挂载就滚进可视区。
   * 用 `block: 'nearest'` 而不是 'center'——只在必要时滚动，用户手动点第 2 站时
   * 列表不会莫名其妙地跳。
   */
  const focusActive = useCallback((el: HTMLLIElement | null) => {
    if (!el || typeof el.scrollIntoView !== 'function') return
    el.scrollIntoView({ block: 'nearest' })
  }, [])

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <section className="border-b border-line p-3">
        <label className="text-xs text-dim">搜索组件<input type="search" value={query} onChange={e=>setQuery(e.target.value)} className="mt-1 w-full min-w-0 rounded border border-line bg-panel px-2 py-1.5" placeholder="GPU / HBM / STX…"/></label>
        {query.trim() && <ul className="mt-2 space-y-2 text-xs">{matches.length===0 && <li>没有匹配组件</li>}{matches.map(a=><li key={a.id} aria-current={focusPath.includes(a.id)?'location':undefined} className={`rounded border p-2 ${selectedId===a.id||focusPath.includes(a.id)?'border-accent bg-accent/10':'border-line'}`}><button type="button" className="text-left" onClick={()=>{select(a.id);onInspectAssembly?.()}}>{a.label}</button><p className="text-[10px] text-dim">{ancestorsOf(a.id).map(n=>n.label).join(' › ')}</p><button type="button" className="mt-1 text-accent underline" onClick={()=>{drillTo(a.id);onInspectAssembly?.()}}>定位组件</button></li>)}</ul>}
      </section>
      {podModules.length>0 && !query.trim() && <details className="border-b border-line p-3 text-xs">
        <summary className="cursor-pointer font-medium">POD 配套 · 独立资源</summary>
        <p className="my-2 text-[11px] text-dim">Agent 执行、KV 存储与网络连接；图中数量为示意。</p>
        <ul className="space-y-2">{podModules.map(a=><li key={a.id}><button type="button" className="text-left text-accent underline" onClick={()=>{drillTo(a.id);onInspectAssembly?.()}}>{a.label}</button></li>)}</ul>
      </details>}
      <section className="border-b border-line px-3 py-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[11px] font-semibold tracking-widest text-dim uppercase">场景导览</h2>
          <button type="button" onClick={reset} className="text-[11px] text-dim hover:text-accent">
            回到总览
          </button>
        </div>
        <ol className="mt-2 space-y-1.5">
          {scenes.map((scene, i) => {
            const active = i === tourStopIdx
            return (
              <li key={scene.id} ref={active ? focusActive : undefined}>
                <button
                  type="button"
                  // 深链（`?tour=`）落到哪一站，E2E 与手册截图都靠这两个锚点核对。
                  data-tour-scene={scene.id}
                  data-tour-scene-active={active ? '1' : '0'}
                  onClick={() => applyScene(scene.id)}
                  className={`w-full rounded-lg border px-2.5 py-2 text-left transition-colors ${
                    active
                      ? 'border-accent bg-accent/10'
                      : 'border-line bg-panel-2 hover:border-accent/50'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[11px] text-dim">{i + 1}</span>
                    <span className="text-sm leading-snug font-medium">{scene.title}</span>
                  </div>
                  <span className="mt-0.5 block text-[11px] text-dim">
                    {LEVEL_LABEL[scene.lodLevel]}级 · {scene.planes.length} 个平面
                  </span>
                </button>
                {active ? (
                  <div
                    data-tour-narration={scene.id}
                    className="mt-1.5 rounded-lg border border-line bg-panel p-2.5"
                  >
                    <p className="text-xs leading-relaxed">
                      <RichText text={scene.narration} />
                    </p>
                    {scene.presalesNote ? (
                      <p className="mt-2 border-t border-line pt-2 text-[11px] leading-relaxed text-warn">
                        <span className="font-semibold">售前提示：</span>
                        <RichText text={scene.presalesNote} />
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            )
          })}
        </ol>
      </section>

      <PlaneToggles />
    </div>
  )
}
