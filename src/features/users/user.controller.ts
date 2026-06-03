import { Request, Response, NextFunction } from 'express'
import { UserService } from './user.service'
import { AppError } from '../../core/errors/AppError'
import { configureCloudinary } from '../../config/cloudinary'
import { User } from './user.model'
// NEW: Import the TokenBudgetService
import { TokenBudgetService } from '../../core/services/token-budget.service'

const extractCloudinaryPublicIdFromUrl = (url?: string): string | null => {
  if (!url) return null
  try {
    const parsed = new URL(url)
    const uploadIdx = parsed.pathname.indexOf('/upload/')
    if (uploadIdx === -1) return null

    let afterUpload = parsed.pathname.slice(uploadIdx + '/upload/'.length)
    afterUpload = afterUpload.replace(/^v\d+\//, '')

    const withoutExt = afterUpload.replace(/\.[^/.]+$/, '')
    return withoutExt || null
  } catch {
    return null
  }
}

export const getUserProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString() || (req as any).user?.id
    if (!userId) return next(new AppError('Unauthorized', 401))

    const user = await UserService.getProfileById(userId)

    if (!user) {
      return next(new AppError('User not found', 404))
    }

    res.status(200).json({
      success: true,
      data: {
        id: user._id,
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        avatar: (user as any).avatar,
        persona: user.persona,
        lastActiveDocumentId: (user as any).lastActiveDocumentId,
        lastActiveComparisonId: (user as any).lastActiveComparisonId,
        planId: user.planId || 'sandbox',
        billingCycle: user.billingCycle || 'monthly',
        hasCompletedTour: (user as any).hasCompletedTour ?? false,
        hasCompletedPopulatedTour: (user as any).hasCompletedPopulatedTour ?? false,
        hasCompletedLibraryTour: (user as any).hasCompletedLibraryTour ?? false,
        hasCompletedComparisonTour: (user as any).hasCompletedComparisonTour ?? false,
        createdAt: user.createdAt
      }
    })
  } catch (error) {
    next(error)
  }
}

export const updateUserProfile = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString() || (req as any).user?.id
    if (!userId) return next(new AppError('Unauthorized', 401))

    const result = await UserService.updateProfile(userId, req.body)

    if (result.error) {
      return next(new AppError(result.error.message, result.error.statusCode))
    }

    res.status(200).json({
      success: true,
      data: {
        id: result.user?._id,
        fullName: result.user?.fullName,
        username: result.user?.username,
        email: result.user?.email,
        avatar: result.user?.avatar,
        persona: result.user?.persona,
        lastActiveDocumentId: (result.user as any)?.lastActiveDocumentId,
        lastActiveComparisonId: (result.user as any)?.lastActiveComparisonId,
        planId: result.user?.planId || 'sandbox',
        billingCycle: result.user?.billingCycle || 'monthly',
        hasCompletedTour: (result.user as any)?.hasCompletedTour ?? false,
        hasCompletedPopulatedTour: (result.user as any)?.hasCompletedPopulatedTour ?? false,
        hasCompletedLibraryTour: (result.user as any)?.hasCompletedLibraryTour ?? false,
        hasCompletedComparisonTour: (result.user as any)?.hasCompletedComparisonTour ?? false,
        createdAt: result.user?.createdAt
      }
    })
  } catch (error) {
    next(error)
  }
}

export const uploadUserAvatar = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString() || (req as any).user?.id
    if (!userId) return next(new AppError('Unauthorized', 401))

    if (!req.file || !req.file.buffer) {
      return next(new AppError('No file uploaded', 400))
    }

    const cloudinary = configureCloudinary()

    const user = await User.findById(userId)
    if (!user) return next(new AppError('User not found', 404))

    const dataUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`
    const uploadResult: any = await cloudinary.uploader.upload(dataUri, {
      folder: 'avatars',
      resource_type: 'image'
    })

    const previousPublicId =
      user.avatarPublicId || extractCloudinaryPublicIdFromUrl(user.avatar)

    user.avatar = uploadResult.secure_url
    user.avatarPublicId = uploadResult.public_id
    await user.save()

    if (previousPublicId && previousPublicId !== uploadResult.public_id) {
      try {
        await cloudinary.uploader.destroy(previousPublicId, { resource_type: 'image' })
      } catch {
        // Intentionally ignored to avoid breaking avatar update flow.
      }
    }

    res.status(200).json({
      success: true, data: {
        id: user._id,
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        persona: user.persona,
        lastActiveDocumentId: (user as any).lastActiveDocumentId,
        lastActiveComparisonId: (user as any).lastActiveComparisonId,
        planId: user.planId || 'sandbox',
        billingCycle: user.billingCycle || 'monthly',
        createdAt: user.createdAt
      }
    })
  } catch (error) {
    next(error)
  }
}

// ─── NEW METHOD: Get Settings + Token Usage ─────────────────────────────────

export const getUserSettings = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString() || (req as any).user?.id
    if (!userId) return next(new AppError('Unauthorized', 401))

    const user = await User.findById(userId)
    if (!user) {
      return next(new AppError('User not found', 404))
    }

    // Fetch today's token consumption
    const budgetStatus = await TokenBudgetService.checkBudget(userId)

    res.status(200).json({
      success: true,
      data: {
        // Note: I used (user as any) here just in case theme/notifications 
        // aren't formally added to your TS User interface yet.
        theme: (user as any).theme || 'system',
        notificationsEnabled: (user as any).notificationsEnabled ?? true,
        language: (user as any).language || 'en',
        aiUsage: {
          tokensUsed: budgetStatus.tokensUsed,
          dailyLimit: budgetStatus.limit,
          remaining: budgetStatus.remaining
        }
      }
    })
  } catch (error) {
    next(error)
  }
}