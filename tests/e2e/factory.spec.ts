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
import { layoutOf } from '../../src/lib/layout'
import { routeConnections } from '../../src/lib/routing'

const GB300 = 'sys.gb300-nvl72'
const VERA_RUBIN = 'sys.vera-rubin-nvl72'
const NVL576 = 'sys.rubin-ultra-nvl576'
const LPX = 'sys.groq3-lpx'

/** 四个代际（v1.3 W3）。扫查类用例按它遍历，新增代际会自动被覆盖到。 */
const ALL_SYSTEMS = [GB300, VERA_RUBIN, NVL576, LPX] as const

/** `PlaneToggles` 的复选框次序 = `PLANE_ORDER`（1 起算，给 `li:nth-child` 用）。 */
const PLANE_ROW = {
  nvlink: 1,
  scaleout: 2,
  business: 3,
  mgmt: 4,
  power: 5,
  cooling: 6,
} as const

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

/**
 * 相机位姿遥测（v1.1 C1）：`useCameraRig` 每次 controls 变化都把
 * `position,target` 六个数写进 canvas 的 `data-camera-pose`。
 *
 * ★ 「相机保持」必须用它断言，**不能用截图差异**：数据流高亮本身就会改像素，
 *   「与默认基线不同」在相机已经被打回默认机位时也能假通过。
 */
async function cameraPose(page: Page): Promise<string | null> {
  return page.locator('canvas').first().getAttribute('data-camera-pose')
}

/** 在画布上真拖一把（触发 camera-controls 的 controlstart）。 */
async function dragOn(page: Page, selector: string, dx: number, dy: number): Promise<void> {
  const box = await page.locator(selector).first().boundingBox()
  if (!box) throw new Error(`${selector} 没有 bounding box`)
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + dx, cy + dy, { steps: 10 })
  await page.mouse.up()
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

  // ── v1.2 F1：出界截断的 DOM 断言（截图断言放最后，失败信息才有诊断价值）──
  // 机架级 25 条线里 7 条两端都在机架外（纯噪音），5 条跨界截断成传送门 stub。
  const stubs = page.locator('[data-stub-label]')
  await expect(stubs).toHaveCount(5)
  await expect(page.locator('[data-stub-label="asm.gb300.converged-switch"]')).toHaveCount(1)
  await expect(stubs).toContainText(['汇聚交换']) // 去向文本可读，不只是个色块
  // 两端都在机架外的线整条消失：外部存储与 spine 都不该再出现在这一屏
  await expect(page.locator('[data-stub-label="asm.gb300.storage"]')).toHaveCount(0)
  await expect(page.locator('[data-stub-label="asm.gb300.scaleout-spine"]')).toHaveCount(0)

  // 标签必须全在画布内，且逐对不相交（后者正是 stackStubLabels 要保证的事：
  // cx8-leaf 与 inrack-oob-uplink 的线端点只差 2.19 cm，不错开就完全叠死）。
  const canvasBox = await page.locator('canvas').first().boundingBox()
  expect(canvasBox).not.toBeNull()
  const stubBoxes: { id: string; box: NonNullable<Awaited<ReturnType<typeof stubs.boundingBox>>> }[] = []
  for (let i = 0; i < 5; i += 1) {
    const el = stubs.nth(i)
    const box = await el.boundingBox()
    expect(box, `第 ${i} 个 stub 标签没有 bounding box`).not.toBeNull()
    stubBoxes.push({ id: (await el.getAttribute('data-stub-label')) ?? `#${i}`, box: box! })
  }
  for (const { id, box } of stubBoxes) {
    expect(box.x, `${id} 越过画布左边界`).toBeGreaterThanOrEqual(canvasBox!.x - 0.5)
    expect(box.y, `${id} 越过画布上边界`).toBeGreaterThanOrEqual(canvasBox!.y - 0.5)
    expect(box.x + box.width, `${id} 越过画布右边界`).toBeLessThanOrEqual(
      canvasBox!.x + canvasBox!.width + 0.5,
    )
    expect(box.y + box.height, `${id} 越过画布下边界`).toBeLessThanOrEqual(
      canvasBox!.y + canvasBox!.height + 0.5,
    )
  }
  for (let i = 0; i < stubBoxes.length; i += 1) {
    for (let j = i + 1; j < stubBoxes.length; j += 1) {
      const a = stubBoxes[i]!
      const b = stubBoxes[j]!
      const overlapW = Math.min(a.box.x + a.box.width, b.box.x + b.box.width) - Math.max(a.box.x, b.box.x)
      const overlapH = Math.min(a.box.y + a.box.height, b.box.y + b.box.height) - Math.max(a.box.y, b.box.y)
      const area = overlapW > 0 && overlapH > 0 ? overlapW * overlapH : 0
      expect(area, `${a.id} 与 ${b.id} 的标签重叠了 ${area.toFixed(0)} px²`).toBe(0)
    }
  }

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

// ─────────────────────────── 3b：NVL576 组件层证据分层 ───────────────────────────

test('桌面·集群视图（Rubin Ultra NVL576）截图——v1.3 组件层证据分层的首张基线', async ({
  page,
}, testInfo) => {
  onlyOn(testInfo, 'desktop')
  // 仓库在 v1.3 之前没有任何 NVL576 的 WebGL 截图基线（PLAN-v1.3.md R2 P1-9）；
  // 这是这一代第一张 3D 基线，同时锁住「官方壳层升 announced（蓝调实体）/
  // 分析师规格件保持 forecast（琥珀线框）」这条组件层证据分层的视觉表现。
  await gotoAndSettle(page, `/?gen=${NVL576}&motion=off`)
  await expect(page.locator('[data-fallback-2d]')).toHaveCount(0)
  // 代际按钮也带 data-generation，用 [data-mode] 精确定位 BreadcrumbBar 的隐藏状态 span。
  await expect(page.locator('[data-generation][data-mode]')).toHaveAttribute('data-generation', NVL576)
  await expect(page).toHaveScreenshot('nvl576-cluster.png')
})

