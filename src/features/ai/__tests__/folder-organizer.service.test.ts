import { FolderOrganizerService } from '../organizer/folder-organizer.service'
import { AppError } from '../../../core/errors/AppError'
import Folder from '../../folders/folder.model'
import { DocumentModel } from '../../documents/document.model'

// ─── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('../../folders/folder.model', () => ({
  __esModule: true,
  default: {
    distinct: jest.fn(),
    find: jest.fn(),
    findOneAndUpdate: jest.fn(),
    countDocuments: jest.fn(),
    findById: jest.fn(),
    findByIdAndDelete: jest.fn()
  }
}))

jest.mock('../../documents/document.model', () => {
  const mockDocFindSelectPopulate = jest.fn()
  const mockDocFindSelect = jest.fn()
  
  return {
    DocumentModel: {
      find: jest.fn((query) => {
        return {
          select: jest.fn((sel) => {
            if (sel === 'folder') {
              return mockDocFindSelect()
            }
            return { populate: mockDocFindSelectPopulate }
          })
        }
      }),
      countDocuments: jest.fn(),
      bulkWrite: jest.fn(),
      _mockDocFindSelectPopulate: mockDocFindSelectPopulate,
      _mockDocFindSelect: mockDocFindSelect
    }
  }
})

// Extract mock references for assertions
const mockFolderDistinct = Folder.distinct as jest.Mock
const mockFolderFind = Folder.find as jest.Mock
const mockFolderFindOneAndUpdate = Folder.findOneAndUpdate as jest.Mock
const mockFolderCountDocuments = Folder.countDocuments as jest.Mock
const mockFolderFindById = Folder.findById as jest.Mock
const mockFolderFindByIdAndDelete = Folder.findByIdAndDelete as jest.Mock

const mockDocFindSelectPopulate = (DocumentModel as any)._mockDocFindSelectPopulate as jest.Mock
const mockDocFindSelect = (DocumentModel as any)._mockDocFindSelect as jest.Mock
const mockDocCountDocuments = DocumentModel.countDocuments as jest.Mock
const mockDocBulkWrite = DocumentModel.bulkWrite as jest.Mock

const mockStructuredInvoke = jest.fn()
const mockModel = {
  withStructuredOutput: jest.fn().mockReturnThis(),
  withConfig: jest.fn().mockReturnThis(),
  invoke: mockStructuredInvoke
}

