import { Router } from 'express'
import { protect } from '../../core/middlewares/auth.middleware'
import { requireAdmin } from '../../core/middlewares/requireAdmin.middleware'
import { analyticsController } from './analytics.controller'

const router = Router()

// Public tracking endpoint (no auth required — used by pre-login pageviews)
router.post('/track', analyticsController.trackEvent)

// Protected analytics endpoints (require authentication)
router.use(protect)
router.get('/top-pages', analyticsController.getTopPages)
router.get('/feature-usage', analyticsController.getFeatureUsage)

// Admin-only analytics
router.get('/errors', requireAdmin, analyticsController.getErrorSummary)

export default router