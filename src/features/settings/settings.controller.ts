import { Request, Response, NextFunction } from 'express'
import { AppError } from '../../core/errors/AppError'
import { SettingsService } from './settings.service'

// GET /api/settings
export const getSettings = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString() || (req as any).user?.id
    if (!userId) return next(new AppError('Unauthorized', 401))

    const data = await SettingsService.getSettings(userId)

    res.status(200).json({
      success: true,
      data
    })
  } catch (error) {
    next(error)
  }
}

// PATCH /api/settings
export const updateSettings = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString() || (req as any).user?.id
    if (!userId) return next(new AppError('Unauthorized', 401))

    const { theme, notificationsEnabled, language } = req.body

    const data = await SettingsService.updateSettings(userId, { theme, notificationsEnabled, language })

    res.status(200).json({
      success: true,
      data
    })
  } catch (error) {
    next(error)
  }
}

// POST /api/settings/reset
export const resetSettings = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString() || (req as any).user?.id
    if (!userId) return next(new AppError('Unauthorized', 401))

    const data = await SettingsService.resetSettings(userId)

    res.status(200).json({
      success: true,
      data
    })
  } catch (error) {
    next(error)
  }
}

// GET /api/settings/token-budget
export const getTokenBudget = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString() || (req as any).user?.id
    if (!userId) return next(new AppError('Unauthorized', 401))

    const data = await SettingsService.getTokenBudget(userId)

    res.status(200).json({
      success: true,
      data
    })
  } catch (error) {
    next(error)
  }
}
