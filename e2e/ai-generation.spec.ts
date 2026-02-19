import { expect, test, type Locator, type Page } from '@playwright/test'
import { dragSidebarTileToCanvas } from './helpers/drag-drop'

const EVIDENCE_HAPPY = '/Users/harveyguo/StemFlow/.sisyphus/evidence/task-12-e2e-happy.png'
const EVIDENCE_RETRY = '/Users/harveyguo/StemFlow/.sisyphus/evidence/task-12-e2e-retry.png'
const PLANNER_SYSTEM_MARKER = 'scientific research planner'
const DIRECTION_CALL_MARKER = 'In this call, generate exactly ONE suggestion aligned to the direction_focus above.'

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

const setupPlannerFlowMock = async (
  page: Page,
  options?: {
    failDirectionAttempts?: number
    delayFirstDirectionMs?: number
  }
) => {
  let directionAttempt = 0

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
    const isDirectionCall = userPrompt.includes(DIRECTION_CALL_MARKER)
    if (!isDirectionCall) {
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'application/json' },
        json: {
          text: JSON.stringify([]),
          finishReason: 'stop',
          model: 'gpt-4o-mini',
        },
      })
      return
    }

    directionAttempt += 1
    if (directionAttempt === 1 && options?.delayFirstDirectionMs) {
      await new Promise((resolve) => setTimeout(resolve, options.delayFirstDirectionMs))
    }

    if (directionAttempt <= (options?.failDirectionAttempts ?? 0)) {
      await route.fulfill({
        status: 429,
        headers: { 'content-type': 'application/json' },
        json: { error: { message: 'Rate limit exceeded' } },
      })
      return
    }

    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      json: {
        text: JSON.stringify([
          {
            type: 'MECHANISM',
            summary_title: `Hydrated Candidate ${directionAttempt}`,
            text_content: `Hydrated mechanism ${directionAttempt} [[exa:1]]`,
            exa_citations: ['exa:1'],
          },
        ]),
        finishReason: 'stop',
        model: 'gpt-4o-mini',
      },
    })
  })
}

const triggerSuggestMechanism = async (page: Page) => {
  const allNodes = page.locator('div.react-flow__node')

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const nodeCount = await allNodes.count()
    if (nodeCount > 0) break
    await dragSidebarTileToCanvas(page, 'sidebar-observation', {
      x: 220 + attempt * 60,
      y: 220 + attempt * 30,
    })
    await page.waitForTimeout(180)
  }

  await expect(allNodes).toHaveCount(1, { timeout: 10000 })
  const observationNode = allNodes.first()
  await observationNode.waitFor({ state: 'visible', timeout: 10000 })
  await observationNode.click({ position: { x: 16, y: 16 } })
  await closeInspectorOverlay(page)

  await observationNode.getByRole('button', { name: /Generate|nodes\.card\.generate/i }).click()
}

test.describe('AI Generation Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const encode = (value: string) => `plain:${btoa(value)}`

      window.localStorage.setItem('stemflow:provider', 'openai')
      window.localStorage.setItem('stemflow:apikey:openai', encode('sk-test-openai'))
      window.localStorage.setItem('stemflow:globalGoal', 'Task 12 e2e verification goal')
    })
  })

  test('planner preview shows exactly 3 ghosts and accepting one keeps siblings visible', async ({ page }) => {
    await setupPlannerFlowMock(page, { delayFirstDirectionMs: 1300 })
    await page.goto('/', { waitUntil: 'networkidle' })

    await triggerSuggestMechanism(page)

    const ghostNodes = page.locator('div.react-flow__node.react-flow__node-GHOST')
    await expect(ghostNodes).toHaveCount(3)
    await expect(ghostNodes.filter({ hasText: 'Direction One' })).toHaveCount(1)
    await expect(ghostNodes.filter({ hasText: 'Direction Two' })).toHaveCount(1)
    await expect(ghostNodes.filter({ hasText: 'Direction Three' })).toHaveCount(1)

    const acceptButtons = page.locator('button[aria-label="Accept suggestion"], button[aria-label="nodes.ghost.acceptSuggestion"]')
    await expect(acceptButtons).toHaveCount(3)

    await clickWithClosedInspector(page, acceptButtons.first())

    const spinner = page.getByTestId('node-generation-spinner')
    await expect(spinner).toBeVisible({ timeout: 8000 })
    await expect(acceptButtons).toHaveCount(2)

    await page.screenshot({ path: EVIDENCE_HAPPY })

    await expect(spinner).toBeHidden({ timeout: 12000 })
  })

  test('failure shows retry and retry recovers same pending node', async ({ page }) => {
    await setupPlannerFlowMock(page, {
      failDirectionAttempts: 3,
      delayFirstDirectionMs: 700,
    })
    await page.goto('/', { waitUntil: 'networkidle' })

    await triggerSuggestMechanism(page)

    const acceptButtons = page.locator('button[aria-label="Accept suggestion"], button[aria-label="nodes.ghost.acceptSuggestion"]')
    await expect(acceptButtons).toHaveCount(3)
    await clickWithClosedInspector(page, acceptButtons.first())

    const retryButton = page.getByTestId('node-generation-retry')
    await expect(retryButton).toBeVisible({ timeout: 15000 })

    await retryButton.click()
    await expect(page.getByTestId('node-generation-spinner')).toBeVisible({ timeout: 8000 })
    await expect(page.getByTestId('node-generation-retry')).toBeHidden({ timeout: 12000 })

    await page.screenshot({ path: EVIDENCE_RETRY })
  })
})
