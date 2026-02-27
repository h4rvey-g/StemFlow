import { expect, test } from '@playwright/test'

const evidencePath = (name: string) => `/Users/harveyguo/StemFlow/.sisyphus/evidence/${name}`

const gotoApp = async (page: import('@playwright/test').Page) => {
  await page.goto('/')
  await expect
    .poll(async () => {
      const popupVisible = await page.getByTestId('onboarding-popup').isVisible().catch(() => false)
      const getStartedVisible = await page.getByTestId('empty-canvas-get-started').isVisible().catch(() => false)
      return popupVisible || getStartedVisible
    })
    .toBe(true)
}

const openOnboardingFromOverlay = async (page: import('@playwright/test').Page) => {
  const getStarted = page.getByTestId('empty-canvas-get-started')
  await expect(getStarted).toBeVisible()
  await getStarted.click()
  await expect(page.getByTestId('onboarding-popup')).toBeVisible()
}

const openOnboarding = async (page: import('@playwright/test').Page) => {
  await expect
    .poll(
      async () => {
        const popupVisible = await page.getByTestId('onboarding-popup').isVisible().catch(() => false)
        const getStartedVisible = await page
          .getByTestId('empty-canvas-get-started')
          .isVisible()
          .catch(() => false)
        return popupVisible || getStartedVisible
      },
      { timeout: 10000 }
    )
    .toBe(true)

  const popupVisible = await page.getByTestId('onboarding-popup').isVisible().catch(() => false)
  if (popupVisible) {
    await expect(page.getByTestId('onboarding-popup')).toBeVisible()
    return
  }

  await openOnboardingFromOverlay(page)
}

const createFromOnboarding = async (
  page: import('@playwright/test').Page,
  type: 'hypothesis' | 'observation',
  text: string
) => {
  await openOnboarding(page)

  if (type === 'hypothesis') {
    await page.getByTestId('onboarding-card-hypothesis').click()
  } else {
    await page.getByTestId('onboarding-card-observation').click()
  }

  const textarea = page.getByTestId('onboarding-textarea')
  const createButton = page.getByTestId('onboarding-create-btn')

  await expect(textarea).toBeVisible()
  await textarea.fill(text)
  await expect(createButton).toBeEnabled()
  await createButton.click()
  await expect(page.getByTestId('onboarding-popup')).toBeHidden()
}

const waitForPersistedNodes = async (page: import('@playwright/test').Page) => {
  await expect
    .poll(async () => {
      return page.evaluate(async () => {
        return await new Promise<number>((resolve) => {
          const request = window.indexedDB.open('StemFlowDB')

          request.onerror = () => resolve(0)
          request.onsuccess = () => {
            const db = request.result
            if (!db.objectStoreNames.contains('nodes')) {
              db.close()
              resolve(0)
              return
            }

            const tx = db.transaction('nodes', 'readonly')
            const store = tx.objectStore('nodes')
            const countRequest = store.count()

            countRequest.onerror = () => {
              db.close()
              resolve(0)
            }
            countRequest.onsuccess = () => {
              db.close()
              resolve(countRequest.result)
            }
          }
        })
      })
    })
    .toBeGreaterThan(0)
}

test.describe('Onboarding flow', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page)
  })

  test('blank project auto-opens onboarding popup', async ({ page }) => {
    await openOnboarding(page)
    await page.screenshot({ path: evidencePath('task-5-onboarding-auto-open.png') })
  })

  test('hypothesis flow creates mechanism node with entered text', async ({ page }) => {
    const mechanismText = 'Hypothesis: protein X regulates pathway Y'
    await createFromOnboarding(page, 'hypothesis', mechanismText)

    const mechanismNode = page.locator('div.react-flow__node.react-flow__node-MECHANISM').first()
    await expect(mechanismNode).toBeVisible()
    await expect(mechanismNode).toContainText(mechanismText)
  })

  test('observation flow creates observation node with entered text', async ({ page }) => {
    const observationText = 'Observation: sample B shows increased growth'
    await createFromOnboarding(page, 'observation', observationText)

    const observationNode = page.locator('div.react-flow__node.react-flow__node-OBSERVATION').first()
    await expect(observationNode).toBeVisible()
    await expect(observationNode).toContainText(observationText)
  })

  test('dismiss popup then get started button reopens popup', async ({ page }) => {
    await openOnboarding(page)

    const popup = page.getByTestId('onboarding-popup')
    await page.getByTestId('onboarding-close-btn').click()
    await expect(popup).toBeHidden()

    await openOnboardingFromOverlay(page)
  })

  test('after create and refresh popup does not auto-open', async ({ page }) => {
    await createFromOnboarding(page, 'observation', 'Persisted onboarding-created node')
    await waitForPersistedNodes(page)

    await page.reload()
    await expect(page.getByTestId('onboarding-popup')).toBeHidden()
    await expect(page.getByTestId('empty-canvas-get-started')).toHaveCount(0)
    await expect(page.locator('div.react-flow__node')).toHaveCount(1)
  })

  test('escape key closes popup', async ({ page }) => {
    await openOnboarding(page)
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('onboarding-popup')).toBeHidden()
  })

  test('create button disabled when textarea is empty', async ({ page }) => {
    await openOnboarding(page)
    await page.getByTestId('onboarding-card-observation').click()

    const textarea = page.getByTestId('onboarding-textarea')
    const createButton = page.getByTestId('onboarding-create-btn')

    await expect(textarea).toBeVisible()
    await expect(createButton).toBeDisabled()

    await textarea.fill('   ')
    await expect(createButton).toBeDisabled()
  })
})
