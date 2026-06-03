/**
 * UploadService — unit tests
 *
 * Mocking strategy:
 * - configureCloudinary() is called at module load level, so we mock it in the
 *   factory with a stable mock object whose methods we can reconfigure per test.
 * - streamifier.createReadStream is mocked to return { pipe: jest.fn() } so the
 *   stream chain doesn't need a real stream.
 * - DocumentModel, Folder, and AIService are fully mocked.
 */

// ─── Stable mock objects (mock-prefix allows hoisting in jest.mock factories) ─

const mockPipe         = jest.fn()
const mockUploadStream = jest.fn()
const mockUploader     = { upload_stream: mockUploadStream }

// ─── Module mocks (MUST be declared before any imports) ──────────────────────

jest.mock('../../../config/cloudinary', () => ({
  configureCloudinary: jest.fn(() => ({ uploader: mockUploader }))
}))

jest.mock('streamifier', () => ({
  createReadStream: jest.fn(() => ({ pipe: mockPipe }))
}))

jest.mock('../document.model', () => ({
  DocumentModel: {
    find:        jest.fn(),
    exists:      jest.fn(),
    create:      jest.fn(),
    insertMany:  jest.fn()
  }
}))

jest.mock('../../folders/folder.model', () => ({
  __esModule: true,
  default: {
    findOne:           jest.fn(),
    create:            jest.fn(),
    findByIdAndUpdate: jest.fn(),
    updateMany:        jest.fn()
  }
}))

jest.mock('../../ai/ai.service', () => ({
  AIService: {
    processPendingDocuments: jest.fn().mockResolvedValue(undefined)
  }
}))

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { UploadService } from '../upload/upload.service'
import { DocumentModel } from '../document.model'
import Folder from '../../folders/folder.model'
import { AIService } from '../../ai/ai.service'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Creates a fake Multer file for testing */
const makeFile = (
  name: string,
  mimeType: string = 'application/pdf',
  size: number = 1024
): Express.Multer.File =>
  ({
    fieldname:    'files',
    originalname: name,
    encoding:     '7bit',
    mimetype:     mimeType,
    buffer:       Buffer.from('fake content'),
    size,
    stream:       null as any,
    destination:  '',
    filename:     name,
    path:         ''
  })

/** Makes upload_stream call the callback immediately with a success result */
const simulateCloudinarySuccess = (url = 'https://cdn.example.com/file.pdf', id = 'pub-id') => {
  mockUploadStream.mockImplementation((_opts: any, cb: any) => {
    cb(null, { secure_url: url, public_id: id })
    return {}
  })
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks()
  ;(AIService.processPendingDocuments as jest.Mock).mockResolvedValue(undefined)
})

// ─────────────────────────────────────────────────────────────────────────────

