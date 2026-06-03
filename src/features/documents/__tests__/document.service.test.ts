import { DocumentService } from '../document.service'
import { DocumentChatService } from '../chat/document-chat.service'
import { DocumentModel } from '../document.model'
import Folder from '../../folders/folder.model'
import { User } from '../../users/user.model'
import { ComparisonRecordModel } from '../../comparison/comparison-record.model'
import { ComparisonMessageModel } from '../../comparison/comparison-chat.model'
import { configureCloudinary } from '../../../config/cloudinary'
import { EmbeddingService } from '../../ai/search/vector.service'
import { ChatMessageModel } from '../../ai/models/chat.model'

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('../document.model')
jest.mock('../../folders/folder.model')
jest.mock('../../ai/search/vector.service')
jest.mock('../../ai/models/chat.model')
jest.mock('../../users/user.model', () => ({
  User: {
    updateOne: jest.fn()
  }
}))
jest.mock('../../comparison/comparison-record.model', () => ({
  ComparisonRecordModel: {
    find: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn()
  }
}))
jest.mock('../../comparison/comparison-chat.model', () => ({
  ComparisonMessageModel: {
    deleteMany: jest.fn()
  }
}))
jest.mock('../../../config/cloudinary', () => ({
  configureCloudinary: jest.fn().mockReturnValue({
    uploader: {
      destroy: jest.fn().mockResolvedValue({ result: 'ok' })
    }
  })
}))

const mockCloudinary = configureCloudinary()

// Mongoose chain mocks for DocumentModel
const mockSelect = jest.fn().mockResolvedValue([])
const mockLimit = jest.fn().mockReturnValue({ select: mockSelect })
const mockSkip = jest.fn().mockReturnValue({ limit: mockLimit })
const mockSort = jest.fn().mockReturnValue({ skip: mockSkip })
const mockFind = jest.fn().mockReturnValue({ sort: mockSort })
;(DocumentModel.find as jest.Mock) = mockFind

// ChatModel mock
const mockChatModelInvoke = jest.fn()
const mockChatModel = { 
  invoke: mockChatModelInvoke,
  withConfig: jest.fn().mockReturnThis()
}

// Retriever mock
const mockRetrieverInvoke = jest.fn()
const mockAsRetriever = jest.fn().mockReturnValue({ invoke: mockRetrieverInvoke })
;(EmbeddingService.getVectorStore as jest.Mock).mockResolvedValue({
  asRetriever: mockAsRetriever
})

// Mongoose ChatMessageModel chain mocks
const mockChatLimit = jest.fn().mockResolvedValue([])
const mockChatSort2 = jest.fn().mockReturnValue({ limit: mockChatLimit })
const mockChatSelect = jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) })
const mockChatSort1 = jest.fn().mockReturnValue({ select: mockChatSelect })
const mockChatFind = jest.fn()
;(ChatMessageModel.find as jest.Mock) = mockChatFind