test('桌面·W-A NVL576 第 3 站 CPO vs NPO 讲解站：?tour= 深链 DOM 断言（?gl=off，不重拍截图）', async ({
  page,
}, testInfo) => {
  onlyOn(testInfo, 'desktop')
  // v1.4 W-A：Rubin Ultra 站数从 2 变 3（新增 scene.ru.optics-formfactor）。
  // 本用例只做 DOM 断言，**不重拍** nvl576-cluster.png——那张基线的左栏站数会跟着变，
  // 按批次纪律留给主循环在合并阶段统一重拍（PLAN-v1.4.md「截图基线是二进制」）。
  await gotoAndSettle(page, `/?tour=scene.ru.optics-formfactor&gl=off`, 400)
  await expect(page.locator('main')).toHaveAttribute('data-mode', 'tour')
  await expect(page.locator('[data-generation][data-mode]')).toHaveAttribute('data-generation', NVL576)

  // 左栏：这一站被唯一高亮
  await expect(
    page.locator('[data-tour-scene="scene.ru.optics-formfactor"]'),
  ).toHaveAttribute('data-tour-scene-active', '1')
  await expect(page.locator('[data-tour-scene-active="1"]')).toHaveCount(1)
  // 新增第 3 站后，NVL576 一共 3 站
  await expect(page.locator('[data-tour-scene]')).toHaveCount(3)

  // 讲解文案必须带出 CPO——证据分层练习的核心内容
  await expect(
    page.locator('[data-tour-narration="scene.ru.optics-formfactor"]'),
  ).toContainText('CPO')
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
//
// ⚠️ `/report` 的用例在 v1.3 W3 被**替换**成下面「四系统动态渲染 + 配对段 + LPX 拒绝卡」
//    那一条（同一张 `report-page.png` 基线）：原用例硬编码三个系统 ID 与「产能三态」，
//    第四代加进来后既漏检新内容、命名也不再准确。新用例是它的超集
//    （六节标题 / 产能态 / 截图 / 不加载 three-vendor 四项断言全部保留）。

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

/**
 * ★ 取舍说明（v1.2 F3）：**粒子的方向（reverse / bidirectional）刻意不在这里做像素断言。**
 *
 * 「相向的两颗光点」在 1440×900 里只有几十个像素，要断言方向就得比较相邻两帧里
 * 某颗珠子的位移向量——采样时机、rAF 抖动、抗锯齿都会把它变成常年偶发红的用例，
 * 而它保护的又恰恰是最容易被静态分析发现的那类错误。
 *
 * 替代覆盖在 `flowTimeline.test.ts` 的「粒子方向 / 淡入淡出 / 串珠」一节：那里用
 * **真实 buildTimeline 段**断言 ingress 的 headFrac=0 落在路径末点、prefill 两珠分处
 * 路径两端、以及三颗珠子在 headFrac=0.5 时的前后次序。`FlowLayer` 每帧直接调用
 * `segmentParticlePosition`，所以方向逻辑漏接必然在单测里红，不会只在像素上表现。
 *
 * 下面这条用例只管一件事：粒子到底画不画得出来（视锥剔除回归）。
 */
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

// ═════════════════════ 10~15：v1.1（A 机房级连接 / B 数据流关联 / C 视角） ═════════════════════

test('桌面·A1 集群级开启供电+液冷后画面必须真的变化（机房级干线不再被硬过滤掉）', async ({
  page,
}, testInfo) => {
  onlyOn(testInfo, 'desktop')
  // v1.1 之前 ConnectionLayer 在 cluster 深度硬过滤成「只画 scaleout + nvlink」，
  // 供电/液冷/业务/管理四个平面即使勾上也一条线都不画 —— 坏状态下这个比值恒为 0。
  await gotoAndSettle(page, '/?motion=off&planes=scaleout', 900)
  const canvas = page.locator('canvas').first()
  const scaleoutOnly = (await canvas.screenshot()).toString('base64')

  await page.locator(`section ul li:nth-child(${PLANE_ROW.power}) input`).check()
  await page.locator(`section ul li:nth-child(${PLANE_ROW.cooling}) input`).check()
  await page.waitForTimeout(800)
  const withFacility = (await canvas.screenshot()).toString('base64')

  // 修复后实测约 1.86%（配电→8 机架 + 歧管→CDU→一次侧水，都是长干线）。
  expect(await changedPixelRatio(page, scaleoutOnly, withFacility)).toBeGreaterThan(0.005)
  await expect(page).toHaveScreenshot('gb300-cluster-facility-planes.png')
})

test('桌面·A2+A3 集群级供电平面：配电→机架扇出到全部 8 台（像素 + 结构双断言）', async ({
  page,
}, testInfo) => {
  onlyOn(testInfo, 'desktop')

  // ① 结构：cluster 深度下这条边确实从「机房配电」出发，并扇出 8 条几何路径。
  //    （v1.1 之前 from 端是从不渲染的装配树根，且只连第 0 台机架。）
  const route = routeConnections(GB300, layoutOf(GB300), 'cluster').find(
    (r) => r.connectionId === 'con.gb300.facility-power-shelf',
  )
  expect(route).toBeTruthy()
  expect(route!.fromAssemblyId).toBe('asm.gb300.facility-power')
  expect(route!.toAssemblyId).toBe('asm.gb300.rack')
  expect(route!.instancePaths).toHaveLength(8)

  // ② 像素：集群级只开供电平面时，画面上就只有这 8 条线；关掉它画面变化必须够大。
  //    8 条实测约 0.89%；不扇出（只画第 0 台）时只剩约 1/8 ≈ 0.11%，
  //    因此 0.004 这条线足以把「扇出」与「只连第一台」区分开。
  await gotoAndSettle(page, '/?motion=off&planes=power', 900)
  const canvas = page.locator('canvas').first()
  const on = (await canvas.screenshot()).toString('base64')
  await page.locator(`section ul li:nth-child(${PLANE_ROW.power}) input`).uncheck()
  await page.waitForTimeout(800)
  const off = (await canvas.screenshot()).toString('base64')
  expect(await changedPixelRatio(page, on, off)).toBeGreaterThan(0.004)
})

test('桌面·B2 KV 写入步：chips 出现 HBM 与 B300 GPU，点击后右栏切到部件详情', async ({
  page,
}, testInfo) => {
  onlyOn(testInfo, 'desktop')
  await gotoAndSettle(page, '/?motion=off', 400)

  // ★ 从「产能粗估」tab 出发：只 select 不切 tab 的话用户根本看不到详情，
  //   这正是 B2 要求「chip 点击同时激活部件详情 tab」的原因。
  await page.click('[data-right-tab="capacity"]')
  await expect(page.locator('[data-right-tab="capacity"]')).toHaveAttribute('aria-pressed', 'true')

  const kvIdx = FACTORY_PACK.flows
    .find((f) => f.systemId === GB300)!
    .steps.findIndex((s) => s.id === 'flow.gb300.moe-inference.kv-write')
  expect(kvIdx).toBeGreaterThanOrEqual(0)

  await page.click(`[data-flow-step-button="${kvIdx}"]`)
  const chips = page.locator('[data-flow-chip]')
  await expect(chips).toHaveCount(3) // B300 GPU / HBM3e 显存堆栈 / Grace CPU
  const chipText = (await chips.allTextContents()).join(' | ')
  expect(chipText).toContain('HBM')
  expect(chipText).toContain('B300 GPU')

  // 点 B300 GPU chip → 选中它 + 右栏自动切到部件详情
  await page.click('[data-flow-chip="asm.gb300.b300-gpu"]')
  await expect(page.locator('[data-right-tab="detail"]')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('aside:has([data-right-tab]) h2')).toContainText('B300 GPU')
})

test('桌面·B4 板级 ingress：出界线截断成传送门 stub，没有横穿全屏的长斜线', async ({
  page,
}, testInfo) => {
  onlyOn(testInfo, 'desktop')
  await gotoAndSettle(page, '/?level=board&focus=asm.gb300.compute-tray&motion=off', 900)
  await expect(page.locator('[data-fallback-2d]')).toHaveCount(0)

  // 通往托盘外的连接（NVSwitch / 汇聚交换机 / 母排 / 歧管 …）都应该带上传送门标签；
  // 两端都在托盘外的连接（如 机房配电→电源架）应当整条消失。
  const stubs = page.locator('[data-stub-label]')
  await expect(stubs.first()).toBeVisible()
  expect(await stubs.count()).toBeGreaterThanOrEqual(4)
  await expect(page.locator('[data-stub-label="asm.gb300.nvswitch-asic"]')).toHaveCount(1)
  await expect(page.locator('[data-stub-label="asm.gb300.facility-power"]')).toHaveCount(0)

  // ingress 步（请求经业务网络进入计算托盘）——截图基线
  await page.click('[data-flow-step-button="1"]')
  await page.waitForTimeout(600)
  await expect(page).toHaveScreenshot('gb300-board-ingress.png')

  // 传送门标签可点击：选中远端部件，但**不移动相机**
  const poseBefore = await cameraPose(page)
  await page.click('[data-stub-label="asm.gb300.nvswitch-asic"]')
  await expect(page.locator('aside:has([data-right-tab]) h2')).toContainText('NVSwitch ASIC')
  await page.waitForTimeout(300)
  expect(await cameraPose(page)).toBe(poseBefore)
})

test('桌面·C1 视角保持：拖拽后点数据流步骤 / 调窗口，位姿逐位不变', async ({ page }, testInfo) => {
  onlyOn(testInfo, 'desktop')
  await gotoAndSettle(page, '/?motion=off', 700)

  const initial = await cameraPose(page)
  expect(initial).toBeTruthy()

  await dragOn(page, 'canvas', 140, 60)
  await page.waitForTimeout(500)
  const dragged = await cameraPose(page)
  expect(dragged).not.toBe(initial) // 拖拽确实改了位姿（否则后面的断言毫无意义）

  // ① 点数据流步骤（v1.1 之前：底栏高度跳变 → canvas resize → 相机被打回默认机位）
  await page.click('[data-flow-step-button="3"]')
  await page.waitForTimeout(600)
  expect(await cameraPose(page)).toBe(dragged)

  // ② 直接调窗口
  await page.setViewportSize({ width: 1200, height: 780 })
  await page.waitForTimeout(700)
  expect(await cameraPose(page)).toBe(dragged)

  // ③ 但导航（下钻）仍然必须飞过去——userMoved 不能把程序化机位也吃掉
  await page.click('[data-flow-step-button="0"]')
  await page.locator('aside button', { hasText: '拆开一个机架' }).first().click()
  await page.waitForTimeout(900)
  expect(await cameraPose(page)).not.toBe(dragged)
})

test('桌面·C1 视角保持：只用滚轮缩放过（wheel 不触发 controlstart）→ 调窗口，位姿不变', async ({
  page,
}, testInfo) => {
  onlyOn(testInfo, 'desktop')
  // camera-controls 文档明确：滚轮缩放**不触发** controlstart。只靠 controlstart 判定
  // 「用户动过相机」的话，这条路径会漏 —— 于是「只滚过轮」的用户照样被打回默认机位。
  await gotoAndSettle(page, '/?motion=off', 700)
  const initial = await cameraPose(page)

  const box = await page.locator('canvas').first().boundingBox()
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2)
  await page.mouse.wheel(0, -400)
  await page.waitForTimeout(700)
  const zoomed = await cameraPose(page)
  expect(zoomed).not.toBe(initial)

  await page.setViewportSize({ width: 1180, height: 820 })
  await page.waitForTimeout(700)
  expect(await cameraPose(page)).toBe(zoomed)
})

test('桌面·C1 视角保持：比较模式拖拽后调窗口，位姿不变', async ({ page }, testInfo) => {
  onlyOn(testInfo, 'desktop')
  // CompareCameraRig 此前是同样的坏结构（一个效果、依赖含 width/height、无条件 setLookAt）。
  await gotoAndSettle(page, '/?mode=compare&motion=off', 1200)
  await expect(page.locator('[data-compare-view]')).toHaveCount(1)

  const initial = await cameraPose(page)
  await dragOn(page, '[data-compare-view]', 120, 40)
  await page.waitForTimeout(600)
  const dragged = await cameraPose(page)
  expect(dragged).not.toBe(initial)

  await page.setViewportSize({ width: 1240, height: 840 })
  await page.waitForTimeout(800)
  expect(await cameraPose(page)).toBe(dragged)
})

test('桌面·C2 步骤切换前后画布高度恒定（底栏不再抖）', async ({ page }, testInfo) => {
  onlyOn(testInfo, 'desktop')
  // 底栏高度跳变正是相机被没收的源头：C1 从相机侧堵，C2 从源头消。
  await gotoAndSettle(page, '/?motion=off', 600)
  const canvas = page.locator('canvas').first()
  const heights: number[] = []
  for (const i of [0, 3, 6, 9, 2]) {
    await page.click(`[data-flow-step-button="${i}"]`)
    await page.waitForTimeout(300)
    const box = await canvas.boundingBox()
    heights.push(Math.round(box!.height))
  }
  expect(new Set(heights).size, `画布高度随步骤变化：${heights.join(',')}`).toBe(1)
})

// ═════════════════════════ 22~24：v1.2（F2 每步都有 3D 反馈） ═════════════════════════

test('桌面·F2 kv-write 脉冲：播放中真的在呼吸，暂停后回到基线', async ({ page }, testInfo) => {
  onlyOn(testInfo, 'desktop')
  // ⚠️ 故意不带 motion=off——要的就是真动画（因此必须 headless，见 config 顶部注释）。
  //
  // 差分口径为什么干净：rack 深度 + kv-write 没有 connectionIds ⇒ 没有粒子，
  // ConnectionLayer 的 emphasize 也恒为 false（没有任何一条线被点亮）。
  // 这一屏唯一会动的东西就是 18 个计算托盘的自发光脉冲。
  await page.goto('/?level=rack&focus=asm.gb300.rack')
  await page.waitForSelector('main[data-ready="1"]', { timeout: 20_000 })
  await expect(page.locator('[data-fallback-2d]')).toHaveCount(0)

  const kvIdx = FACTORY_PACK.flows
    .find((f) => f.systemId === GB300)!
    .steps.findIndex((s) => s.id === 'flow.gb300.moe-inference.kv-write')
  await page.click(`[data-flow-step-button="${kvIdx}"]`)
  await page.waitForTimeout(700)
  const canvas = page.locator('canvas').first()
  const t0 = (await canvas.screenshot()).toString('base64')

  // ★ 三点采样而不是「峰 0.35 / 谷 1.05 两点」：截图本身有 100~300 ms 延迟，会把相位
  //   整体推移 δ；两点固定相隔半周期时，差异按 cos(2πδ/PULSE_PERIOD) 衰减，δ≈0.35 s
  //   时正好归零 —— 那是纯粹由采样时机造成的假红。三点跨 3/4 周期取逐对最大值，
  //   无论 δ 多少都至少有一对处在 ≥¼ 周期的相位差上。
  await page.click('footer button:has-text("播放")')
  await page.waitForTimeout(350)
  const t1 = (await canvas.screenshot()).toString('base64')
  await page.waitForTimeout(350)
  const t2 = (await canvas.screenshot()).toString('base64')
  await page.waitForTimeout(350)
  const t3 = (await canvas.screenshot()).toString('base64')

  // kv-write 的 durationHint = 4，上面全部采样都在这一段之内（不会跨段污染差分）
  await expect(page.locator('footer[data-flow-step]')).toHaveAttribute('data-flow-step', String(kvIdx))

  const pulsing = Math.max(
    await changedPixelRatio(page, t1, t2),
    await changedPixelRatio(page, t1, t3),
    await changedPixelRatio(page, t2, t3),
  )
  const vsBase = Math.max(
    await changedPixelRatio(page, t0, t1),
    await changedPixelRatio(page, t0, t2),
    await changedPixelRatio(page, t0, t3),
  )
  // ① 播放中的两帧之间必须有差异 —— 它真的在脉动
  expect(pulsing, `播放中的采样帧之间没有差异（脉冲没生效？）`).toBeGreaterThan(0.001)
  // ② 且与静止基线也不同 —— 否则「把高亮恒定压暗一档」这种坏实现也能骗过 ①
  expect(vsBase, `脉冲与静止基线没有差异（恒定压暗的坏实现？）`).toBeGreaterThan(0.001)

  // ③ 暂停必须复位回 base：frameloop 切回 demand 后 useFrame 可能永远不再执行，
  //    复位若写在 useFrame 的 else 分支里，材质会冻结在暂停那一刻的脉冲值上。
  await page.click('footer button:has-text("暂停")')
  await page.waitForTimeout(500)
  const t4 = (await canvas.screenshot()).toString('base64')
  expect(
    await changedPixelRatio(page, t0, t4),
    '暂停后没有回到静止基线（EmissivePulseDriver 的 effect 复位没生效？）',
  ).toBeLessThan(0.0005)
})

test('桌面·F2 ?motion=off 时 kv-write 不脉冲（静态高亮保留）', async ({ page }, testInfo) => {
  onlyOn(testInfo, 'desktop')
  await gotoAndSettle(page, '/?level=rack&focus=asm.gb300.rack&motion=off', 700)

  const kvIdx = FACTORY_PACK.flows
    .find((f) => f.systemId === GB300)!
    .steps.findIndex((s) => s.id === 'flow.gb300.moe-inference.kv-write')
  await page.click(`[data-flow-step-button="${kvIdx}"]`)
  await page.waitForTimeout(600)
  const canvas = page.locator('canvas').first()
  const t0 = (await canvas.screenshot()).toString('base64')

  await page.click('footer button:has-text("播放")')
  await page.waitForTimeout(1000)
  const t1 = (await canvas.screenshot()).toString('base64')
  // reducedMotion 下 SceneRoot 的 flowPulse 恒为 false：静态高亮照旧，但一动不动。
  expect(
    await changedPixelRatio(page, t0, t1),
    '减少动态效果开启时画面仍在动（flowPulse 没有被 reducedMotion 关掉？）',
  ).toBeLessThan(0.0005)
})

test('桌面·F2 逻辑层徽标三态：播放逻辑步出现 / 物理步消失 / 不挤画布', async ({ page }, testInfo) => {
  onlyOn(testInfo, 'desktop')
  await gotoAndSettle(page, '/', 600)
  const overlay = page.locator('[data-flow-logical-overlay]')
  const canvas = page.locator('canvas').first()

  // ① 默认（未播放）不显示：静止看某一步时不需要这句提示
  await expect(overlay).toHaveCount(0)
  const heightBefore = Math.round((await canvas.boundingBox())!.height)

  // ② 播放第 0 步（网关鉴权，logicalOnly）→ 出现
  await page.click('[data-flow-step-button="0"]')
  await page.click('footer button:has-text("播放")')
  await expect(overlay).toHaveCount(1)
  await expect(overlay).toContainText('逻辑层步骤')
  await expect(overlay).toContainText('不产生机架内流量')

  // ③ 绝对定位，不占布局高度——C2 那条「切步骤画布高度恒定」的约束不能被它破坏
  const heightAfter = Math.round((await canvas.boundingBox())!.height)
  expect(heightAfter, `徽标出现后画布高度变了：${heightBefore} → ${heightAfter}`).toBe(heightBefore)

  // ④ 切到物理层步骤（Prefill）→ 消失
  await page.click('[data-flow-step-button="2"]')
  await expect(overlay).toHaveCount(0)
})

// ═════════════════════ 25~27：v1.3 W2（?tour= 深链 + 场景高亮接线） ═════════════════════

test('桌面·W2 ?tour= 深链：层级/平面/左栏当前站一次到位', async ({ page }, testInfo) => {
  onlyOn(testInfo, 'desktop')
  // 手册环节 2.1 的六张练习卡都是这种链接：一步落到「机架级 + 只开一个平面 + 讲解文案」。
  await gotoAndSettle(page, '/?tour=scene.gb300.learn-plane-nvlink&motion=off', 700)

  // ① 模式/代际/层级：applyScene 强制 tour 模式，场景写的是 rack 级
  await expect(page.locator('main')).toHaveAttribute('data-mode', 'tour')
  const anchor = page.locator('[data-level][data-focus-id]')
  await expect(anchor).toHaveAttribute('data-level', 'rack')
  await expect(anchor).toHaveAttribute('data-generation', GB300)
  await expect(anchor).toHaveAttribute('data-focus-id', 'asm.gb300.rack')

  // ② 平面：只开 nvlink，其余五个都关
  await expect(page.locator(`section ul li:nth-child(${PLANE_ROW.nvlink}) input`)).toBeChecked()
  for (const plane of ['scaleout', 'business', 'mgmt', 'power', 'cooling'] as const) {
    await expect(page.locator(`section ul li:nth-child(${PLANE_ROW[plane]}) input`)).not.toBeChecked()
  }

  // ③ 左栏：对应那一站被高亮，且**只有它**一站
  await expect(
    page.locator('[data-tour-scene="scene.gb300.learn-plane-nvlink"]'),
  ).toHaveAttribute('data-tour-scene-active', '1')
  await expect(page.locator('[data-tour-scene-active="1"]')).toHaveCount(1)
  // 讲解站 3 + 练习站 7 = 10 站（手册「3 个讲解站 + 7 个练习站」的文案锚点）
  await expect(page.locator('[data-tour-scene]')).toHaveCount(10)
})

test('桌面·W2 场景高亮：开/关导览站，3D 画面必须真的变化（highlightAssemblyIds 不再是死数据）', async ({
  page,
}, testInfo) => {
  onlyOn(testInfo, 'desktop')
  // learn-switch-layers 是集群级站，点名 Leaf/Spine/汇聚三个交换层。
  //
  // ★ 差分口径为什么干净：这一站的 focus 就是装配树根（= reset 之后的焦点），层级也同为
  //   cluster，而「回到总览」只改 mode 与 tourStopIdx——**相机与平面开关都不动**。
  //   因此前后两张图的唯一差别就是那三个交换层还亮不亮。
  //   坏状态（highlightAssemblyIds 无人消费）下这个比值恒为 0。
  await gotoAndSettle(page, '/?tour=scene.gb300.learn-switch-layers&motion=off', 900)
  await expect(page.locator('main')).toHaveAttribute('data-mode', 'tour')
  const canvas = page.locator('canvas').first()
  const poseBefore = await cameraPose(page)
  const highlighted = (await canvas.screenshot()).toString('base64')

  await page.locator('aside button', { hasText: '回到总览' }).first().click()
  await page.waitForTimeout(800)
  await expect(page.locator('main')).toHaveAttribute('data-mode', 'explore')
  const plain = (await canvas.screenshot()).toString('base64')

  // 相机没动 —— 否则「画面变了」这件事毫无说服力
  expect(await cameraPose(page)).toBe(poseBefore)
  // 三个交换层盒子在集群总览里不大，实测约 0.07%；坏状态恒为 0.0000%。
  expect(
    await changedPixelRatio(page, highlighted, plain),
    '导览站开/关画面没有差异（场景高亮没接上？）',
  ).toBeGreaterThan(0.0002)
})

test('桌面·W2 ?gl=off 降级路径同样有场景高亮（结构图 DOM 标记）', async ({ page }, testInfo) => {
  onlyOn(testInfo, 'desktop')
  // R2 P1-4：降级路径此前只消费数据流高亮，导览站在结构图上完全没有表现。
  await gotoAndSettle(page, '/?tour=scene.gb300.learn-plane-nvlink&gl=off&motion=off', 300)
  await expect(page.locator('[data-fallback-2d]')).toHaveCount(1)

  // 机架立面只画占 U 位的四类档位：nvlink 站点名的计算托盘与交换托盘应当被标上
  await expect(
    page.locator('[data-rack-elevation-row="asm.gb300.compute-tray"]').first(),
  ).toHaveAttribute('data-scene-active', '1')
  await expect(
    page.locator('[data-rack-elevation-row="asm.gb300.nvswitch-tray"]').first(),
  ).toHaveAttribute('data-scene-active', '1')
  // 没被点名的不能误标
  await expect(
    page.locator('[data-rack-elevation-row="asm.gb300.power-shelf"]').first(),
  ).toHaveAttribute('data-scene-active', '0')
  await expect(page.locator('[data-scene-active="1"]')).toHaveCount(2)

  // 换到供电站：标记必须跟着换（证明它真的跟着当前站走，不是写死的）
  await gotoAndSettle(page, '/?tour=scene.gb300.learn-plane-power&gl=off&motion=off', 300)
  await expect(
    page.locator('[data-rack-elevation-row="asm.gb300.power-shelf"]').first(),
  ).toHaveAttribute('data-scene-active', '1')
  await expect(page.locator('[data-scene-active="1"]')).toHaveCount(1)

  // 集群级站（Leaf/Spine/汇聚）在机架立面上没有对应档位 —— 零标记是正确行为，不是漏标。
  await gotoAndSettle(page, '/?tour=scene.gb300.learn-switch-layers&gl=off&motion=off', 300)
  await expect(page.locator('main')).toHaveAttribute('data-mode', 'tour')
  await expect(page.locator('[data-scene-active="1"]')).toHaveCount(0)
  await expect(page.locator('[data-rack-elevation-row]').first()).toBeVisible()
})

test('桌面·F2 逻辑层徽标：比较模式与 ?gl=off 下都不出现', async ({ page }, testInfo) => {
  onlyOn(testInfo, 'desktop')
  // 比较模式有两个视口，徽标贴谁都不对；降级路径根本没有画布可贴。
  await gotoAndSettle(page, '/?mode=compare', 900)
  await expect(page.locator('[data-compare-view]')).toHaveCount(1)
  await page.click('footer button:has-text("播放")')
  await page.waitForTimeout(400)
  await expect(page.locator('[data-flow-logical-overlay]')).toHaveCount(0)

  await gotoAndSettle(page, '/?gl=off', 400)
  await expect(page.locator('[data-fallback-2d]')).toHaveCount(1)
  await page.click('footer button:has-text("播放")')
  await page.waitForTimeout(400)
  await expect(page.locator('[data-flow-logical-overlay]')).toHaveCount(0)
})

// ═════════════════════ 30~36：v1.3 W3（Groq 3 LPX 第四系统全链路） ═════════════════════

test('桌面·W3 LPX 机架级 3D 基线 + 平面开关按代际改名（C2C scale-up）', async ({ page }, testInfo) => {
  onlyOn(testInfo, 'desktop')
  // 第四代的第一张 WebGL 基线：32 个 1U 托盘、无交换托盘。
  await gotoAndSettle(page, `/?tour=scene.lpx.rack-anatomy&motion=off`, 700)
  await expect(page.locator('[data-fallback-2d]')).toHaveCount(0)
  await expect(page.locator('[data-generation][data-mode]')).toHaveAttribute('data-generation', LPX)
  const anchor = page.locator('[data-level][data-focus-id]')
  await expect(anchor).toHaveAttribute('data-level', 'rack')
  await expect(anchor).toHaveAttribute('data-focus-id', 'asm.lpx.rack')

  // ★ planeLabel：这一代的 `nvlink` 键必须显示成 C2C scale-up——LPX 没有 NVLink。
  const nvlinkRow = page.locator('[data-plane-toggle="nvlink"]')
  await expect(nvlinkRow).toContainText('C2C scale-up')
  await expect(nvlinkRow).not.toContainText('NVLink')
  await expect(page.locator('[data-plane-toggle="scaleout"]')).toContainText('AFD')
  // LPX 只有 2 站（对照 GB300 的 10 站），且当前落在第 1 站
  await expect(page.locator('[data-tour-scene]')).toHaveCount(2)
  await expect(page.locator('[data-tour-scene-active="1"]')).toHaveCount(1)

  await expect(page).toHaveScreenshot('lpx-rack.png')
})

test('桌面·W3 平面显示名只在 LPX 改，其余三代仍是 NVLink（helper 没有误伤）', async ({ page }, testInfo) => {
  onlyOn(testInfo, 'desktop')
  for (const gen of [GB300, VERA_RUBIN, NVL576]) {
    await gotoAndSettle(page, `/?gen=${gen}&motion=off`, 300)
    await expect(page.locator('[data-plane-toggle="nvlink"]'), gen).toContainText('NVLink')
    await expect(page.locator('[data-plane-toggle="nvlink"]'), gen).not.toContainText('C2C scale-up')
  }
  await gotoAndSettle(page, `/?gen=${LPX}&motion=off`, 300)
  await expect(page.locator('[data-plane-toggle="nvlink"]')).toContainText('C2C scale-up')
})

test('桌面·W3 LPX 产能拒绝：paired-only 的 reasonCode 文案 + 空的缺数据列表', async ({ page }, testInfo) => {
  onlyOn(testInfo, 'desktop')
  await gotoAndSettle(page, `/?gen=${LPX}&motion=off`, 400)

  // 顶栏警示条按 capacityPolicy 出文案（BreadcrumbBar.capacityCaveat）
  await expect(page.locator('text=仅提供与配对系统联合工作的产能语境')).toHaveCount(1)

  // 产能卡在右栏的「产能粗估」页签下（默认是「部件详情」）
  await page.click('[data-right-tab="capacity"]')
  await page.waitForTimeout(200)

  // 产能卡：拒绝出数，且理由是「配对」而不是「缺数据」
  const card = page.locator(`[data-capacity-card="${LPX}"]`).first()
  await expect(card).toHaveAttribute('data-capacity-kind', 'refused')
  await expect(card).toContainText('仅提供配对产能语境，不单独出产能数字')
  await expect(card).toContainText('配对')
  // ★ paired-only 是策略性拒绝：missing 恒为空 ⇒ 不得渲染「缺少的官方数据」小节
  await expect(card).not.toContainText('缺少的官方数据')

  // 对照：NVL576 是另一种拒绝（analyst-modeled），文案必须不同
  await gotoAndSettle(page, `/?gen=${NVL576}&motion=off`, 400)
  await page.click('[data-right-tab="capacity"]')
  await page.waitForTimeout(200)
  const ruCard = page.locator(`[data-capacity-card="${NVL576}"]`).first()
  await expect(ruCard).toHaveAttribute('data-capacity-kind', 'refused')
  await expect(ruCard).toContainText('第三方分析师')
  await expect(ruCard).not.toContainText('仅提供配对产能语境')
})

test('桌面·W3 比较模式 VR ↔ LPX：diff 计数 + 配对叙述 + 交换左右两次复原', async ({ page }, testInfo) => {
  onlyOn(testInfo, 'desktop')
  await gotoAndSettle(page, `/?gen=${VERA_RUBIN}&mode=compare&right=${LPX}&motion=off`, 900)

  const panel = page.locator('[data-compare-left]')
  await expect(panel).toHaveAttribute('data-compare-left', VERA_RUBIN)
  await expect(panel).toHaveAttribute('data-compare-right', LPX)

  // ① DOM diff 计数与纯函数逐位核对（不是拍脑袋数字）
  const result = compareSystems(VERA_RUBIN, LPX)
  await expect(page.locator('[data-diff-role]')).toHaveCount(result.rows.length)
  for (const kind of DIFF_KINDS) {
    await expect(page.locator(`[data-diff-kind="${kind}"]`)).toHaveCount(result.counts[kind])
  }

  // ② 内容断言（不只截图）：配对叙述、LPX 独有层、「真的没有」与「未收录 ≠ 没有」的区分
  await expect(panel).toContainText('配对')
  await expect(panel).toContainText('AFD')
  await expect(page.locator('[data-diff-role="lpu-tray"]')).toHaveAttribute('data-diff-kind', 'added')
  await expect(page.locator('[data-diff-role="fabric-expansion"]')).toHaveAttribute('data-diff-kind', 'added')
  await expect(page.locator('[data-diff-role="nvswitch-tray"]')).toHaveAttribute('data-diff-kind', 'removed')
  await expect(page.locator('[data-diff-role="nvswitch-tray"]')).toContainText('真的没有')
  await expect(page.locator('[data-diff-role="scaleout-nic"]')).toContainText('未收录')
  // accelerator 行必须警告「72 → 256 没有可比性」
  await expect(page.locator('[data-diff-role="accelerator"]')).toContainText('没有可比性')

  // ③ 右侧下拉恰好 3 个选项，且不含左侧自己
  const options = page.locator('[data-compare-right-select] option')
  await expect(options).toHaveCount(3)
  expect(await options.evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value))).not.toContain(
    VERA_RUBIN,
  )

  // ④ 交换左右：一次对调、两次复原（旧左必须成为新右）
  await page.click('[data-compare-swap="1"]')
  await page.waitForTimeout(500)
  await expect(page.locator('[data-compare-left]')).toHaveAttribute('data-compare-left', LPX)
  await expect(page.locator('[data-compare-left]')).toHaveAttribute('data-compare-right', VERA_RUBIN)
  await page.click('[data-compare-swap="1"]')
  await page.waitForTimeout(500)
  await expect(page.locator('[data-compare-left]')).toHaveAttribute('data-compare-left', VERA_RUBIN)
  await expect(page.locator('[data-compare-left]')).toHaveAttribute('data-compare-right', LPX)
})

