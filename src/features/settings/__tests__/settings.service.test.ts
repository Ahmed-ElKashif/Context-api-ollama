import { SettingsService } from '../settings.service'
import { User } from '../../users/user.model'
import { TokenBudgetService } from '../../../core/services/token-budget.service'

jest.mock('../../users/user.model', () => ({
  User: {
    findById: jest.fn()
  }
}))

jest.mock('../../../core/services/token-budget.service', () => ({
  TokenBudgetService: {
    checkBudget: jest.fn(),
    getMonthlyUsage: jest.fn()
  },
  MONTHLY_TOKEN_BUDGET: 5000000
}))

describe('SettingsService', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('getSettings()', () => {
    it('throws 404 if user not found', async () => {
      ;(User.findById as jest.Mock).mockResolvedValueOnce(null)
      await expect(SettingsService.getSettings('user1')).rejects.toThrow('User not found')
    })

    it('returns settings and AI usage', async () => {
      const mockUser = { theme: 'dark', notificationsEnabled: false, language: 'es' }
      ;(User.findById as jest.Mock).mockResolvedValueOnce(mockUser)
      
      ;(TokenBudgetService.checkBudget as jest.Mock).mockResolvedValueOnce({
        tokensUsed: 1000, limit: 10000, remaining: 9000
      })
      ;(TokenBudgetService.getMonthlyUsage as jest.Mock).mockResolvedValueOnce({
        tokensUsed: 50000
      })

      const result = await SettingsService.getSettings('user1')

      expect(result.theme).toBe('dark')
      expect(result.notificationsEnabled).toBe(false)
      expect(result.language).toBe('es')
      expect(result.aiUsage.remaining).toBe(9000)
    })
  })

  describe('updateSettings()', () => {
    it('throws 404 if user not found', async () => {
      ;(User.findById as jest.Mock).mockResolvedValueOnce(null)
      await expect(SettingsService.updateSettings('user1', {})).rejects.toThrow('User not found')
    })

    it('updates user settings and saves', async () => {
      const mockUser = {
        theme: 'light',
        notificationsEnabled: true,
        language: 'en',
        save: jest.fn().mockResolvedValueOnce(true)
      }
      ;(User.findById as jest.Mock).mockResolvedValueOnce(mockUser)

      ;(TokenBudgetService.checkBudget as jest.Mock).mockResolvedValueOnce({
        tokensUsed: 0, limit: 100, remaining: 100
      })
      ;(TokenBudgetService.getMonthlyUsage as jest.Mock).mockResolvedValueOnce({
        tokensUsed: 0
      })

      const result = await SettingsService.updateSettings('user1', { theme: 'dark' })

      expect(mockUser.theme).toBe('dark')
      expect(mockUser.save).toHaveBeenCalled()
      expect(result.theme).toBe('dark')
    })
  })

  describe('resetSettings()', () => {
    it('resets user settings to defaults', async () => {
      const mockUser = {
        theme: 'dark',
        notificationsEnabled: false,
        language: 'fr',
        save: jest.fn().mockResolvedValueOnce(true)
      }
      ;(User.findById as jest.Mock).mockResolvedValueOnce(mockUser)

      ;(TokenBudgetService.checkBudget as jest.Mock).mockResolvedValueOnce({})
      ;(TokenBudgetService.getMonthlyUsage as jest.Mock).mockResolvedValueOnce({})

      const result = await SettingsService.resetSettings('user1')

      expect(mockUser.theme).toBe('system')
      expect(mockUser.notificationsEnabled).toBe(true)
      expect(mockUser.language).toBe('en')
      expect(mockUser.save).toHaveBeenCalled()
    })
  })

  describe('getTokenBudget()', () => {
    it('returns token budget formatted', async () => {
      ;(TokenBudgetService.checkBudget as jest.Mock).mockResolvedValueOnce({
        tokensUsed: 50, limit: 100, remaining: 50, resetAt: 'tomorrow'
      })
      ;(TokenBudgetService.getMonthlyUsage as jest.Mock).mockResolvedValueOnce({
        tokensUsed: 200, requestCount: 10
      })

      const result = await SettingsService.getTokenBudget('user1')
      expect(result.dailyUsage.remaining).toBe(50)
      expect(result.monthlyUsage.tokensUsed).toBe(200)
    })
  })
})
