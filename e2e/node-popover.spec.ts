import { expect, test, type Page } from '@playwright/test'
import { dragSidebarTileToCanvas } from './helpers/drag-drop'

type NodeType = 'OBSERVATION' | 'MECHANISM' | 'VALIDATION'

const evidencePath = (name: string) => `/Users/harveyguo/StemFlow/.sisyphus/evidence/${name}`
const CLOSE_LABEL = /(Close|common\.close)/i
const AI_ACTIONS_LABEL = /AI Actions|nodes\.card\.aiActions/i
const SUMMARIZE_LABEL = /Summarize|popover\.actions\.summarize/i
const SUGGEST_MECHANISM_LABEL = /Suggest Mechanism|popover\.actions\.suggestMechanism/i
const SUGGEST_VALIDATION_LABEL = /Suggest Validation|popover\.actions\.suggestValidation/i

const aiButtonLocator = 'button[aria-label="AI Actions"], button[aria-label="nodes.card.aiActions"]'
const getNodeByType = (page: Page, nodeType: NodeType) =>
  page.locator(`div.react-flow__node.react-flow__node-${nodeType}`).first()

const closeInspectorOverlay = async (page: Page) => {
  const inspector = page.getByTestId('inspector-panel')
  const backdropSelector = 'div.fixed.inset-0.z-50'
  const backdrop = page.locator(backdropSelector)

  await inspector.waitFor({ state: 'visible', timeout: 1000 }).catch(() => {})
  if (!(await inspector.isVisible().catch(() => false))) {
    await backdrop.waitFor({ state: 'detached', timeout: 500 }).catch(() => {})
    return
  }

  const closeButton = inspector.getByRole('button', { name: CLOSE_LABEL })
  if (!(await closeButton.isVisible().catch(() => false))) {
    throw new Error('Inspector close button not visible while panel is open')
  }
  await closeButton.click()

  await expect(inspector).toBeHidden()
  await inspector.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {})
  await backdrop.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {})
}

test.describe('NodePopover AI actions', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const encode = (value: string) => `plain:${btoa(value)}`

      window.localStorage.setItem('stemflow:provider', 'openai')
      window.localStorage.setItem('stemflow:apikey:openai', encode('sk-test-openai'))
    })

    await page.route('**/api/ai/openai', async (route) => {
      const body =
        'data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n' +
        'data: {"choices":[{"delta":{"content":"world"}}]}\n\n' +
        'data: [DONE]\n\n'

      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
        body,
      })
    })

    await page.goto('/', { waitUntil: 'networkidle' })
  })

  test('AI action creates new connected node', async ({ page }) => {
    await dragSidebarTileToCanvas(page, 'sidebar-observation', { x: 200, y: 200 })
    const node = getNodeByType(page, 'OBSERVATION')
    await node.waitFor({ state: 'visible' })
    await node.click({ position: { x: 10, y: 10 } })
    await closeInspectorOverlay(page)
    await expect(node.getByRole('button', { name: AI_ACTIONS_LABEL })).toBeVisible()
    const aiButton = node.locator(aiButtonLocator)
    await aiButton.click({ force: true })
    await expect(page.getByTestId('node-popover')).toBeVisible()

    await page.getByRole('button', { name: SUMMARIZE_LABEL }).click()
    // Playwright route.fulfill returns the full SSE body immediately, so the loading cursor
    // may appear and disappear too quickly to assert reliably. Instead, wait for output.
    await expect(page.getByTestId('streaming-text-container')).toContainText('Hello world')

    await page.getByRole('button', { name: /Apply|common\.apply/i }).click()
    await expect(page.locator('div.react-flow__node')).toHaveCount(2)

    await page.screenshot({ path: evidencePath('task-13-ai-node-created.png') })
  })

  test('Suggest Mechanism only shows for Observation', async ({ page }) => {
    await dragSidebarTileToCanvas(page, 'sidebar-observation', { x: 200, y: 200 })
    await dragSidebarTileToCanvas(page, 'sidebar-mechanism', { x: 820, y: 200 })

    let obs = getNodeByType(page, 'OBSERVATION')
    await obs.waitFor({ state: 'visible' })
    await obs.click({ position: { x: 10, y: 10 } })
    await closeInspectorOverlay(page)
    obs = getNodeByType(page, 'OBSERVATION')
    await expect(obs.getByRole('button', { name: AI_ACTIONS_LABEL })).toBeVisible()
    const obsAiButton = obs.locator(aiButtonLocator)
    await obsAiButton.click({ force: true })
    await expect(page.getByRole('button', { name: SUGGEST_MECHANISM_LABEL })).toBeVisible()
    await page.getByRole('button', { name: CLOSE_LABEL }).click()

    const mech = getNodeByType(page, 'MECHANISM')
    await mech.click({ position: { x: 10, y: 10 } })
    await closeInspectorOverlay(page)
    await expect(mech.getByRole('button', { name: AI_ACTIONS_LABEL })).toBeVisible()
    await mech.getByRole('button', { name: AI_ACTIONS_LABEL }).click({ force: true })
    await expect(page.getByRole('button', { name: SUGGEST_MECHANISM_LABEL })).toHaveCount(0)
    await expect(page.getByRole('button', { name: SUGGEST_VALIDATION_LABEL })).toBeVisible()

    await page.screenshot({ path: evidencePath('task-13-suggest-visible-only-obs.png') })
  })

  test('Connection highlighting shows O→M suggestion', async ({ page }) => {
    await dragSidebarTileToCanvas(page, 'sidebar-observation', { x: 200, y: 200 })
    await dragSidebarTileToCanvas(page, 'sidebar-mechanism', { x: 760, y: 200 })
    await dragSidebarTileToCanvas(page, 'sidebar-validation', { x: 760, y: 420 })

    const obs = getNodeByType(page, 'OBSERVATION')
    await obs.click({ position: { x: 10, y: 10 } })
    await closeInspectorOverlay(page)

    const sourceHandle = obs
      .locator('[data-handlepos="right"][data-handleid*="s-middle"]')
      .first()
    const mech = getNodeByType(page, 'MECHANISM')
    const targetHandle = mech.locator('[data-handlepos="left"][data-handleid*="t-middle"]').first()

    await sourceHandle.waitFor({ state: 'visible' })
    await targetHandle.waitFor({ state: 'visible' })

    const handleBox = await sourceHandle.boundingBox()
    const targetBox = await targetHandle.boundingBox()
    if (!handleBox) throw new Error('Source handle bounding box missing')
    if (!targetBox) throw new Error('Target handle bounding box missing')

    const handleCenter = {
      x: handleBox.x + handleBox.width / 2,
      y: handleBox.y + handleBox.height / 2,
    }
    const targetCenter = {
      x: targetBox.x + targetBox.width / 2,
      y: targetBox.y + targetBox.height / 2,
    }

    await page.mouse.move(handleCenter.x, handleCenter.y)
    await page.mouse.down()
    await page.mouse.move(targetCenter.x - 24, targetCenter.y)

    const val = getNodeByType(page, 'VALIDATION')

    await expect.poll(async () => (await mech.getAttribute('class')) ?? '').toContain('ring-indigo-400')
    await expect.poll(async () => (await val.getAttribute('class')) ?? '').not.toContain('ring-indigo-400')

    await page.mouse.up()
    await page.screenshot({ path: evidencePath('task-13-connection-highlighting.png') })
  })
})
