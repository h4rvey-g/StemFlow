/**
 * SDK Compatibility Test Harness
 * Validates that SDK output shapes are compatible with existing chat schema validation
 * Tests both success and error paths to identify migration risks
 */

import { describe, expect, it } from 'vitest'
import { validateChatResponse } from '@/lib/ai/chat-schemas'
import type { ChatResponse } from '@/types/chat'

describe('SDK Compatibility', () => {
  describe('Answer Mode Response Shape', () => {
    it('validates correct answer response from SDK', () => {
      const sdkResponse: ChatResponse = {
        mode: 'answer',
        answerText: 'This is a valid answer from the SDK',
      }

      const result = validateChatResponse(sdkResponse)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(sdkResponse)
      expect(result.error).toBeUndefined()
    })

    it('rejects answer response with missing answerText', () => {
      const invalidResponse = {
        mode: 'answer',
        // Missing answerText
      }

      const result = validateChatResponse(invalidResponse)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error?.message).toContain('Invalid')
    })

    it('rejects answer response with empty answerText', () => {
      const invalidResponse = {
        mode: 'answer',
        answerText: '',
      }

      const result = validateChatResponse(invalidResponse)

      expect(result.success).toBe(false)
      expect(result.error?.message).toContain('Invalid')
    })

    it('rejects answer response with extra fields', () => {
      const invalidResponse = {
        mode: 'answer',
        answerText: 'Valid answer',
        extraField: 'should not be here',
      }

      const result = validateChatResponse(invalidResponse)

      expect(result.success).toBe(false)
      expect(result.error?.message).toContain('Invalid')
    })
  })

  describe('Proposal Mode Response Shape', () => {
    it('validates correct proposal response from SDK', () => {
      const sdkResponse: ChatResponse = {
        mode: 'proposal',
        proposal: {
          title: 'Improved mechanism',
          content: 'The proposed new content for the node',
          rationale: 'This improves clarity and scientific rigor',
          confidence: 0.85,
        },
      }

      const result = validateChatResponse(sdkResponse)

      expect(result.success).toBe(true)
      expect(result.data).toEqual(sdkResponse)
      expect(result.error).toBeUndefined()
    })

    it('validates proposal response without optional confidence', () => {
      const sdkResponse: ChatResponse = {
        mode: 'proposal',
        proposal: {
          title: 'Improved mechanism',
          content: 'The proposed new content for the node',
          rationale: 'This improves clarity and scientific rigor',
        },
      }

      const result = validateChatResponse(sdkResponse)

      expect(result.success).toBe(true)
      expect(result.data?.mode).toBe('proposal')
    })

    it('rejects proposal response with missing required fields', () => {
      const invalidResponse = {
        mode: 'proposal',
        proposal: {
          title: 'Improved mechanism',
          // Missing content and rationale
        },
      }

      const result = validateChatResponse(invalidResponse)

      expect(result.success).toBe(false)
      expect(result.error?.message).toContain('Invalid')
    })

    it('rejects proposal response with empty title', () => {
      const invalidResponse = {
        mode: 'proposal',
        proposal: {
          title: '',
          content: 'Valid content',
          rationale: 'Valid rationale',
        },
      }

      const result = validateChatResponse(invalidResponse)

      expect(result.success).toBe(false)
      expect(result.error?.message).toContain('Invalid')
    })

    it('rejects proposal response with confidence out of range', () => {
      const invalidResponse = {
        mode: 'proposal',
        proposal: {
          title: 'Improved mechanism',
          content: 'Valid content',
          rationale: 'Valid rationale',
          confidence: 1.5, // Out of range [0, 1]
        },
      }

      const result = validateChatResponse(invalidResponse)

      expect(result.success).toBe(false)
      expect(result.error?.message).toContain('Invalid')
    })

    it('rejects proposal response with extra fields in proposal', () => {
      const invalidResponse = {
        mode: 'proposal',
        proposal: {
          title: 'Improved mechanism',
          content: 'Valid content',
          rationale: 'Valid rationale',
          unknownField: 'should not be here',
        },
      }

      const result = validateChatResponse(invalidResponse)

      expect(result.success).toBe(false)
      expect(result.error?.message).toContain('Invalid')
    })
  })

  describe('Error Shape Compatibility', () => {
    it('rejects response with invalid mode', () => {
      const invalidResponse = {
        mode: 'invalid_mode',
        someData: 'value',
      }

      const result = validateChatResponse(invalidResponse)

      expect(result.success).toBe(false)
      expect(result.error?.message).toContain('Invalid')
    })

    it('rejects completely malformed response', () => {
      const invalidResponse = {
        notAValidField: 'value',
      }

      const result = validateChatResponse(invalidResponse)

      expect(result.success).toBe(false)
      expect(result.error?.message).toContain('Invalid')
    })

    it('rejects null response', () => {
      const result = validateChatResponse(null)

      expect(result.success).toBe(false)
      expect(result.error?.message).toContain('Invalid')
    })

    it('rejects undefined response', () => {
      const result = validateChatResponse(undefined)

      expect(result.success).toBe(false)
      expect(result.error?.message).toContain('Invalid')
    })

    it('provides detailed error information for debugging', () => {
      const invalidResponse = {
        mode: 'answer',
        // Missing answerText
      }

      const result = validateChatResponse(invalidResponse)

      expect(result.success).toBe(false)
      expect(result.error?.issues).toBeDefined()
      expect(Array.isArray(result.error?.issues)).toBe(true)
      if (result.error?.issues) {
        expect(result.error.issues.length).toBeGreaterThan(0)
        expect(result.error.issues[0]).toHaveProperty('path')
        expect(result.error.issues[0]).toHaveProperty('message')
      }
    })
  })

  describe('Migration Risk Visibility', () => {
    it('catches SDK response with wrong mode type (string vs literal)', () => {
      const sdkResponse = {
        mode: 'answer' as const,
        answerText: 'Valid answer',
      }

      const result = validateChatResponse(sdkResponse)
      expect(result.success).toBe(true)
    })

    it('catches SDK response with numeric confidence boundary', () => {
      const sdkResponse: ChatResponse = {
        mode: 'proposal',
        proposal: {
          title: 'Test',
          content: 'Test content',
          rationale: 'Test rationale',
          confidence: 0, // Boundary: minimum valid
        },
      }

      const result = validateChatResponse(sdkResponse)
      expect(result.success).toBe(true)
    })

    it('catches SDK response with maximum confidence boundary', () => {
      const sdkResponse: ChatResponse = {
        mode: 'proposal',
        proposal: {
          title: 'Test',
          content: 'Test content',
          rationale: 'Test rationale',
          confidence: 1, // Boundary: maximum valid
        },
      }

      const result = validateChatResponse(sdkResponse)
      expect(result.success).toBe(true)
    })

    it('validates length constraints for answer text', () => {
      const longAnswer = 'a'.repeat(5001) // Exceeds max 5000
      const sdkResponse = {
        mode: 'answer',
        answerText: longAnswer,
      }

      const result = validateChatResponse(sdkResponse)
      expect(result.success).toBe(false)
      expect(result.error?.message).toContain('Invalid')
    })

    it('validates length constraints for proposal title', () => {
      const longTitle = 'a'.repeat(201) // Exceeds max 200
      const sdkResponse = {
        mode: 'proposal',
        proposal: {
          title: longTitle,
          content: 'Valid content',
          rationale: 'Valid rationale',
        },
      }

      const result = validateChatResponse(sdkResponse)
      expect(result.success).toBe(false)
      expect(result.error?.message).toContain('Invalid')
    })
  })

  describe('Schema Validation Path', () => {
    it('uses validateChatResponse for all SDK outputs', () => {
      // This test documents the validation path that must be used
      const validAnswerResponse: ChatResponse = {
        mode: 'answer',
        answerText: 'Test answer',
      }

      const validProposalResponse: ChatResponse = {
        mode: 'proposal',
        proposal: {
          title: 'Test',
          content: 'Test content',
          rationale: 'Test rationale',
        },
      }

      // Both should validate successfully through the same path
      expect(validateChatResponse(validAnswerResponse).success).toBe(true)
      expect(validateChatResponse(validProposalResponse).success).toBe(true)
    })

    it('returns consistent error structure for all validation failures', () => {
      const testCases = [
        { mode: 'invalid' },
        { mode: 'answer' }, // Missing answerText
        { mode: 'proposal', proposal: {} }, // Missing required fields
        null,
      ]

      for (const testCase of testCases) {
        const result = validateChatResponse(testCase)
        expect(result.success).toBe(false)
        expect(result.error).toBeDefined()
        expect(result.error?.message).toBeDefined()
        expect(typeof result.error?.message).toBe('string')
      }
    })
  })
})
