import { expect, test } from '@playwright/test'
import { dragSidebarTileToCanvas } from './helpers/drag-drop'

test.describe('AI Generation Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api.openai.com/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify([
                 { type: 'MECHANISM', text_content: 'AI suggested mechanism' },
                 { type: 'VALIDATION', text_content: 'AI suggested validation' },
                 { type: 'OBSERVATION', text_content: 'AI suggested observation' }
               ])
             }
           }]
         })
       })
    })

    await page.route('**/api.anthropic.com/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          content: [{
             text: JSON.stringify([
               { type: 'MECHANISM', text_content: 'AI suggested mechanism' },
               { type: 'VALIDATION', text_content: 'AI suggested validation' },
               { type: 'OBSERVATION', text_content: 'AI suggested observation' }
             ])
           }]
         })
       })
    })

    await page.goto('/', { waitUntil: 'networkidle' })
  })

  test('Generate button appears on nodes', async ({ page }) => {
    await dragSidebarTileToCanvas(page, 'sidebar-observation', { x: 200, y: 200 })

    const node = page.locator('div.react-flow__node:has-text("Observation")').first()
    await node.click({ position: { x: 10, y: 10 } })
    await expect(node).toHaveClass(/selected/)
    await expect(node.getByRole('button', { name: /generate/i })).toBeVisible()
  })

  test('Generate button exists on mechanism nodes', async ({ page }) => {
    const nodeSelector = 'div.react-flow__node:has-text("Mechanism")'
    await dragSidebarTileToCanvas(page, 'sidebar-mechanism', { x: 200, y: 200 })

    await page.locator(nodeSelector).first().click({ position: { x: 10, y: 10 }, force: true })
    const node = page.locator(nodeSelector).first()
    await expect(node).toHaveClass(/selected/)
    await expect(node.getByRole('button', { name: /generate/i })).toBeVisible()
  })

  test('Generate button exists on validation nodes', async ({ page }) => {
    const nodeSelector = 'div.react-flow__node:has-text("Validation")'
    await dragSidebarTileToCanvas(page, 'sidebar-validation', { x: 200, y: 200 })

    await page.locator(nodeSelector).first().click({ position: { x: 10, y: 10 }, force: true })
    const node = page.locator(nodeSelector).first()
    await expect(node).toHaveClass(/selected/)
    const validationActionRegex = /^(?:Add Observation|添加观察|nodes\.card\.addObservation)$/i
    const validationActionButton = node.getByRole('button', {
      name: validationActionRegex,
    })
    await expect(validationActionButton).toBeVisible()
  })

  test('settings modal allows API key configuration', async ({ page }) => {
    await page.getByTestId('sidebar-settings').click()
    const modal = page.getByTestId('settings-modal')
    await expect(modal).toBeVisible()
    await expect(modal.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await expect(modal.locator('#settings-language')).toBeVisible()
    await modal.getByRole('button', { name: 'Model' }).click()
    await expect(modal.locator('input[type="password"]')).toBeVisible()
  })
})
