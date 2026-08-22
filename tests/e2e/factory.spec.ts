/**
 * 端到端验收（Playwright，headless 跑，见 `playwright.config.ts` 顶部注释里
 * 「为什么必须 headless」的说明）。
 *
 * 覆盖范围对应 B5 实施计划里点名的 8 类场景：桌面集群/机架/板级三张结构截图、
 * 比较模式（含 showDiffOnly ghost）、`/report`、`?gl=off` 降级、移动导览、
 * 数据流步骤条的 DOM 断言，以及「motion 开启时 useFrame 是否真的推进」这条
 * B3 一直没能实测、B4 交接下来的验证点。
 *
 * 两个 project（`desktop` 1440×900 / `mobile` 390×844）默认会把同一个 `test()`
 * 跑两遍——本文件绝大多数用例只对其中一个 viewport 有意义（例如比较双视口只在
 * 桌面渲染、移动导览只在 `MobileFactoryView` 里存在），因此每条用例开头用
 * `onlyOn(testInfo, 'desktop' | 'mobile')` 显式限定，另一侧跑成 skipped 而不是
 * 用一堆 viewport 判断把每条用例都写复杂。
 *
 * 深链统一走 `?motion=off`（`useShotParams` → `store.reducedMotion=true`）保证
 * 像素稳定；两条数据流用例例外——它们本来就是在验证「有动画时到底动不动」。
 */
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { FACTORY_PACK } from '../../src/data'
import { compareSystems } from '../../src/lib/compare'

const GB300 = 'sys.gb300-nvl72'
const VERA_RUBIN = 'sys.vera-rubin-nvl72'
const NVL576 = 'sys.rubin-ultra-nvl576'

const DIFF_KINDS = ['added', 'removed', 'qty-changed', 'spec-changed', 'unchanged'] as const

function onlyOn(testInfo: TestInfo, project: 'desktop' | 'mobile') {
  test.skip(testInfo.project.name !== project, `仅在 ${project} project 下有意义`)
}

/**
 * 两张截图的「明显不同像素」占比。
 *
 * ★ 为什么要自己算而不是只靠 `toHaveScreenshot` 基线：ghost 那个 bug 的表现是
 *   **截图基线照样绿**（基线记录的就是「没生效」的画面），只有拿开关前后两张图对比
 *   才能证明「切换真的改变了画面」。解码放在浏览器里做（`drawImage` + `getImageData`），
 *   这样不必为测试引入 pngjs/pixelmatch 这类图像依赖。
 */
async function changedPixelRatio(page: Page, base64A: string, base64B: string): Promise<number> {
  return page.evaluate(
    async ([base64A, base64B]) => {
      const load = (b64: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image()
          img.onload = () => resolve(img)
          img.onerror = reject
          img.src = `data:image/png;base64,${b64}`
        })
      const [imgA, imgB] = await Promise.all([load(base64A), load(base64B)])
      const canvas = document.createElement('canvas')
      canvas.width = Math.min(imgA.width, imgB.width)
      canvas.height = Math.min(imgA.height, imgB.height)
      const ctx = canvas.getContext('2d')
      if (!ctx) return 0
      ctx.drawImage(imgA, 0, 0)
      const da = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(imgB, 0, 0)
      const db = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      let changed = 0
      for (let i = 0; i < da.length; i += 4) {
        const delta =
          Math.abs(da[i]! - db[i]!) + Math.abs(da[i + 1]! - db[i + 1]!) + Math.abs(da[i + 2]! - db[i + 2]!)
        if (delta > 12) changed += 1
      }
      return changed / (da.length / 4)
    },
    [base64A, base64B] as const,
  )
}

