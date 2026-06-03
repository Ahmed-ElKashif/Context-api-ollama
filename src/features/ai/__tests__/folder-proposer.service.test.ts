/**
 * FolderProposerService — unit tests
 *
 * Strategy:
 * - Mock DocumentModel (chained: .find().select().sort().limit())
 * - Inject mock model via FolderProposerService.init()
 * - Mock model has .withStructuredOutput() → { invoke: jest.fn() }
 */

// ─── Mock DocumentModel (chained query) ──────────────────────────────────────
const mockLimit = jest.fn()
const mockSort  = jest.fn().mockReturnValue({ limit: mockLimit })
const mockSelect = jest.fn().mockReturnValue({ sort: mockSort })
const mockFind   = jest.fn().mockReturnValue({ select: mockSelect })
const mockExists = jest.fn()

jest.mock('../../documents/document.model', () => ({
  DocumentModel: { find: mockFind, exists: mockExists }
}))

import { FolderProposerService } from '../organizer/folder-proposer.service'

// ─── Mock model with withStructuredOutput ─────────────────────────────────────
const mockStructuredInvoke = jest.fn()
const mockModel = {
  withStructuredOutput: jest.fn().mockReturnThis(),
  withConfig: jest.fn().mockReturnThis(),
  invoke: mockStructuredInvoke
}

// Sample analyzed documents
const makeDocs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    _id:           { toString: () => `doc${i}` },
    title:         `Document ${i}`,
    summary:       `Summary of document ${i}`,
    tags:          ['tag1', 'tag2'],
    fileType:      'PDF',
    cognitiveLoad: 'Medium'
  }))

const sampleTree = [
  {
    name: 'Finance',
    reason: 'Financial documents',
    documentIds: ['doc0', 'doc1'],
    subfolders: []
  }
]

beforeEach(() => {
  FolderProposerService.init(mockModel as any)
  // Reset the chain mocks
  mockFind.mockReturnValue({ select: mockSelect })
  mockSelect.mockReturnValue({ sort: mockSort })
  mockSort.mockReturnValue({ limit: mockLimit })
  mockExists.mockResolvedValue(null)
})

// ─────────────────────────────────────────────────────────────────────────────

describe('FolderProposerService', () => {
  describe('proposeStructure()', () => {
    it('returns empty tree + documentCount 0 when user has no analyzed docs', async () => {
      mockLimit.mockResolvedValueOnce([])
      const result = await FolderProposerService.proposeStructure('user123')
      expect(result.tree).toEqual([])
      expect(result.documentCount).toBe(0)
      expect(mockStructuredInvoke).not.toHaveBeenCalled()
    })

    it('returns empty tree when user has only 1 analyzed doc (need ≥ 2 to cluster)', async () => {
      mockLimit.mockResolvedValueOnce(makeDocs(1))
      const result = await FolderProposerService.proposeStructure('user123')
      expect(result.tree).toEqual([])
      expect(result.documentCount).toBe(1)
    })

    it('queries only aiStatus=Analyzed docs for the correct user', async () => {
      mockLimit.mockResolvedValueOnce(makeDocs(2))
      mockStructuredInvoke.mockResolvedValueOnce({ folders: sampleTree })
      await FolderProposerService.proposeStructure('user_abc')
      expect(mockFind).toHaveBeenCalledWith({ user: 'user_abc', aiStatus: 'Analyzed', isOrganized: false })
    })

    it('calls withStructuredOutput() + invoke() and returns the tree', async () => {
      mockLimit.mockResolvedValueOnce(makeDocs(3))
      mockStructuredInvoke.mockResolvedValueOnce({ folders: sampleTree })
      const result = await FolderProposerService.proposeStructure('user123')
      expect(result.tree).toEqual(sampleTree)
      expect(result.documentCount).toBe(3)
      expect(result.wasCapped).toBe(false)
    })

    it('sets wasCapped=true when more than 100 docs are returned from DB', async () => {
      // 101 docs returned → wasCapped = true, but only 100 sent to model
      mockLimit.mockResolvedValueOnce(makeDocs(101))
      mockStructuredInvoke.mockResolvedValueOnce({ folders: sampleTree })
      const result = await FolderProposerService.proposeStructure('user123')
      expect(result.wasCapped).toBe(true)
      expect(result.documentCount).toBe(100)
    })
  })
})
