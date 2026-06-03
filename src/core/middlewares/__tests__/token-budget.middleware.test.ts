import { checkTokenBudget } from '../token-budget.middleware'
import { TokenBudgetService, DAILY_TOKEN_BUDGET, getResetTime } from '../../services/token-budget.service'

jest.mock('../../services/token-budget.service', () => ({
  TokenBudgetService: {
    checkBudget: jest.fn(),
    recordUsage: jest.fn()
  },
  DAILY_TOKEN_BUDGET: 50000,
  getResetTime: jest.fn()
}))

describe('Token Budget Middleware', () => {
  let req: any
  let res: any
  let next: any

  beforeEach(() => {
    jest.clearAllMocks()
    
    req = {
      user: { _id: 'u1' }
    }
    
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      set: jest.fn(),
      locals: {},
      on: jest.fn()
    }
    
    next = jest.fn()
    
    ;(getResetTime as jest.Mock).mockReturnValue(new Date('2026-05-02T00:00:00.000Z'))
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-05-01T12:00:00.000Z').getTime())
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('checkTokenBudget()', () => {
    it('calls next if no user is found', async () => {
      req.user = undefined
      await checkTokenBudget(req, res, next)
      expect(next).toHaveBeenCalled()
      expect(TokenBudgetService.checkBudget).not.toHaveBeenCalled()
    })

    it('returns 429 if monthly budget is exceeded', async () => {
      ;(TokenBudgetService.checkBudget as jest.Mock).mockResolvedValue({
        allowed: false,
        monthlyAllowed: false,
        tokensUsed: 1000,
        limit: 50000,
        monthlyLimit: 100000
      })

      await checkTokenBudget(req, res, next)

      expect(res.status).toHaveBeenCalledWith(429)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Monthly AI token budget exceeded.',
        limit: 50000
      }))
      expect(next).not.toHaveBeenCalled()
    })

    it('returns 429 and sets retry headers if daily budget is exceeded', async () => {
      ;(TokenBudgetService.checkBudget as jest.Mock).mockResolvedValue({
        allowed: false,
        monthlyAllowed: true,
        tokensUsed: 50000,
        limit: 50000
      })

      await checkTokenBudget(req, res, next)

      expect(res.set).toHaveBeenCalledWith(expect.objectContaining({
        'Retry-After': expect.any(String),
        'X-RateLimit-Limit': '50000',
        'X-RateLimit-Remaining': '0'
      }))
      expect(res.status).toHaveBeenCalledWith(429)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: 'Daily AI token budget exceeded.'
      }))
      expect(next).not.toHaveBeenCalled()
    })

    it('allows request, sets locals.startTime, and registers finish handler', async () => {
      ;(TokenBudgetService.checkBudget as jest.Mock).mockResolvedValue({
        allowed: true
      })

      await checkTokenBudget(req, res, next)

      expect(res.locals.startTime).toBeDefined()
      expect(res.on).toHaveBeenCalledWith('finish', expect.any(Function))
      expect(next).toHaveBeenCalled()
    })

    it('records token usage on finish if successful', async () => {
      ;(TokenBudgetService.checkBudget as jest.Mock).mockResolvedValue({ allowed: true })

      await checkTokenBudget(req, res, next)
      const finishHandler = res.on.mock.calls.find((call: any[]) => call[0] === 'finish')[1]
      
      // Simulate successful response with aiMeta
      res.statusCode = 200
      res.locals.aiMeta = { tokensUsed: 150 }
      
      await finishHandler()
      
      expect(TokenBudgetService.recordUsage).toHaveBeenCalledWith('u1', 150)
    })

    it('does not record usage if request failed', async () => {
      ;(TokenBudgetService.checkBudget as jest.Mock).mockResolvedValue({ allowed: true })

      await checkTokenBudget(req, res, next)
      const finishHandler = res.on.mock.calls.find((call: any[]) => call[0] === 'finish')[1]
      
      // Simulate failed response
      res.statusCode = 400
      res.locals.aiMeta = { tokensUsed: 150 }
      
      await finishHandler()
      
      expect(TokenBudgetService.recordUsage).not.toHaveBeenCalled()
    })
  })
})