/** 深链种子播种是一次性的（`useShotParams`），因此每条用例都从一次干净的 `goto` 开始。 */
async function gotoAndSettle(page: Page, path: string, settleMs = 500): Promise<void> {
  await page.goto(path)
  await page.waitForSelector('main[data-ready="1"]', { timeout: 20_000 })
  // 首帧回调（`onCreated`）说明 WebGL 上下文已建好，但真正的像素落地还要再等
  // 至少一次 rAF；`ComparisonView` 的 `showDiffOnly` 切换更是要等 ghost 材质的
  // FramePump 补帧窗口过完（见下面比较模式用例里单独加长的等待）。这里给个
  // 统一的保守 settle，避免每条截图用例各自摸索时间常数。
  await page.waitForTimeout(settleMs)
}

// ─────────────────────────── 1~3：桌面结构截图 ───────────────────────────

test('桌面·集群视图（GB300）截图——顺带确认没有多余 NVLink 线', async ({ page }, testInfo) => {
  onlyOn(testInfo, 'desktop')
  await gotoAndSettle(page, '/?motion=off')
  // 走的是真 3D 路径而不是降级视图，截图才有意义。
  await expect(page.locator('[data-fallback-2d]')).toHaveCount(0)
  // 问题③的确定性回归覆盖见 `src/lib/routing.test.ts`
  //（GB300 cluster 深度下 0 条非退化 nvlink 路由）；这张截图是它的视觉基线。
  await expect(page).toHaveScreenshot('gb300-cluster.png')
})

test('桌面·机架级 + 全平面开启 截图', async ({ page }, testInfo) => {
  onlyOn(testInfo, 'desktop')
  await gotoAndSettle(
    page,
    '/?level=rack&focus=asm.gb300.rack&planes=nvlink,scaleout,business,mgmt,power,cooling&motion=off',
  )
  await expect(page.locator('[data-fallback-2d]')).toHaveCount(0)
  await expect(page.locator('main')).toHaveAttribute('data-mode', 'explore')
  await expect(page).toHaveScreenshot('gb300-rack-allplanes.png')
})

test('桌面·机架级 nvlink 平面必须真的画得出线（导览第 2 站的前提）', async ({ page }, testInfo) => {
  onlyOn(testInfo, 'desktop')
  // GB300 的 nvlink 边全是**机架内**的 scale-up。这些折线一度整段埋在不透明托盘里，
  // 表现为「机架级勾掉 NVLink 画面纹丝不动」，而导览第 2 站（planes=nvlink,power）
  // 点名要看的就是这一层——那一屏当时等于空的。修复见 ConnectionLayer 的 depthTest 注释。
  await gotoAndSettle(page, '/?motion=off&level=rack&focus=asm.gb300.rack&planes=nvlink', 900)
  const canvas = page.locator('canvas')
  const withNvlink = (await canvas.screenshot()).toString('base64')
  await page.locator('section ul li:nth-child(1) input').uncheck()
  await page.waitForTimeout(600)
  const withoutNvlink = (await canvas.screenshot()).toString('base64')
  // 坏状态恒为 0.000%；修复后实测约 0.06%（细线，占屏比例本就小）。
  expect(await changedPixelRatio(page, withNvlink, withoutNvlink)).toBeGreaterThan(0.0002)
})

test('桌面·板级 explode 截图（计算托盘拆解）', async ({ page }, testInfo) => {
  onlyOn(testInfo, 'desktop')
  await gotoAndSettle(page, '/?level=board&focus=asm.gb300.compute-tray&motion=off')
  await expect(page.locator('[data-fallback-2d]')).toHaveCount(0)
  await expect(page).toHaveScreenshot('gb300-tray-explode.png')
})

// ─────────────────────────── 4：比较模式 ───────────────────────────

