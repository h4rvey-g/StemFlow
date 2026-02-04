import { expect, test } from '@playwright/test'

test('canvas nodes and edges persist after reload', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' })

  const canvas = page.locator('.react-flow__pane')
  await expect(canvas).toBeVisible()

  const canvasBox = await canvas.boundingBox()
  if (!canvasBox) throw new Error('Unable to find canvas bounding box')

  const observationTile = page.getByTestId('sidebar-observation')
  const mechanismTile = page.getByTestId('sidebar-mechanism')

  await observationTile.dragTo(canvas, { targetPosition: { x: 80, y: 120 } })
  await mechanismTile.dragTo(canvas, { targetPosition: { x: 260, y: 120 } })

  const observationNode = page.locator('div.react-flow__node:has-text("OBSERVATION")').first()
  const mechanismNode = page.locator('div.react-flow__node:has-text("MECHANISM")').first()
  await observationNode.waitFor({ state: 'visible' })
  await mechanismNode.waitFor({ state: 'visible' })

  const observationText = 'Observation text persists'
  const mechanismText = 'Mechanism explanation persists'

  await observationNode.locator('textarea').fill(observationText)
  await mechanismNode.locator('textarea').fill(mechanismText)

  const sourceHandle = observationNode.locator('[data-handlepos="bottom"]')
  const targetHandle = mechanismNode.locator('[data-handlepos="top"]')

  await expect(sourceHandle).toBeVisible()
  await expect(targetHandle).toBeVisible()

  await sourceHandle.dragTo(targetHandle)

  await expect(page.locator('.react-flow__edge')).toHaveCount(1)

  await page.waitForTimeout(800)
  await page.reload()

  await expect(page.locator('div.react-flow__node')).toHaveCount(2)

  const observationAfterReload = page.locator('div.react-flow__node:has-text("OBSERVATION")')
  const mechanismAfterReload = page.locator('div.react-flow__node:has-text("MECHANISM")')

  await expect(observationAfterReload.locator('textarea')).toHaveValue(observationText)
  await expect(mechanismAfterReload.locator('textarea')).toHaveValue(mechanismText)
  await expect(page.locator('.react-flow__edge')).toHaveCount(1)
})
