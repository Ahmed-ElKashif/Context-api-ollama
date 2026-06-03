import { Router } from 'express'
import { protect } from '../../core/middlewares/auth.middleware'
import { validate } from '../../core/middlewares/validate.middleware'
import { checkTokenBudget } from '../../core/middlewares/token-budget.middleware'
import { aiLogger } from '../../core/middlewares/ai-logger.middleware'

import { createFolderSchema, updateFolderSchema } from './folder.schema'

import {
  createFolder,
  getFolderContents,
  renameFolder,
  deleteFolder,
  getFolderTree,
  proposeSemanticFolders,
  downloadFolderZip // 📦 NEW: Import the ZIP export controller
} from './folder.controller'

const router = Router()

// 🛡️ Apply authentication to all folder routes
router.use(protect)

// ==========================================
// 🛡️ STATIC ROUTES (Must go BEFORE /:id)
// ==========================================

// 📁 Create a folder (Validated)
router.post('/', validate(createFolderSchema), createFolder)

// 🤖 Propose semantic folder tree for ALL user documents (AI)
router.post('/propose', checkTokenBudget, aiLogger, proposeSemanticFolders)

// 🌳 Global Tree
router.get('/tree', getFolderTree)

// 🔍 Fetch Root directory
router.get('/', getFolderContents)

// ==========================================
// 🔄 DYNAMIC ROUTES (/:id or /:folderId)
// ==========================================

// 📦 Export a folder (and all contents) to a ZIP file
router.get('/:id/download', downloadFolderZip)

// ✏️ Rename a folder (Validated)
router.put('/:id/rename', validate(updateFolderSchema), renameFolder)

// 🗑️ Delete a folder
router.delete('/:id', deleteFolder)

// 🔍 Fetch a specific Sub-folder
router.get('/:folderId', getFolderContents)

export default router