test('桌面·比较模式（GB300 vs Vera Rubin）：截图 + diff 计数 + showDiffOnly ghost', async ({
  page,
}, testInfo) => {
  onlyOn(testInfo, 'desktop')
  await gotoAndSettle(page, '/?mode=compare&motion=off', 700)
  await expect(page.locator('main')).toHaveAttribute('data-mode', 'compare')
  await expect(page.locator('[data-compare-view]')).toHaveCount(1)
  await expect(page).toHaveScreenshot('compare-gb300-vera.png')

  // DOM 断言 diff 计数：与 `lib/compare.ts` 的纯函数结果逐位核对，不是拍脑袋数字。
  const result = compareSystems(GB300, VERA_RUBIN)
  await expect(page.locator('[data-diff-role]')).toHaveCount(result.rows.length)
  for (const kind of DIFF_KINDS) {
    await expect(page.locator(`[data-diff-kind="${kind}"]`)).toHaveCount(result.counts[kind])
  }

  // 问题②：showDiffOnly 开启后 3D 里未变化的部件应降为 ghost（12% 不透明度）。
  // ⚠️ 只截图是**不够的**：这个功能曾经整整一批处于「材质对、画面不动」的状态，
  //    而截图基线照样绿（基线记录的就是坏画面）。因此这里同时做「开关前后画面必须
  //    明显不同」的像素断言——它才是 ghost 的真正回归锁。
  //    根因见 GenericShapes.tsx 的 `useTransparencyProgramSync`（运行期翻转
  //    material.transparent 必须 needsUpdate，否则 `#define OPAQUE` 把 alpha 写回 1）。
  const viewport = page.locator('[data-compare-view]')
  const solidShot = (await viewport.screenshot()).toString('base64')
  await page.click('[data-diff-only-toggle="1"]')
  // ComparisonView 的 FramePump 补帧窗口是 900ms，这里多留一点余量再截图。
  await page.waitForTimeout(1300)
  const ghostShot = (await viewport.screenshot()).toString('base64')
  // 未变化的部件（facility / CDU / 外部存储 / 水路 / 母排 …）占了相当一片像素；
  // ghost 真的生效时这一片会整体变淡。1% 是「远高于坏状态（0.4%，只有描边消失）、
  // 又远低于实测值（约 4%）」的分界线。
  expect(await changedPixelRatio(page, solidShot, ghostShot)).toBeGreaterThan(0.01)
  await expect(page).toHaveScreenshot('compare-gb300-vera-diffonly.png')
})

// ─────────────────────────── 5：/report ───────────────────────────

test('/report：六节标题 + 产能三态徽章 + 截图 + 不加载 three-vendor', async ({ page }, testInfo) => {
  onlyOn(testInfo, 'desktop')
  const requestedUrls: string[] = []
  page.on('request', (req) => requestedUrls.push(req.url()))

  await page.goto('/report')
  await expect(page.locator('h2')).toHaveCount(6)

  // 产能卡三态：GB300/Vera Rubin 能出数（估算区间），NVL576（forecast 系统）恒拒绝出数。
  await expect(page.locator(`[data-capacity-card="${GB300}"]`)).toHaveAttribute(
    'data-capacity-kind',
    'estimate',
  )
  await expect(page.locator(`[data-capacity-card="${VERA_RUBIN}"]`)).toHaveAttribute(
    'data-capacity-kind',
    'estimate',
  )
  await expect(page.locator(`[data-capacity-card="${NVL576}"]`)).toHaveAttribute(
    'data-capacity-kind',
    'refused',
  )

  await page.waitForTimeout(200)
  await expect(page).toHaveScreenshot('report-page.png')

  // 硬规则复核（ReportPage.tsx 顶部注释要求的「构建后 grep 复核」，这里换成运行期网络断言）：
  // `/report` 全程不应该有任何请求打到 three-vendor chunk。
  expect(requestedUrls.some((u) => u.includes('three-vendor'))).toBe(false)
})

test('未知路由：给 404 页而不是白屏，且不加载 three-vendor', async ({ page }, testInfo) => {
  onlyOn(testInfo, 'desktop')
  const requestedUrls: string[] = []
  page.on('request', (req) => requestedUrls.push(req.url()))

  // SPA 托管会把未知路径回落到 index.html，没有兜底路由时 `<Routes>` 一个都不匹配 → 纯白屏。
  await page.goto('/no-such-page')
  await expect(page.locator('[data-not-found]')).toHaveCount(1)
  await expect(page.locator('h1')).toContainText('这个地址不存在')
  // 404 页只用 DOM：无 WebGL 环境同样能打开。（断言必须在点回工作台之前——
  // 工作台本来就会去拉 three-vendor。）
  expect(requestedUrls.some((u) => u.includes('three-vendor'))).toBe(false)

  await page.click('[data-not-found] a[href="/"]')
  await expect(page.locator('main[data-mode]')).toHaveCount(1)
})

