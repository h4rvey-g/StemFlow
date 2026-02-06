import { expect, test } from '@playwright/test'

const evidencePath = (name: string) => `/Users/harveyguo/StemFlow/.sisyphus/evidence/${name}`

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
    await page.getByTestId('sidebar-observation').dragTo(canvas, {
      targetPosition: { x: 220, y: 220 },
    })

    const node = page.locator('div.react-flow__node:has-text("Observation")').first()
    await node.click({ position: { x: 10, y: 10 } })
    await node.getByRole('button', { name: 'AI Actions' }).click()

    await page.getByRole('button', { name: 'Summarize' }).click()
    await expect(page.getByTestId('streaming-text-container')).toContainText('Hello Gemini')

    await page.getByRole('button', { name: 'Apply' }).click()
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
    await page.getByTestId('sidebar-observation').dragTo(canvas, {
      targetPosition: { x: 220, y: 220 },
    })

    const node = page.locator('div.react-flow__node:has-text("Observation")').first()
    await node.click({ position: { x: 10, y: 10 } })
    await node.getByRole('button', { name: 'AI Actions' }).click()

    await page.getByRole('button', { name: 'Summarize' }).click()
    await expect(page.getByTestId('streaming-text-container')).toContainText('Hello Claude')

    await page.getByRole('button', { name: 'Apply' }).click()
    await expect(page.locator('div.react-flow__node')).toHaveCount(2)

    await page.screenshot({ path: evidencePath('task-14-anthropic-workflow.png') })
  })
})
