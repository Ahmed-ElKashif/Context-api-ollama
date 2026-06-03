import { Router } from 'express'
import { protect } from '../../core/middlewares/auth.middleware'
import {
  getSettings,
  updateSettings,
  resetSettings,
  getTokenBudget
} from './settings.controller'

const router = Router()

// All routes require authentication
router.use(protect)

router.get('/', getSettings)
router.patch('/', updateSettings)
router.post('/reset', resetSettings)
router.get('/token-budget', getTokenBudget)

export default router
