import { z } from 'zod'

export const updateProfileSchema = z.object({
  body: z.object({
    fullName: z.string().min(1, 'Full Name is required').max(50, 'Name is too long').optional(),

    username: z
      .string()
      .min(3, 'Username must be at least 3 characters')
      .regex(/^[a-zA-Z0-9_]+$/, 'Letters, numbers, and underscores only')
      .optional(),

    email: z
      .string()
      .email('Invalid email address')
      .optional(),

    password: z
      .string()
      .min(8, 'Master key must be at least 8 characters')
      .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
      .regex(/[0-9]/, 'Must contain at least one number')
      .optional(),

    currentPassword: z.string().min(1, 'Current master key is required').optional(),

    persona: z.enum(['general', 'professional', 'student', 'developer']).optional(),
    
    lastActiveDocumentId: z.string().optional().nullable(),
    lastActiveComparisonId: z.string().optional().nullable()
  }).superRefine((data, ctx) => {
    if (data.password && !data.currentPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['currentPassword'],
        message: 'Current master key is required to change password'
      })
    }
  })
})