describe('FolderOrganizerService', () => {
  beforeEach(() => {
    FolderOrganizerService.init(mockModel as any)
    jest.clearAllMocks()
  })

  describe('generateSemanticProposal()', () => {
    it('returns empty array if no documents are found in DB', async () => {
      mockFolderDistinct.mockResolvedValueOnce(['Finance', 'Work/Projects'])
      mockDocFindSelectPopulate.mockResolvedValueOnce([])

      const result = await FolderOrganizerService.generateSemanticProposal('user1', [{ title: 'test', id: '123' }])
      expect(result).toEqual([])
    })

    it('throws if any document is not fully analyzed', async () => {
      mockFolderDistinct.mockResolvedValueOnce([])
      mockDocFindSelectPopulate.mockResolvedValueOnce([
        { _id: '1', title: 'test1', aiStatus: 'Pending' }
      ])

      await expect(
        FolderOrganizerService.generateSemanticProposal('user1', [{ id: '1', title: 'test1' }])
      ).rejects.toThrow(AppError)
    })

    it('throws if any document is already organized', async () => {
      mockFolderDistinct.mockResolvedValueOnce([])
      mockDocFindSelectPopulate.mockResolvedValueOnce([
        { _id: '1', title: 'test1', aiStatus: 'Analyzed', isOrganized: true }
      ])

      await expect(
        FolderOrganizerService.generateSemanticProposal('user1', [{ id: '1', title: 'test1' }])
      ).rejects.toThrow(AppError)
    })

    it('invokes the LLM and enriches the response with human-readable originalPath', async () => {
      mockFolderDistinct.mockResolvedValueOnce(['OldPath'])
      mockDocFindSelectPopulate.mockResolvedValueOnce([
        { _id: { toString: () => '1' }, title: 'Invoice', aiStatus: 'Analyzed', isOrganized: false, semanticPath: 'Unsorted' }
      ])
      
      mockStructuredInvoke.mockResolvedValueOnce({
        updates: [{ documentId: '1', newPath: 'Finance/Invoices' }]
      })

      const result = await FolderOrganizerService.generateSemanticProposal('user1', [{ id: '1', title: 'Invoice' }])

      expect(result).toHaveLength(1)
      expect(result[0].newPath).toBe('Finance/Invoices')
      expect(result[0].originalPath).toBe('Unsorted/Invoice')
    })
    
    it('handles rate limits cleanly', async () => {
      mockFolderDistinct.mockResolvedValueOnce([])
      mockDocFindSelectPopulate.mockResolvedValueOnce([
        { _id: { toString: () => '1' }, title: 'Doc', aiStatus: 'Analyzed', isOrganized: false }
      ])
      
      mockStructuredInvoke.mockRejectedValueOnce({ status: 429 })

      await expect(
        FolderOrganizerService.generateSemanticProposal('user1', [{ id: '1', title: 'Doc' }])
      ).rejects.toThrow('AI provider rate limit exceeded')
    })
  })

  describe('applyPhysicalFolders()', () => {
    it('does nothing if updates array is empty', async () => {
      await FolderOrganizerService.applyPhysicalFolders('user1', [])
      expect(mockFolderFind).not.toHaveBeenCalled()
    })

    it('replaces "Random Files" with "Miscellaneous" when applying', async () => {
      // Mock old folder fetching
      mockDocFindSelect.mockResolvedValueOnce([])
      // Mock folder cache
      mockFolderFind.mockReturnValueOnce({ select: jest.fn().mockResolvedValue([]) })
      
      // Upsert mock
      mockFolderFindOneAndUpdate.mockResolvedValue({ _id: { toString: () => 'folder1' } })

      await FolderOrganizerService.applyPhysicalFolders('user1', [
        { documentId: 'doc1', newPath: 'Random Files/Test' }
      ])

      expect(mockFolderFindOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Miscellaneous' }),
        expect.anything(),
        expect.anything()
      )
    })

    it('caches parent IDs to minimize DB calls', async () => {
      mockDocFindSelect.mockResolvedValueOnce([])
      mockFolderFind.mockReturnValueOnce({ select: jest.fn().mockResolvedValue([{ _id: 'cached-root', path: 'Root' }]) })
      
      mockFolderFindOneAndUpdate.mockResolvedValue({ _id: { toString: () => 'new-sub' } })

      await FolderOrganizerService.applyPhysicalFolders('user1', [
        { documentId: 'doc1', newPath: 'Root/SubFolder' }
      ])

      // Should only call findOneAndUpdate for "SubFolder", not for "Root"
      expect(mockFolderFindOneAndUpdate).toHaveBeenCalledTimes(1)
      expect(mockFolderFindOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'SubFolder', parentFolder: 'cached-root' }),
        expect.anything(),
        expect.anything()
      )
      
      // Should perform a bulkWrite on DocumentModel
      expect(mockDocBulkWrite).toHaveBeenCalledTimes(1)
      const ops = mockDocBulkWrite.mock.calls[0][0]
      expect(ops[0].updateOne.update.$set.folder).toBe('new-sub')
    })

    it('prunes empty ghost folders recursively', async () => {
      mockDocFindSelect.mockResolvedValueOnce([
        { _id: 'doc1', folder: { toString: () => 'ghost1' } }
      ])
      mockFolderFind.mockReturnValueOnce({ select: jest.fn().mockResolvedValue([]) })
      mockFolderFindOneAndUpdate.mockResolvedValue({ _id: { toString: () => 'new1' } })
      
      // First pass: docCount=0, childCount=0 -> delete ghost1
      mockDocCountDocuments.mockResolvedValueOnce(0)
      mockFolderCountDocuments.mockResolvedValueOnce(0)
      mockFolderFindById.mockResolvedValueOnce({ _id: 'ghost1', name: 'Ghost', parentFolder: 'ghost2' })
      
      // Second pass: for ghost2, docCount=1 -> stop deleting
      mockDocCountDocuments.mockResolvedValueOnce(1)
      mockFolderCountDocuments.mockResolvedValueOnce(0)
      
      await FolderOrganizerService.applyPhysicalFolders('user1', [
        { documentId: 'doc1', newPath: 'New/Path' }
      ])

      expect(mockFolderFindByIdAndDelete).toHaveBeenCalledTimes(1)
      expect(mockFolderFindByIdAndDelete).toHaveBeenCalledWith('ghost1')
    })
  })
})
