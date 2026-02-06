import { expect, test } from '@playwright/test'

test.describe('AI Integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      // Use plaintext fallback encoding supported by src/lib/api-keys.ts
      const encode = (value: string) => `plain:${btoa(value)}`

      window.localStorage.setItem('stemflow:provider', 'openai')
      window.localStorage.setItem('stemflow:apikey:openai', encode('sk-test-openai'))
      window.localStorage.setItem('stemflow:globalGoal', 'Test global goal')
    })

    const openaiChatResponse = {
      id: 'chatcmpl-test',
      object: 'chat.completion',
      created: 1234567890,
      model: 'gpt-4o-mini',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: JSON.stringify([
              { type: 'MECHANISM', text_content: 'AI suggested mechanism' },
              { type: 'VALIDATION', text_content: 'AI suggested validation' },
              { type: 'OBSERVATION', text_content: 'AI suggested observation' },
            ]),
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      },
    }

    const fulfillOpenAI = async (route: any) => {
      const request = route.request()

      if (request.method() === 'OPTIONS') {
        await route.fulfill({
          status: 204,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET,POST,OPTIONS',
            'access-control-allow-headers': 'authorization,content-type',
          },
          body: '',
        })
        return
      }

      await route.fulfill({
        status: 200,
        headers: {
          'access-control-allow-origin': '*',
        },
        json: openaiChatResponse,
      })
    }

    await page.route('**/api.openai.com/**', fulfillOpenAI)
    await page.route('**/v1/chat/completions', fulfillOpenAI)
    await page.route('**/v1/responses', fulfillOpenAI)

    await page.goto('/', { waitUntil: 'networkidle' })
  })

  test('generate creates 3 ghost nodes and accept persists after reload', async ({ page }) => {
    const canvas = page.locator('.react-flow__pane')
    await expect(canvas).toBeVisible()

    await page.getByTestId('sidebar-observation').dragTo(canvas, {
      targetPosition: { x: 120, y: 120 },
    })

    const parent = page.locator('div.react-flow__node:has-text("Observation")').first()
    await parent.waitFor({ state: 'visible' })

    await parent.click({ position: { x: 10, y: 10 } })
    await expect(parent).toHaveClass(/selected/)

    await parent.getByRole('button', { name: /generate/i }).click()

    const acceptButtons = page.locator('button[aria-label="Accept suggestion"]')
    await expect(acceptButtons).toHaveCount(3)

    await acceptButtons.first().click()
    await expect(page.locator('button[aria-label="Accept suggestion"]')).toHaveCount(2)

    await page.locator('button[aria-label="Accept suggestion"]').first().click()
    await expect(page.locator('button[aria-label="Accept suggestion"]')).toHaveCount(1)

    await page.waitForTimeout(500)
    await page.reload()

    await expect(page.locator('button[aria-label="Accept suggestion"]')).toHaveCount(0)
    await expect(page.locator('div.react-flow__node:has-text("Mechanism")')).toHaveCount(1)
  })
})
