import { SuggestedFocusService } from '../analysis/suggested-focus.service'
import { DocumentModel } from '../document.model'

jest.mock('../document.model', () => ({
  DocumentModel: {
    find: jest.fn()
  }
}))

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeDoc = (
  overrides: Partial<{
    cognitiveLoad: 'Heavy' | 'Medium' | 'Light'
    createdAt:     Date
    isUnread:      boolean
  }> = {}
) => ({
  cognitiveLoad: 'Medium' as const,
  createdAt:     new Date(),
  isUnread:      false,
  ...overrides
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SuggestedFocusService', () => {

  describe('scoreDocument()', () => {
    it('Heavy load scores higher than Medium which scores higher than Light', () => {
      const now = new Date()
      const heavy  = SuggestedFocusService.scoreDocument(makeDoc({ cognitiveLoad: 'Heavy',  createdAt: now }))
      const medium = SuggestedFocusService.scoreDocument(makeDoc({ cognitiveLoad: 'Medium', createdAt: now }))
      const light  = SuggestedFocusService.scoreDocument(makeDoc({ cognitiveLoad: 'Light',  createdAt: now }))

      expect(heavy).toBeGreaterThan(medium)
      expect(medium).toBeGreaterThan(light)
    })

    it('a document created just now scores higher on recency than one 20 days old', () => {
      const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000)
      const fresh = SuggestedFocusService.scoreDocument(makeDoc({ createdAt: new Date() }))
      const stale = SuggestedFocusService.scoreDocument(makeDoc({ createdAt: twentyDaysAgo }))

      expect(fresh).toBeGreaterThan(stale)
    })

    it('a doc older than 30 days gets a recency score of 0 (floor)', () => {
      const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)
      const score = SuggestedFocusService.scoreDocument(makeDoc({ createdAt: fortyDaysAgo }))
      // load=2 (Medium), recency=0 (floored), unread=0
      expect(score).toBe(2)
    })

    it('adds a +2 bonus for unread documents', () => {
      const now   = new Date()
      const read  = SuggestedFocusService.scoreDocument(makeDoc({ isUnread: false, createdAt: now }))
      const unread = SuggestedFocusService.scoreDocument(makeDoc({ isUnread: true,  createdAt: now }))

      expect(unread - read).toBe(2)
    })

    it('a freshly uploaded Heavy + unread doc has the highest possible score', () => {
      const score = SuggestedFocusService.scoreDocument({
        cognitiveLoad: 'Heavy',
        createdAt:     new Date(),
        isUnread:      true
      })
      // load=3, recency≈1, unread=+2  → ~6
      expect(score).toBeGreaterThan(5.9)
    })
  })

  describe('getTopFocusDocuments()', () => {
    const mockDocs = [
      {
        _id:           { toString: () => 'doc1' },
        title:         'Heavy Recent Unread',
        fileType:      'PDF',
        cognitiveLoad: 'Heavy' as const,
        cognitiveScore: 9,
        aiStatus:      'Analyzed',
        isUnread:      true,
        cloudinaryUrl: 'https://cdn.example.com/1',
        summary:       'Complex ML paper',
        createdAt:     new Date() // fresh
      },
      {
        _id:           { toString: () => 'doc2' },
        title:         'Light Old Read',
        fileType:      'PDF',
        cognitiveLoad: 'Light' as const,
        cognitiveScore: 2,
        aiStatus:      'Analyzed',
        isUnread:      false,
        cloudinaryUrl: 'https://cdn.example.com/2',
        summary:       'Easy intro guide',
        createdAt:     new Date(Date.now() - 35 * 24 * 60 * 60 * 1000) // very old
      },
      {
        _id:           { toString: () => 'doc3' },
        title:         'Medium Recent Read',
        fileType:      'Word',
        cognitiveLoad: 'Medium' as const,
        cognitiveScore: 5,
        aiStatus:      'Analyzed',
        isUnread:      false,
        cloudinaryUrl: 'https://cdn.example.com/3',
        summary:       'Mid-tier doc',
        createdAt:     new Date() // fresh
      }
    ]

    beforeEach(() => {
      jest.clearAllMocks()
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        lean:   jest.fn().mockResolvedValue(mockDocs)
      }
      ;(DocumentModel.find as jest.Mock).mockReturnValue(mockQuery)
    })

    it('queries only Analyzed documents for the given user', async () => {
      await SuggestedFocusService.getTopFocusDocuments('user1')
      expect(DocumentModel.find).toHaveBeenCalledWith({ user: 'user1', aiStatus: 'Analyzed' })
    })

    it('returns at most 2 documents', async () => {
      const result = await SuggestedFocusService.getTopFocusDocuments('user1')
      expect(result).toHaveLength(2)
    })

    it('ranks Heavy+Unread first and Light+Old last', async () => {
      const result = await SuggestedFocusService.getTopFocusDocuments('user1')
      expect(result[0]._id).toBe('doc1') // Heavy + Unread + Fresh → highest
      expect(result[1]._id).toBe('doc3') // Medium + Fresh → second
      // doc2 (Light + Old) is excluded from top-2
    })

    it('exposes the computed score on each result', async () => {
      const result = await SuggestedFocusService.getTopFocusDocuments('user1')
      expect(typeof result[0].score).toBe('number')
      expect(result[0].score).toBeGreaterThan(result[1].score)
    })

    it('returns an empty array when the user has no Analyzed documents', async () => {
      const mockQuery = {
        select: jest.fn().mockReturnThis(),
        lean:   jest.fn().mockResolvedValue([])
      }
      ;(DocumentModel.find as jest.Mock).mockReturnValue(mockQuery)

      const result = await SuggestedFocusService.getTopFocusDocuments('user1')
      expect(result).toEqual([])
    })
  })
})
