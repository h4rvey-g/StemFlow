import type { Page } from '@playwright/test'

const CANVAS_SELECTOR = '.react-flow__pane'
const DROP_TARGET_SELECTOR = '.react-flow'

type DragTarget = {
  x: number
  y: number
}

const TILE_TO_NODE_TYPE: Record<string, 'OBSERVATION' | 'MECHANISM' | 'VALIDATION'> = {
  'sidebar-observation': 'OBSERVATION',
  'sidebar-mechanism': 'MECHANISM',
  'sidebar-validation': 'VALIDATION',
}

export async function dragSidebarTileToCanvas(
  page: Page,
  tileTestId: string,
  target: DragTarget,
  canvasSelector = CANVAS_SELECTOR,
  dropTargetSelector = DROP_TARGET_SELECTOR
) {
  const tileSelector = `[data-testid="${tileTestId}"]`
  await page.waitForSelector(tileSelector)
  await page.waitForSelector(canvasSelector)
  await page.waitForSelector(dropTargetSelector)

  await page.evaluate(
    ({ tileSelector, tileTestId, canvasSelector, dropTargetSelector, targetX, targetY }) => {
      const tile = document.querySelector<HTMLElement>(tileSelector)
      const paneTarget = document.querySelector<HTMLElement>(canvasSelector)
      const dropTarget = document.querySelector<HTMLElement>(dropTargetSelector)

      if (!tile || !paneTarget || !dropTarget) {
        throw new Error('Missing drag source or drop target')
      }

      const nodeTypeMap: Record<string, 'OBSERVATION' | 'MECHANISM' | 'VALIDATION'> = {
        'sidebar-observation': 'OBSERVATION',
        'sidebar-mechanism': 'MECHANISM',
        'sidebar-validation': 'VALIDATION',
      }

      const nodeType = nodeTypeMap[tileTestId]
      if (!nodeType) {
        throw new Error(`Unsupported sidebar tile: ${tileTestId}`)
      }

      const dispatchDragEvent = (
        element: HTMLElement,
        type: string,
        clientX: number,
        clientY: number,
        dataTransfer: DataTransfer
      ) => {
        const event = new DragEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX,
          clientY,
          dataTransfer,
        })
        element.dispatchEvent(event)
      }

      const paneRect = paneTarget.getBoundingClientRect()
      const dropX = paneRect.left + targetX
      const dropY = paneRect.top + targetY

      window.dispatchEvent(new CustomEvent('stemflow:sidebar-drag-start', { detail: { nodeType } }))

      const dataTransfer = new DataTransfer()
      dataTransfer.setData('application/reactflow', nodeType)
      dataTransfer.setData('text/plain', nodeType)

      dispatchDragEvent(tile, 'dragstart', paneRect.left + 8, paneRect.top + 8, dataTransfer)
      dispatchDragEvent(paneTarget, 'dragenter', dropX, dropY, dataTransfer)
      dispatchDragEvent(paneTarget, 'dragover', dropX, dropY, dataTransfer)
      dispatchDragEvent(paneTarget, 'drop', dropX, dropY, dataTransfer)
      dispatchDragEvent(tile, 'dragend', dropX, dropY, dataTransfer)

      window.dispatchEvent(new CustomEvent('stemflow:sidebar-drag-end', { detail: { nodeType } }))
    },
    {
      tileSelector,
      tileTestId,
      canvasSelector,
      dropTargetSelector,
      targetX: target.x,
      targetY: target.y,
    }
  )
}
