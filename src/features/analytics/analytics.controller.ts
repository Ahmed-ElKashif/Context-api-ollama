import { Request, Response, NextFunction } from 'express'
import { analyticsService } from './analytics.service'
import { AppError } from '../../core/errors/AppError'

export const analyticsController = {

  /**
   * POST /api/analytics/track
   * Frontend sends custom events (pageviews, feature usage, errors).
   */
  async trackEvent(req: Request, res: Response, next: NextFunction) {
    try {
      const { eventType, route, metadata, errorMessage, errorStack } = req.body
      const sessionId = req.headers['x-session-id'] as string

      if (!eventType || !sessionId) {
        return next(new AppError('eventType and sessionId are required', 400))
      }

      await analyticsService.track({
        eventType,
        userId: req.user?._id?.toString(),
        sessionId,
        route,
        metadata,
        errorMessage,
        errorStack,
        userAgent: req.headers['user-agent'],
        ip: hashIP(req.ip || req.socket.remoteAddress || 'unknown')
      })

      res.status(201).json({ success: true })
    } catch (error) {
      next(error)
    }
  },

  /**
   * GET /api/analytics/top-pages
   * Returns top pages by pageview count (last 30 days).
   */
  async getTopPages(req: Request, res: Response, next: NextFunction) {
    try {
      const limit = parseInt(req.query.limit as string, 10) || 10
      const pages = await analyticsService.getTopPages(limit)
      res.status(200).json({ success: true, data: pages })
    } catch (error) {
      next(error)
    }
  },

  /**
   * GET /api/analytics/feature-usage
   * Returns feature usage stats (last 30 days).
   */
  async getFeatureUsage(req: Request, res: Response, next: NextFunction) {
    try {
      const usage = await analyticsService.getFeatureUsage()
      res.status(200).json({ success: true, data: usage })
    } catch (error) {
      next(error)
    }
  },

  /**
   * GET /api/analytics/errors
   * Returns error summary (last 7 days).
   * Admin-only endpoint.
   */
  async getErrorSummary(req: Request, res: Response, next: NextFunction) {
    try {
      const errors = await analyticsService.getErrorSummary()
      res.status(200).json({ success: true, data: errors })
    } catch (error) {
      next(error)
    }
  }
}

function hashIP(ip: string): string {
  const crypto = require('crypto')
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16)
}