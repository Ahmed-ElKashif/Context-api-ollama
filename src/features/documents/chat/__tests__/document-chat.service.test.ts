import { DocumentChatService } from '../document-chat.service'
import { ChatMessageModel } from '../../../ai/models/chat.model'
import { EmbeddingService } from '../../../ai/search/vector.service'

jest.mock('../../../ai/models/chat.model')
jest.mock('../../../ai/search/vector.service')

const mockChatModelInvoke = jest.fn()
const mockChatModel = { 
  invoke: mockChatModelInvoke,
  withConfig: jest.fn().mockReturnThis()
}

const mockRetrieverInvoke = jest.fn()
const mockAsRetriever = jest.fn().mockReturnValue({ invoke: mockRetrieverInvoke })
;(EmbeddingService.getVectorStore as jest.Mock).mockResolvedValue({
  asRetriever: mockAsRetriever
})

const mockChatExec = jest.fn()
const mockChatLimit = jest.fn().mockReturnValue({ exec: mockChatExec })
const mockChatSort = jest.fn().mockReturnValue({ limit: mockChatLimit })
;(ChatMessageModel.find as jest.Mock).mockReturnValue({ sort: mockChatSort })

describe('DocumentChatService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    DocumentChatService.init(mockChatModel as any)
  })

  describe('chatWithDocument()', () => {
    it('performs vector search, calls LLM, and saves chat history', async () => {
      mockChatExec.mockResolvedValueOnce([{ role: 'user', content: 'hello' }])
      mockRetrieverInvoke.mockResolvedValueOnce([{ pageContent: 'Document context here.' }])
      mockChatModelInvoke.mockResolvedValueOnce({ content: 'AI Answer' })

      const validDocId = '5f8d04f3b54764421b7156d1'
      const validUserId = '5f8d04f3b54764421b7156d2'
      const result = await DocumentChatService.chatWithDocument(validDocId, validUserId, 'What is this?')

      expect(result).toBe('AI Answer')
      expect(mockRetrieverInvoke).toHaveBeenCalledWith('What is this?')
      expect(mockChatModel.withConfig).toHaveBeenCalledWith({ timeout: 30000 })
      expect(mockChatModelInvoke).toHaveBeenCalled()
      expect(ChatMessageModel.insertMany).toHaveBeenCalledWith([
        { documentId: validDocId, user: validUserId, role: 'user', content: 'What is this?' },
        { documentId: validDocId, user: validUserId, role: 'assistant', content: 'AI Answer' }
      ])
    })

    it('returns a fallback message if no relevant context is found', async () => {
      mockRetrieverInvoke.mockResolvedValueOnce([]) // No context chunks

      const validDocId = '5f8d04f3b54764421b7156d1'
      const validUserId = '5f8d04f3b54764421b7156d2'
      const result = await DocumentChatService.chatWithDocument(validDocId, validUserId, 'Hello')

      expect(result).toBe(
        "I couldn't find any relevant information in this document to answer your question."
      )
      expect(mockChatModelInvoke).not.toHaveBeenCalled()
    })
  })
})
