import { expect, test, type Locator, type Page } from '@playwright/test'
import { dragSidebarTileToCanvas } from './helpers/drag-drop'

const EVIDENCE_PATH = '/Users/harveyguo/StemFlow/.sisyphus/evidence/task-9-pending-ui-verified.png'
const APP_URL = 'http://localhost:3000'
const PLANNER_SYSTEM_MARKER = 'scientific research planner'
const DIRECTION_MARKER = 'In this call, generate exactly ONE suggestion aligned to the direction_focus above.'

type RequestMessage = {
  role?: string
  content?:
    | string
    | Array<{
        type?: string
        text?: string
      }>
}

const toMessageText = (content: RequestMessage['content']): string => {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  return content
    .map((part) => {
      if (!part || typeof part !== 'object') return ''
      return typeof part.text === 'string' ? part.text : ''
    })
    .filter(Boolean)
    .join('\n')
}

const closeInspectorOverlay = async (page: Page) => {
  const inspector = page.getByTestId('inspector-panel')
  await inspector.waitFor({ state: 'visible', timeout: 1500 }).catch(() => {})
  if (!(await inspector.isVisible().catch(() => false))) return

  const closeButton = inspector.getByRole('button', { name: /(Close|common\.close)/i })
  if (!(await closeButton.isVisible().catch(() => false))) {
    throw new Error('Inspector close button not visible while panel is open')
  }
  await closeButton.click()
  await expect(inspector).toBeHidden()
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

const ensureObservationNode = async (page: Page): Promise<Locator> => {
  const nodes = page.locator('div.react-flow__node')

  for (let attempt = 0; attempt < 4; attempt += 1) {
    if ((await nodes.count()) > 0) break
    await dragSidebarTileToCanvas(page, 'sidebar-observation', {
      x: 320 + attempt * 10,
      y: 260 + attempt * 25,
    })
    await page.waitForTimeout(180)
  }

  const observationNode = nodes.first()
  await expect(observationNode).toBeVisible({ timeout: 10000 })
  const count = await nodes.count()
  if (count === 0) {
    throw new Error('Failed to bootstrap observation node')
  }
  return observationNode
}

test('ghost accept shows pending spinner while AI request delayed', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('stemflow:provider', 'openai')
    window.localStorage.setItem('stemflow:apikey:openai', 'plain:' + btoa('sk-test-openai'))
    window.localStorage.setItem('stemflow:globalGoal', 'Pending spinner verification goal')
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

  await page.route('**/api/ai/openai', async (route) => {
    const body = route.request().postDataJSON() as {
      messages?: RequestMessage[]
    }
    const systemMessage = toMessageText(body.messages?.find((message) => message.role === 'system')?.content)

    if (systemMessage.includes(PLANNER_SYSTEM_MARKER)) {
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

    const userPrompt = toMessageText(body.messages?.find((message) => message.role === 'user')?.content)
    const isDirectionCall = userPrompt.includes(DIRECTION_MARKER)
    if (isDirectionCall) {
      await new Promise((resolve) => setTimeout(resolve, 5000))
    }

    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      json: {
        text: JSON.stringify([
          {
            type: 'MECHANISM',
            summary_title: 'Hydrated Candidate',
            text_content: 'Hydrated mechanism [[exa:1]]',
            exa_citations: ['exa:1'],
          },
        ]),
        finishReason: 'stop',
        model: 'gpt-4o-mini',
      },
    })
  })

  await page.goto(APP_URL, { waitUntil: 'networkidle' })
  const obsNode = await ensureObservationNode(page)
  await obsNode.click({ position: { x: 16, y: 16 } })
  await closeInspectorOverlay(page)

  await obsNode.getByRole('button', { name: /Generate|nodes\.card\.generate/i }).click()

  const acceptButton = page
    .locator('button[aria-label="Accept suggestion"], button[aria-label="nodes.ghost.acceptSuggestion"]')
    .first()
  await expect(acceptButton).toBeVisible({ timeout: 20000 })
  await clickWithClosedInspector(page, acceptButton)

  const spinner = page.getByTestId('node-generation-spinner')
  await expect(spinner).toBeVisible({ timeout: 15000 })

  await page.screenshot({ path: EVIDENCE_PATH })
})
