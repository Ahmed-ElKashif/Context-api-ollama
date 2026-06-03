import { Request, Response, NextFunction } from 'express'
import { AppError } from '../errors/AppError'

/**
 * requireAdmin middleware
 * Must be used AFTER protect middleware (which attaches req.user).
 * Blocks anyone whose role is not 'admin'.
 *
 * Usage in routes:
 *   router.get('/stats', protect, requireAdmin, adminController.getStats)
 */
export const requireAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user || req.user.role !== 'admin') {
    return next(new AppError('You do not have permission to perform this action.', 403))
  }
  next()
}