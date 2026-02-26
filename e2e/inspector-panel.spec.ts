import { expect, test, type Page } from '@playwright/test'
import { dragSidebarTileToCanvas } from './helpers/drag-drop'

const evidencePath = (name: string) => `/Users/harveyguo/StemFlow/.sisyphus/evidence/${name}`
const OBSERVATION_LABEL = /Observation|nodes\.observation\.title/i
const MECHANISM_LABEL = /Mechanism|nodes\.mechanism\.title/i
const VALIDATION_LABEL = /Validation|nodes\.validation\.title/i
const CLOSE_LABEL = /(Close|common\.close)/i
const INSPECTOR_TITLE_LABEL = /Inspector|inspector\.title/i
const LONG_TEXT_LABEL = /Full Text|全文|inspector\.longText/i
const READ_MORE_LABEL = /Inspect|nodes\.card\.readMore/i

const getNodeByLabel = (page: Page, label: RegExp) =>
  page.locator('div.react-flow__node').filter({ hasText: label }).first()

const closeInspectorWithButton = async (page: Page) => {
  const inspector = page.getByTestId('inspector-panel')
  if (!(await inspector.isVisible().catch(() => false))) return
  await inspector.getByRole('button', { name: CLOSE_LABEL }).click()
  await expect(inspector).toBeHidden()
}

test.describe('Inspector panel regression suite', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const encode = (value: string) => `plain:${btoa(value)}`
      window.localStorage.setItem('stemflow:provider', 'openai')
      window.localStorage.setItem('stemflow:apikey:openai', encode('sk-test-openai'))
    })

    await page.goto('/', { waitUntil: 'networkidle' })
  })

  test('selection opens/syncs inspector and Escape closes without deselecting', async ({ page }) => {
    await dragSidebarTileToCanvas(page, 'sidebar-observation', { x: 200, y: 200 })
    await dragSidebarTileToCanvas(page, 'sidebar-mechanism', { x: 520, y: 220 })

    const observation = getNodeByLabel(page, OBSERVATION_LABEL)
    const mechanism = getNodeByLabel(page, MECHANISM_LABEL)

    await expect(mechanism).toBeVisible()
    await expect(observation).toBeVisible()

    const observationText = 'Observation inspector selection sync text.'
    await observation.click({ position: { x: 10, y: 10 } })
    await expect(observation).toHaveClass(/selected/)

    const observationTextarea = observation.locator('textarea').first()
    await observationTextarea.fill(observationText)

    const inspector = page.getByTestId('inspector-panel')
    await expect(inspector).toBeVisible()
    await expect(page.getByRole('heading', { name: INSPECTOR_TITLE_LABEL })).toBeVisible()
    await expect(inspector).toContainText(observationText)

    await inspector.getByRole('button', { name: CLOSE_LABEL }).focus()
    await page.keyboard.press('Escape')
    await expect(inspector).toBeHidden()
    await expect(observation).toHaveClass(/selected/)
    await expect(observationTextarea).toHaveValue(observationText)

    const mechanismText = 'Mechanism inspector selection sync text.'
    await mechanism.click({ position: { x: 10, y: 10 } })
    await expect(mechanism).toHaveClass(/selected/)
    const mechanismTextarea = mechanism.locator('textarea').first()
    await mechanismTextarea.fill(mechanismText)

    await expect(inspector).toBeVisible()
    await expect(inspector).toContainText(mechanismText)
    await expect(inspector).not.toContainText(observationText)

    await inspector.getByRole('button', { name: CLOSE_LABEL }).focus()
    await page.keyboard.press('Escape')
    await expect(inspector).toBeHidden()
    await expect(mechanism).toHaveClass(/selected/)
    await expect(mechanismTextarea).toHaveValue(mechanismText)

    await page.screenshot({ path: evidencePath('task-10-e2e-happy.png') })
  })

  test('Inspect intent opens inspector long-text view', async ({ page }) => {
    const canvas = page.locator('.react-flow__pane')
    await dragSidebarTileToCanvas(page, 'sidebar-observation', { x: 220, y: 300 })

    const observation = getNodeByLabel(page, OBSERVATION_LABEL)
    await observation.click({ position: { x: 10, y: 10 } })

    const longText = Array(40)
      .fill('Long observation detail that exceeds the collapse threshold.')
      .join(' ')

    const textarea = observation.locator('textarea').first()
    await textarea.fill(longText)

    await closeInspectorWithButton(page)

    await canvas.click({ position: { x: 10, y: 10 } })
    const readMoreButton = observation.getByRole('button', { name: READ_MORE_LABEL }).last()
    await readMoreButton.click()

    const inspector = page.getByTestId('inspector-panel')
    await expect(inspector).toBeVisible()
    await expect(inspector.getByRole('heading', { name: LONG_TEXT_LABEL })).toBeVisible()
    await expect(inspector).toContainText(longText.slice(0, 20))
    await page.screenshot({ path: evidencePath('task-10-e2e-read-more.png') })
  })

  test('inspector stays hidden when canvas is empty and Escape pressed', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => {
      errors.push(error.message)
    })
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })

    const inspector = page.getByTestId('inspector-panel')

    await expect(inspector).toBeHidden()
    await page.keyboard.press('Escape')

    await expect(inspector).toBeHidden()
    expect(errors).toEqual([])
    await page.screenshot({ path: evidencePath('task-10-e2e-negative.png') })
  })

  test('drag-drop remains functional while inspector overlay is open', async ({ page }) => {
    await dragSidebarTileToCanvas(page, 'sidebar-observation', { x: 200, y: 200 })
    const observation = getNodeByLabel(page, OBSERVATION_LABEL)
    await observation.click({ position: { x: 10, y: 10 } })

    const inspector = page.getByTestId('inspector-panel')
    await expect(inspector).toBeVisible()

    const nodeCountBefore = await page.locator('div.react-flow__node').count()
    await dragSidebarTileToCanvas(page, 'sidebar-validation', { x: 760, y: 320 })

    await expect(page.locator('div.react-flow__node')).toHaveCount(nodeCountBefore + 1)
    await expect(getNodeByLabel(page, VALIDATION_LABEL)).toBeVisible()
    await expect(inspector).toBeVisible()
    await page.screenshot({ path: evidencePath('task-10-e2e-drag-overlay.png') })
  })
})
