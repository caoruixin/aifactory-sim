/**
 * 内容包文案里的**极小子集** markdown：只认 `**粗体**`，别的一概不认。
 *
 * ★ 为什么需要这个文件（v1.5 缺陷 1）：内容包的作者一直用 `**…**` 给关键词加重音
 * （note / presalesNote / summary / narrative / narration 共 169 处），但渲染层是纯文本
 * JSX，用户实际看到的是字面的星号——「没有铜背板、没有直流母排」在导览面板上读成
 * 「**没有铜背板、没有直流母排**」。数据层不能动（证据可溯源的那套文案是资产），
 * 所以在渲染侧补一个解析器。
 *
 * ★ 三条设计纪律：
 * 1. **不引入 markdown 库、不碰 `dangerouslySetInnerHTML`**。内容包是可信的，但
 *    「把字符串塞进 innerHTML」这条路一旦开，以后任何一个从 URL/外部进来的字符串
 *    走到同一个组件就是 XSS。这里只产出结构化片段，由 React 负责转义。
 * 2. **只有成对的 `**` 才成为粗体**。落单的 `**`（作者写漏了一半）原样显示，
 *    这样排版错误在界面上是可见的、会被修掉；悄悄吞掉它反而会长期留在数据里。
 *    `****`（空粗体）同理按字面处理——不产出空的 `<strong>`。
 * 3. 单个 `*`（乘号、脚注星、`?tour=*`）不参与解析，完全按字面。
 */

export interface RichSegment {
  text: string
  /** true = 该片段来自一对 `**…**`，渲染成 `<strong>`。 */
  bold: boolean
}

/** 成对 `**`，内容至少一个字符（含换行），非贪婪就近配对。 */
const BOLD_PATTERN = '\\*\\*([\\s\\S]+?)\\*\\*'

/**
 * 把一段文案切成「普通片段 / 粗体片段」序列。
 *
 * 纯函数、零依赖，因此可以在 node 环境下单测（`richText.test.ts`），
 * 也可以被 `plainText()` 复用到 `title=` 这类只能放字符串的位置。
 */
export function parseRichText(input: string | null | undefined): RichSegment[] {
  if (!input) return []
  // 每次新建正则：模块级 /g 正则带 lastIndex 状态，多处并发调用会互相串台。
  const re = new RegExp(BOLD_PATTERN, 'g')
  const out: RichSegment[] = []
  let last = 0
  for (let m = re.exec(input); m !== null; m = re.exec(input)) {
    if (m.index > last) out.push({ text: input.slice(last, m.index), bold: false })
    out.push({ text: m[1]!, bold: true })
    last = m.index + m[0].length
  }
  if (last < input.length) out.push({ text: input.slice(last), bold: false })
  return out
}

/**
 * 去掉成对 `**` 后的纯文本——给 `title=` / `aria-label=` 这类只接受字符串、
 * 放不下 `<strong>` 的位置用（如顶栏代际按钮的悬浮说明）。
 * 落单的 `**` 与解析规则一致地保留，不做额外清洗。
 */
export function plainText(input: string | null | undefined): string {
  return parseRichText(input)
    .map((s) => s.text)
    .join('')
}