test('/report：四系统动态渲染 + VR↔LPX 配对段 + LPX 拒绝卡（内容断言，不只截图）', async ({
  page,
}, testInfo) => {
  onlyOn(testInfo, 'desktop')
  const requestedUrls: string[] = []
  page.on('request', (req) => requestedUrls.push(req.url()))

  await page.goto('/report')
  await expect(page.locator('h2')).toHaveCount(6)

  // ① 产能卡与系统清单按内容包动态渲染：四个系统一个不少
  await expect(page.locator('[data-report-capacity] [data-capacity-card]')).toHaveCount(
    FACTORY_PACK.systems.length,
  )
  await expect(page.locator('[data-report-system]')).toHaveCount(FACTORY_PACK.systems.length)
  for (const s of FACTORY_PACK.systems) {
    await expect(page.locator(`[data-report-system="${s.id}"]`)).toContainText(s.capacityPolicy)
  }

  // ② 产能四态：两代出数、NVL576 与 LPX 各自因不同理由拒绝
  for (const id of [GB300, VERA_RUBIN]) {
    await expect(page.locator(`[data-capacity-card="${id}"]`)).toHaveAttribute(
      'data-capacity-kind',
      'estimate',
    )
  }
  for (const id of [NVL576, LPX]) {
    await expect(page.locator(`[data-capacity-card="${id}"]`)).toHaveAttribute(
      'data-capacity-kind',
      'refused',
    )
  }

  // ③ 相邻代际比较链：systems.length - 1 段
  await expect(page.locator('[data-report-diffs] > div')).toHaveCount(FACTORY_PACK.systems.length - 1)

  // ④ VR ↔ LPX 配对段（内容断言）
  const pairing = page.locator(`[data-report-pairing="${VERA_RUBIN}|${LPX}"]`)
  await expect(pairing).toHaveCount(1)
  await expect(pairing).toContainText('不是「换代」')
  await expect(pairing).toContainText('attention')
  await expect(pairing).toContainText('FFN/MoE')
  await expect(pairing).toContainText('Dynamo')

  // ⑤ LPX 专属拒绝卡：reasonCode 与「不是缺数据」的说明
  const refusal = page.locator('[data-report-lpx-refusal]')
  await expect(refusal).toHaveAttribute('data-report-lpx-refusal', 'paired-only-policy')
  await expect(refusal).toContainText('paired-only')
  await expect(refusal).toContainText('不是')
  await expect(refusal).toContainText('0 项')

  await page.waitForTimeout(200)
  await expect(page).toHaveScreenshot('report-page.png')

  // 硬规则复核：/report 全程不加载 three-vendor
  expect(requestedUrls.some((u) => u.includes('three-vendor'))).toBe(false)
})

