import { z } from 'zod'

// 💬 Validate AI Chat Input
export const askAISchema = z.object({
  body: z.object({
    documentId: z.string().length(24, 'Invalid Document ID format'),
    message: z.string().min(1, 'Message cannot be empty')
  })
})

// 🧠 Validate Semantic Folder Generation (The AI Proposal)
export const generateSemanticStructureSchema = z.object({
  body: z
    .object({
      documents: z
        .array(
          z.object({
            _id: z.string().optional(), // Allow _id or id
            id: z.string().optional(),
            // 🛠️ THE FIX: Use .min(1) to ensure it exists AND isn't an empty string
            title: z.string().min(1, 'Each document must have a title for the AI to analyze')
          })
        )
        .optional(),
      folderIds: z.array(z.string()).optional()
    })
    .refine(
      (data) =>
        (data.documents && data.documents.length > 0) ||
        (data.folderIds && data.folderIds.length > 0),
      {
        message: 'Must provide at least one document or folder to organize'
      }
    )
})

// 📁 Validate Applying Physical Folders (The Final Boss)
export const applySemanticFoldersSchema = z.object({
  body: z.object({
    updates: z
      .array(
        z.object({
          documentId: z.string().length(24, 'Invalid Document ID format'),
          newPath: z.string().min(1, 'Path cannot be empty')
        })
      )
      .min(1, 'Must provide at least one path update')
  })
})

// 🔍 Validate URL Params for Chat History
export const chatHistoryParamsSchema = z.object({
  params: z.object({
    documentId: z.string().length(24, 'Invalid Document ID format in URL')
  })
})

// 🔍 Validate URL Params for Chat History
export const semanticSearchSchema = z.object({
  query: z.object({
    q: z.string({ required_error: 'Search query string (q) is required' }).min(2)
  })
})

export const synthesizeDocumentsSchema = z.object({
  body: z.object({
    documentIds: z.array(z.string()).optional(),
    folderIds: z.array(z.string()).optional()
  }).refine(data => (data.documentIds && data.documentIds.length > 0) || (data.folderIds && data.folderIds.length > 0), {
    message: 'You must provide at least one document or folder to analyze.'
  })
})
