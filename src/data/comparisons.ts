import type { ComparisonDefinition } from './types'

/**
 * 代际比较定义。
 *
 * 批次 1 仅建立文件与导出结构，内容留到批次 4（代际 + 比较 + 产能 + 报告）填充：
 * 届时会有 GB300 ↔ Vera Rubin、Vera Rubin ↔ Rubin Ultra 两组定义。
 *
 * ⚠️ 提醒后续批次：配对只用 AssemblyNode.roleKey，永不解析 ID 字符串；
 * 每个 roleKey 在两侧至多配成一对（pack.test.ts 会强制这条确定性）。
 */
export const COMPARISONS: ComparisonDefinition[] = []