describe('UploadService', () => {
  // ──────────────────────────────────────────────────────────────────────────
  describe('uploadTextSnippet()', () => {
    const userId   = 'user1'
    const snippetDoc = { _id: 'doc1', title: 'My Snippet' }

    it('creates "Random files" folder when it does not exist', async () => {
      ;(Folder.findOne as jest.Mock).mockResolvedValueOnce(null)
      ;(Folder.create as jest.Mock).mockResolvedValueOnce({ _id: 'folder1', isPinned: true })
      ;(DocumentModel.create as jest.Mock).mockResolvedValueOnce(snippetDoc)
      ;(Folder.findByIdAndUpdate as jest.Mock).mockResolvedValue(null)

      await UploadService.uploadTextSnippet(userId, { extractedText: 'Hello world' })

      expect(Folder.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Random files', isPinned: true })
      )
    })

    it('pins an existing but un-pinned "Random files" folder', async () => {
      ;(Folder.findOne as jest.Mock).mockResolvedValueOnce({ _id: 'f1', isPinned: false })
      ;(Folder.findByIdAndUpdate as jest.Mock).mockResolvedValue(null)
      ;(DocumentModel.create as jest.Mock).mockResolvedValueOnce(snippetDoc)

      await UploadService.uploadTextSnippet(userId, { extractedText: 'Hello' })

      expect(Folder.create).not.toHaveBeenCalled()
      expect(Folder.findByIdAndUpdate).toHaveBeenCalledWith('f1', { isPinned: true })
    })

    it('reuses existing pinned folder without creating a new one', async () => {
      ;(Folder.findOne as jest.Mock).mockResolvedValueOnce({ _id: 'f1', isPinned: true })
      ;(DocumentModel.create as jest.Mock).mockResolvedValueOnce(snippetDoc)
      ;(Folder.findByIdAndUpdate as jest.Mock).mockResolvedValue(null)

      await UploadService.uploadTextSnippet(userId, { extractedText: 'Hello' })

      expect(Folder.create).not.toHaveBeenCalled()
    })

    it('generates a default title from extractedText when no title is provided', async () => {
      ;(Folder.findOne as jest.Mock).mockResolvedValueOnce({ _id: 'f1', isPinned: true })
      ;(Folder.findByIdAndUpdate as jest.Mock).mockResolvedValue(null)
      ;(DocumentModel.create as jest.Mock).mockResolvedValueOnce(snippetDoc)

      await UploadService.uploadTextSnippet(userId, { extractedText: 'The quick brown fox jumps' })

      expect(DocumentModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Snippet: The quick brown fox ...' })
      )
    })

    it('uses the provided title when given', async () => {
      ;(Folder.findOne as jest.Mock).mockResolvedValueOnce({ _id: 'f1', isPinned: true })
      ;(Folder.findByIdAndUpdate as jest.Mock).mockResolvedValue(null)
      ;(DocumentModel.create as jest.Mock).mockResolvedValueOnce(snippetDoc)

      await UploadService.uploadTextSnippet(userId, { title: 'My custom title', extractedText: 'Content' })

      expect(DocumentModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'My custom title' })
      )
    })

    it('returns the created snippet document', async () => {
      ;(Folder.findOne as jest.Mock).mockResolvedValueOnce({ _id: 'f1', isPinned: true })
      ;(Folder.findByIdAndUpdate as jest.Mock).mockResolvedValue(null)
      ;(DocumentModel.create as jest.Mock).mockResolvedValueOnce(snippetDoc)

      const result = await UploadService.uploadTextSnippet(userId, { extractedText: 'Hello' })

      expect(result).toEqual(snippetDoc)
    })
  })

  // ──────────────────────────────────────────────────────────────────────────
  describe('uploadPhysicalFiles()', () => {
    const userId = 'user1'

    it('skips duplicate files detected by SHA-256 hash', async () => {
      ;(DocumentModel.exists as jest.Mock).mockResolvedValueOnce({ _id: 'existing' })

      const files = [makeFile('report.pdf')]
      const result = await UploadService.uploadPhysicalFiles(userId, files, undefined, [])

      expect(result.skippedFiles).toContain('report.pdf')
      expect(result.createdDocs).toHaveLength(0)
      expect(mockUploadStream).not.toHaveBeenCalled()
    })

    it('returns empty createdDocs array when ALL files are duplicates', async () => {
      ;(DocumentModel.exists as jest.Mock)
        .mockResolvedValueOnce({ _id: 'a' })
        .mockResolvedValueOnce({ _id: 'b' })

      const files = [makeFile('a.pdf'), makeFile('b.pdf')]
      const result = await UploadService.uploadPhysicalFiles(userId, files, undefined, [])

      expect(result.createdDocs).toHaveLength(0)
      expect(result.skippedFiles).toHaveLength(2)
    })

    it('uploads new files to Cloudinary and inserts them into the DB', async () => {
      simulateCloudinarySuccess()
      ;(DocumentModel.exists as jest.Mock).mockResolvedValueOnce(null)
      ;(DocumentModel.find as jest.Mock).mockReturnValue({ select: jest.fn().mockResolvedValue([]) })
      ;(Folder.findOne as jest.Mock).mockResolvedValueOnce(null)
      ;(Folder.create as jest.Mock).mockResolvedValueOnce({ _id: 'folder1' })
      ;(DocumentModel.insertMany as jest.Mock).mockResolvedValueOnce([
        { _id: 'doc1', title: 'report.pdf' }
      ])
      ;(Folder.updateMany as jest.Mock).mockResolvedValue(null)

      const files = [makeFile('report.pdf', 'application/pdf')]
      const result = await UploadService.uploadPhysicalFiles(userId, files, undefined, ['/report.pdf'])

      expect(mockUploadStream).toHaveBeenCalled()
      expect(DocumentModel.insertMany).toHaveBeenCalled()
      expect(result.createdDocs).toHaveLength(1)
      expect(result.skippedFiles).toHaveLength(0)
    })

    it('fires AI processing for successfully uploaded documents', async () => {
      simulateCloudinarySuccess()
      ;(DocumentModel.exists as jest.Mock).mockResolvedValueOnce(null)
      ;(DocumentModel.find as jest.Mock).mockReturnValue({ select: jest.fn().mockResolvedValue([]) })
      ;(Folder.findOne as jest.Mock).mockResolvedValueOnce(null)
      ;(Folder.create as jest.Mock).mockResolvedValueOnce({ _id: 'folder1' })
      ;(DocumentModel.insertMany as jest.Mock).mockResolvedValueOnce([
        { _id: { toString: () => 'doc1' }, title: 'report.pdf' }
      ])
      ;(Folder.updateMany as jest.Mock).mockResolvedValue(null)

      const files = [makeFile('report.pdf')]
      await UploadService.uploadPhysicalFiles(userId, files, undefined, [])

      expect(AIService.processPendingDocuments).toHaveBeenCalled()
    })

    it('sets aiStatus to Pending for physical file uploads', async () => {
      simulateCloudinarySuccess()
      ;(DocumentModel.exists as jest.Mock).mockResolvedValueOnce(null)
      ;(DocumentModel.find as jest.Mock).mockReturnValue({ select: jest.fn().mockResolvedValue([]) })
      ;(Folder.findOne as jest.Mock).mockResolvedValueOnce(null)
      ;(Folder.create as jest.Mock).mockResolvedValueOnce({ _id: 'f1' })
      ;(DocumentModel.insertMany as jest.Mock).mockResolvedValueOnce([{ _id: 'doc1' }])
      ;(Folder.updateMany as jest.Mock).mockResolvedValue(null)

      const files = [makeFile('report.pdf')]
      await UploadService.uploadPhysicalFiles(userId, files, undefined, [])

      const insertedDocs = (DocumentModel.insertMany as jest.Mock).mock.calls[0][0]
      expect(insertedDocs[0].aiStatus).toBe('Pending')
    })

    it('assigns Heavy cognitiveLoad to files over 5 MB', async () => {
      simulateCloudinarySuccess()
      const bigFileSizeBytes = 6 * 1024 * 1024 // 6 MB
      ;(DocumentModel.exists as jest.Mock).mockResolvedValueOnce(null)
      ;(DocumentModel.find as jest.Mock).mockReturnValue({ select: jest.fn().mockResolvedValue([]) })
      ;(Folder.findOne as jest.Mock).mockResolvedValueOnce(null)
      ;(Folder.create as jest.Mock).mockResolvedValueOnce({ _id: 'f1' })
      ;(DocumentModel.insertMany as jest.Mock).mockResolvedValueOnce([{ _id: 'doc1' }])
      ;(Folder.updateMany as jest.Mock).mockResolvedValue(null)

      const files = [makeFile('big.pdf', 'application/pdf', bigFileSizeBytes)]
      await UploadService.uploadPhysicalFiles(userId, files, undefined, [])

      const insertedDocs = (DocumentModel.insertMany as jest.Mock).mock.calls[0][0]
      expect(insertedDocs[0].cognitiveLoad).toBe('Heavy')
    })

    it('infers correct fileType from MIME type', async () => {
      simulateCloudinarySuccess()
      ;(DocumentModel.exists as jest.Mock).mockResolvedValueOnce(null)
      ;(DocumentModel.find as jest.Mock).mockReturnValue({ select: jest.fn().mockResolvedValue([]) })
      ;(Folder.findOne as jest.Mock).mockResolvedValueOnce(null)
      ;(Folder.create as jest.Mock).mockResolvedValueOnce({ _id: 'f1' })
      ;(DocumentModel.insertMany as jest.Mock).mockResolvedValueOnce([{ _id: 'doc1' }])
      ;(Folder.updateMany as jest.Mock).mockResolvedValue(null)

      const files = [makeFile('photo.jpg', 'image/jpeg')]
      await UploadService.uploadPhysicalFiles(userId, files, undefined, [])

      const insertedDocs = (DocumentModel.insertMany as jest.Mock).mock.calls[0][0]
      expect(insertedDocs[0].fileType).toBe('Image')
    })
  })
})
