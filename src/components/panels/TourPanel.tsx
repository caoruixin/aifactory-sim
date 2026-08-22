/**
 * 左栏：场景导览 + 六平面开关。
 *
 * 导览条目直接来自内容包的 `ScenePreset`（「看什么」的语义），
 * 相机数字留在 `lib/cameraPresets.ts`——内容作者不需要懂 3D 就能加一屏讲解。
 */

import { scenesOfSystem } from '../../data'
import type { NetworkPlane } from '../../data/types'
import { LEVEL_LABEL } from '../../lib/drill'
import { PLANE_LABEL, PLANE_ORDER, planeColor } from '../../lib/palette'
import { useFactoryStore } from '../../store'

export default function TourPanel() {
  const generation = useFactoryStore((s) => s.generation)
  const tourStopIdx = useFactoryStore((s) => s.tourStopIdx)
  const applyScene = useFactoryStore((s) => s.applyScene)
  const reset = useFactoryStore((s) => s.reset)
  const scenes = scenesOfSystem(generation)
  const activeScene = scenes[tourStopIdx]

  return (
    <div className="flex h-full flex-col overflow-y-auto">
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
              <li key={scene.id}>
                <button
                  type="button"
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
              </li>
            )
          })}
        </ol>
        {activeScene ? (
          <div className="mt-2.5 rounded-lg border border-line bg-panel p-2.5">
            <p className="text-xs leading-relaxed">{activeScene.narration}</p>
            {activeScene.presalesNote ? (
              <p className="mt-2 border-t border-line pt-2 text-[11px] leading-relaxed text-warn">
                <span className="font-semibold">售前提示：</span>
                {activeScene.presalesNote}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <PlaneToggles />
    </div>
  )
}

/**
 * 六平面开关。B2 只维护开关状态与图例（连线本体在 B3 的 ConnectionLayer 里接上），
 * 但配色与文案在这里就定死，DOM 图例与 3D 连线共用 `lib/palette.ts` 的同一组值。
 */
function PlaneToggles() {
  const planes = useFactoryStore((s) => s.planes)
  const togglePlane = useFactoryStore((s) => s.togglePlane)
  const setPlanes = useFactoryStore((s) => s.setPlanes)

  const setAll = (on: boolean) => {
    setPlanes(PLANE_ORDER.reduce((acc, p) => ({ ...acc, [p]: on }), {} as Record<NetworkPlane, boolean>))
  }

  return (
    <section className="px-3 py-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[11px] font-semibold tracking-widest text-dim uppercase">网络与设施平面</h2>
        <div className="flex gap-2 text-[11px]">
          <button type="button" onClick={() => setAll(true)} className="text-dim hover:text-accent">
            全开
          </button>
          <button type="button" onClick={() => setAll(false)} className="text-dim hover:text-accent">
            全关
          </button>
        </div>
      </div>
      <ul className="mt-2 space-y-1">
        {PLANE_ORDER.map((plane) => (
          <li key={plane}>
            <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-panel-2">
              <input
                type="checkbox"
                checked={planes[plane]}
                onChange={() => togglePlane(plane)}
                className="h-3.5 w-3.5"
              />
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: planeColor(plane) }}
              />
              <span className={planes[plane] ? '' : 'text-dim line-through'}>
                {PLANE_LABEL[plane]}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] leading-snug text-dim">
        平面连线将在批次 3 接入 3D 视图；当前开关只保存状态，配色即最终配色。
      </p>
    </section>
  )
}
