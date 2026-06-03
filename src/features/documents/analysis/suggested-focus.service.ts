import { DocumentModel, CognitiveLoad } from '../document.model'

// ─── Scoring constants ────────────────────────────────────────────────────────

const LOAD_SCORE: Record<CognitiveLoad, number> = {
  Heavy: 3,
  Medium: 2,
  Light: 1
}

const RECENCY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000 // 30 days in ms
const UNREAD_BONUS = 2
const TOP_N = 2

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SuggestedFocusResult {
  _id: string
  title: string
  fileType: string
  cognitiveLoad: CognitiveLoad
  cognitiveScore?: number
  aiStatus: string
  isUnread: boolean
  cloudinaryUrl?: string
  summary?: string
  tags: string[]
  score: number
  createdAt: Date
  updatedAt: Date
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class SuggestedFocusService {
  /**
   * Computes a priority score for a single document.
   *
   * Formula:
   *   score = loadScore + recencyScore + unreadBonus
   *
   *   loadScore   — Heavy=3, Medium=2, Light=1
   *   recencyScore — linear decay from 1.0 (just uploaded) → 0.0 (≥30 days old)
   *   unreadBonus — +2 if isUnread is true
   */
  static scoreDocument(doc: {
    cognitiveLoad: CognitiveLoad
    createdAt: Date
    isUnread: boolean
  }): number {
    const loadScore = LOAD_SCORE[doc.cognitiveLoad] ?? 1

    const ageMs = Date.now() - new Date(doc.createdAt).getTime()
    const recencyScore = Math.max(0, 1 - ageMs / RECENCY_WINDOW_MS)

    const unreadBonus = doc.isUnread ? UNREAD_BONUS : 0

    return loadScore + recencyScore + unreadBonus
  }

  /**
   * Queries the user's documents, ranks them by score, and returns the top-N.
   * Only considers documents with aiStatus === 'Analyzed' so we surface
   * documents that are fully processed and ready to engage with.
   */
  static async getTopFocusDocuments(userId: string): Promise<SuggestedFocusResult[]> {
    const docs = await DocumentModel.find({ user: userId, aiStatus: 'Analyzed' })
      .select(
        'title fileType cognitiveLoad cognitiveScore aiStatus isUnread cloudinaryUrl summary tags createdAt updatedAt'
      )
      .lean()

    const scored = docs.map((doc) => ({
      _id: doc._id.toString(),
      title: doc.title,
      fileType: doc.fileType,
      cognitiveLoad: doc.cognitiveLoad,
      cognitiveScore: doc.cognitiveScore,
      aiStatus: doc.aiStatus,
      isUnread: doc.isUnread,
      cloudinaryUrl: doc.cloudinaryUrl,
      summary: doc.summary,
      tags: doc.tags || [],
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      score: SuggestedFocusService.scoreDocument({
        cognitiveLoad: doc.cognitiveLoad,
        createdAt: doc.createdAt,
        isUnread: doc.isUnread
      })
    }))

    scored.sort((a, b) => b.score - a.score)

    return scored.slice(0, TOP_N)
  }
}
