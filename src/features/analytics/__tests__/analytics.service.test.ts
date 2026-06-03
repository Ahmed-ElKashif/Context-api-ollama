import { analyticsService } from '../analytics.service'
import { AnalyticsEvent } from '../analytics.model'
import { User } from '../../users/user.model'
import { DocumentModel } from '../../documents/document.model'

jest.mock('../analytics.model', () => ({
  AnalyticsEvent: {
    create: jest.fn(),
    countDocuments: jest.fn(),
    distinct: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn()
  }
}))

jest.mock('../../users/user.model', () => ({
  User: {
    countDocuments: jest.fn()
  }
}))

jest.mock('../../documents/document.model', () => ({
  DocumentModel: {
    aggregate: jest.fn()
  }
}))

describe('AnalyticsService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('track()', () => {
    it('creates an analytics event with an expiration date 90 days in the future', async () => {
      const mockEvent = {
        eventType: 'pageview',
        sessionId: 'sess123',
        route: '/dashboard'
      }

      const before = Date.now()
      await analyticsService.track(mockEvent)
      const after = Date.now()

      expect(AnalyticsEvent.create).toHaveBeenCalled()
      const callArg = (AnalyticsEvent.create as jest.Mock).mock.calls[0][0]

      expect(callArg.eventType).toBe('pageview')
      expect(callArg.sessionId).toBe('sess123')
      expect(callArg.route).toBe('/dashboard')
      
      // Ensure timestamp is roughly now
      expect(callArg.timestamp.getTime()).toBeGreaterThanOrEqual(before)
      expect(callArg.timestamp.getTime()).toBeLessThanOrEqual(after)

      // Ensure expiresAt is roughly 90 days from now
      const ninetyDaysInMs = 90 * 24 * 60 * 60 * 1000
      expect(callArg.expiresAt.getTime()).toBeGreaterThanOrEqual(before + ninetyDaysInMs - 5000)
      expect(callArg.expiresAt.getTime()).toBeLessThanOrEqual(after + ninetyDaysInMs + 5000)
    })
  })

  describe('getAdminStats()', () => {
    it('aggregates and shapes admin stats correctly', async () => {
      // Setup mocks
      ;(User.countDocuments as jest.Mock)
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(50)  // active
        .mockResolvedValueOnce(10)  // trial
        .mockResolvedValueOnce(5)   // canceled

      ;(DocumentModel.aggregate as jest.Mock)
        .mockResolvedValueOnce([{ _id: null, totalBytes: 5000 }]) // total storage
        .mockResolvedValueOnce([                                   // storage history
          { _id: { year: 2026, month: 1 }, bytes: 1000000000 },
          { _id: { year: 2026, month: 2 }, bytes: 2000000000 }
        ])
        .mockResolvedValueOnce([{ _id: 'pdf', count: 10 }])        // docTypesAgg

      ;(AnalyticsEvent.countDocuments as jest.Mock).mockResolvedValue(5000) // total page views
      ;(AnalyticsEvent.distinct as jest.Mock).mockResolvedValue(new Array(1500)) // unique visitors

      ;(AnalyticsEvent.aggregate as jest.Mock).mockResolvedValue([ // traffic history
        { _id: { year: 2026, month: 1 }, pageViews: 2000, visitors: 800 },
        { _id: { year: 2026, month: 2 }, pageViews: 3000, visitors: 1000 }
      ])

      const result = await analyticsService.getAdminStats()

      expect(result.totalUsers).toBe(100)
      expect(result.activeUsers).toBe(50)
      expect(result.trialUsers).toBe(10)
      expect(result.canceledUsers).toBe(5)
      expect(result.totalStorageBytes).toBe(5000)
      expect(result.totalPageViews).toBe(5000)
      expect(result.totalUniqueVisitors).toBe(1500)

      expect(result.trafficHistory).toHaveLength(12)
      expect(result.trafficHistory[11]).toEqual({
        date: expect.any(String),
        pageViews: 480,
        visitors: 140
      })

      expect(result.storageHistory).toHaveLength(12)
      expect(result.storageHistory[11]).toEqual({
        date: expect.any(String),
        storageGB: expect.any(Number) // Based on 5000 bytes
      })
    })

    it('handles empty aggregation results gracefully', async () => {
      ;(User.countDocuments as jest.Mock).mockResolvedValue(0)
      ;(DocumentModel.aggregate as jest.Mock)
        .mockResolvedValueOnce([]) // total storage
        .mockResolvedValueOnce([]) // storage history
        .mockResolvedValueOnce([]) // docTypesAgg
      ;(AnalyticsEvent.countDocuments as jest.Mock).mockResolvedValue(0)
      ;(AnalyticsEvent.distinct as jest.Mock).mockResolvedValue([])
      ;(AnalyticsEvent.aggregate as jest.Mock).mockResolvedValue([])

      const result = await analyticsService.getAdminStats()

      expect(result.totalStorageBytes).toBe(0)
      expect(result.trafficHistory).toHaveLength(12)
      expect(result.storageHistory).toHaveLength(12)
    })
  })

  describe('getTopPages()', () => {
    it('aggregates and returns top pages', async () => {
      const mockResult = [{ route: '/home', views: 100, uniqueVisitors: 50 }]
      ;(AnalyticsEvent.aggregate as jest.Mock).mockResolvedValue(mockResult)

      const result = await analyticsService.getTopPages(5)

      expect(result).toEqual(mockResult)
      expect(AnalyticsEvent.aggregate).toHaveBeenCalled()
      
      const pipeline = (AnalyticsEvent.aggregate as jest.Mock).mock.calls[0][0]
      expect(pipeline[pipeline.length - 1]).toEqual({ $limit: 5 })
    })
  })

  describe('getFeatureUsage()', () => {
    it('aggregates and returns feature usage', async () => {
      const mockResult = [{ feature: 'Upload', count: 50, uniqueUsers: 20 }]
      ;(AnalyticsEvent.aggregate as jest.Mock).mockResolvedValue(mockResult)

      const result = await analyticsService.getFeatureUsage()

      expect(result).toEqual(mockResult)
      expect(AnalyticsEvent.aggregate).toHaveBeenCalled()
    })
  })

  describe('getErrorSummary()', () => {
    it('aggregates and returns error summaries', async () => {
      const mockResult = [{ route: '/api/docs', message: 'Timeout', count: 5, lastSeen: new Date() }]
      ;(AnalyticsEvent.aggregate as jest.Mock).mockResolvedValue(mockResult)

      const result = await analyticsService.getErrorSummary()

      expect(result).toEqual(mockResult)
      expect(AnalyticsEvent.aggregate).toHaveBeenCalled()
    })
  })
})
