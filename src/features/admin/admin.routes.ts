import { Router } from 'express'
import { protect } from '../../core/middlewares/auth.middleware'
import { requireAdmin } from '../../core/middlewares/requireAdmin.middleware'
import { adminController } from './admin.controller'
import { paymentController } from '../payments/payment.controller'

const router = Router()

// All admin routes require: valid JWT (protect) + role === 'admin' (requireAdmin)
router.use(protect, requireAdmin)

// GET  /api/admin/stats          → KPI overview
router.get('/stats', adminController.getStats)

// GET  /api/admin/users          → Paginated user list
router.get('/users', adminController.getUsers)

// GET  /api/admin/export/users   → CSV download (must be before /:id routes)
router.get('/export/users', adminController.exportUsers)

// PATCH /api/admin/users/:id/suspend → Suspend / unsuspend a user
router.patch('/users/:id/suspend', adminController.toggleSuspend)

// GET  /api/admin/ai-usage       → AI token consumption analytics
router.get('/ai-usage', adminController.getAIUsage)

// GET  /api/admin/ai-usage/user/:userId → Per-user AI usage history
router.get('/ai-usage/user/:userId', adminController.getUserAIUsage)

// GET  /api/admin/payments            → Paginated payment requests
router.get('/payments', paymentController.getRequests)

// PATCH /api/admin/payments/:id/status → Approve / reject a payment request
router.patch('/payments/:id/status', paymentController.updateStatus)

export default router