test('桌面·W3 四系统 × ?gl=off 扫查：三页签都出内容 + 全程不加载 three-vendor', async ({
  page,
}, testInfo) => {
  onlyOn(testInfo, 'desktop')
  const requestedUrls: string[] = []
  page.on('request', (req) => requestedUrls.push(req.url()))

  for (const gen of ALL_SYSTEMS) {
    await gotoAndSettle(page, `/?gen=${gen}&gl=off&motion=off`, 300)
    await expect(page.locator('main'), gen).toHaveAttribute('data-gl', 'none')
    await expect(page.locator('[data-fallback-2d]'), gen).toHaveCount(1)
    await expect(page.locator('[data-generation][data-mode]'), gen).toHaveAttribute('data-generation', gen)

    // ① 结构图（默认页签）：机架立面至少一档（四代都有占 U 位的部件）
    await expect(page.locator('[data-rack-elevation-row]').first(), `${gen} 结构图`).toBeVisible()

    // ② 组件树
    await page.click('[data-fallback-2d] [data-tab="tree"]')
    await page.waitForTimeout(120)
    await expect(page.locator('[data-component-tree] button').first(), `${gen} 组件树`).toBeVisible()

    // ③ 连接列表：至少一行，且平面名按代际取（LPX 是 C2C scale-up）
    await page.click('[data-fallback-2d] [data-tab="connections"]')
    await page.waitForTimeout(120)
    const rows = page.locator('[data-connection-row]')
    expect(await rows.count(), `${gen} 连接列表为空`).toBeGreaterThan(0)
    const nvlinkCell = page.locator('[data-connection-row] [data-plane="nvlink"]').first()
    if (gen === LPX) {
      await expect(nvlinkCell).toContainText('C2C scale-up')
    } else {
      await expect(nvlinkCell).toContainText('NVLink')
    }
  }

  // ★ 四代 × 三页签走完，一次 three-vendor 请求都不该有
  expect(
    requestedUrls.filter((u) => u.includes('three-vendor')),
    '?gl=off 路径加载了 three-vendor',
  ).toEqual([])
})

