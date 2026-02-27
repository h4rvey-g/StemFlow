/**
 * Zod validation schemas for chat responses
 * Enforces strict validation of AI-generated chat responses
 */

import { z } from 'zod'
import type { ChatResponse } from '@/types/chat'

/**
 * Schema for proposal payload
 * Validates content modification proposals from AI
 */
const proposalPayloadSchema = z
  .object({
    title: z.string().min(1, 'Proposal title is required').max(200, 'Title too long'),
    content: z.string().min(1, 'Proposed content is required').max(10000, 'Content exceeds maximum length'),
    rationale: z.string().min(1, 'Rationale is required').max(1000, 'Rationale too long'),
    confidence: z.number().min(0).max(1).optional(),
    diffSummary: z.string().max(500).optional(),
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

/**
 * Combined schema for all chat responses
 * Discriminated union: either answer or proposal mode
 */
const chatResponseSchema = z.union([answerResponseSchema, proposalResponseSchema])

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
  const result = chatResponseSchema.safeParse(data)

  if (result.success) {
    return {
      success: true,
      data: result.data,
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
export { chatResponseSchema, answerResponseSchema, proposalResponseSchema, proposalPayloadSchema }
