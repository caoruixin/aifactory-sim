/**
 * `/report` — 给老板看的一页纸汇报（可打印）。
 *
 * ★ 硬规则：本文件及其**全部依赖禁止导入 three 或 components/scene**。
 *   打印场景（以及任何没有 WebGL 的环境）必须能独立打开这一页。
 *   构建后可以用 `grep -l "three" dist/assets/ReportPage-*.js` 复核。
 *
 * 六节：需求背景 / 当前架构 / 推理数据流 / 代际变化 / 证据边界 / 下一阶段。
 * 打印用 Tailwind 的 `print:` 变体收拾：去掉导航与背景色、避免在节中间分页。
 */

import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import CapacityBands from '../components/panels/CapacityBands'
import RackElevationSvg from '../components/fallback/RackElevationSvg'
import { EvidenceChip, EVIDENCE_LABEL, StatusChip, STATUS_LABEL } from '../components/ui/Chips'
import { FACTORY_PACK, flowsOfSystem, sourceById, systemById } from '../data'
import type { Claim, EvidenceType } from '../data/types'
import { estimateSystemCapacity } from '../lib/capacity'
import { changedRows, compareSystems } from '../lib/compare'
import { FLOW_PHASE_LABEL } from '../lib/flowTimeline'

const GB300 = 'sys.gb300-nvl72'
const VERA_RUBIN = 'sys.vera-rubin-nvl72'
const NVL576 = 'sys.rubin-ultra-nvl576'

// ─────────────────────────── 证据统计（纯函数） ───────────────────────────

interface ClaimRef {
  where: string
  claim: Claim
}

function allClaims(): ClaimRef[] {
  const out: ClaimRef[] = []
  for (const s of FACTORY_PACK.systems) {
    for (const [k, c] of Object.entries(s.keySpecs)) out.push({ where: `${s.name} · ${k}`, claim: c })
  }
  for (const c of FACTORY_PACK.components) {
    for (const [k, v] of Object.entries(c.specs)) out.push({ where: `${c.name} · ${k}`, claim: v })
  }
  for (const a of FACTORY_PACK.assemblies) {
    if (a.countClaim) out.push({ where: `${a.label} · 数量`, claim: a.countClaim })
  }
  for (const c of FACTORY_PACK.connections) {
    if (c.bandwidth) out.push({ where: `${c.label} · 带宽`, claim: c.bandwidth })
  }
  return out
}

