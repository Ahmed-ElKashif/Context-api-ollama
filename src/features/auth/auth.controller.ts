import { Request, Response, NextFunction } from 'express'
import { AuthService } from './auth.service'
import { AppError } from '../../core/errors/AppError'
import { COOKIE_NAME } from '../../core/middlewares/auth.middleware'
import { User } from '../users/user.model'

import { CookieOptions } from 'express'

const COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  path: '/'
}

export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const payload = { ...req.body, passwordHash: req.body.password }

    const result = await AuthService.registerUser(payload)

    if (result.error) {
      return next(new AppError(result.error.message, result.error.statusCode))
    }
    res.cookie(COOKIE_NAME, result.token!, COOKIE_OPTIONS)

    res.status(201).json({
      success: true,
      token: result.token,
      user: {
        id: result.user?._id,
        fullName: result.user?.fullName,
        username: result.user?.username,
        email: result.user?.email,
        persona: result.user?.persona,
        avatar: (result.user as any)?.avatar,
        role: result.user?.role ?? 'user',   // ← added
        lastActiveDocumentId: (result.user as any)?.lastActiveDocumentId,
        lastActiveComparisonId: (result.user as any)?.lastActiveComparisonId,
        hasCompletedTour: (result.user as any)?.hasCompletedTour ?? false,
        hasCompletedPopulatedTour: (result.user as any)?.hasCompletedPopulatedTour ?? false,
        hasCompletedLibraryTour: (result.user as any)?.hasCompletedLibraryTour ?? false,
        hasCompletedComparisonTour: (result.user as any)?.hasCompletedComparisonTour ?? false,
      }
    })
  } catch (error) {
    next(error)
  }
}

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email, password } = req.body

    const result = await AuthService.loginUser(email, password)

    if (result.error) {
      return next(new AppError(result.error.message, result.error.statusCode))
    }
    res.cookie(COOKIE_NAME, result.token!, COOKIE_OPTIONS)

    res.status(200).json({
      success: true,
      token: result.token,
      user: {
        id: result.user?._id,
        fullName: result.user?.fullName,
        username: result.user?.username,
        email: result.user?.email,
        persona: result.user?.persona,
        avatar: (result.user as any)?.avatar,
        role: result.user?.role ?? 'user',   // ← added
        lastActiveDocumentId: (result.user as any)?.lastActiveDocumentId,
        lastActiveComparisonId: (result.user as any)?.lastActiveComparisonId,
        hasCompletedTour: (result.user as any)?.hasCompletedTour ?? false,
        hasCompletedPopulatedTour: (result.user as any)?.hasCompletedPopulatedTour ?? false,
        hasCompletedLibraryTour: (result.user as any)?.hasCompletedLibraryTour ?? false,
        hasCompletedComparisonTour: (result.user as any)?.hasCompletedComparisonTour ?? false,
      }
    })
  } catch (error) {
    next(error)
  }
}

export const forgotPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { email } = req.body
    const result = await AuthService.forgotPassword(email)
    if (result.error) {
      return next(new AppError(result.error.message, result.error.statusCode))
    }
    res.status(200).json({ success: true, message: 'Password reset link sent to your email.' })
  } catch (error) {
    next(error)
  }
}

export const resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { token, password } = req.body
    const result = await AuthService.resetPassword(token, password)

    if (result.error) {
      return next(new AppError(result.error.message, result.error.statusCode))
    }

    res.status(200).json({ success: true, message: 'Password reset successful. You can now login.' })
  } catch (error) {
    next(error)
  }
}

export const logout = async (req: Request, res: Response): Promise<void> => {
  // Global logout: increment tokenVersion to burn all existing JWTs for this user
  if (req.user) {
    req.user.tokenVersion = (req.user.tokenVersion || 0) + 1
    await req.user.save()
  }
  
  res.clearCookie(COOKIE_NAME, { 
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax'
  })
  res.status(200).json({ success: true, message: 'Logged out.' })
}

export const getMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = req.user!
    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        persona: user.persona,
        avatar: (user as any)?.avatar,
        role: user.role,
        planId: user.planId || 'sandbox',
        billingCycle: user.billingCycle || 'monthly',
        lastActiveDocumentId: (user as any)?.lastActiveDocumentId,
        lastActiveComparisonId: (user as any)?.lastActiveComparisonId,
        hasCompletedTour: (user as any)?.hasCompletedTour ?? false,
        hasCompletedPopulatedTour: (user as any)?.hasCompletedPopulatedTour ?? false,
        hasCompletedLibraryTour: (user as any)?.hasCompletedLibraryTour ?? false,
        hasCompletedComparisonTour: (user as any)?.hasCompletedComparisonTour ?? false,
      }
    })
  } catch (error) {
    next(error)
  }
}
