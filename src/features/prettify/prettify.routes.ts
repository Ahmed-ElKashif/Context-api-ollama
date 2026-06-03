import { Router } from 'express'
import { protect } from '../../core/middlewares/auth.middleware'
import { validate } from '../../core/middlewares/validate.middleware'
import { checkTokenBudget } from '../../core/middlewares/token-budget.middleware'
import { aiLogger } from '../../core/middlewares/ai-logger.middleware'
import { prettifyDocumentSchema } from './prettify.schema'
import { prettifyDocument } from './prettify.controller'

const router = Router()

// Protect all Prettify routes
router.use(protect)

router.post(
  '/:documentId',
  checkTokenBudget,
  aiLogger,
  validate(prettifyDocumentSchema),
  prettifyDocument
)

export default router