export default function ReportPage() {
  const claims = useMemo(allClaims, [])
  const capacity = useMemo(
    () =>
      [GB300, VERA_RUBIN, NVL576].map((systemId) =>
        estimateSystemCapacity({ systemId, modelId: 'deepseek-v3', quantId: 'fp8' }),
      ),
    [],
  )
  const diffToRubin = useMemo(() => compareSystems(GB300, VERA_RUBIN), [])
  const diffToUltra = useMemo(() => compareSystems(VERA_RUBIN, NVL576), [])
  const episode = flowsOfSystem(GB300)[0]

  const byEvidence = useMemo(() => {
    const map = new Map<EvidenceType, ClaimRef[]>()
    for (const c of claims) {
      const list = map.get(c.claim.evidence)
      if (list) list.push(c)
      else map.set(c.claim.evidence, [c])
    }
    return map
  }, [claims])

  const unknownCount = claims.filter((c) => c.claim.value === null).length

  return (
    <main className="mx-auto max-w-4xl bg-panel px-6 py-8 text-fg print:max-w-none print:px-0 print:py-0">
      {/* ── 页眉（打印时隐藏导航） ── */}
      <header className="mb-6 border-b border-line pb-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold">AI Factory 方案汇报</h1>
          <div className="flex items-center gap-3 print:hidden">
            <Link to="/" className="text-xs text-accent underline">
              ← 回到工作台
            </Link>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-md border border-accent/40 bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/20"
            >
              打印 / 导出 PDF
            </button>
          </div>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-dim">
          从一台机架讲清 AI Factory 的硬件主线：机架里有什么、一个请求怎么在里面跑、
          代际之间到底变了什么、以及这些结论各自有多硬的证据。
          内容包版本 {FACTORY_PACK.version} · 数据截至 {FACTORY_PACK.generatedAsOf}。
        </p>
      </header>

      {/* ── 1. 需求背景 ── */}
      <Section n={1} title="需求背景：为什么要有这么一张图">
        <p>
          AI Factory 的方案沟通有一个反复出现的困难：<strong>硬件是立体的，而材料是平面的</strong>。
          客户问「72 张卡怎么连成一台机器」「机房要准备多少电和水」「换下一代能多跑多少 token」，
          这些问题的答案分散在参考架构文档、产品页脚注和分析师文章里，口径还各不相同。
        </p>
        <p>
          本工具把这些资料收敛成一个可下钻的三维模型 + 一套<strong>可溯源的内容包</strong>：
          集群 → 机架 → 托盘 → 板卡逐层展开，每个部件的每个数字都带出处与证据等级，
          官方没公布的一律显示「未公布」而不是编一个看起来合理的数。目标不是做得漂亮，
          而是<strong>讲的时候不会说错</strong>。
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li>建立硬件主线认知：GPU / HBM / NVLink / NIC / DPU / 供电 / 液冷 各自解决什么问题。</li>
          <li>用推理数据流动画解释各部件如何协同，把「参数量」翻译成「哪条链路会堵」。</li>
          <li>代际对比只讲结构与已公布规格，产能只给区间且明确标注是粗估。</li>
        </ul>
      </Section>

      {/* ── 2. 当前架构 ── */}
      <Section n={2} title="当前架构：GB300 NVL72 是一台什么机器">
        <div className="flex flex-wrap gap-6">
          <div className="shrink-0">
            <RackElevationSvg systemId={GB300} />
          </div>
          <div className="min-w-[16rem] flex-1 space-y-3">
            <p>
              一句话：<strong>它不是 18 台服务器摆在一个柜子里，而是 72 张 GPU 通过 NVLink
              组成的单一计算单元</strong>。18 个计算托盘提供 72 张 B300 GPU 与 36 颗 Grace CPU，
              9 个交换托盘里的 18 颗 NVSwitch ASIC 把它们连成无阻塞全互联——每张 GPU 恰好
              18 条 NVLink，每颗 NVSwitch 分一条。
            </p>
            <KeySpecTable systemId={GB300} keys={['gpuCount', 'cpuCount', 'computeTrayCount', 'nvswitchTrayCount', 'nvlinkAggregateBandwidthTBs', 'gpuMemoryTotalTB', 'gpuMemoryBandwidthTBs', 'rackPowerKW']} />
          </div>
        </div>
        <p className="text-xs leading-relaxed text-dim">
          售前口径提醒：GB300 的计算托盘是 <strong>2 Grace + 4 B300</strong>，网卡是
          <strong> ConnectX-8</strong>、DPU 是 <strong>BlueField-3</strong>（不是上一代的 CX-7 / BF-2）；
          交换托盘是 <strong>9 个、每个 2 颗 ASIC</strong>（不是 9 颗，也不是 18 个托盘）。
          这几个数字说错，后面的结论客户就不会信了。
        </p>
      </Section>

      {/* ── 3. 推理数据流 ── */}
      <Section n={3} title="推理数据流：一个请求在机架里怎么跑">
        {episode ? (
          <>
            <p>{episode.summary}</p>
            <ol className="space-y-2">
              {episode.steps.map((step, i) => (
                <li key={step.id} className="rounded-md border border-line px-3 py-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[11px] text-dim">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="rounded border border-line bg-panel-2 px-1.5 py-px text-[11px] text-dim">
                      {FLOW_PHASE_LABEL[step.phase]}
                    </span>
                    <span className="text-sm font-medium">{step.label}</span>
                    <span
                      className={`rounded border px-1.5 py-px text-[11px] ${
                        step.logicalOnly
                          ? 'border-accent-2/35 bg-accent-2/10 text-accent-2'
                          : 'border-ok/35 bg-ok/10 text-ok'
                      }`}
                    >
                      {step.logicalOnly ? '逻辑层' : '物理层'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed">{step.description}</p>
                  {step.presalesNote ? (
                    <p className="mt-1 text-[11px] leading-relaxed text-warn">
                      售前怎么解释：{step.presalesNote}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
            <p className="text-xs leading-relaxed text-dim">
              ⚠️ 步骤的相对时长只用于动画节奏，<strong>不是真实时延</strong>；工具里也刻意
              不把它换算成毫秒展示。真实时延请看下一节的 TTFT / TPOT 粗估区间。
            </p>
          </>
        ) : (
          <p className="text-dim">内容包中暂无数据流剧本。</p>
        )}
      </Section>

      {/* ── 4. 代际变化 ── */}
      <Section n={4} title="代际变化：GB300 → Vera Rubin → Rubin Ultra">
        <div className="space-y-4">
          <SummaryBlock title={diffToRubin.title} points={diffToRubin.summary} />
          <DiffTable title="主要差异（按 roleKey 自动配对）" result={diffToRubin} />
          <SummaryBlock title={diffToUltra.title} points={diffToUltra.summary} />
          <DiffTable title="主要差异（按 roleKey 自动配对）" result={diffToUltra} />
        </div>

        <h3 className="mt-6 text-sm font-semibold">同一负载下的产能粗估对照</h3>
        <p className="text-xs leading-relaxed text-dim">
          参考模型 deepseek-v3（671B 总参 / 37B 激活，MLA）、FP8、单机架、中等负载
          （2k 输入 / 4k 上下文 / 并发 32）。三代中有两代拿不到完整数字——这正是要展示的结论之一。
        </p>
        <div className="mt-2 grid gap-3 md:grid-cols-3 print:grid-cols-3">
          {capacity.map((est) => (
            <CapacityBands key={est.systemId} estimate={est} compact />
          ))}
        </div>
      </Section>

      {/* ── 5. 证据边界 ── */}
      <Section n={5} title="证据边界：哪些能对外说、哪些只能内部参考">
        <p>
          内容包里共 <strong>{claims.length}</strong> 条可溯源事实，其中{' '}
          <strong>{unknownCount}</strong> 条是「官方未公布」——它们在界面上显示为「未公布」，
          并且会让下游的产能估算降级或拒绝出数，而不是被当成 0 参与计算。
        </p>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-line text-left text-dim">
              <th className="py-1.5 pr-2 font-medium">证据等级</th>
              <th className="py-1.5 pr-2 font-medium">条数</th>
              <th className="py-1.5 font-medium">含义与用法</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ['verified_spec', '厂商官方文档/规格表里的确切数字。可以直接对外引用。'],
                ['vendor_claim', '厂商宣称（含营销口径）。要连同前提一起说，不能当规格用。'],
                ['analyst_estimate', '第三方分析师测算。只能讲趋势，不能进方案数字。'],
                ['forecast', '未发布产品的预测。汇报时必须显式说明「这是预测」。'],
                ['author_opinion', '本项目的推导（如产能粗估）。不可当作任何一方的承诺。'],
                ['management_guidance', '管理层业绩会指引。仅作市场背景。'],
                ['benchmark', '公开跑分。本内容包目前未收录。'],
              ] as [EvidenceType, string][]
            ).map(([ev, meaning]) => (
              <tr key={ev} className="border-b border-line/60 align-top">
                <td className="py-1.5 pr-2">
                  <EvidenceChip evidence={ev} />
                </td>
                <td className="py-1.5 pr-2 font-mono">{byEvidence.get(ev)?.length ?? 0}</td>
                <td className="py-1.5 leading-relaxed">{meaning}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3 className="mt-4 text-sm font-semibold">三代产品的状态与可引用性</h3>
        <ul className="space-y-2">
          {FACTORY_PACK.systems.map((s) => (
            <li key={s.id} className="rounded-md border border-line px-3 py-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-medium">{s.name}</span>
                <StatusChip status={s.status} />
                <span className="text-[11px] text-dim">{STATUS_LABEL[s.status]}</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-dim">
                来源：
                {s.sourceIds
                  .map((id) => {
                    const src = sourceById(id)
                    return src ? `${src.publisher}《${src.title}》` : id
                  })
                  .join('；')}
              </p>
            </li>
          ))}
        </ul>

        <h3 className="mt-4 text-sm font-semibold">全部数据源</h3>
        <ul className="space-y-1 text-xs">
          {FACTORY_PACK.sources.map((s) => (
            <li key={s.id} className="leading-relaxed">
              <span className="font-medium">{s.title}</span>
              <span className="text-dim">
                {' '}
                · {s.publisher} · {s.asOf} · {SOURCE_KIND_LABEL[s.kind]}
              </span>
              {s.url ? (
                <a href={s.url} className="ml-1 text-accent underline print:hidden" target="_blank" rel="noreferrer">
                  链接 ↗
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      </Section>

      {/* ── 6. 下一阶段 ── */}
      <Section n={6} title="下一阶段">
        <ul className="ml-5 list-disc space-y-1.5">
          <li>
            <strong>补齐 Vera Rubin 的官方缺口</strong>：整机架功率、单卡 TDP、每卡 NVLink 链路数、
            scale-out 参考架构。这四项一旦官方公布，工具里的 tokens/W 与拓扑图会自动补全。
          </li>
          <li>
            <strong>把产能粗估接到真实压测</strong>：现在的区间只建模了「prefill 吃算力、
            decode 吃显存带宽」两条主线，下一步要引入实测 MFU/MBU 与集合通信开销，
            并区分 goodput 与 SLA 达成率。
          </li>
          <li>
            <strong>加入国产与自研 ASIC 路线</strong>：目前只覆盖 NVIDIA 一条线，
            客户实际的选型对话通常是多路线并行。
          </li>
          <li>
            <strong>把这套内容包做成可维护的资产</strong>：新一代发布时只需追加一个数据文件，
            3D、比较、产能与本页会自动跟着更新——这是当初把「证据」和「渲染」分开的目的。
          </li>
        </ul>
      </Section>

      <footer className="mt-8 border-t border-line pt-3 text-[11px] leading-relaxed text-dim">
        本页所有性能区间均为 roofline 粗估，非实测、非可承诺产能；预测代际的数据来自第三方分析师，
        不代表 NVIDIA 官方口径。引用前请回看每个数字旁的证据徽章与出处。
      </footer>
    </main>
  )
}

// ─────────────────────────── 子块 ───────────────────────────

const SOURCE_KIND_LABEL: Record<string, string> = {
  official_doc: '厂商官方文档',
  official_press: '厂商发布稿',
  analyst_report: '⚠️ 第三方分析师报告',
  earnings_call: '⚠️ 业绩电话会',
  internal_deck: '内部材料',
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8 break-inside-avoid print:mb-6">
      <h2 className="mb-2 flex items-baseline gap-2 border-b border-line pb-1 text-lg font-semibold">
        <span className="font-mono text-sm text-accent">{String(n).padStart(2, '0')}</span>
        {title}
      </h2>
      <div className="space-y-3 text-sm leading-relaxed">{children}</div>
    </section>
  )
}

function KeySpecTable({ systemId, keys }: { systemId: string; keys: string[] }) {
  const system = systemById(systemId)
  if (!system) return null
  return (
    <table className="w-full border-collapse text-xs">
      <tbody>
        {keys.map((k) => {
          const claim = system.keySpecs[k]
          if (!claim) return null
          return (
            <tr key={k} className="border-b border-line/60 align-top">
              <th className="py-1 pr-2 text-left font-mono font-normal text-dim">{k}</th>
              <td className="py-1 pr-2 text-right font-medium whitespace-nowrap">
                {claim.value === null ? (
                  <span className="text-dim italic">官方未公布</span>
                ) : (
                  <>
                    {typeof claim.value === 'number' ? claim.value.toLocaleString('zh-CN') : String(claim.value)}
                    {claim.unit ? <span className="ml-0.5 text-dim">{claim.unit}</span> : null}
                  </>
                )}
              </td>
              <td className="py-1">
                <EvidenceChip evidence={claim.evidence} />
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function SummaryBlock({ title, points }: { title: string; points: string[] }) {
  if (points.length === 0) return null
  return (
    <div className="rounded-md border border-accent/25 bg-accent/5 px-3 py-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-1 ml-4 list-disc space-y-1 text-xs leading-relaxed">
        {points.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ul>
    </div>
  )
}

function DiffTable({ title, result }: { title: string; result: ReturnType<typeof compareSystems> }) {
  const rows = changedRows(result.rows)
  return (
    <div>
      <h4 className="text-xs font-semibold text-dim">
        {title}：共 {result.rows.length} 个部件配对，{rows.length} 处有变化
        （{result.counts.unchanged} 处无变化）
      </h4>
      <table className="mt-1 w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-line text-left text-dim">
            <th className="py-1 pr-2 font-medium">部件</th>
            <th className="py-1 pr-2 font-medium">左</th>
            <th className="py-1 pr-2 font-medium">右</th>
            <th className="py-1 font-medium">变化</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.roleKey} className="border-b border-line/60 align-top">
              <td className="py-1 pr-2 font-medium">{row.label}</td>
              <td className="py-1 pr-2 whitespace-nowrap">
                {row.left ? `${row.left.componentName} ×${row.left.total}` : <span className="text-dim">—</span>}
              </td>
              <td className="py-1 pr-2 whitespace-nowrap">
                {row.right ? `${row.right.componentName} ×${row.right.total}` : <span className="text-dim">—</span>}
              </td>
              <td className="py-1 leading-relaxed">{row.narrative ?? row.summary}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export { EVIDENCE_LABEL }
