import { Router } from 'express'
import { protect } from '../../core/middlewares/auth.middleware'
import { validate } from '../../core/middlewares/validate.middleware'
import { checkTokenBudget } from '../../core/middlewares/token-budget.middleware'
import { uploadData } from './upload/upload.controller'
import { getDocumentChatHistory, chatWithDocument, reanalyzeDocument } from './chat/document-chat.controller'
import { getDocumentStatuses, streamDocumentStatuses } from './status/document-status.controller'

// 🛠️ NEW: Import your Zod Schemas
import {
  searchDocumentSchema,
  updateDocumentSchema,
  bulkDeleteSchema,
  bulkUpdateSemanticSchema
} from './document.schema'

import {
  getAllDocuments,
  searchDocuments, // 🛠️ NEW: Don't forget your powerful search controller!
  updateDocument,
  deleteDocument,
  bulkUpdateSemanticPaths,
  bulkDeleteDocuments,
  getDocumentById,
  serveDocumentFile,
  getSuggestedFocus
} from './document.controller'

const router = Router()

// Protect all document routes so only logged-in users can access them
router.use(protect)

// ==========================================
// 🛡️ STATIC ROUTES (Must go BEFORE /:id)
// ==========================================

// Route: POST /api/documents/upload
// Upgraded to handle batch uploads! Expects an array of files under the key 'files' (max 5)
router.post('/upload', checkTokenBudget, uploadData)

// Route: GET /api/documents/suggested-focus
// Returns the top-2 documents ranked by cognitiveLoad + recency + isUnread.
// Must be declared BEFORE /:id so Express doesn't treat 'suggested-focus' as an ID.
router.get('/suggested-focus', getSuggestedFocus)

// Route: GET /api/documents
router.get('/', getAllDocuments)

// 🔍 Route: GET /api/documents/search
// Validates query parameters (q, page, limit)
router.get('/search', validate(searchDocumentSchema), searchDocuments)

// 📡 Route: GET /api/documents/status/stream
// SSE stream endpoint to push real-time document aiStatus changes
router.get('/status/stream', streamDocumentStatuses)

// 📡 Route: GET /api/documents/status
// Lightweight endpoint for polling document aiStatus
router.get('/status', getDocumentStatuses)

// 📁 Route: PUT /api/documents/bulk/semantic-paths
// Validates the array of updates before hitting the DB
router.put('/bulk/semantic-paths', validate(bulkUpdateSemanticSchema), bulkUpdateSemanticPaths)

// 🗑️ Route: DELETE /api/documents/bulk
// Validates the array of IDs before attempting to delete
router.delete('/bulk', validate(bulkDeleteSchema), bulkDeleteDocuments)

// ==========================================
// 🔄 DYNAMIC ROUTES (/:id)
// ==========================================

// Route: GET /api/documents/:id
router.get('/:id', getDocumentById)

// Route: GET /api/documents/:id/file
router.get('/:id/file', serveDocumentFile)

// Route: PUT /api/documents/:id
// Validates the update body (title, tags, cognitiveLoad, etc.)
router.put('/:id', validate(updateDocumentSchema), updateDocument)

// Route: DELETE /api/documents/:id
router.delete('/:id', deleteDocument)

// Route: POST /api/documents/:id/reanalyze
router.post('/:id/reanalyze', checkTokenBudget, reanalyzeDocument)

// ==========================================
// 💬 RAG CHAT ROUTES (Scoped to Document ID)
// ==========================================

// Route: GET /api/documents/:id/chat
router.get('/:id/chat', getDocumentChatHistory)

// Route: POST /api/documents/:id/chat
router.post('/:id/chat', checkTokenBudget, chatWithDocument)

export default router
