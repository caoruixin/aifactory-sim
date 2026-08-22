import { Link } from 'react-router-dom'

/**
 * 打印报告页占位。批次 4 填充六节内容：
 * 需求背景 / 当前架构 / 推理数据流 / 代际变化 / 证据边界 / 下一阶段。
 * ⚠️ 本文件及其后续依赖**禁止导入 three 或 components/scene**。
 */
export default function ReportPage() {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">AI Factory 方案报告</h1>
      <p className="mt-4 text-dim">本页将在批次 4 填充，用于打印版汇报材料。</p>
      <Link to="/" className="mt-6 inline-block text-accent underline">
        ← 回到工作台
      </Link>
    </main>
  )
}
