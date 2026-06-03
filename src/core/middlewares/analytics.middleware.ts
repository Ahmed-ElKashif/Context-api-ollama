import { Request, Response, NextFunction } from 'express'
import { analyticsService } from '../../features/analytics/analytics.service'

/**
 * Analytics middleware — tracks every API request.
 * Attach AFTER auth middleware so req.user is available.
 * 
 * Usage in app.ts:
 *   app.use(analyticsMiddleware)
 */
export const analyticsMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const startTime = Date.now()

  // Extract session ID from headers (set by frontend useAnalytics hook)
  const sessionId = req.headers['x-session-id'] as string || 'unknown'

  // Capture response details after the request completes
  res.on('finish', async () => {
    const duration = Date.now() - startTime

    try {
      await analyticsService.track({
        eventType: 'api_request',
        userId: req.user?._id?.toString(),
        sessionId,
        route: req.path,
        method: req.method,
        statusCode: res.statusCode,
        duration,
        userAgent: req.headers['user-agent'],
        ip: hashIP(req.ip || req.socket.remoteAddress || 'unknown')
      })
    } catch (error) {
      // Fail silently — analytics should never break the app
      console.error('[Analytics] Failed to track API request:', error)
    }
  })

  next()
}

/**
 * Simple IP hashing for privacy compliance.
 * Stores a one-way hash instead of raw IPs.
 */
function hashIP(ip: string): string {
  const crypto = require('crypto')
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16)
}