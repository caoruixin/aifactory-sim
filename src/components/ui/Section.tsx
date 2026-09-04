/**
 * 右栏的小节标题 + 内容块（从 `DetailPanel` 提取，DOM 与 class 逐字不变）。
 *
 * 提取的理由不是「复用一个 h3」，而是**避免第二份证据渲染实现**：v1.6 的切面章节面板
 * 同样要出「关键数字」「因果链」这些小节，就地再写一遍必然会与详情面板慢慢分叉
 *（字号、字距、留白三处都是有意调过的）。`ClaimRow` 同理。
 */

import type { ReactNode } from 'react'

export interface SectionProps {
  title: string
  children: ReactNode
}

export default function Section({ title, children }: SectionProps) {
  return (
    <section>
      <h3 className="text-[11px] font-semibold tracking-widest text-dim uppercase">{title}</h3>
      <div className="mt-1.5">{children}</div>
    </section>
  )
}
