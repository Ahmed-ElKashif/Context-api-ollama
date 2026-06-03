import { z } from 'zod'

// 🔍 Validate Search Query Params
export const searchDocumentSchema = z.object({
  query: z.object({
    q: z.string().min(1, 'Search query is required'),
    page: z.string().optional().transform(Number),
    limit: z.string().optional().transform(Number)
  })
})

// 📝 Validate Single Document Updates
export const updateDocumentSchema = z.object({
  body: z.object({
    title: z.string().optional(),
    tags: z.array(z.string()).optional(),
    cognitiveLoad: z.enum(['Light', 'Medium', 'Heavy']).optional(),
    semanticPath: z.string().optional(),
    originalClientPath: z.string().optional()
  })
})

// 🗑️ Validate Bulk Deletes
export const bulkDeleteSchema = z.object({
  body: z.object({
    ids: z
      .array(z.string().length(24, 'Invalid MongoDB ID format'))
      .min(1, 'Must provide at least one ID to delete')
  })
})

// 📁 Validate Bulk Semantic Path Updates (Accept Organization)
export const bulkUpdateSemanticSchema = z.object({
  body: z.object({
    updates: z
      .array(
        z.object({
          documentId: z.string().length(24, 'Invalid Document ID format'),
          newPath: z.string().min(1, 'Path cannot be empty')
        })
      )
      .min(1, 'Must provide at least one update')
  })
})
