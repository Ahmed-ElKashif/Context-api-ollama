import { z } from 'zod'

export const registerSchema = z.object({
  body: z.object({
    fullName: z.string().min(5, 'Full Name is required').max(25, 'Name is too long'),
    username: z
      .string()
      .min(5, 'Username must be at least 5 characters')
      .regex(/^[a-zA-Z0-9_]+$/, 'Letters, numbers, and underscores only'),
    email: z.string().email('Invalid email format'),
    password: z
      .string()
      .min(8, 'Master key must be at least 8 characters')
      .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
      .regex(/[0-9]/, 'Must contain at least one number'),
    persona: z.enum(['general', 'professional', 'student', 'developer'])
  })
})

export const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(1, 'Password is required')
  })
})

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email format')
  })
})

export const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(1, 'Token is required'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
      .regex(/[0-9]/, 'Must contain at least one number')
  })
})
