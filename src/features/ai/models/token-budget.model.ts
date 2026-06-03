import mongoose, { Schema, Document, Model } from 'mongoose'

// ─── Interface ───────────────────────────────────────────────────────────────

export interface ITokenBudget extends Document {
  userId: mongoose.Types.ObjectId
  /** 'YYYY-MM-DD' in UTC — one document per user per day */
  date: string
  tokensUsed: number
  requestCount: number
  lastUpdated: Date
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const TokenBudgetSchema = new Schema<ITokenBudget>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: String,
    required: true
  },
  tokensUsed: {
    type: Number,
    default: 0,
    min: 0
  },
  requestCount: {
    type: Number,
    default: 0,
    min: 0
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
})

// ─── Indexes ─────────────────────────────────────────────────────────────────

// Compound unique index: one document per user per day
TokenBudgetSchema.index({ userId: 1, date: 1 }, { unique: true })

// TTL index: auto-delete records older than 30 days (saves storage)
TokenBudgetSchema.index({ lastUpdated: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 })

// ─── Model ───────────────────────────────────────────────────────────────────

export const TokenBudgetModel: Model<ITokenBudget> = mongoose.model<ITokenBudget>(
  'TokenBudget',
  TokenBudgetSchema
)
