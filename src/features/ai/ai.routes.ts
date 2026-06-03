import { Router } from 'express'
import { protect } from '../../core/middlewares/auth.middleware'
import { validate } from '../../core/middlewares/validate.middleware'
import { checkTokenBudget } from '../../core/middlewares/token-budget.middleware'
import { aiLogger } from '../../core/middlewares/ai-logger.middleware'
import { synthesizeDocuments } from './ai.controller'
import {
  generateSemanticStructureSchema,
  applySemanticFoldersSchema,
  semanticSearchSchema,
  synthesizeDocumentsSchema
} from './ai.schema'

import { generateSemanticStructure, applySemanticFolders, searchDocuments } from './ai.controller'

const router = Router()

// Protect all AI routes
router.use(protect)

// ==========================================
// 🧠 GLOBAL AI ACTIONS
// ==========================================

// 🧠 Organize Folders — Generate Proposal
router.post(
  '/organize-folder',
  checkTokenBudget,
  aiLogger,
  validate(generateSemanticStructureSchema),
  generateSemanticStructure
)

// 📁 Apply Folders — Physical DB updates (no AI call, no budget needed)
router.put('/apply-folders', validate(applySemanticFoldersSchema), applySemanticFolders)

// 🔍 Semantic Search — Global vector search
router.get(
  '/search',
  checkTokenBudget,
  aiLogger,
  validate(semanticSearchSchema),
  searchDocuments
)

// 🧠 Bulk Synthesis — Combine multiple documents
router.post(
  '/synthesize',
  checkTokenBudget,
  aiLogger,
  validate(synthesizeDocumentsSchema),
  synthesizeDocuments
)

export default router
