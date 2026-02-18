import { expect, test, type Locator, type Page } from '@playwright/test'
import { dragSidebarTileToCanvas } from './helpers/drag-drop'

type NodeType = 'OBSERVATION' | 'MECHANISM' | 'VALIDATION'

const getNodeByType = (page: Page, nodeType: NodeType) =>
  page.locator(`div.react-flow__node.react-flow__node-${nodeType}`).first()

const closeInspectorOverlay = async (page: Page) => {
  const inspector = page.getByTestId('inspector-panel')
  await inspector.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {})
  if (!(await inspector.isVisible().catch(() => false))) return

  const closeButton = inspector.getByRole('button', { name: /(Close|common\.close)/i })
  if (!(await closeButton.isVisible().catch(() => false))) {
    throw new Error('Inspector close button not visible while panel is open')
  }
  await closeButton.click()

  await expect(inspector).toBeHidden()
}

const waitForPersistedRecordCount = async (
  page: Page,
  storeName: 'nodes' | 'edges',
  minimumCount: number
) => {
  await expect
    .poll(async () => {
      return page.evaluate(async ({ table }) => {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = window.indexedDB.open('StemFlowDB')
          request.onerror = () => reject(request.error)
          request.onsuccess = () => resolve(request.result)
        })

        try {
          return await new Promise<number>((resolve, reject) => {
            const tx = db.transaction(table, 'readonly')
            const countRequest = tx.objectStore(table).count()
            countRequest.onerror = () => reject(countRequest.error)
            countRequest.onsuccess = () => resolve(countRequest.result)
          })
        } finally {
          db.close()
        }
      }, { table: storeName })
    })
    .toBeGreaterThanOrEqual(minimumCount)
}

const clickWithClosedInspector = async (page: Page, target: Locator) => {
  let lastError: unknown = null

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await closeInspectorOverlay(page)
    try {
      await target.click({ timeout: 3000 })
      return
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to click target with inspector closed')
}

test.describe('AI Integration', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      // Use plaintext fallback encoding supported by src/lib/api-keys.ts
      const encode = (value: string) => `plain:${btoa(value)}`

      window.localStorage.setItem('stemflow:provider', 'openai')
      window.localStorage.setItem('stemflow:apikey:openai', encode('sk-test-openai'))
      window.localStorage.setItem('stemflow:globalGoal', 'Test global goal')
    })

    let directionCall = 0

    await page.route('**/api/ai/**', async (route) => {
      const requestUrl = route.request().url()
      if (!requestUrl.includes('/api/ai/openai') && !requestUrl.includes('/api/ai/openai-compatible')) {
        await route.continue()
        return
      }

      let body: { messages?: Array<{ role?: string; content?: string }> } = {}
      try {
        body = route.request().postDataJSON() as {
          messages?: Array<{ role?: string; content?: string }>
        }
      } catch {
        body = {}
      }

      const systemMessage =
        body.messages?.find((message) => message.role === 'system')?.content ?? ''

      if (typeof systemMessage === 'string' && systemMessage.includes('scientific research planner')) {
        await route.fulfill({
          status: 200,
          headers: { 'content-type': 'application/json' },
          json: {
            text: JSON.stringify([
              {
                summary_title: 'Direction One',
                direction_focus: 'Focus one',
                search_query: 'query one',
              },
              {
                summary_title: 'Direction Two',
                direction_focus: 'Focus two',
                search_query: 'query two',
              },
              {
                summary_title: 'Direction Three',
                direction_focus: 'Focus three',
                search_query: 'query three',
              },
            ]),
            finishReason: 'stop',
            model: 'gpt-4o-mini',
          },
        })
        return
      }

      directionCall += 1
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        json: {
          text: JSON.stringify([
            {
              type: 'MECHANISM',
              summary_title: `Candidate ${directionCall}`,
              text_content: `AI suggested mechanism ${directionCall} [[exa:1]]`,
              exa_citations: ['exa:1'],
            },
          ]),
          finishReason: 'stop',
          model: 'gpt-4o-mini',
        },
      })
    })

    await page.route('**/api/search/exa**', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        json: {
          text: 'Title: Source 1\nURL: https://example.com/source-1\nSummary: grounded snippet',
        },
      })
    })

    await page.goto('/', { waitUntil: 'networkidle' })
  })

  test('generate creates 3 ghost nodes and accept persists after reload', async ({ page }) => {
    const canvas = page.locator('.react-flow__pane')
    await expect(canvas).toBeVisible()

    await dragSidebarTileToCanvas(page, 'sidebar-observation', { x: 120, y: 120 })

    const parent = getNodeByType(page, 'OBSERVATION')
    await parent.waitFor({ state: 'visible' })

    await parent.click({ position: { x: 10, y: 10 } })
    await closeInspectorOverlay(page)

    await expect(parent.getByRole('button', { name: /Generate|nodes\.card\.generate/i })).toBeVisible()
    await parent.getByRole('button', { name: /Generate|nodes\.card\.generate/i }).click()

    const acceptButtons = page.locator('button[aria-label="Accept suggestion"]')
    await expect(acceptButtons).toHaveCount(3)

    await clickWithClosedInspector(page, acceptButtons.first())
    await expect(page.locator('button[aria-label="Accept suggestion"]')).toHaveCount(2)

    await clickWithClosedInspector(page, page.locator('button[aria-label="Accept suggestion"]').first())
    await expect(page.locator('button[aria-label="Accept suggestion"]')).toHaveCount(1)

    await waitForPersistedRecordCount(page, 'nodes', 3)
    await waitForPersistedRecordCount(page, 'edges', 2)
    await page.reload()

    await expect(page.locator('button[aria-label="Accept suggestion"]')).toHaveCount(0)
    await expect(getNodeByType(page, 'MECHANISM')).toHaveCount(1)
  })
})
