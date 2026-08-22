import { Link } from 'react-router-dom'
import {
  FACTORY_PACK,
  connectionsOfPlane,
  packStats,
  totalInstances,
} from '../data'
import type { NetworkPlane } from '../data/types'

/**
 * 主工作台占位页。
 * 批次 1 只做一件事：把内容包真正加载出来并把统计摘要显示到页面上，
 * 证明数据层可用。批次 2 起这里会被替换成「顶面包屑 / 左导览 / 中 Canvas / 右详情 / 底步骤条」布局。
 */

const PLANE_LABELS: Record<NetworkPlane, string> = {
  nvlink: 'NVLink（机架内 scale-up）',
  scaleout: 'Scale-out（East/West 计算网）',
  business: '业务与存储（North/South）',
  mgmt: '管理（带外/带内）',
  power: '供电',
  cooling: '液冷',
}

const PLANE_TOKENS: Record<NetworkPlane, string> = {
  nvlink: 'var(--color-plane-nvlink)',
  scaleout: 'var(--color-plane-scaleout)',
  business: 'var(--color-plane-business)',
  mgmt: 'var(--color-plane-mgmt)',
  power: 'var(--color-plane-power)',
  cooling: 'var(--color-plane-cooling)',
}

export default function FactoryPage() {
  const stats = packStats()
  const system = FACTORY_PACK.systems[0]!
  const gpusPerRack = totalInstances('asm.gb300.b300-gpu', 'asm.gb300.rack')
  const cpusPerRack = totalInstances('asm.gb300.grace-cpu', 'asm.gb300.rack')
  const nvswitchPerRack = totalInstances('asm.gb300.nvswitch-asic', 'asm.gb300.rack')

  return (
    <main data-ready="1" className="mx-auto max-w-4xl px-6 py-10">
      <header className="border-b border-line pb-6">
        <p className="text-xs tracking-widest text-dim uppercase">AI Factory 数字孪生模拟器</p>
        <h1 className="mt-2 text-3xl font-semibold">{system.name}</h1>
        <p className="mt-3 leading-relaxed text-dim">{system.summary}</p>
      </header>

      <section className="mt-8">
        <h2 className="text-sm font-semibold tracking-wide text-dim">内容包统计</h2>
        <dl className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5">
          <Stat label="数据源" value={stats.sources} />
          <Stat label="系统" value={stats.systems} />
          <Stat label="组件" value={stats.components} />
          <Stat label="装配节点" value={stats.assemblies} />
          <Stat label="连接" value={stats.connections} />
          <Stat label="导览场景" value={stats.scenes} />
          <Stat label="参考模型" value={stats.models} />
          <Stat label="数据流剧本" value={stats.flows} hint="批次 3" />
          <Stat label="代际比较" value={stats.comparisons} hint="批次 4" />
        </dl>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold tracking-wide text-dim">单机架关键数量（由装配树连乘得出）</h2>
        <dl className="mt-3 grid grid-cols-3 gap-3">
          <Stat label="B300 GPU" value={gpusPerRack} />
          <Stat label="Grace CPU" value={cpusPerRack} />
          <Stat label="NVSwitch ASIC" value={nvswitchPerRack} />
        </dl>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold tracking-wide text-dim">六平面连接数</h2>
        <ul className="mt-3 space-y-1.5">
          {(Object.keys(PLANE_LABELS) as NetworkPlane[]).map((plane) => (
            <li key={plane} className="flex items-center gap-2.5 text-sm">
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: PLANE_TOKENS[plane] }}
              />
              <span className="flex-1">{PLANE_LABELS[plane]}</span>
              <span className="font-mono text-dim">
                {connectionsOfPlane(system.id, plane).length} 条
              </span>
            </li>
          ))}
        </ul>
      </section>

      <footer className="mt-10 border-t border-line pt-6 text-sm text-dim">
        <p>
          批次 1 占位页：数据层与 roofline 引擎已就绪，3D 下钻查看器将在批次 2 接入。
        </p>
        <Link to="/report" className="mt-3 inline-block text-accent underline">
          打印报告（占位）→
        </Link>
      </footer>
    </main>
  )
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-md border border-line bg-panel px-3 py-2.5">
      <dt className="text-xs text-dim">
        {label}
        {hint ? <span className="ml-1 opacity-70">（{hint}）</span> : null}
      </dt>
      <dd className="mt-0.5 font-mono text-xl">{value}</dd>
    </div>
  )
}