test('移动·W3 四系统切换：根节点/站数跟着换，且窄屏不横向溢出', async ({ page }, testInfo) => {
  onlyOn(testInfo, 'mobile')
  await gotoAndSettle(page, '/?motion=off', 500)
  await expect(page.locator('[data-mobile-view]')).toHaveCount(1)

  for (const gen of ALL_SYSTEMS) {
    await page.selectOption('[data-mobile-gen-select]', gen)
    await page.waitForTimeout(600)

    const view = page.locator('[data-mobile-view]')
    await expect(view, gen).toHaveAttribute('data-generation', gen)

    // ① 根节点跟着换：焦点必须落在该系统自己的装配树里（切代际会重置下钻状态，
    //    随后移动端自动落到第 1 站，因此焦点是该站的 focusAssemblyId 或系统树根）。
    const focusId = await view.getAttribute('data-focus-id')
    const node = FACTORY_PACK.assemblies.find((a) => a.id === focusId)
    expect(node, `${gen} 的焦点 ${focusId} 不存在`).toBeDefined()
    expect(node!.systemId, `${gen} 的焦点残留在上一代的树里`).toBe(gen)

    // ② 站数跟着换（与内容包逐位核对）
    const sceneCount = FACTORY_PACK.scenes.filter((s) => s.systemId === gen).length
    await expect(page.locator('[data-tour-stop]'), gen).toHaveAttribute(
      'data-tour-total',
      String(sceneCount),
    )

    // ③ 窄屏不横向溢出——第四个代际正是最容易把顶栏撑宽的那一下
    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      win: window.innerWidth,
    }))
    expect(overflow.doc, `${gen} 在 390px 下横向溢出（${overflow.doc} > ${overflow.win}）`).toBeLessThanOrEqual(
      overflow.win,
    )
  }
})

test('移动·W3 导览站在 LPX 下同样可推进（第四代没有掉出移动端主流程）', async ({ page }, testInfo) => {
  onlyOn(testInfo, 'mobile')
  await gotoAndSettle(page, `/?gen=${LPX}&motion=off`, 700)
  await expect(page.locator('[data-mobile-view]')).toHaveAttribute('data-generation', LPX)
  await expect(page.locator('[data-tour-stop]')).toHaveAttribute('data-tour-total', '2')
  await expect(page.locator('[data-tour-stop]')).toHaveAttribute('data-tour-stop', '0')

  await page.click('[data-tour-next]')
  await page.waitForTimeout(400)
  await expect(page.locator('[data-tour-stop]')).toHaveAttribute('data-tour-stop', '1')
  // 第 2 站是 AFD 讲解，叙述里必须出现三段流的关键词
  await expect(page.locator('[data-tour-stop]')).toContainText('AFD')
})
