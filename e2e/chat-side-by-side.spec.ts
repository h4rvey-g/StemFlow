import { expect, test, type Locator, type Page } from '@playwright/test'
import { dragSidebarTileToCanvas } from './helpers/drag-drop'

const CHAT_CLOSE_LABEL = /Close chat panel/i

type LayoutSnapshot = {
  modalWidth: number
  inspectorWidth: number
  chatWidth: number
  inspectorDisplay: string
  chatDisplay: string
}

const dismissOnboardingIfVisible = async (page: Page) => {
  const popup = page.getByTestId('onboarding-popup')
  const isVisible = await popup.isVisible().catch(() => false)
  if (!isVisible) return

  await page.getByTestId('onboarding-close-btn').click()
  await popup.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {})
}

const ensureContentNodeId = async (page: Page): Promise<string> => {
  const contentNodes = page.locator(
    'div.react-flow__node.react-flow__node-OBSERVATION, div.react-flow__node.react-flow__node-MECHANISM, div.react-flow__node.react-flow__node-VALIDATION'
  )

  if ((await contentNodes.count()) === 0) {
    await dragSidebarTileToCanvas(page, 'sidebar-observation', { x: 320, y: 260 })
  }

  const node = contentNodes.first()
  await expect(node).toBeVisible({ timeout: 10000 })

  const nodeId = await node.getAttribute('data-id')
  if (!nodeId) {
    throw new Error('Unable to read node id for inspector/chat open events')
  }

  return nodeId
}

const getOverlay = (page: Page): Locator =>
  page.locator('div.fixed.inset-0.z-50').filter({
    has: page.getByRole('button', { name: CHAT_CLOSE_LABEL }),
  }).first()

const getModal = (page: Page): Locator => getOverlay(page).locator('div.relative.z-10').first()

const readLayoutSnapshot = async (modal: Locator): Promise<LayoutSnapshot> => {
  const sections = modal.locator('section')
  await expect(sections).toHaveCount(2)

  const inspectorSection = sections.nth(0)
  const chatSection = sections.nth(1)

  const [modalWidth, inspectorWidth, chatWidth, inspectorDisplay, chatDisplay] = await Promise.all([
    modal.evaluate((el) => el.getBoundingClientRect().width),
    inspectorSection.evaluate((el) => el.getBoundingClientRect().width),
    chatSection.evaluate((el) => el.getBoundingClientRect().width),
    inspectorSection.evaluate((el) => window.getComputedStyle(el).display),
    chatSection.evaluate((el) => window.getComputedStyle(el).display),
  ])

  return {
    modalWidth,
    inspectorWidth,
    chatWidth,
    inspectorDisplay,
    chatDisplay,
  }
}

const openInspectorAndChat = async (page: Page) => {
  const nodeId = await ensureContentNodeId(page)

  await page.evaluate((id) => {
    window.dispatchEvent(new CustomEvent('stemflow:read-more-intent', { detail: { nodeId: id } }))
    window.dispatchEvent(new CustomEvent('stemflow:open-chat', { detail: { nodeId: id } }))
  }, nodeId)

  const overlay = getOverlay(page)
  await expect(overlay).toBeVisible()
  await expect(page.getByRole('button', { name: CHAT_CLOSE_LABEL })).toBeVisible()

  return {
    overlay,
    modal: getModal(page),
  }
}

test.describe('Inspector + chat responsive side-by-side behavior', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const encode = (value: string) => `plain:${btoa(value)}`
      window.localStorage.setItem('stemflow:provider', 'openai')
      window.localStorage.setItem('stemflow:apikey:openai', encode('sk-test-openai'))
    })

    await page.goto('/', { waitUntil: 'networkidle' })
    await dismissOnboardingIfVisible(page)
  })

  test('desktop: opens inspector + chat in side-by-side layout', async ({ page }) => {
    const { modal } = await openInspectorAndChat(page)
    const layout = await readLayoutSnapshot(modal)

    expect(layout.inspectorDisplay).not.toBe('none')
    expect(layout.chatDisplay).not.toBe('none')
    expect(layout.chatWidth).toBeGreaterThan(430)
    expect(layout.chatWidth).toBeLessThan(530)
    expect(layout.inspectorWidth).toBeGreaterThan(layout.chatWidth)
    expect(layout.inspectorWidth + layout.chatWidth).toBeGreaterThan(layout.modalWidth - 20)
  })

  test('mobile: 375x667 shows chat full width and hides detail', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })

    const { modal } = await openInspectorAndChat(page)
    const layout = await readLayoutSnapshot(modal)

    expect(layout.inspectorDisplay).toBe('none')
    expect(layout.chatDisplay).not.toBe('none')
    expect(Math.abs(layout.chatWidth - layout.modalWidth)).toBeLessThanOrEqual(2)
    expect(layout.chatWidth).toBeGreaterThan(300)
  })

  test('Escape closes inspector and chat together', async ({ page }) => {
    await openInspectorAndChat(page)

    await page.keyboard.press('Escape')

    await expect(getOverlay(page)).toHaveCount(0)
    await expect(page.getByRole('button', { name: CHAT_CLOSE_LABEL })).toHaveCount(0)
  })

  test('backdrop click closes inspector and chat together', async ({ page }) => {
    const { overlay } = await openInspectorAndChat(page)

    await overlay.click({ position: { x: 5, y: 5 } })

    await expect(getOverlay(page)).toHaveCount(0)
    await expect(page.getByRole('button', { name: CHAT_CLOSE_LABEL })).toHaveCount(0)
  })

  test('viewport resize transitions desktop side-by-side to mobile full-width chat', async ({ page }) => {
    const { modal } = await openInspectorAndChat(page)

    const desktopLayout = await readLayoutSnapshot(modal)
    expect(desktopLayout.inspectorDisplay).not.toBe('none')
    expect(desktopLayout.chatDisplay).not.toBe('none')
    expect(desktopLayout.chatWidth).toBeGreaterThan(430)

    await page.setViewportSize({ width: 375, height: 667 })
    await page.waitForTimeout(400)

    const mobileLayout = await readLayoutSnapshot(modal)
    expect(mobileLayout.inspectorDisplay).toBe('none')
    expect(mobileLayout.chatDisplay).not.toBe('none')
    expect(Math.abs(mobileLayout.chatWidth - mobileLayout.modalWidth)).toBeLessThanOrEqual(2)
  })
})
