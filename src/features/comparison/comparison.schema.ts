import { z } from 'zod'

export const compareDocumentsSchema = z.object({
  body: z.object({
    documentIds: z
      .array(z.string().length(24, 'Invalid Document ID format'))
      .length(2, 'You must provide exactly two document IDs for comparison.')
  })
})
