import { expect, test } from '@playwright/test'

const evidencePath = (name: string) => `/Users/harveyguo/StemFlow/.sisyphus/evidence/${name}`

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
    const canvas = page.locator('.react-flow__pane')
    await page.getByTestId('sidebar-observation').dragTo(canvas, {
      targetPosition: { x: 200, y: 200 },
    })

    const node = page.locator('div.react-flow__node:has-text("Observation")').first()
    await node.click({ position: { x: 10, y: 10 } })
    await node.getByRole('button', { name: 'AI Actions' }).click()
    await expect(page.getByTestId('node-popover')).toBeVisible()

    await page.getByRole('button', { name: 'Summarize' }).click()
    // Playwright route.fulfill returns the full SSE body immediately, so the loading cursor
    // may appear and disappear too quickly to assert reliably. Instead, wait for output.
    await expect(page.getByTestId('streaming-text-container')).toContainText('Hello world')

    await page.getByRole('button', { name: 'Apply' }).click()
    await expect(page.locator('div.react-flow__node')).toHaveCount(2)

    await page.screenshot({ path: evidencePath('task-13-ai-node-created.png') })
  })

  test('Suggest Mechanism only shows for Observation', async ({ page }) => {
    const canvas = page.locator('.react-flow__pane')
    await page.getByTestId('sidebar-observation').dragTo(canvas, {
      targetPosition: { x: 200, y: 200 },
    })
    await page.getByTestId('sidebar-mechanism').dragTo(canvas, {
      targetPosition: { x: 820, y: 200 },
    })

    const obs = page.locator('div.react-flow__node:has-text("Observation")').first()
    await obs.click({ position: { x: 10, y: 10 } })
    await obs.getByRole('button', { name: 'AI Actions' }).click()
    await expect(page.getByText('Suggest Mechanism')).toBeVisible()
    await page.getByRole('button', { name: 'Close' }).click()

    // Ensure the previous selected node doesn't intercept clicks.
    await canvas.click({ position: { x: 20, y: 20 } })

    const mech = page.locator('div.react-flow__node:has-text("Mechanism")').first()
    await mech.click({ position: { x: 10, y: 10 }, force: true })
    await mech.getByRole('button', { name: 'AI Actions' }).click()
    await expect(page.getByText('Suggest Mechanism')).toHaveCount(0)

    await page.screenshot({ path: evidencePath('task-13-suggest-visible-only-obs.png') })
  })

  test('Connection highlighting shows O→M suggestion', async ({ page }) => {
    const canvas = page.locator('.react-flow__pane')
    await page.getByTestId('sidebar-observation').dragTo(canvas, {
      targetPosition: { x: 200, y: 200 },
    })
    await page.getByTestId('sidebar-mechanism').dragTo(canvas, {
      targetPosition: { x: 520, y: 200 },
    })
    await page.getByTestId('sidebar-validation').dragTo(canvas, {
      targetPosition: { x: 520, y: 420 },
    })

    const obs = page.locator('div.react-flow__node:has-text("Observation")').first()
    const sourceHandle = obs.locator('.react-flow__handle-bottom').first()

    await sourceHandle.hover()
    await page.mouse.down()
    await page.mouse.move(520, 200)

    const mech = page.locator('div.react-flow__node:has-text("Mechanism")').first()
    const val = page.locator('div.react-flow__node:has-text("Validation")').first()

    await expect(mech).toHaveClass(/ring-2/)
    await expect(val).not.toHaveClass(/ring-2/)

    await page.mouse.up()
    await page.screenshot({ path: evidencePath('task-13-connection-highlighting.png') })
  })
})