beforeEach(() => {
  jest.clearAllMocks()
  DocumentChatService.init(mockChatModel as any)

  // Reset chain
  mockFind.mockReturnValue({ sort: mockSort })
  mockSort.mockReturnValue({ skip: mockSkip })
  mockSkip.mockReturnValue({ limit: mockLimit })
  mockLimit.mockReturnValue({ select: mockSelect })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('DocumentService', () => {
  describe('getAll()', () => {
    it('applies basic filters and returns documents and total count', async () => {
      mockSelect.mockResolvedValueOnce([{ _id: 'doc1' }])
      ;(DocumentModel.countDocuments as jest.Mock).mockResolvedValueOnce(1)

      const filters = { fileType: 'PDF' }
      const result = await DocumentService.getAll('user1', filters, 0, 10, 'createdAt', -1)

      expect(mockFind).toHaveBeenCalledWith({ user: 'user1', fileType: 'PDF' })
      expect(mockSort).toHaveBeenCalledWith({ createdAt: -1 })
      expect(result.documents).toEqual([{ _id: 'doc1' }])
      expect(result.totalDocuments).toBe(1)
    })

    it('escapes and applies regex for semanticPath', async () => {
      mockSelect.mockResolvedValueOnce([])
      ;(DocumentModel.countDocuments as jest.Mock).mockResolvedValueOnce(0)

      const filters = { semanticPath: '/My/Folder/' }
      await DocumentService.getAll('user1', filters, 0, 10, 'createdAt', -1)

      expect(mockFind).toHaveBeenCalledWith({
        user: 'user1',
        semanticPath: { $regex: '^/?My/Folder(/|$)', $options: 'i' }
      })
    })
  })

  describe('updateById()', () => {
    it('updates document fields and touches parent folder if present', async () => {
      const mockDoc = {
        _id: 'doc1',
        title: 'Old',
        folder: 'folder1',
        save: jest.fn().mockResolvedValue(true)
      }
      ;(DocumentModel.findOne as jest.Mock).mockResolvedValueOnce(mockDoc)
      ;(Folder.findByIdAndUpdate as jest.Mock).mockResolvedValueOnce(true)

      const result = await DocumentService.updateById('user1', 'doc1', { title: 'New' })

      expect(result?.title).toBe('New')
      expect(mockDoc.save).toHaveBeenCalled()
      expect(Folder.findByIdAndUpdate).toHaveBeenCalledWith('folder1', {
        updatedAt: expect.any(Date)
      })
    })
  })

  describe('deleteById()', () => {
    it('deletes from db, destroys from cloudinary, updates parent folder, and cascades deletes', async () => {
      const mockDoc = {
        _id: 'doc1',
        fileType: 'PDF',
        cloudinaryPublicId: 'pub_id_123',
        folder: 'folder1',
        deleteOne: jest.fn().mockResolvedValue(true)
      }
      ;(DocumentModel.findOne as jest.Mock).mockResolvedValueOnce(mockDoc)
      ;(Folder.findByIdAndUpdate as jest.Mock).mockResolvedValueOnce(true)
      ;(ComparisonRecordModel.find as jest.Mock).mockResolvedValueOnce([{ _id: 'comp1' }])

      const success = await DocumentService.deleteById('user1', 'doc1')

      expect(success).toBe(true)
      expect(mockCloudinary.uploader.destroy).toHaveBeenCalledWith('pub_id_123', {
        resource_type: 'image'
      })
      expect(mockDoc.deleteOne).toHaveBeenCalled()
      expect(Folder.findByIdAndUpdate).toHaveBeenCalledWith('folder1', {
        updatedAt: expect.any(Date)
      })
      expect(ComparisonRecordModel.deleteMany).toHaveBeenCalledWith({ _id: { $in: ['comp1'] } })
      expect(ComparisonMessageModel.deleteMany).toHaveBeenCalledWith(expect.objectContaining({ user: 'user1' }))
      expect(User.updateOne).toHaveBeenCalledWith(
        { _id: 'user1', lastActiveDocumentId: 'doc1' },
        { $unset: { lastActiveDocumentId: '' } }
      )
    })
  })

  describe('bulkDelete()', () => {
    it('deletes multiple docs, their assets, updates parent folders, and cascades deletes', async () => {
      const mockDocs = [
        { _id: 'd1', fileType: 'Word', cloudinaryPublicId: 'c1', folder: 'f1' },
        { _id: 'd2', fileType: 'PDF', cloudinaryPublicId: 'c2', folder: 'f1' },
        { _id: 'd3', fileType: 'Image', cloudinaryPublicId: 'c3', folder: 'f2' }
      ]
      ;(DocumentModel.find as jest.Mock).mockReturnValueOnce(mockDocs)
      ;(DocumentModel.deleteMany as jest.Mock).mockResolvedValueOnce({ deletedCount: 3 })
      ;(Folder.updateMany as jest.Mock).mockResolvedValueOnce(true)
      ;(ComparisonRecordModel.find as jest.Mock).mockResolvedValueOnce([{ _id: 'comp2' }])

      const res = await DocumentService.bulkDelete('user1', ['d1', 'd2', 'd3'])

      expect(res.deletedCount).toBe(3)
      expect(mockCloudinary.uploader.destroy).toHaveBeenCalledTimes(3)
      expect(mockCloudinary.uploader.destroy).toHaveBeenCalledWith('c1', { resource_type: 'raw' })
      expect(mockCloudinary.uploader.destroy).toHaveBeenCalledWith('c2', { resource_type: 'image' })

      // Folder updates - should deduplicate to ['f1', 'f2']
      expect(Folder.updateMany).toHaveBeenCalledWith(
        { _id: { $in: ['f1', 'f2'] } },
        { $set: { updatedAt: expect.any(Date) } }
      )

      expect(ComparisonRecordModel.deleteMany).toHaveBeenCalledWith({ _id: { $in: ['comp2'] } })
      expect(ComparisonMessageModel.deleteMany).toHaveBeenCalledWith(expect.objectContaining({ user: 'user1' }))
      expect(User.updateOne).toHaveBeenCalledWith(
        { _id: 'user1', lastActiveDocumentId: { $in: ['d1', 'd2', 'd3'] } },
        { $unset: { lastActiveDocumentId: '' } }
      )
    })
  })

  describe('getStatuses()', () => {
    it('returns selected document fields', async () => {
      const mockFind = {
        select: jest.fn().mockResolvedValue([{ _id: 'd1', title: 'Doc 1', aiStatus: 'completed' }])
      }
      ;(DocumentModel.find as jest.Mock).mockReturnValueOnce(mockFind)

      const result = await DocumentService.getStatuses('u1', ['d1'])

      expect(DocumentModel.find).toHaveBeenCalledWith({ _id: { $in: ['d1'] }, user: 'u1' })
      expect(mockFind.select).toHaveBeenCalledWith('_id title aiStatus tags cognitiveLoad summary')
      expect(result[0].aiStatus).toBe('completed')
    })
  })


})
