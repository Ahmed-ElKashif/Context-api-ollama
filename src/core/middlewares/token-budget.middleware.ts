import { Request, Response, NextFunction } from 'express'
import {
  TokenBudgetService,
  DAILY_TOKEN_BUDGET,
  getResetTime
} from '../services/token-budget.service'

/**
 * @description Pre-request middleware that enforces the per-user daily AI token budget.
 *
 * ─── What it does ────────────────────────────────────────────────────────────
 * 1. Reads the user's cumulative token usage for today from MongoDB
 * 2. If over budget → returns 429 with Retry-After headers (industry standard)
 * 3. If within budget → sets res.locals.startTime and calls next()
 * 4. Registers a res.on('finish') listener to record usage AFTER the response
 *    (reads res.locals.aiMeta.tokensUsed set by the controller)
 *
 * ─── Usage ───────────────────────────────────────────────────────────────────
 * Attach AFTER protect middleware (requires req.user to be populated).
 *
 * On AI routes:
 *   router.post('/synthesize', protect, checkTokenBudget, validate(...), controller)
 *
 * On upload route (budget check prevents file-and-forget AI processing):
 *   router.post('/upload', protect, checkTokenBudget, uploadMemory.array(...), controller)
 *
 * ─── Response Headers on 429 (industry standard) ─────────────────────────────
 *   Retry-After: <seconds until midnight UTC>
 *   X-RateLimit-Limit: 50000
 *   X-RateLimit-Remaining: 0
 *   X-RateLimit-Reset: <ISO string of midnight UTC>
 */
export const checkTokenBudget = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const userId = req.user?._id?.toString()

  if (!userId) {
    // Should never happen since protect runs first — but be safe
    next()
    return
  }

  const budget = await TokenBudgetService.checkBudget(userId)

  if (!budget.allowed) {
    const resetAt = getResetTime()

    if (!budget.monthlyAllowed) {
      res.status(429).json({
        success: false,
        error: 'Monthly AI token budget exceeded.',
        message: `You have used all ${budget.monthlyLimit.toLocaleString()} tokens for this month. AI features will be temporarily paused.`,
        tokensUsed: budget.tokensUsed,
        limit: budget.limit,
        resetAt: resetAt.toISOString()
      })
      return
    }

    const retryAfterSeconds = Math.ceil((resetAt.getTime() - Date.now()) / 1000)
    
    const hoursRemaining = Math.floor(retryAfterSeconds / 3600)
    const minutesRemaining = Math.floor((retryAfterSeconds % 3600) / 60)
    let timeText = ''
    if (hoursRemaining > 0) {
      timeText += `${hoursRemaining} hour${hoursRemaining > 1 ? 's' : ''}`
    }
    if (minutesRemaining > 0) {
      timeText += `${timeText ? ' and ' : ''}${minutesRemaining} minute${minutesRemaining > 1 ? 's' : ''}`
    }

    res.set({
      'Retry-After': String(retryAfterSeconds),
      'X-RateLimit-Limit': String(DAILY_TOKEN_BUDGET),
      'X-RateLimit-Remaining': '0',
      'X-RateLimit-Reset': resetAt.toISOString()
    })

    res.status(429).json({
      success: false,
      error: 'Daily AI token budget exceeded.',
      message: `You have used all ${DAILY_TOKEN_BUDGET.toLocaleString()} tokens for today. Your budget will be refreshed in ${timeText}.`,
      tokensUsed: budget.tokensUsed,
      limit: budget.limit,
      resetAt: resetAt.toISOString(),
      retryAfterSeconds
    })
    return
  }

  // Budget OK — set startTime for latency tracking
  res.locals.startTime = Date.now()

  // Register post-response hook to record actual token usage
  res.on('finish', async () => {
    // Only record on successful responses (2xx) — don't charge for failed AI calls
    if (res.statusCode >= 200 && res.statusCode < 300) {
      const tokensUsed = res.locals.aiMeta?.tokensUsed ?? 0
      if (tokensUsed > 0) {
        await TokenBudgetService.recordUsage(userId, tokensUsed)
      }
    }
  })

  next()
}
