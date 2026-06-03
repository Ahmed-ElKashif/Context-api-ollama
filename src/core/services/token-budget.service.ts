import { TokenBudgetModel } from '../../features/ai/models/token-budget.model'

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Daily token budget per user. Configurable via env var.
 * Default: 50,000 tokens (~37,500 words of input context).
 * Industry standard for dev/team environments to control costs.
 */
export const DAILY_TOKEN_BUDGET = parseInt(process.env.AI_DAILY_TOKEN_BUDGET || '50000', 10)
export const MONTHLY_TOKEN_BUDGET = parseInt(process.env.AI_MONTHLY_TOKEN_BUDGET || (DAILY_TOKEN_BUDGET * 30).toString(), 10)

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns today's date key in 'YYYY-MM-DD' format (UTC).
 * UTC is used to ensure consistent day boundaries across timezones.
 */
export function getTodayKey(): string {
  return new Date().toISOString().split('T')[0]
}

/**
 * Returns a Date object representing midnight UTC tonight (when the budget resets).
 */
export function getResetTime(): Date {
  const now = new Date()
  const midnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  )
  return midnight
}

/**
 * Estimates token count from raw text length.
 * Industry standard approximation: ~4 characters per token for English text.
 * Used for budget tracking — not for billing (accuracy within 20% is acceptable).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * Estimates token consumption for processing a single document through the full AI pipeline:
 * - OrchestratorService (classify + tag + summarize): ~3,000 tokens overhead
 * - CognitiveLoadService (4k char sample analysis): ~1,200 tokens overhead
 * - EmbeddingService: text.length / 4 tokens (this is the main variable cost)
 */
export function estimateDocumentPipelineTokens(rawText: string): number {
  const embeddingTokens = Math.ceil(rawText.length / 4)
  const llmOverhead = 4200 // Orchestrator + CognitiveLoad fixed overhead
  return embeddingTokens + llmOverhead
}

// ─── TokenBudgetService ───────────────────────────────────────────────────────

export interface BudgetStatus {
  allowed: boolean
  tokensUsed: number
  limit: number
  remaining: number
  resetAt: Date
  monthlyUsed: number
  monthlyLimit: number
  monthlyAllowed: boolean
}

/**
 * @description Shared service for token budget operations.
 * Used by:
 *  - `token-budget.middleware.ts` (HTTP pre-check for AI routes + upload)
 *  - `AIService.processPendingDocuments()` (background pipeline recording)
 *
 * Never throws — always fails silently to prevent budget tracking from
 * blocking legitimate requests.
 */
export class TokenBudgetService {
  /**
   * Checks if a user is within their daily and monthly token budget.
   * Returns a BudgetStatus object — caller decides whether to block the request.
   */
  static async checkBudget(userId: string): Promise<BudgetStatus> {
    const today = getTodayKey()
    const resetAt = getResetTime()
    const monthlyLimit = MONTHLY_TOKEN_BUDGET

    try {
      const record = await TokenBudgetModel.findOne({ userId, date: today })
      const tokensUsed = record?.tokensUsed ?? 0

      const monthlyUsage = await this.getMonthlyUsage(userId)
      const monthlyAllowed = monthlyUsage.tokensUsed < monthlyLimit

      return {
        allowed: tokensUsed < DAILY_TOKEN_BUDGET && monthlyAllowed,
        tokensUsed,
        limit: DAILY_TOKEN_BUDGET,
        remaining: Math.max(0, DAILY_TOKEN_BUDGET - tokensUsed),
        resetAt,
        monthlyUsed: monthlyUsage.tokensUsed,
        monthlyLimit,
        monthlyAllowed
      }
    } catch (error) {
      // If DB read fails, allow the request (fail open — never block users due to our DB issues)
      console.error('[TokenBudget] Failed to check budget:', error)
      return {
        allowed: true,
        tokensUsed: 0,
        limit: DAILY_TOKEN_BUDGET,
        remaining: DAILY_TOKEN_BUDGET,
        resetAt,
        monthlyUsed: 0,
        monthlyLimit,
        monthlyAllowed: true
      }
    }
  }

  /**
   * Records token usage for a user.
   * Uses atomic $inc + upsert to handle concurrent requests safely.
   * Called AFTER a successful AI operation completes.
   */
  static async recordUsage(userId: string, tokensUsed: number): Promise<void> {
    if (tokensUsed <= 0) return

    const today = getTodayKey()

    try {
      await TokenBudgetModel.findOneAndUpdate(
        { userId, date: today },
        {
          $inc: { tokensUsed, requestCount: 1 },
          $set: { lastUpdated: new Date() }
        },
        { upsert: true, returnDocument: 'after' }
      )
    } catch (error) {
      // Fail silently — recording a missed usage is better than crashing the app
      console.error('[TokenBudget] Failed to record usage:', error)
    }
  }

  /**
   * Calculates the total token usage for the current user in the current calendar month.
   */
  static async getMonthlyUsage(userId: string): Promise<{ tokensUsed: number; requestCount: number }> {
    try {
      const currentMonth = new Date().toISOString().slice(0, 7) // 'YYYY-MM'
      const records = await TokenBudgetModel.find({
        userId,
        date: { $regex: new RegExp('^' + currentMonth) }
      })

      let tokensUsed = 0
      let requestCount = 0

      for (const rec of records) {
        tokensUsed += rec.tokensUsed
        requestCount += rec.requestCount
      }

      return { tokensUsed, requestCount }
    } catch (error) {
      console.error('[TokenBudget] Failed to get monthly usage:', error)
      return { tokensUsed: 0, requestCount: 0 }
    }
  }
}
