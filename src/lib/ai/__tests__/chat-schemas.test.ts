import { describe, expect, it } from 'vitest'
import { validateChatResponse, chatResponseSchema, answerResponseSchema, proposalResponseSchema } from '@/lib/ai/chat-schemas'
import type { ChatResponse } from '@/types/chat'

describe('chat schemas', () => {
  describe('validateChatResponse', () => {
    describe('valid answer responses', () => {
      it('accepts valid answer mode response', () => {
        const data = {
          mode: 'answer',
          answerText: 'This is a helpful answer to your question.',
        }
        const result = validateChatResponse(data)
        expect(result.success).toBe(true)
        expect(result.data).toEqual(data)
        expect(result.error).toBeUndefined()
      })

      it('accepts answer with long text', () => {
        const longText = 'A'.repeat(5000)
        const data = {
          mode: 'answer',
          answerText: longText,
        }
        const result = validateChatResponse(data)
        expect(result.success).toBe(true)
      })

      it('rejects answer with empty text', () => {
        const data = {
          mode: 'answer',
          answerText: '',
        }
        const result = validateChatResponse(data)
        expect(result.success).toBe(false)
        expect(result.error?.message).toContain('Answer text is required')
      })

      it('rejects answer exceeding max length', () => {
        const tooLongText = 'A'.repeat(5001)
        const data = {
          mode: 'answer',
          answerText: tooLongText,
        }
        const result = validateChatResponse(data)
        expect(result.success).toBe(false)
        expect(result.error?.message).toContain('Answer too long')
      })
    })

    describe('valid proposal responses', () => {
      it('accepts valid proposal mode response', () => {
        const data = {
          mode: 'proposal',
          proposal: {
            title: 'Improved mechanism description',
            content: 'The mechanism works by...',
            rationale: 'This provides better clarity',
            confidence: 0.85,
            diffSummary: 'Added 2 sentences for clarity',
          },
        }
        const result = validateChatResponse(data)
        expect(result.success).toBe(true)
        expect(result.data).toEqual(data)
      })

      it('accepts proposal without optional fields', () => {
        const data = {
          mode: 'proposal',
          proposal: {
            title: 'Updated content',
            content: 'New content here',
            rationale: 'Better explanation',
          },
        }
        const result = validateChatResponse(data)
        expect(result.success).toBe(true)
      })

      it('rejects proposal with empty title', () => {
        const data = {
          mode: 'proposal',
          proposal: {
            title: '',
            content: 'New content',
            rationale: 'Reason',
          },
        }
        const result = validateChatResponse(data)
        expect(result.success).toBe(false)
        expect(result.error?.message).toContain('Proposal title is required')
      })

      it('rejects proposal with empty content', () => {
        const data = {
          mode: 'proposal',
          proposal: {
            title: 'Title',
            content: '',
            rationale: 'Reason',
          },
        }
        const result = validateChatResponse(data)
        expect(result.success).toBe(false)
        expect(result.error?.message).toContain('Proposed content is required')
      })

      it('rejects proposal with empty rationale', () => {
        const data = {
          mode: 'proposal',
          proposal: {
            title: 'Title',
            content: 'Content',
            rationale: '',
          },
        }
        const result = validateChatResponse(data)
        expect(result.success).toBe(false)
        expect(result.error?.message).toContain('Rationale is required')
      })

      it('rejects proposal with invalid confidence', () => {
        const data = {
          mode: 'proposal',
          proposal: {
            title: 'Title',
            content: 'Content',
            rationale: 'Reason',
            confidence: 1.5,
          },
        }
        const result = validateChatResponse(data)
        expect(result.success).toBe(false)
      })

      it('rejects proposal exceeding content max length', () => {
        const tooLongContent = 'A'.repeat(10001)
        const data = {
          mode: 'proposal',
          proposal: {
            title: 'Title',
            content: tooLongContent,
            rationale: 'Reason',
          },
        }
        const result = validateChatResponse(data)
        expect(result.success).toBe(false)
        expect(result.error?.message).toContain('Content exceeds maximum length')
      })

      it('rejects proposal with extra fields (strict mode)', () => {
        const data = {
          mode: 'proposal',
          proposal: {
            title: 'Title',
            content: 'Content',
            rationale: 'Reason',
            extraField: 'should not be here',
          },
        }
        const result = validateChatResponse(data)
        expect(result.success).toBe(false)
      })
    })

    describe('invalid responses', () => {
      it('rejects response with invalid mode', () => {
        const data = {
          mode: 'invalid',
          answerText: 'Some text',
        }
        const result = validateChatResponse(data)
        expect(result.success).toBe(false)
      })

      it('rejects response missing mode', () => {
        const data = {
          answerText: 'Some text',
        }
        const result = validateChatResponse(data)
        expect(result.success).toBe(false)
      })

      it('rejects response with extra top-level fields (strict mode)', () => {
        const data = {
          mode: 'answer',
          answerText: 'Text',
          extraField: 'not allowed',
        }
        const result = validateChatResponse(data)
        expect(result.success).toBe(false)
      })

      it('rejects null input', () => {
        const result = validateChatResponse(null)
        expect(result.success).toBe(false)
      })

      it('rejects undefined input', () => {
        const result = validateChatResponse(undefined)
        expect(result.success).toBe(false)
      })

      it('rejects string input', () => {
        const result = validateChatResponse('not an object')
        expect(result.success).toBe(false)
      })

      it('rejects array input', () => {
        const result = validateChatResponse([])
        expect(result.success).toBe(false)
      })
    })

    describe('error details', () => {
      it('includes detailed error information', () => {
        const data = {
          mode: 'answer',
          answerText: '',
        }
        const result = validateChatResponse(data)
        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()
        expect(result.error?.message).toBeDefined()
        expect(result.error?.issues).toBeDefined()
        expect(Array.isArray(result.error?.issues)).toBe(true)
      })

      it('includes path information in error issues', () => {
        const data = {
          mode: 'proposal',
          proposal: {
            title: '',
            content: 'Content',
            rationale: 'Reason',
          },
        }
        const result = validateChatResponse(data)
        expect(result.success).toBe(false)
        expect(result.error?.issues).toBeDefined()
        expect(result.error?.issues?.length).toBeGreaterThan(0)
        expect(result.error?.issues?.[0]?.path).toBeDefined()
      })
    })

    describe('edge cases', () => {
      it('accepts proposal with confidence at boundaries', () => {
        const data0 = {
          mode: 'proposal',
          proposal: {
            title: 'Title',
            content: 'Content',
            rationale: 'Reason',
            confidence: 0,
          },
        }
        expect(validateChatResponse(data0).success).toBe(true)

        const data1 = {
          mode: 'proposal',
          proposal: {
            title: 'Title',
            content: 'Content',
            rationale: 'Reason',
            confidence: 1,
          },
        }
        expect(validateChatResponse(data1).success).toBe(true)
      })

      it('accepts proposal with max length content', () => {
        const maxContent = 'A'.repeat(10000)
        const data = {
          mode: 'proposal',
          proposal: {
            title: 'Title',
            content: maxContent,
            rationale: 'Reason',
          },
        }
        expect(validateChatResponse(data).success).toBe(true)
      })

      it('accepts proposal with max length title', () => {
        const maxTitle = 'A'.repeat(200)
        const data = {
          mode: 'proposal',
          proposal: {
            title: maxTitle,
            content: 'Content',
            rationale: 'Reason',
          },
        }
        expect(validateChatResponse(data).success).toBe(true)
      })

      it('rejects proposal with title exceeding max', () => {
        const tooLongTitle = 'A'.repeat(201)
        const data = {
          mode: 'proposal',
          proposal: {
            title: tooLongTitle,
            content: 'Content',
            rationale: 'Reason',
          },
        }
        expect(validateChatResponse(data).success).toBe(false)
      })
    })
  })

  describe('schema exports', () => {
    it('exports chatResponseSchema', () => {
      expect(chatResponseSchema).toBeDefined()
      const result = chatResponseSchema.safeParse({
        mode: 'answer',
        answerText: 'test',
      })
      expect(result.success).toBe(true)
    })

    it('exports answerResponseSchema', () => {
      expect(answerResponseSchema).toBeDefined()
      const result = answerResponseSchema.safeParse({
        mode: 'answer',
        answerText: 'test',
      })
      expect(result.success).toBe(true)
    })

    it('exports proposalResponseSchema', () => {
      expect(proposalResponseSchema).toBeDefined()
      const result = proposalResponseSchema.safeParse({
        mode: 'proposal',
        proposal: {
          title: 'Title',
          content: 'Content',
          rationale: 'Reason',
        },
      })
      expect(result.success).toBe(true)
    })
  })
})
