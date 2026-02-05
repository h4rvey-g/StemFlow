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
                { type: 'VALIDATION', text_content: 'AI suggested validation' }
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
              { type: 'VALIDATION', text_content: 'AI suggested validation' }
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

    const node = page.locator('div.react-flow__node:has-text("OBSERVATION")').first()
    await expect(node.getByRole('button', { name: /generate/i })).toBeVisible()
  })

  test('Generate button exists on mechanism nodes', async ({ page }) => {
    const canvas = page.locator('.react-flow__pane')
    const mechanismTile = page.getByTestId('sidebar-mechanism')
    await mechanismTile.dragTo(canvas, { targetPosition: { x: 200, y: 200 } })

    const node = page.locator('div.react-flow__node:has-text("MECHANISM")').first()
    await expect(node.getByRole('button', { name: /generate/i })).toBeVisible()
  })

  test('Generate button exists on validation nodes', async ({ page }) => {
    const canvas = page.locator('.react-flow__pane')
    const validationTile = page.getByTestId('sidebar-validation')
    await validationTile.dragTo(canvas, { targetPosition: { x: 200, y: 200 } })

    const node = page.locator('div.react-flow__node:has-text("VALIDATION")').first()
    await expect(node.getByRole('button', { name: /generate/i })).toBeVisible()
  })

  test('settings modal allows API key configuration', async ({ page }) => {
    const settingsButton = page.locator('[data-testid="settings-button"]').or(
      page.locator('button').filter({ has: page.locator('svg') }).first()
    )
    await settingsButton.click()

    await expect(page.getByText('Settings')).toBeVisible()
    await expect(page.getByRole('combobox')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
  })
})
