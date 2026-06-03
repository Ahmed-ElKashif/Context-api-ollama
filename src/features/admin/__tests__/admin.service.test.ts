import { adminService } from '../admin.service'
import { User } from '../../users/user.model'
import { analyticsService } from '../../analytics/analytics.service'
import { TokenBudgetModel } from '../../ai/models/token-budget.model'

jest.mock('../../users/user.model', () => ({
  User: {
    find: jest.fn(),
    countDocuments: jest.fn(),
    findById: jest.fn(),
  }
}))

jest.mock('../../analytics/analytics.service', () => ({
  analyticsService: {
    getAdminStats: jest.fn()
  }
}))

jest.mock('../../documents/document.model', () => ({
  DocumentModel: {
    aggregate: jest.fn().mockResolvedValue([{ _id: '1', totalBytes: 1000 }])
  }
}))

jest.mock('../../ai/models/token-budget.model', () => ({
  TokenBudgetModel: {
    aggregate: jest.fn(),
    find: jest.fn()
  }
}))

describe('AdminService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-05-01T00:00:00.000Z').getTime())
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('getStats()', () => {
    it('delegates to analyticsService.getAdminStats', async () => {
      const mockStats = { totalUsers: 10 }
      ;(analyticsService.getAdminStats as jest.Mock).mockResolvedValue(mockStats)

      const result = await adminService.getStats()
      expect(result).toEqual(mockStats)
      expect(analyticsService.getAdminStats).toHaveBeenCalled()
    })
  })

  describe('getUsers()', () => {
    const mockUsers = [{ _id: '1', username: 'test1' }, { _id: '2', username: 'test2' }]

    beforeEach(() => {
      const mockFind = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockUsers)
      }
      ;(User.find as jest.Mock).mockReturnValue(mockFind)
      ;(User.countDocuments as jest.Mock).mockResolvedValue(20)
    })

    it('returns paginated users with no search query', async () => {
      const result = await adminService.getUsers({ page: 2, limit: 5 })

      expect(User.find).toHaveBeenCalledWith({})
      expect(User.countDocuments).toHaveBeenCalledWith({})
      expect(result.users).toEqual([
        { _id: '1', username: 'test1', storageUsedBytes: 1000 },
        { _id: '2', username: 'test2', storageUsedBytes: 0 }
      ])
      expect(result.pagination).toEqual({ total: 20, page: 2, limit: 5, totalPages: 4 })
    })

    it('applies search filters', async () => {
      await adminService.getUsers({ search: 'john' })

      expect(User.find).toHaveBeenCalledWith({
        $or: [
          { username: { $regex: 'john', $options: 'i' } },
          { email: { $regex: 'john', $options: 'i' } },
          { fullName: { $regex: 'john', $options: 'i' } }
        ]
      })
    })

    it('falls back to default sort if an invalid sortBy is provided', async () => {
      const mockFind = User.find()
      await adminService.getUsers({ sortBy: 'invalidField', sortOrder: 'asc' })

      expect(mockFind.sort).toHaveBeenCalledWith({ createdAt: 1 })
    })

    it('uses valid sort fields', async () => {
      const mockFind = User.find()
      await adminService.getUsers({ sortBy: 'username', sortOrder: 'desc' })

      expect(mockFind.sort).toHaveBeenCalledWith({ username: -1 })
    })
  })

  describe('toggleSuspend()', () => {
    it('throws error if user not found', async () => {
      ;(User.findById as jest.Mock).mockResolvedValue(null)
      await expect(adminService.toggleSuspend('id1', true)).rejects.toThrow('User not found')
    })

    it('throws error if user is an admin', async () => {
      ;(User.findById as jest.Mock).mockResolvedValue({ role: 'admin' })
      await expect(adminService.toggleSuspend('id1', true)).rejects.toThrow('Cannot suspend an admin account')
    })

    it('updates isSuspended and saves the user', async () => {
      const mockUser = { role: 'user', isSuspended: false, save: jest.fn() }
      ;(User.findById as jest.Mock).mockResolvedValue(mockUser)

      const result = await adminService.toggleSuspend('id1', true)

      expect(mockUser.isSuspended).toBe(true)
      expect(mockUser.save).toHaveBeenCalled()
      expect(result).toBe(mockUser)
    })
  })

  describe('exportUsersCSV()', () => {
    it('generates a CSV string of all users', async () => {
      const mockUsers = [
        {
          _id: '1',
          username: 'alice',
          email: 'alice@example.com',
          fullName: 'Alice A',
          role: 'user',
          subscriptionStatus: 'active',
          isSuspended: false,
          createdAt: new Date('2026-01-01T00:00:00.000Z')
        },
        {
          _id: '2',
          username: 'bob',
          email: 'bob@example.com',
          fullName: 'Bob B',
          isSuspended: true,
          createdAt: new Date('2026-02-01T00:00:00.000Z')
        }
      ]

      const mockFind = {
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockUsers)
      }
      ;(User.find as jest.Mock).mockReturnValue(mockFind)

      const csv = await adminService.exportUsersCSV()

      const rows = csv.split('\n')
      expect(rows[0]).toBe('Username,Email,Full Name,Role,Status,Storage (MB),Suspended,Joined')
      expect(rows[1]).toBe(`"alice","alice@example.com","Alice A","user","active","0.0","No","${new Date('2026-01-01T00:00:00.000Z').toLocaleDateString()}"`)
      expect(rows[2]).toBe(`"bob","bob@example.com","Bob B","user","none","0.0","Yes","${new Date('2026-02-01T00:00:00.000Z').toLocaleDateString()}"`)
    })
  })

  describe('getAIUsage()', () => {
    it('aggregates ai usage stats', async () => {
      ;(TokenBudgetModel.aggregate as jest.Mock)
        .mockResolvedValueOnce([{ totalTokens: 1000, totalRequests: 50 }]) // monthly usage
        .mockResolvedValueOnce([{ _id: 'u1', tokensUsed: 500, requestCount: 20 }]) // top users
        .mockResolvedValueOnce([{ _id: '2026-05-01', tokensUsed: 100, requestCount: 5 }]) // daily
        .mockResolvedValueOnce([{ _id: '2026-05', tokensUsed: 1000, requestCount: 50 }]) // db monthly

      ;(User.find as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([{ _id: 'u1', username: 'alice', email: 'alice@a.com' }])
      })

      const result = await adminService.getAIUsage()
      expect(result.totalTokensThisMonth).toBe(1000)
      expect(result.topUsers[0].username).toBe('alice')
      expect(result.dailyUsage[0].tokensUsed).toBe(100)
      expect(result.monthlyUsage.length).toBe(6)
    })
  })

  describe('getUserAIUsage()', () => {
    it('returns history for specific user', async () => {
      ;(TokenBudgetModel.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([{ date: '2026-05-01', tokensUsed: 100, requestCount: 5 }])
      })

      const result = await adminService.getUserAIUsage('u1')
      expect(result[0].tokensUsed).toBe(100)
    })
  })
})
