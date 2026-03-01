/**
 * Zod validation schemas for chat responses
 * Enforces strict validation of AI-generated chat responses
 */

import { z } from 'zod'
import type { ChatResponse, ProposalPayload } from '@/types/chat'

/**
 * Schema for proposal payload
 * Validates content modification proposals from AI
 */
const proposalPayloadSchema = z
  .object({
    title: z.string().min(1, 'Proposal title is required').max(200, 'Title too long'),
    content: z.string().min(1, 'Proposed content is required').max(10000, 'Content exceeds maximum length'),
    rationale: z.string().min(1, 'Rationale is required').max(1000, 'Rationale too long'),
    confidence: z.number().min(0).max(1).nullable().optional(),
    diffSummary: z.string().max(500).nullable().optional(),
  })
  .strict()

const proposalPayloadStructuredSchema = z
  .object({
    title: z.string().min(1, 'Proposal title is required').max(200, 'Title too long'),
    content: z.string().min(1, 'Proposed content is required').max(10000, 'Content exceeds maximum length'),
    rationale: z.string().min(1, 'Rationale is required').max(1000, 'Rationale too long'),
    confidence: z.number().min(0).max(1).nullable(),
    diffSummary: z.string().max(500).nullable(),
  })
  .strict()

/**
 * Schema for answer mode response
 * Validates Q&A responses from AI
 */
const answerResponseSchema = z
  .object({
    mode: z.literal('answer'),
    answerText: z.string().min(1, 'Answer text is required').max(5000, 'Answer too long'),
  })
  .strict()

/**
 * Schema for proposal mode response
 * Validates content modification proposals from AI
 */
const proposalResponseSchema = z
  .object({
    mode: z.literal('proposal'),
    proposal: proposalPayloadSchema,
  })
  .strict()

const chatResponseSchema = z
  .object({
    mode: z.enum(['answer', 'proposal']),
    answerText: z.string().min(1, 'Answer text is required').max(5000, 'Answer too long').optional(),
    proposal: proposalPayloadSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.mode === 'answer') {
      if (typeof value.answerText !== 'string') {
        context.addIssue({
          code: 'custom',
          path: ['answerText'],
          message: 'Answer text is required',
        })
      }

      if (value.proposal !== undefined) {
        context.addIssue({
          code: 'custom',
          path: ['proposal'],
          message: 'Proposal is not allowed in answer mode',
        })
      }

      return
    }

    if (value.proposal === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['proposal'],
        message: 'Proposal payload is required',
      })
    }

    if (value.answerText !== undefined) {
      context.addIssue({
        code: 'custom',
        path: ['answerText'],
        message: 'Answer text is not allowed in proposal mode',
      })
    }
  })

const chatResponseStructuredSchema = z
  .object({
    mode: z.enum(['answer', 'proposal']),
    answerText: z.string().min(1, 'Answer text is required').max(5000, 'Answer too long').nullable(),
    proposal: proposalPayloadStructuredSchema.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.mode === 'answer') {
      if (typeof value.answerText !== 'string') {
        context.addIssue({
          code: 'custom',
          path: ['answerText'],
          message: 'Answer text is required',
        })
      }

      if (value.proposal !== null) {
        context.addIssue({
          code: 'custom',
          path: ['proposal'],
          message: 'Proposal must be null in answer mode',
        })
      }

      return
    }

    if (value.proposal === null) {
      context.addIssue({
        code: 'custom',
        path: ['proposal'],
        message: 'Proposal payload is required',
      })
    }

    if (value.answerText !== null) {
      context.addIssue({
        code: 'custom',
        path: ['answerText'],
        message: 'Answer text must be null in proposal mode',
      })
    }
  })

/**
 * Validation result type
 */
export interface ValidationResult<T> {
  success: boolean
  data?: T
  error?: {
    message: string
    issues?: Array<{
      path: string[]
      message: string
    }>
  }
}

/**
 * Validates a chat response using safeParse
 * Never throws; returns actionable validation result
 *
 * @param data - Unknown data to validate
 * @returns Validation result with success flag and data or error details
 */
export function validateChatResponse(data: unknown): ValidationResult<ChatResponse> {
  const normalizedData =
    data && typeof data === 'object'
      ? (() => {
          const source = data as Record<string, unknown>
          const normalized: Record<string, unknown> = { ...source }

          if (normalized.answerText === null) {
            delete normalized.answerText
          }

          if (normalized.proposal === null) {
            delete normalized.proposal
          }

          if (normalized.proposal && typeof normalized.proposal === 'object') {
            const proposalSource = normalized.proposal as Record<string, unknown>
            normalized.proposal = {
              ...proposalSource,
              confidence: proposalSource.confidence === null ? undefined : proposalSource.confidence,
              diffSummary: proposalSource.diffSummary === null ? undefined : proposalSource.diffSummary,
            }
          }

          return normalized
        })()
      : data

  const result = chatResponseSchema.safeParse(normalizedData)

  if (result.success) {
    const parsed = result.data
    return {
      success: true,
      data:
        parsed.mode === 'answer'
          ? {
              mode: 'answer',
              answerText: parsed.answerText as string,
            }
          : {
              mode: 'proposal',
              proposal: {
                ...(parsed.proposal as ProposalPayload),
                confidence: parsed.proposal?.confidence ?? undefined,
                diffSummary: parsed.proposal?.diffSummary ?? undefined,
              },
            },
    }
  }

  // Format validation errors for user-friendly display
  const issues = result.error.issues.map((issue) => ({
    path: issue.path.map(String),
    message: issue.message,
  }))

  return {
    success: false,
    error: {
      message: `Invalid chat response: ${result.error.issues[0]?.message || 'Unknown validation error'}`,
      issues,
    },
  }
}

// Export schemas for testing
export {
  chatResponseSchema,
  chatResponseStructuredSchema,
  answerResponseSchema,
  proposalResponseSchema,
  proposalPayloadSchema,
  proposalPayloadStructuredSchema,
}
