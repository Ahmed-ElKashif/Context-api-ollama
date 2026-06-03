import { z } from 'zod'

// 📁 Validate Folder Creation
export const createFolderSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Folder name cannot be empty').max(255, 'Folder name is too long'),
    // parentFolder can be a valid MongoID, null (for root), or just omitted entirely
    parentFolder: z.string().length(24, 'Invalid Parent Folder ID format').nullable().optional()
  })
})

// ✏️ Validate Folder Updates (Renaming or Moving)
export const updateFolderSchema = z.object({
  body: z.object({
    name: z
      .string()
      .min(1, 'Folder name cannot be empty')
      .max(255, 'Folder name is too long')
      .optional(),
    parentFolder: z.string().length(24, 'Invalid Parent Folder ID format').nullable().optional()
  })
})