// ─────────────────────────── 6：?gl=off 完整降级 ───────────────────────────

test('桌面·?gl=off 降级：三 tab 截图 + 组件树点击联动详情 + 不加载 three-vendor', async ({
  page,
}, testInfo) => {
  onlyOn(testInfo, 'desktop')
  const requestedUrls: string[] = []
  page.on('request', (req) => requestedUrls.push(req.url()))

  await gotoAndSettle(page, '/?gl=off&motion=off', 300)
  await expect(page.locator('main')).toHaveAttribute('data-gl', 'none')
  await expect(page.locator('[data-fallback-2d]')).toHaveCount(1)

  // 结构图 tab（默认）
  await expect(page).toHaveScreenshot('fallback-structure.png')

  // 组件树 tab
  await page.click('[data-fallback-2d] [data-tab="tree"]')
  await page.waitForTimeout(150)
  await expect(page).toHaveScreenshot('fallback-tree.png')

  // 交互：点组件树第一个节点（装配树根）→ 右栏详情联动更新。
  const firstNodeBtn = page.locator('[data-component-tree] button').first()
  const label = (await firstNodeBtn.textContent())?.trim()
  expect(label && label.length > 0).toBe(true)
  await firstNodeBtn.click()
  await expect(page.locator('[data-right-tab="detail"]')).toHaveAttribute('aria-pressed', 'true')
  // 右栏（详情面板所在的那个 aside）里的 h2——左栏 TourPanel/PlaneToggles 也用 <aside><h2>，
  // 必须用 :has([data-right-tab]) 精确定位到右栏，否则 strict mode 会因为 3 个 h2 都命中而报错。
  await expect(page.locator('aside:has([data-right-tab]) h2')).toContainText(label!)

  // 连接列表 tab
  await page.click('[data-fallback-2d] [data-tab="connections"]')
  await page.waitForTimeout(150)
  await expect(page).toHaveScreenshot('fallback-connections.png')

  expect(requestedUrls.some((u) => u.includes('three-vendor'))).toBe(false)
})

// ─────────────────────────── 7：移动导览 ───────────────────────────

test('移动·390×844：导览第 1 站截图 + 下一站按钮推进', async ({ page }, testInfo) => {
  onlyOn(testInfo, 'mobile')
  await gotoAndSettle(page, '/?motion=off', 500)
  await expect(page.locator('[data-mobile-view]')).toHaveCount(1)
  await expect(page.locator('[data-tour-stop]')).toHaveAttribute('data-tour-stop', '0')
  await expect(page).toHaveScreenshot('mobile-tour-stop1.png')

  await page.click('[data-tour-next]')
  await expect(page.locator('[data-tour-stop]')).toHaveAttribute('data-tour-stop', '1')
})

test('移动·比较模式：没有 Canvas 也必须置 data-ready（否则深链/E2E 白等）', async ({ page }, testInfo) => {
  onlyOn(testInfo, 'mobile')
  // 窄屏 + compare 是唯一一条「不降级、却也不挂 Canvas」的路径（见 MobileFactoryView）：
  // 没有 onCreated 就没人置 ready，data-ready 会永远停在 0。界面本身是好的，
  // 所以只有断言这个锚点才抓得到。
  await gotoAndSettle(page, '/?mode=compare&motion=off', 400)
  await expect(page.locator('main')).toHaveAttribute('data-mode', 'compare')
  await expect(page.locator('[data-capacity-card]')).toHaveCount(2)
  await expect(page.locator('[data-diff-role]').first()).toBeVisible()
})

// ─────────────────────────── 8：数据流步骤条 DOM 断言 ───────────────────────────

