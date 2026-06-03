import { Request, Response, NextFunction } from 'express'
import { adminService } from './admin.service'
import { AppError } from '../../core/errors/AppError'

export const adminController = {

  /**
   * GET /api/admin/stats
   */
  async getStats(req: Request, res: Response, next: NextFunction) {
    try {
      const stats = await adminService.getStats()
      res.status(200).json({ success: true, data: stats })
    } catch (error) {
      next(error)
    }
  },

  /**
   * GET /api/admin/users?search=&page=&limit=&sortBy=&sortOrder=
   */
  async getUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const search = String(req.query.search ?? '')
      const page = String(req.query.page ?? '1')
      const limit = String(req.query.limit ?? '10')
      const sortBy = String(req.query.sortBy ?? 'createdAt')
      const sortOrderRaw = String(req.query.sortOrder ?? 'desc')
      const sortOrder = sortOrderRaw === 'asc' ? 'asc' as const : 'desc' as const

      const result = await adminService.getUsers({
        search,
        page: Math.max(1, parseInt(page, 10)),
        limit: Math.min(100, Math.max(1, parseInt(limit, 10))),
        sortBy,
        sortOrder
      })

      res.status(200).json({ success: true, ...result })
    } catch (error) {
      next(error)
    }
  },

  /**
   * PATCH /api/admin/users/:id/suspend
   * Body: { suspend: boolean }
   */
  async toggleSuspend(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params
      const { suspend } = req.body

      if (typeof suspend !== 'boolean') {
        return next(new AppError('suspend field must be a boolean', 400))
      }

      const user = await adminService.toggleSuspend(id as string, suspend)
      res.status(200).json({
        success: true,
        message: `User ${suspend ? 'suspended' : 'unsuspended'} successfully`,
        data: user
      })
    } catch (error: any) {
      next(new AppError(error.message ?? 'Failed to update user', 400))
    }
  },

  /**
   * GET /api/admin/export/users
   * Streams a CSV file download.
   */
  async exportUsers(req: Request, res: Response, next: NextFunction) {
    try {
      const csv = await adminService.exportUsersCSV()
      const filename = `users-export-${Date.now()}.csv`

      res.setHeader('Content-Type', 'text/csv')
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      res.status(200).send(csv)
    } catch (error) {
      next(error)
    }
  },

  /**
   * GET /api/admin/ai-usage
   * Returns AI token consumption analytics (this month + top users + daily chart data).
   */
  async getAIUsage(req: Request, res: Response, next: NextFunction) {
    try {
      const usage = await adminService.getAIUsage()
      res.status(200).json({ success: true, data: usage })
    } catch (error) {
      next(error)
    }
  },

  /**
   * GET /api/admin/ai-usage/user/:userId
   * Returns AI usage history for a specific user (last 30 days).
   */
  async getUserAIUsage(req: Request, res: Response, next: NextFunction) {
    try {
      const { userId } = req.params
      const usage = await adminService.getUserAIUsage(userId as string)
      res.status(200).json({ success: true, data: usage })
    } catch (error) {
      next(error)
    }
  }
}