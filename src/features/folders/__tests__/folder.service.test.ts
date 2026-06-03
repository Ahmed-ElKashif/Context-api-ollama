jest.mock('archiver', () => ({
  create: jest.fn(),
  ZipArchive: jest.fn()
}))

import { FolderService } from '../folder.service'
import Folder from '../folder.model'
import { DocumentModel } from '../../documents/document.model'
import { EmbeddingService } from '../../ai/search/vector.service'
import { ChatMessageModel } from '../../ai/models/chat.model'
import { ComparisonRecordModel } from '../../comparison/comparison-record.model'
import { ComparisonMessageModel } from '../../comparison/comparison-chat.model'
import { configureCloudinary } from '../../../config/cloudinary'

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('../folder.model')
jest.mock('../../documents/document.model')
jest.mock('../../ai/search/vector.service')
jest.mock('../../ai/models/chat.model')
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

// Folder Mongoose chain mocks
const mockFolderLimit = jest.fn().mockResolvedValue([])
const mockFolderSkip = jest.fn().mockReturnValue({ limit: mockFolderLimit })
const mockFolderSort = jest.fn().mockReturnValue({ skip: mockFolderSkip })
const mockFolderFind = jest.fn().mockReturnValue({ sort: mockFolderSort })
;(Folder.find as jest.Mock) = mockFolderFind

// Document Mongoose chain mocks
const mockDocLimit = jest.fn().mockResolvedValue([])
const mockDocSkip = jest.fn().mockReturnValue({ limit: mockDocLimit })
const mockDocSort = jest.fn().mockReturnValue({ skip: mockDocSkip })
const mockDocFind = jest.fn().mockReturnValue({ sort: mockDocSort })
;(DocumentModel.find as jest.Mock) = mockDocFind

beforeEach(() => {
  jest.clearAllMocks()

  // Reset Folder chain
  mockFolderFind.mockReturnValue({ sort: mockFolderSort })
  mockFolderSort.mockReturnValue({ skip: mockFolderSkip })
  mockFolderSkip.mockReturnValue({ limit: mockFolderLimit })
  mockFolderLimit.mockResolvedValue([])

  // Reset Document chain
  mockDocFind.mockReturnValue({ sort: mockDocSort })
  mockDocSort.mockReturnValue({ skip: mockDocSkip })
  mockDocSkip.mockReturnValue({ limit: mockDocLimit })
  mockDocLimit.mockResolvedValue([])
})

// ─────────────────────────────────────────────────────────────────────────────

