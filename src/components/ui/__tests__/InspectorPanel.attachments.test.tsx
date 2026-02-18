import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { InspectorAttachments } from '../InspectorAttachments'
import type { NodeFileAttachment } from '@/types/nodes'
import * as fileStorage from '@/lib/file-storage'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultValue?: string) => defaultValue || key,
  }),
}))

vi.mock('@/lib/file-storage', () => ({
  getFileAttachmentBlob: vi.fn(),
}))

describe('InspectorAttachments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders attachment metadata (filename, type, status)', () => {
    const attachments: NodeFileAttachment[] = [
      {
        id: 'file-1',
        name: 'data.pdf',
        mimeType: 'application/pdf',
        size: 1024000,
        uploadedAt: Date.now(),
        processingStatus: 'ready',
        processingError: null,
        textExcerpt: 'Sample PDF text...',
        imageDescription: null,
      },
    ]

    render(<InspectorAttachments attachments={attachments} />)

    expect(screen.getByTestId('attachment-name')).toHaveTextContent('data.pdf')
    expect(screen.getByTestId('attachment-type')).toHaveTextContent('application/pdf')
    expect(screen.getByTestId('attachment-status')).toHaveTextContent('ready')
  })

  it('renders image thumbnail when blob is available', async () => {
    const mockBlob = new Blob(['fake-image'], { type: 'image/png' })
    vi.mocked(fileStorage.getFileAttachmentBlob).mockResolvedValue(mockBlob)

    const attachments: NodeFileAttachment[] = [
      {
        id: 'img-1',
        name: 'photo.png',
        mimeType: 'image/png',
        size: 50000,
        uploadedAt: Date.now(),
        processingStatus: 'ready',
        processingError: null,
        textExcerpt: null,
        imageDescription: 'A photo',
      },
    ]

    render(<InspectorAttachments attachments={attachments} />)

    await waitFor(() => {
      expect(screen.getByTestId('thumbnail-img-1')).toBeInTheDocument()
    })
  })

  it('shows fallback when missing blob', async () => {
    vi.mocked(fileStorage.getFileAttachmentBlob).mockResolvedValue(null)

    const attachments: NodeFileAttachment[] = [
      {
        id: 'missing-1',
        name: 'lost.jpg',
        mimeType: 'image/jpeg',
        size: 10000,
        uploadedAt: Date.now(),
        processingStatus: 'ready',
        processingError: null,
        textExcerpt: null,
        imageDescription: null,
      },
    ]

    render(<InspectorAttachments attachments={attachments} />)

    await waitFor(() => {
      expect(screen.getByTestId('fallback-message')).toBeInTheDocument()
    })
  })

  it('renders PDF excerpt metadata', () => {
    const attachments: NodeFileAttachment[] = [
      {
        id: 'pdf-1',
        name: 'research.pdf',
        mimeType: 'application/pdf',
        size: 2048000,
        uploadedAt: Date.now(),
        processingStatus: 'ready',
        processingError: null,
        textExcerpt: 'This is the extracted text from the PDF document...',
        imageDescription: null,
      },
    ]

    render(<InspectorAttachments attachments={attachments} />)

    expect(screen.getByTestId('pdf-excerpt-pdf-1')).toHaveTextContent(
      'This is the extracted text from the PDF document...'
    )
  })
})
