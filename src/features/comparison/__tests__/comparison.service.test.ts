import { ComparisonService } from '../comparison.service'
import { DeepThinkerService } from '../deep-thinker.service'
import { DocumentModel } from '../../documents/document.model'
import { ComparisonMessageModel } from '../comparison-chat.model'
import { EmbeddingService } from '../../ai/search/vector.service'
import mongoose from 'mongoose'

jest.mock('../../documents/document.model', () => ({
  DocumentModel: {
    findOne: jest.fn()
  }
}))

jest.mock('../deep-thinker.service', () => ({
  DeepThinkerService: {
    compareDocuments: jest.fn()
  }
}))

jest.mock('../comparison-chat.model', () => ({
  ComparisonMessageModel: {
    find: jest.fn(),
    insertMany: jest.fn()
  }
}))

jest.mock('../../ai/search/vector.service', () => {
  const mockVectorStoreRetrieverInvoke = jest.fn()
  return {
    EmbeddingService: {
      getVectorStore: jest.fn().mockResolvedValue({
        asRetriever: jest.fn().mockReturnValue({
          invoke: mockVectorStoreRetrieverInvoke
        })
      }),
      _mockVectorStoreRetrieverInvoke: mockVectorStoreRetrieverInvoke
    }
  }
})

const mockVectorStoreRetrieverInvoke = (EmbeddingService as any)._mockVectorStoreRetrieverInvoke as jest.Mock

describe('ComparisonService', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('performComparison()', () => {
    it('returns 404 if documents are not found', async () => {
      ;(DocumentModel.findOne as jest.Mock).mockResolvedValueOnce(null).mockResolvedValueOnce(null)
      const result = await ComparisonService.performComparison('user1', 'id1', 'id2')
      expect(result.statusCode).toBe(404)
      expect(result.error).toMatch(/not found or unauthorized/)
    })

    it('returns 400 if documents are not fully analyzed', async () => {
      ;(DocumentModel.findOne as jest.Mock)
        .mockResolvedValueOnce({ aiStatus: 'Pending' })
        .mockResolvedValueOnce({ aiStatus: 'Analyzed' })
      const result = await ComparisonService.performComparison('user1', 'id1', 'id2')
      expect(result.statusCode).toBe(400)
      expect(result.error).toMatch(/Neural Cortex/)
    })

    it('returns 400 if documents have no extracted text or summary', async () => {
      ;(DocumentModel.findOne as jest.Mock)
        .mockResolvedValueOnce({ aiStatus: 'Analyzed', extractedText: '' })
        .mockResolvedValueOnce({ aiStatus: 'Analyzed', extractedText: 'text' })
      const result = await ComparisonService.performComparison('user1', 'id1', 'id2')
      expect(result.statusCode).toBe(400)
      expect(result.error).toMatch(/extracted text or a summary/)
    })

    it('calls DeepThinkerService and returns the comparison result', async () => {
      const doc1 = { _id: '1', title: 'Doc 1', aiStatus: 'Analyzed', extractedText: 'text1' }
      const doc2 = { _id: '2', title: 'Doc 2', aiStatus: 'Analyzed', extractedText: 'text2' }
      ;(DocumentModel.findOne as jest.Mock).mockResolvedValueOnce(doc1).mockResolvedValueOnce(doc2)
      
      const mockComparison = { synthesis: 'synthesis' }
      ;(DeepThinkerService.compareDocuments as jest.Mock).mockResolvedValueOnce(mockComparison)

      const result = await ComparisonService.performComparison('user1', '1', '2')
      expect(result).toEqual({
        doc1: { _id: '1', title: 'Doc 1' },
        doc2: { _id: '2', title: 'Doc 2' },
        comparison: mockComparison
      })
    })
  })

  describe('getComparisonChatHistory()', () => {
    it('fetches chat history from DB', async () => {
      const mockExec = jest.fn().mockResolvedValue([{ role: 'user', content: 'hello' }])
      const mockSelect = jest.fn().mockReturnValue({ exec: mockExec })
      const mockSort = jest.fn().mockReturnValue({ select: mockSelect })
      ;(ComparisonMessageModel.find as jest.Mock).mockReturnValue({ sort: mockSort })

      const result = await ComparisonService.getComparisonChatHistory('user1', 'doc1', 'doc2')
      expect(result).toEqual([{ role: 'user', content: 'hello' }])
      expect(ComparisonMessageModel.find).toHaveBeenCalledWith({ user: 'user1', docIdA: 'doc1', docIdB: 'doc2' })
    })
  })

  describe('chatWithComparison()', () => {
    const mockLlmInvoke = jest.fn()
    const mockLlm = {
      withConfig: jest.fn().mockReturnThis(),
      invoke: mockLlmInvoke
    }

    beforeEach(() => {
      ComparisonService.init(mockLlm as any)
    })

    it('returns a fallback message if no relevant context is found', async () => {
      mockVectorStoreRetrieverInvoke.mockResolvedValueOnce([])
      const result = await ComparisonService.chatWithComparison(new mongoose.Types.ObjectId().toHexString(), new mongoose.Types.ObjectId().toHexString(), new mongoose.Types.ObjectId().toHexString(), 'query')
      expect(result).toMatch(/couldn't find any relevant information/)
    })

    it('performs RAG and saves messages on success', async () => {
      mockVectorStoreRetrieverInvoke.mockResolvedValueOnce([{ pageContent: 'chunk 1' }])
      
      const mockExec = jest.fn().mockResolvedValue([{ role: 'user', content: 'hi' }])
      const mockLimit = jest.fn().mockReturnValue({ exec: mockExec })
      const mockSort = jest.fn().mockReturnValue({ limit: mockLimit })
      ;(ComparisonMessageModel.find as jest.Mock).mockReturnValue({ sort: mockSort })

      mockLlmInvoke.mockResolvedValueOnce({ content: ' AI Response ' })

      const result = await ComparisonService.chatWithComparison(new mongoose.Types.ObjectId().toHexString(), new mongoose.Types.ObjectId().toHexString(), new mongoose.Types.ObjectId().toHexString(), 'query')
      
      expect(result).toBe('AI Response')
      expect(ComparisonMessageModel.insertMany).toHaveBeenCalledTimes(1)
    })
  })
})
