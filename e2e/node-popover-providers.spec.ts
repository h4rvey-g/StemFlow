import { expect, test, type Page } from '@playwright/test'
import { dragSidebarTileToCanvas } from './helpers/drag-drop'

const evidencePath = (name: string) => `/Users/harveyguo/StemFlow/.sisyphus/evidence/${name}`
const OBSERVATION_LABEL = /Observation|nodes\.observation\.title/i
const CLOSE_LABEL = /(Close|common\.close)/i
const AI_ACTIONS_LABEL = /AI Actions|nodes\.card\.aiActions/i
const SUMMARIZE_LABEL = /Summarize|popover\.actions\.summarize/i
const APPLY_LABEL = /Apply|common\.apply/i

const getNodeByLabel = (page: Page, label: RegExp) =>
  page.locator('div.react-flow__node').filter({ hasText: label }).first()

const closeInspectorOverlay = async (page: Page) => {
  const inspector = page.getByTestId('inspector-panel')
  if (!(await inspector.isVisible().catch(() => false))) return

  await inspector.getByRole('button', { name: CLOSE_LABEL }).click()
  await expect(inspector).toBeHidden()
}

test.describe('NodePopover providers', () => {
  test('Gemini streaming works via /api/ai/gemini', async ({ page }) => {
    await page.addInitScript(() => {
      const encode = (value: string) => `plain:${btoa(value)}`

      window.localStorage.setItem('stemflow:provider', 'gemini')
      window.localStorage.setItem('stemflow:apikey:gemini', encode('gk-test-gemini'))
    })

    await page.route('**/api/ai/gemini', async (route) => {
      const body =
        'data: {"candidates":[{"content":{"parts":[{"text":"Hello "}]}}]}\n\n' +
        'data: {"candidates":[{"content":{"parts":[{"text":"Gemini"}]}}]}\n\n'

      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
        body,
      })
    })

    await page.goto('/', { waitUntil: 'networkidle' })

    const canvas = page.locator('.react-flow__pane')
    await dragSidebarTileToCanvas(page, 'sidebar-observation', { x: 220, y: 220 })

    const node = getNodeByLabel(page, OBSERVATION_LABEL)
    await node.click({ position: { x: 10, y: 10 } })
    await closeInspectorOverlay(page)
    await node.getByRole('button', { name: AI_ACTIONS_LABEL }).click()

    await page.getByRole('button', { name: SUMMARIZE_LABEL }).click()
    await expect(page.getByTestId('streaming-text-container')).toContainText('Hello Gemini')

    await page.getByRole('button', { name: APPLY_LABEL }).click()
    await expect(page.locator('div.react-flow__node')).toHaveCount(2)

    await page.screenshot({ path: evidencePath('task-14-gemini-workflow.png') })
  })

  test('Anthropic streaming works via /api/ai/anthropic', async ({ page }) => {
    await page.addInitScript(() => {
      const encode = (value: string) => `plain:${btoa(value)}`

      window.localStorage.setItem('stemflow:provider', 'anthropic')
      window.localStorage.setItem('stemflow:apikey:anthropic', encode('sk-ant-test'))
    })

    await page.route('**/api/ai/anthropic', async (route) => {
      const body =
        'event: content_block_delta\n' +
        'data: {"delta":{"text":"Hello "}}\n\n' +
        'event: content_block_delta\n' +
        'data: {"delta":{"text":"Claude"}}\n\n' +
        'event: message_stop\n' +
        'data: {}\n\n'

      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
        body,
      })
    })

    await page.goto('/', { waitUntil: 'networkidle' })

    const canvas = page.locator('.react-flow__pane')
    await dragSidebarTileToCanvas(page, 'sidebar-observation', { x: 220, y: 220 })

    const node = getNodeByLabel(page, OBSERVATION_LABEL)
    await node.click({ position: { x: 10, y: 10 } })
    await closeInspectorOverlay(page)
    await node.getByRole('button', { name: AI_ACTIONS_LABEL }).click()

    await page.getByRole('button', { name: SUMMARIZE_LABEL }).click()
    await expect(page.getByTestId('streaming-text-container')).toContainText('Hello Claude')

    await page.getByRole('button', { name: APPLY_LABEL }).click()
    await expect(page.locator('div.react-flow__node')).toHaveCount(2)

    await page.screenshot({ path: evidencePath('task-14-anthropic-workflow.png') })
  })
})
