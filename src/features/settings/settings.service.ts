import { User } from '../users/user.model'
import { AppError } from '../../core/errors/AppError'
import { TokenBudgetService, MONTHLY_TOKEN_BUDGET } from '../../core/services/token-budget.service'

export interface SettingsUpdateDto {
  theme?: 'light' | 'dark' | 'system'
  notificationsEnabled?: boolean
  language?: string
}

export class SettingsService {
  static async getSettings(userId: string) {
    const user = await User.findById(userId)
    if (!user) throw new AppError('User not found', 404)

    const budgetStatus = await TokenBudgetService.checkBudget(userId)
    const monthlyStatus = await TokenBudgetService.getMonthlyUsage(userId)

    return {
      theme: user.theme || 'system',
      notificationsEnabled: user.notificationsEnabled ?? true,
      language: user.language || 'en',
      aiUsage: {
        tokensUsed: budgetStatus.tokensUsed,
        dailyLimit: budgetStatus.limit,
        remaining: budgetStatus.remaining,
        monthlyUsed: monthlyStatus.tokensUsed,
        monthlyLimit: MONTHLY_TOKEN_BUDGET
      }
    }
  }

  static async updateSettings(userId: string, updateData: SettingsUpdateDto) {
    const user = await User.findById(userId)
    if (!user) throw new AppError('User not found', 404)

    if (updateData.theme !== undefined) user.theme = updateData.theme
    if (updateData.notificationsEnabled !== undefined) user.notificationsEnabled = updateData.notificationsEnabled
    if (updateData.language !== undefined) user.language = updateData.language

    await user.save()

    const budgetStatus = await TokenBudgetService.checkBudget(userId)
    const monthlyStatus = await TokenBudgetService.getMonthlyUsage(userId)

    return {
      theme: user.theme,
      notificationsEnabled: user.notificationsEnabled,
      language: user.language,
      aiUsage: {
        tokensUsed: budgetStatus.tokensUsed,
        dailyLimit: budgetStatus.limit,
        remaining: budgetStatus.remaining,
        monthlyUsed: monthlyStatus.tokensUsed,
        monthlyLimit: MONTHLY_TOKEN_BUDGET
      }
    }
  }

  static async resetSettings(userId: string) {
    const user = await User.findById(userId)
    if (!user) throw new AppError('User not found', 404)

    user.theme = 'system'
    user.notificationsEnabled = true
    user.language = 'en'
    await user.save()

    const budgetStatus = await TokenBudgetService.checkBudget(userId)
    const monthlyStatus = await TokenBudgetService.getMonthlyUsage(userId)

    return {
      theme: user.theme,
      notificationsEnabled: user.notificationsEnabled,
      language: user.language,
      aiUsage: {
        tokensUsed: budgetStatus.tokensUsed,
        dailyLimit: budgetStatus.limit,
        remaining: budgetStatus.remaining,
        monthlyUsed: monthlyStatus.tokensUsed,
        monthlyLimit: MONTHLY_TOKEN_BUDGET
      }
    }
  }

  static async getTokenBudget(userId: string) {
    const budgetStatus = await TokenBudgetService.checkBudget(userId)
    const monthlyStatus = await TokenBudgetService.getMonthlyUsage(userId)

    return {
      dailyUsage: {
        tokensUsed: budgetStatus.tokensUsed,
        dailyLimit: budgetStatus.limit,
        remaining: budgetStatus.remaining,
        resetAt: budgetStatus.resetAt
      },
      monthlyUsage: {
        tokensUsed: monthlyStatus.tokensUsed,
        requestCount: monthlyStatus.requestCount
      }
    }
  }
}