describe('FolderService', () => {
  describe('createFolder()', () => {
    it('returns error if folder already exists', async () => {
      ;(Folder.findOne as jest.Mock).mockResolvedValueOnce({ _id: 'existing' })

      const result = await FolderService.createFolder('user1', 'Finance', 'parent1')

      expect(result.error).toBe('A folder with this name already exists here.')
      expect(Folder.create).not.toHaveBeenCalled()
    })

    it('returns error if parent folder not found', async () => {
      ;(Folder.findOne as jest.Mock).mockResolvedValueOnce(null)
      ;(Folder.findById as jest.Mock).mockResolvedValueOnce(null)

      const result = await FolderService.createFolder('user1', 'Finance', 'parent1')

      expect(result.error).toBe('Parent folder not found.')
      expect(Folder.create).not.toHaveBeenCalled()
    })

    it('creates top-level folder successfully', async () => {
      ;(Folder.findOne as jest.Mock).mockResolvedValueOnce(null)
      ;(Folder.create as jest.Mock).mockResolvedValueOnce({ _id: 'f1', name: 'Finance' })

      const result = await FolderService.createFolder('user1', 'Finance')

      expect(result.folder).toEqual({ _id: 'f1', name: 'Finance' })
      expect(Folder.create).toHaveBeenCalledWith({
        name: 'Finance',
        user: 'user1',
        parentFolder: null,
        path: 'Finance'
      })
    })

    it('creates sub-folder and appends to parent path', async () => {
      ;(Folder.findOne as jest.Mock).mockResolvedValueOnce(null)
      ;(Folder.findById as jest.Mock).mockResolvedValueOnce({ _id: 'parent1', path: 'Finance' })
      ;(Folder.create as jest.Mock).mockResolvedValueOnce({ _id: 'f2', name: 'Q1' })

      const result = await FolderService.createFolder('user1', 'Q1', 'parent1')

      expect(result.folder).toEqual({ _id: 'f2', name: 'Q1' })
      expect(Folder.create).toHaveBeenCalledWith({
        name: 'Q1',
        user: 'user1',
        parentFolder: 'parent1',
        path: 'Finance/Q1'
      })
    })
  })

  describe('renameFolder()', () => {
    it('returns error if target folder not found', async () => {
      ;(Folder.findOne as jest.Mock).mockResolvedValueOnce(null)
      const result = await FolderService.renameFolder('user1', 'f1', 'NewName')
      expect(result.error).toBe('Folder not found.')
    })

    it('returns error if new name collides with existing folder', async () => {
      ;(Folder.findOne as jest.Mock)
        .mockResolvedValueOnce({ _id: 'f1', name: 'OldName', parentFolder: 'p1' })
        .mockResolvedValueOnce({ _id: 'collision' }) // Collision exists

      const result = await FolderService.renameFolder('user1', 'f1', 'NewName')
      expect(result.error).toBe('Name already in use in this destination.')
    })

    it('renames folder and updates its path correctly', async () => {
      const mockFolder = {
        _id: 'f1',
        name: 'OldName',
        path: 'Root/OldName',
        parentFolder: 'p1',
        updatedAt: null,
        save: jest.fn().mockResolvedValue(true)
      }

      ;(Folder.findOne as jest.Mock)
        .mockResolvedValueOnce(mockFolder) // target
        .mockResolvedValueOnce(null)       // no collision

      const result = await FolderService.renameFolder('user1', 'f1', 'NewName')

      expect(result.folder?.name).toBe('NewName')
      expect(result.folder?.path).toBe('Root/NewName')
      expect(result.folder?.updatedAt).not.toBeNull()
      expect(mockFolder.save).toHaveBeenCalled()
    })
  })

  describe('deleteFolderWithContents()', () => {
    it('returns error if target folder not found', async () => {
      ;(Folder.findOne as jest.Mock).mockResolvedValueOnce(null)
      const result = await FolderService.deleteFolderWithContents('user1', 'f1')
      expect(result.error).toBe('Folder not found.')
    })

    it('deletes subfolders, documents, and destroys Cloudinary assets', async () => {
      const targetFolder = { _id: 'root', path: 'Root' }
      const subFolders = [{ _id: 'f1' }, { _id: 'f2' }]
      const docs = [
        { _id: 'd1', fileType: 'PDF', cloudinaryPublicId: 'pub1' },
        { _id: 'd2', fileType: 'Word', cloudinaryPublicId: 'pub2' }
      ]

      ;(Folder.findOne as jest.Mock).mockResolvedValueOnce(targetFolder)
      mockFolderFind.mockReturnValueOnce(subFolders) // foldersToDelete
      mockDocFind.mockReturnValueOnce(docs)          // documentsToDelete
      ;(DocumentModel.deleteMany as jest.Mock).mockResolvedValueOnce(true)
      ;(Folder.deleteMany as jest.Mock).mockResolvedValueOnce(true)
      ;(ComparisonRecordModel.find as jest.Mock).mockResolvedValueOnce([{ _id: 'comp1' }])

      const result = await FolderService.deleteFolderWithContents('user1', 'root')

      expect(result.foldersDeleted).toBe(2)
      expect(result.documentsDeleted).toBe(2)
      
      expect(mockCloudinary.uploader.destroy).toHaveBeenCalledTimes(2)
      expect(mockCloudinary.uploader.destroy).toHaveBeenCalledWith('pub1', { resource_type: 'image' })
      expect(mockCloudinary.uploader.destroy).toHaveBeenCalledWith('pub2', { resource_type: 'raw' })

      expect(EmbeddingService.deleteDocumentChunks).toHaveBeenCalledWith(['d1', 'd2'], 'user1')
      expect(ChatMessageModel.deleteMany).toHaveBeenCalledWith({ documentId: { $in: ['d1', 'd2'] }, user: 'user1' })
      expect(ComparisonRecordModel.deleteMany).toHaveBeenCalledWith({ _id: { $in: ['comp1'] } })
      expect(ComparisonMessageModel.deleteMany).toHaveBeenCalledWith(expect.objectContaining({ user: 'user1' }))

      expect(DocumentModel.deleteMany).toHaveBeenCalledWith({
        user: 'user1',
        folder: { $in: ['f1', 'f2'] }
      })
      expect(Folder.deleteMany).toHaveBeenCalledWith({
        user: 'user1',
        _id: { $in: ['f1', 'f2'] }
      })
    })
  })

  describe('getTree()', () => {
    it('returns sorted folder tree', async () => {
      const tree = [{ _id: 'f1' }]
      mockFolderSort.mockResolvedValueOnce(tree)

      const result = await FolderService.getTree('user1')

      expect(mockFolderFind).toHaveBeenCalledWith({ user: 'user1' })
      expect(mockFolderSort).toHaveBeenCalledWith({ path: 1 })
      expect(result).toEqual(tree)
    })
  })

  describe('getContents()', () => {
    it('handles mixed pagination properly when folders fit completely on page', async () => {
      ;(Folder.countDocuments as jest.Mock).mockResolvedValueOnce(2)
      ;(DocumentModel.countDocuments as jest.Mock).mockResolvedValueOnce(5)
      
      const mockFolders = [{ _id: 'f1' }, { _id: 'f2' }]
      const mockDocs = [{ _id: 'd1' }, { _id: 'd2' }, { _id: 'd3' }]
      
      mockFolderLimit.mockResolvedValueOnce(mockFolders)
      mockDocLimit.mockResolvedValueOnce(mockDocs)
      
      // skip 0, limit 5
      const result = await FolderService.getContents('user1', 'target', 0, 5, undefined, undefined, 'title', 1)
      
      expect(result.folders).toEqual(mockFolders)
      expect(result.documents).toEqual(mockDocs)
      expect(result.totalDocuments).toBe(7)
      
      // Folder query limit logic
      expect(mockFolderLimit).toHaveBeenCalledWith(2) // folderLimit = min(5, 2 - 0) = 2
      // Document query limit logic for remaining space
      expect(mockDocLimit).toHaveBeenCalledWith(3) // remainingSpace = 5 - 2 = 3
    })
  })
})
