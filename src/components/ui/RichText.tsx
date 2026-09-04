/**
 * 内容包文案的行内渲染器：把 `**粗体**` 渲染成 `<strong>`，其余原样输出。
 *
 * 用法就是把裸的 `{text}` 换成 `<RichText text={text} />`——它返回的是**片段**
 * （没有外层容器），因此原来的 `<p className="…">` 排版类名、行高、颜色全部不变，
 * 只是关键词从字面星号变成了真正的重音。
 *
 * ⚠️ 凡是渲染内容包 note / presalesNote / summary / narrative / narration 的地方
 * 都要走这里（`lib/richText.ts` 顶部有清单与理由）。只能放字符串的位置
 * （`title=` / `aria-label=`）改用 `plainText()`。
 *
 * 解析规则、为什么不用 markdown 库、为什么落单的 `**` 原样显示，见 `lib/richText.ts`。
 */

import { Fragment } from 'react'
import { parseRichText } from '../../lib/richText'

export interface RichTextProps {
  /** 内容包里的一段文案；null / undefined / 空串一律渲染成「什么都没有」。 */
  text: string | null | undefined
}

export default function RichText({ text }: RichTextProps) {
  const segments = parseRichText(text)
  return (
    <>
      {segments.map((seg, i) =>
        seg.bold ? (
          // 只加粗，不改颜色：这些文案分布在 text-dim / text-warn / text-bad 各种上下文里，
          // 顺手把颜色调成 text-fg 会破坏「弱化说明」「警示」这些既有的语义分层。
          <strong key={i} className="font-semibold">
            {seg.text}
          </strong>
        ) : (
          <Fragment key={i}>{seg.text}</Fragment>
        ),
      )}
    </>
  )
}
