/**
 * 机架立面图（纯 SVG，零 three 依赖）。
 *
 * 两个用途：
 *   1. `/report` 打印页里表达「一个机架里装了什么」——打印机没有 WebGL；
 *   2. B5 的 2D 降级视图（`Fallback2D`）复用同一个组件，保证降级路径不是另画一套。
 *
 * ⚠️ U 位全部是**示意占位**：三代产品的官方资料都没有公布逐 U 布局
 *    （NVL576 的立面图来自分析师文章，且本项目为保证 roleKey 唯一做了合并简化）。
 *    因此图上标的 U 只保证「同层不重叠、数量正确」，不能当机柜施工图用。
 */

import { assembliesOfSystem, componentById, systemById } from '../../data'
import { DEFAULT_RACK_UNITS } from '../../lib/layout'
import { color as paletteColor } from '../../lib/palette'

export interface RackElevationSvgProps {
  systemId: string
  /** 图形宽度（px）。高度按机架 U 数自适应。 */
  width?: number
  /** 每 U 的像素高度。 */
  uHeight?: number
  /**
   * B5 新增（Fallback2D 复用）：点击某一档位 = 选中该装配节点，与 3D/组件树同一动作。
   * 省略则退回 `/report` 的原始纯展示行为（不可点）。
   */
  onSelectAssembly?: (assemblyId: string) => void
  /** 当前选中的装配节点：描边加粗，呼应 3D 里的选中高亮。 */
  selectedId?: string | null
  /**
   * 数据流当前步骤引用的装配节点（含连接两端 + `highlightAssemblyIds`）：
   * 对应档位加一圈强调色描边，替代 3D 里粒子经过时的高亮——降级路径下没有粒子，
   * 「哪个部件正在参与这一步」只能靠这种静态强调表达。
   */
  highlightAssemblyIds?: ReadonlySet<string>
  /**
   * 导览当前站点名的装配节点（v1.3 W2，已折叠到机架粒度）：优先级**低于**选中与
   * 数据流高亮，用较细的 accent 描边 + `data-scene-active` 标记表达
   * ——与 3D 那边 `selected > hovered > flow > scene` 的排序一致。
   */
  sceneAssemblyIds?: ReadonlySet<string> | null
}

export default function RackElevationSvg({
  systemId,
  width = 260,
  uHeight = 9,
  onSelectAssembly,
  selectedId = null,
  highlightAssemblyIds,
  sceneAssemblyIds = null,
}: RackElevationSvgProps) {
  const system = systemById(systemId)
  const units = system?.rackUnitsForLayout ?? DEFAULT_RACK_UNITS
  const rows = assembliesOfSystem(systemId)
    .filter((a) => a.rackU !== null)
    .sort((x, y) => y.rackU!.start - x.rackU!.start)

  const padTop = 18
  const padBottom = 14
  const height = units * uHeight + padTop + padBottom
  const bodyLeft = 34
  const bodyRight = width - 8
  const yOf = (u: number) => padTop + (units - u) * uHeight // U1 在底部

  if (rows.length === 0) {
    return <p className="text-xs text-dim">该系统没有登记占 U 位的部件。</p>
  }

  return (
    <figure className="m-0">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${system?.name ?? systemId} 机架立面示意`}
        className="max-w-full"
      >
        {/* 机架外框 */}
        <rect
          x={bodyLeft}
          y={padTop}
          width={bodyRight - bodyLeft}
          height={units * uHeight}
          fill="none"
          stroke={paletteColor('line', 'line')}
          strokeWidth={1.5}
          rx={3}
        />
        {/* 每 5U 一条刻度 */}
        {Array.from({ length: Math.floor(units / 5) + 1 }, (_, i) => i * 5).map((u) =>
          u === 0 ? null : (
            <g key={u}>
              <line
                x1={bodyLeft - 4}
                y1={yOf(u)}
                x2={bodyLeft}
                y2={yOf(u)}
                stroke={paletteColor('line', 'line')}
              />
              <text x={bodyLeft - 6} y={yOf(u) + 3} textAnchor="end" fontSize={7} fill={paletteColor('dim', 'dim')}>
                U{u}
              </text>
            </g>
          ),
        )}

        {rows.map((node) => {
          const span = node.rackU!
          const slotU = span.height / node.count
          const component = componentById(node.componentId)
          const fill = paletteColor(component?.visual.colorToken ?? null, 'dim')
          const forecast = component?.status === 'forecast'
          const selected = selectedId === node.id
          const flowActive = highlightAssemblyIds?.has(node.id) ?? false
          const sceneActive = sceneAssemblyIds?.has(node.id) ?? false
          const clickable = typeof onSelectAssembly === 'function'
          // 优先级与 3D 同序：选中 > 数据流 > 场景导览（立面图没有悬停态）。
          const strokeColor = selected
            ? paletteColor('accent', 'accent')
            : flowActive
              ? paletteColor('accent-2', 'accent-2')
              : sceneActive
                ? paletteColor('accent', 'accent')
                : fill
          const emphasized = selected || flowActive
          return (
            <g
              key={node.id}
              data-rack-elevation-row={node.id}
              data-selected={selected ? '1' : '0'}
              data-flow-active={flowActive ? '1' : '0'}
              data-scene-active={sceneActive ? '1' : '0'}
              onClick={clickable ? () => onSelectAssembly!(node.id) : undefined}
              style={clickable ? { cursor: 'pointer' } : undefined}
            >
              {Array.from({ length: node.count }, (_, i) => {
                const start = span.start + i * slotU
                const y = yOf(start + slotU)
                return (
                  <rect
                    key={i}
                    x={bodyLeft + 2}
                    y={y + 0.6}
                    width={bodyRight - bodyLeft - 4}
                    height={Math.max(slotU * uHeight - 1.2, 1.4)}
                    fill={fill}
                    fillOpacity={forecast ? 0.18 : 0.32}
                    stroke={strokeColor}
                    strokeWidth={emphasized ? 1.8 : sceneActive ? 1.4 : 0.8}
                    strokeDasharray={forecast ? '3 2' : undefined}
                  >
                    <title>{`${node.label} #${i + 1}（U${start.toFixed(2).replace(/\.?0+$/, '')} 起，${slotU}U，示意）`}</title>
                  </rect>
                )
              })}
              {/* 分组标签：写在该组中间那一格上 */}
              <text
                x={bodyLeft + 8}
                y={yOf(span.start + span.height / 2) + 3}
                fontSize={8}
                fill={paletteColor('fg', 'fg')}
              >
                {node.label}
                {node.count > 1 ? ` ×${node.count}` : ''}
              </text>
            </g>
          )
        })}

        <text x={bodyLeft} y={padTop - 6} fontSize={9} fill={paletteColor('dim', 'dim')}>
          {system?.name ?? systemId} · {units}U（示意）
        </text>
      </svg>
      <figcaption className="mt-1 text-[11px] leading-snug text-dim">
        ⚠️ U 位为示意占位：官方未公布逐 U 布局，图上只保证数量与不重叠。
      </figcaption>
    </figure>
  )
}
