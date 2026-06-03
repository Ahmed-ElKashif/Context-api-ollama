import { Router } from 'express'
import {
  compareDocuments,
  getComparisonChatHistory,
  chatWithComparison,
  getComparisonHistory,
  getComparisonRecordById,
  saveComparisonRecord,
  updateComparisonRecord,
  deleteComparisonRecord
} from './comparison.controller'
import { protect } from '../../core/middlewares/auth.middleware'
import { validate } from '../../core/middlewares/validate.middleware'
import { checkTokenBudget } from '../../core/middlewares/token-budget.middleware'
import { aiLogger } from '../../core/middlewares/ai-logger.middleware'
import { compareDocumentsSchema } from './comparison.schema'

const router = Router()

// 🛡️ All comparison routes require authentication
router.use(protect)

// 🧠 Deep Comparison — DeepThinkerService
router.post(
  '/compare',
  checkTokenBudget,
  aiLogger,
  validate(compareDocumentsSchema),
  compareDocuments
)

// ==========================================
// 📚 HISTORY ROUTES
// ==========================================
router.route('/history')
  .get(getComparisonHistory)
  .post(saveComparisonRecord)

router.route('/history/:id')
  .get(getComparisonRecordById)
  .patch(updateComparisonRecord)
  .delete(deleteComparisonRecord)


// ==========================================
// 💬 DUAL-DOCUMENT RAG CHAT ROUTES
// ==========================================

// 📜 Get Chat History for a specific document pair
router.get('/:docIdA/:docIdB/chat', getComparisonChatHistory)

// 🤖 Chat with Comparison (Dual-Document RAG)
// Note: We apply checkTokenBudget here because this triggers an LLM inference
router.post('/:docIdA/:docIdB/chat', checkTokenBudget, chatWithComparison)

export default router
