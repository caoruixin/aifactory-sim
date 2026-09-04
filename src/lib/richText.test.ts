import { describe, expect, it } from 'vitest'
import { FACTORY_PACK } from '../data'
import { parseRichText, plainText } from './richText'

/** 片段序列压成 `文本|**粗体**` 的可读串，方便逐条比对。 */
function shape(input: string | null | undefined): string {
  return parseRichText(input)
    .map((s) => (s.bold ? `**${s.text}**` : s.text))
    .join('|')
}

describe('parseRichText：只认成对 `**`', () => {
  it('普通文本：整段一个非粗体片段，原样返回', () => {
    const t = '一个普通的风冷机架，没有任何标记。'
    expect(parseRichText(t)).toEqual([{ text: t, bold: false }])
    expect(plainText(t)).toBe(t)
  })

  it('单个粗体：前中后三段，中间那段 bold', () => {
    expect(parseRichText('把平面切到 **NVLink**——')).toEqual([
      { text: '把平面切到 ', bold: false },
      { text: 'NVLink', bold: true },
      { text: '——', bold: false },
    ])
  })

  it('多个粗体：交替切分，不吞掉粗体之间的文字', () => {
    expect(shape('**没有铜背板**、**没有直流母排**，其余照旧')).toBe(
      '**没有铜背板**|、|**没有直流母排**|，其余照旧',
    )
  })

  it('粗体在开头 / 结尾时不产生空片段', () => {
    expect(parseRichText('**开头**')).toEqual([{ text: '开头', bold: true }])
    expect(shape('**开头**尾巴')).toBe('**开头**|尾巴')
    expect(shape('前缀**结尾**')).toBe('前缀|**结尾**')
  })

  it('★ 未闭合的 `**` 原样显示，绝不把后半段整体吞成粗体', () => {
    expect(parseRichText('这里漏了一半 **粗体')).toEqual([
      { text: '这里漏了一半 **粗体', bold: false },
    ])
    // 三个标记：前两个配对，落单的第三个按字面留下
    expect(shape('**配对**后面又来一个 **')).toBe('**配对**|后面又来一个 **')
    expect(plainText('这里漏了一半 **粗体')).toBe('这里漏了一半 **粗体')
  })

  it('★ 空粗体 `****` 不产出空的 <strong>，按字面处理', () => {
    expect(parseRichText('空标记 **** 在这')).toEqual([{ text: '空标记 **** 在这', bold: false }])
  })

  it('空串 / null / undefined → 空片段序列（调用方不必先判空）', () => {
    expect(parseRichText('')).toEqual([])
    expect(parseRichText(null)).toEqual([])
    expect(parseRichText(undefined)).toEqual([])
    expect(plainText(null)).toBe('')
  })

  it('★ 含单个 `*` 但不是粗体：乘号、脚注星、通配符一律按字面', () => {
    for (const t of ['2 * 3 = 6', '每卡 1.8 TB/s *（见脚注）', 'a*b*c', '18 托盘 × 4 GPU *']) {
      expect(parseRichText(t), t).toEqual([{ text: t, bold: false }])
      expect(plainText(t), t).toBe(t)
    }
  })

  it('跨换行的粗体也能配对（内容包里有折行的长句）', () => {
    expect(shape('前\n**跨\n行**\n后')).toBe('前\n|**跨\n行**|\n后')
  })

  it('plainText 与 parseRichText 一致：拼回去只少掉成对的标记', () => {
    const t = '⚠️「新增 / 未收录」只描述**本内容包收录了什么**，不代表产品上有没有这个部件'
    expect(plainText(t)).toBe('⚠️「新增 / 未收录」只描述本内容包收录了什么，不代表产品上有没有这个部件')
    expect(plainText(t)).not.toContain('**')
  })
})

describe('内容包实测：解析器覆盖真实文案', () => {
  /** 遍历内容包所有字符串，收集含 `**` 的那些。 */
  function allStrings(): string[] {
    const out: string[] = []
    const walk = (v: unknown): void => {
      if (typeof v === 'string') {
        if (v.includes('**')) out.push(v)
        return
      }
      if (Array.isArray(v)) {
        for (const x of v) walk(x)
        return
      }
      if (v && typeof v === 'object') {
        for (const x of Object.values(v as Record<string, unknown>)) walk(x)
      }
    }
    walk(FACTORY_PACK)
    return out
  }

  it('★ 内容包里每一处 `**` 都是成对的——解析后不再残留字面标记', () => {
    const hits = allStrings()
    // 现状 169 处；这条锁的是「一个都不能漏」，不是具体条数。
    expect(hits.length).toBeGreaterThan(100)
    const leftovers = hits.filter((t) => plainText(t).includes('**'))
    expect(leftovers, `这些文案的 ** 没有闭合：\n${leftovers.join('\n')}`).toEqual([])
  })

  it('★ 解析是无损的：把片段按规则拼回去 === 原文', () => {
    for (const t of allStrings()) {
      const back = parseRichText(t)
        .map((s) => (s.bold ? `**${s.text}**` : s.text))
        .join('')
      expect(back).toBe(t)
    }
  })
})