test('桌面·数据流步骤条：10 步走完 + 逻辑/物理徽章按内容包切换', async ({ page }, testInfo) => {
  onlyOn(testInfo, 'desktop')
  await gotoAndSettle(page, '/?motion=off')

  const episode = FACTORY_PACK.flows.find((f) => f.systemId === GB300)
  expect(episode).toBeTruthy()
  const steps = episode!.steps
  expect(steps.length).toBe(10)

  for (let i = 0; i < steps.length; i += 1) {
    await page.click(`[data-flow-step-button="${i}"]`)
    await expect(page.locator('footer[data-flow-step]')).toHaveAttribute('data-flow-step', String(i))
    const expectedLogical = steps[i]!.logicalOnly ? '1' : '0'
    await expect(page.locator('footer [data-flow-logical]')).toHaveAttribute(
      'data-flow-logical',
      expectedLogical,
    )
  }
})

// ─────────────────────────── 9：motion 开启——useFrame 自动推进 ───────────────────────────

test('桌面·数据流自动播放：motion 开启时 useFrame 真的推进 stepIdx（B3 遗留验证点）', async ({
  page,
}, testInfo) => {
  onlyOn(testInfo, 'desktop')
  // ⚠️ 这条用例故意不带 `motion=off`——就是要验证真实动画时序，
  //   因此必须 headless 跑（见 playwright.config.ts 顶部注释）：
  //   非 headless 的未聚焦标签页会被浏览器节流 rAF，播放会卡在原地，
  //   之前 B3/B4 一直没能在浏览器里实测到这一步就是因为踩了这个坑。
  await page.goto('/')
  await page.waitForSelector('main[data-ready="1"]', { timeout: 20_000 })
  await expect(page.locator('[data-fallback-2d]')).toHaveCount(0)

  await expect(page.locator('footer[data-flow-step]')).toHaveAttribute('data-flow-step', '0')
  await page.click('footer button:has-text("播放")')
  await expect(page.locator('footer[data-flow-playing]')).toHaveAttribute('data-flow-playing', '1')

  // 第 0 步（gateway）的 durationHint 是 3（教学节奏，按“基准秒数”使用，speed=1 时
  // 约等于 3 个真实秒），等 4 秒足够确定性地跨过这个边界。
  await page.waitForTimeout(4000)
  await expect(page.locator('footer[data-flow-step]')).not.toHaveAttribute('data-flow-step', '0')
})

test('桌面·数据流粒子必须真的画得出来（InstancedMesh 视锥剔除回归）', async ({ page }, testInfo) => {
  onlyOn(testInfo, 'desktop')
  // ⚠️ 同样必须 headless（真实动画时序）。
  // 这条盯的是一个「stepIdx 在推进、画面却纹丝不动」的坑：three 的
  // `InstancedMesh.boundingSphere` 一旦从 instanceMatrix 算出来就永久缓存，而粒子在
  // 未播放时停在 (0,-9999,0)——包围球被钉死在视锥外，之后粒子永远被剔除。
  // 只断言 stepIdx 推进（上一条用例）是抓不到的，必须断言像素。
  await page.goto('/?level=board&focus=asm.gb300.compute-tray')
  await page.waitForSelector('main[data-ready="1"]', { timeout: 20_000 })
  await page.waitForTimeout(1200)
  // 第 3 步（Prefill）引用 con.gb300.gpu-nvswitch，durationHint = 8，
  // 因此下面 1.5 秒的采样窗口内不会跨段——画面的变化只可能来自粒子在动。
  await page.click('[data-flow-step-button="2"]')
  await page.waitForTimeout(400)
  const canvas = page.locator('canvas')
  const t0 = (await canvas.screenshot()).toString('base64')
  await page.click('footer button:has-text("播放")')
  await page.waitForTimeout(1500)
  const t1 = (await canvas.screenshot()).toString('base64')
  await expect(page.locator('footer[data-flow-step]')).toHaveAttribute('data-flow-step', '2')
  // 坏状态恒为 0.0000%；修复后实测约 0.04%（粒子本来就只有几十个像素）。
  expect(await changedPixelRatio(page, t0, t1)).toBeGreaterThan(0.0001)
})
