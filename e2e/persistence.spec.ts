import { expect, test, type Page } from '@playwright/test'
import { dragSidebarTileToCanvas } from './helpers/drag-drop'

type NodeType = 'OBSERVATION' | 'MECHANISM'

const getNodeByType = (page: Page, nodeType: NodeType) =>
  page.locator(`div.react-flow__node.react-flow__node-${nodeType}`).first()

const closeInspectorOverlay = async (page: Page) => {
  const inspector = page.getByTestId('inspector-panel')
  await inspector.waitFor({ state: 'visible', timeout: 1200 }).catch(() => {})
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

test('canvas nodes and edges persist after reload', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' })

  const canvas = page.locator('.react-flow__pane')
  await expect(canvas).toBeVisible()

  await dragSidebarTileToCanvas(page, 'sidebar-observation', { x: 80, y: 120 })
  await dragSidebarTileToCanvas(page, 'sidebar-mechanism', { x: 260, y: 120 })

  const observationNode = getNodeByType(page, 'OBSERVATION')
  const mechanismNode = getNodeByType(page, 'MECHANISM')
  await observationNode.waitFor({ state: 'visible' })
  await mechanismNode.waitFor({ state: 'visible' })

  await observationNode.click({ position: { x: 10, y: 10 } })
  await closeInspectorOverlay(page)

  const observationText = 'Observation text persists'
  const mechanismText = 'Mechanism explanation persists'

  await expect(observationNode.locator('textarea')).toBeVisible()
  await observationNode.locator('textarea').fill(observationText)

  await closeInspectorOverlay(page)
  await canvas.click({ position: { x: 12, y: 12 } })
  await closeInspectorOverlay(page)

  await mechanismNode.click({ position: { x: 10, y: 10 } })
  await closeInspectorOverlay(page)
  await expect(mechanismNode.locator('textarea')).toBeVisible()
  await mechanismNode.locator('textarea').fill(mechanismText)

  await closeInspectorOverlay(page)

  await canvas.click({ position: { x: 20, y: 20 } })
  await closeInspectorOverlay(page)
  await expect(mechanismNode.locator('textarea')).toHaveCount(0)

  await page.evaluate(() => {
    const existingStyle = document.querySelector<HTMLStyleElement>('style[data-e2e-disable-minimap="true"]')
    if (existingStyle) return

    const style = document.createElement('style')
    style.setAttribute('data-e2e-disable-minimap', 'true')
    style.textContent = '.react-flow__minimap, .react-flow__minimap * { pointer-events: none !important; }'
    document.head.appendChild(style)
  })

  const sourceHandle = observationNode
    .locator('[data-handlepos="right"][data-handleid*="s-middle"]')
    .first()
  const targetHandle = mechanismNode
    .locator('[data-handlepos="left"][data-handleid*="t-middle"]')
    .first()

  await expect(sourceHandle).toBeVisible()
  await expect(targetHandle).toBeVisible()

  const sourceBox = await sourceHandle.boundingBox()
  const targetBox = await targetHandle.boundingBox()
  if (!sourceBox || !targetBox) throw new Error('Handle bounding box missing')

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 12 })
  await page.mouse.up()

  await expect(page.locator('.react-flow__edge')).toHaveCount(1)

  await waitForPersistedRecordCount(page, 'nodes', 2)
  await waitForPersistedRecordCount(page, 'edges', 1)
  await page.reload()

  await expect(page.locator('div.react-flow__node')).toHaveCount(2)

  const observationAfterReload = getNodeByType(page, 'OBSERVATION')
  const mechanismAfterReload = getNodeByType(page, 'MECHANISM')

  await observationAfterReload.click({ position: { x: 10, y: 10 } })
  await closeInspectorOverlay(page)

  await expect(observationAfterReload.locator('textarea')).toHaveValue(observationText)

  await mechanismAfterReload.click({ position: { x: 10, y: 10 } })
  await closeInspectorOverlay(page)
  await expect(mechanismAfterReload.locator('textarea')).toHaveValue(mechanismText)
  await expect(page.locator('.react-flow__edge')).toHaveCount(1)
})
