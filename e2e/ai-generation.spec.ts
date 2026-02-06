import { expect, test } from '@playwright/test'

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
    const canvas = page.locator('.react-flow__pane')
    const observationTile = page.getByTestId('sidebar-observation')
    await observationTile.dragTo(canvas, { targetPosition: { x: 200, y: 200 } })

    const node = page.locator('div.react-flow__node:has-text("Observation")').first()
    await node.click({ position: { x: 10, y: 10 } })
    await expect(node).toHaveClass(/selected/)
    await expect(node.getByRole('button', { name: /generate/i })).toBeVisible()
  })

  test('Generate button exists on mechanism nodes', async ({ page }) => {
    const canvas = page.locator('.react-flow__pane')
    const mechanismTile = page.getByTestId('sidebar-mechanism')
    await mechanismTile.dragTo(canvas, { targetPosition: { x: 200, y: 200 } })

    const node = page.locator('div.react-flow__node:has-text("Mechanism")').first()
    await node.click({ position: { x: 10, y: 10 } })
    await expect(node).toHaveClass(/selected/)
    await expect(node.getByRole('button', { name: /generate/i })).toBeVisible()
  })

  test('Generate button exists on validation nodes', async ({ page }) => {
    const canvas = page.locator('.react-flow__pane')
    const validationTile = page.getByTestId('sidebar-validation')
    await validationTile.dragTo(canvas, { targetPosition: { x: 200, y: 200 } })

    const node = page.locator('div.react-flow__node:has-text("Validation")').first()
    await node.click({ position: { x: 10, y: 10 } })
    await expect(node).toHaveClass(/selected/)
    await expect(node.getByRole('button', { name: /generate/i })).toBeVisible()
  })

  test('settings modal allows API key configuration', async ({ page }) => {
    await page.getByTestId('sidebar-settings').click()
    await expect(page.getByTestId('settings-modal')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await expect(page.getByRole('combobox')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
  })
})
