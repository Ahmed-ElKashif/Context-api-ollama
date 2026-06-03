import { z } from 'zod'

export const prettifyDocumentSchema = z.object({
  params: z.object({
    documentId: z.string().length(24, 'Invalid Document ID format')
  })
})
