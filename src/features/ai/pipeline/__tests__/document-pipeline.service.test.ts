import { DocumentPipelineService } from '../document-pipeline.service'
import { DocumentModel } from '../../../documents/document.model'
import { EmbeddingService } from '../../search/vector.service'
import { OrchestratorService } from '../../agents/orchestrator.service'
import { CognitiveLoadService } from '../../agents/cognitive-load.service'
import { VisualCortexService } from '../../agents/visual-cortex.service'
import { TokenBudgetService } from '../../../../core/services/token-budget.service'
import { aiEvents } from '../../ai.events'
import { PDFParse } from 'pdf-parse'
import mammoth from 'mammoth'
import * as xlsx from 'xlsx'

jest.mock('../../../documents/document.model')
jest.mock('../../search/vector.service')
jest.mock('../../agents/orchestrator.service')
jest.mock('../../agents/cognitive-load.service')
jest.mock('../../agents/visual-cortex.service')
jest.mock('../../../../core/services/token-budget.service')
jest.mock('../../ai.events', () => ({
  aiEvents: { emit: jest.fn() }
}))
jest.mock('pdf-parse', () => {
  return {
    PDFParse: jest.fn().mockImplementation(() => ({
      getText: jest.fn().mockResolvedValue({ text: 'PDF content' })
    }))
  }
})
jest.mock('mammoth', () => ({ extractRawText: jest.fn() }))
jest.mock('xlsx', () => ({
  read: jest.fn(),
  utils: { sheet_to_csv: jest.fn() }
}))

global.fetch = jest.fn()

describe('DocumentPipelineService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(global.fetch as jest.Mock).mockResolvedValue({
      arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(8))
    })
    ;(TokenBudgetService.recordUsage as jest.Mock).mockResolvedValue(true)
  })

  describe('processPendingDocuments()', () => {
    it('processes a TextSnippet document successfully', async () => {
      const mockDoc = {
        _id: 'doc1',
        user: { _id: 'u1', persona: 'general' },
        fileType: 'TextSnippet',
        extractedText: 'Hello world'
      }
      
      const mockFindById = jest.fn().mockReturnValue({ populate: jest.fn().mockResolvedValue(mockDoc) })
      ;(DocumentModel.findById as jest.Mock) = mockFindById
      ;(DocumentModel.findByIdAndUpdate as jest.Mock).mockResolvedValue(mockDoc)
      
      ;(OrchestratorService.analyzeDocumentMetadata as jest.Mock).mockResolvedValue({
        summary: 'Summary', tags: ['tag'], type: 'article'
      })
      ;(CognitiveLoadService.evaluateText as jest.Mock).mockResolvedValue({
        load: 'low', score: 2, reason: 'Easy'
      })

      await DocumentPipelineService.processPendingDocuments(['doc1'])

      expect(DocumentModel.findByIdAndUpdate).toHaveBeenCalledWith('doc1', { aiStatus: 'Processing' })
      expect(DocumentModel.findByIdAndUpdate).toHaveBeenCalledWith('doc1', { extractedText: 'Hello world' })
      expect(OrchestratorService.analyzeDocumentMetadata).toHaveBeenCalledWith('doc1', 'Hello world', 'general')
      expect(CognitiveLoadService.evaluateText).toHaveBeenCalledWith('Hello world')
      expect(EmbeddingService.upsert).toHaveBeenCalledWith('Hello world', 'doc1', 'u1')
      expect(DocumentModel.findByIdAndUpdate).toHaveBeenCalledWith('doc1', expect.objectContaining({ aiStatus: 'Analyzed' }), { new: true })
      expect(aiEvents.emit).toHaveBeenCalledWith('status-update', expect.objectContaining({ aiStatus: 'Analyzed' }))
      expect(TokenBudgetService.recordUsage).toHaveBeenCalled()
    })

    it('processes a PDF document successfully', async () => {
      const mockDoc = {
        _id: 'doc1',
        user: { _id: 'u1', persona: 'general' },
        fileType: 'PDF',
        cloudinaryUrl: 'http://pdf'
      }
      ;(DocumentModel.findById as unknown as jest.Mock).mockReturnValue({ populate: jest.fn().mockResolvedValue(mockDoc), select: jest.fn().mockResolvedValue(mockDoc) })
      ;(OrchestratorService.analyzeDocumentMetadata as jest.Mock).mockResolvedValue({ summary: 'S', tags: [], type: 't' })
      ;(CognitiveLoadService.evaluateText as jest.Mock).mockResolvedValue({ load: 'low', score: 1, reason: 'R' })

      await DocumentPipelineService.processPendingDocuments(['doc1'])

      expect(PDFParse).toHaveBeenCalled()
      expect(OrchestratorService.analyzeDocumentMetadata).toHaveBeenCalledWith('doc1', 'PDF content', 'general')
    })

    it('processes a Word document successfully', async () => {
      const mockDoc = {
        _id: 'doc1',
        user: { _id: 'u1', persona: 'general' },
        fileType: 'Word',
        cloudinaryUrl: 'http://word'
      }
      ;(DocumentModel.findById as unknown as jest.Mock).mockReturnValue({ populate: jest.fn().mockResolvedValue(mockDoc) })
      ;(mammoth.extractRawText as jest.Mock).mockResolvedValue({ value: 'Word content' })
      ;(OrchestratorService.analyzeDocumentMetadata as jest.Mock).mockResolvedValue({ summary: 'S', tags: [], type: 't' })
      ;(CognitiveLoadService.evaluateText as jest.Mock).mockResolvedValue({ load: 'low', score: 1, reason: 'R' })

      await DocumentPipelineService.processPendingDocuments(['doc1'])

      expect(mammoth.extractRawText).toHaveBeenCalled()
      expect(OrchestratorService.analyzeDocumentMetadata).toHaveBeenCalledWith('doc1', 'Word content', 'general')
    })

    it('processes an Excel document successfully', async () => {
      const mockDoc = {
        _id: 'doc1',
        user: { _id: 'u1', persona: 'general' },
        fileType: 'Excel',
        cloudinaryUrl: 'http://excel'
      }
      ;(DocumentModel.findById as unknown as jest.Mock).mockReturnValue({ populate: jest.fn().mockResolvedValue(mockDoc) })
      
      const mockWorkbook = { SheetNames: ['Sheet1'], Sheets: { Sheet1: {} } }
      ;(xlsx.read as jest.Mock).mockReturnValue(mockWorkbook)
      ;(xlsx.utils.sheet_to_csv as jest.Mock).mockReturnValue('col1,col2\nval1,val2')
      
      ;(OrchestratorService.analyzeDocumentMetadata as jest.Mock).mockResolvedValue({ summary: 'S', tags: [], type: 't' })
      ;(CognitiveLoadService.evaluateText as jest.Mock).mockResolvedValue({ load: 'low', score: 1, reason: 'R' })

      await DocumentPipelineService.processPendingDocuments(['doc1'])

      expect(xlsx.read).toHaveBeenCalled()
      expect(xlsx.utils.sheet_to_csv).toHaveBeenCalled()
      expect(OrchestratorService.analyzeDocumentMetadata).toHaveBeenCalledWith('doc1', expect.stringContaining('val1'), 'general')
    })

    it('processes an Image document successfully using Visual Cortex', async () => {
      const mockDoc = {
        _id: 'doc1',
        user: { _id: 'u1', persona: 'general' },
        fileType: 'Image',
        cloudinaryUrl: 'http://img'
      }
      ;(DocumentModel.findById as unknown as jest.Mock).mockReturnValue({ populate: jest.fn().mockResolvedValue(mockDoc) })
      ;(VisualCortexService.extractImageContent as jest.Mock).mockResolvedValue('Image content')
      ;(OrchestratorService.analyzeDocumentMetadata as jest.Mock).mockResolvedValue({ summary: 'S', tags: [], type: 't' })
      ;(CognitiveLoadService.evaluateText as jest.Mock).mockResolvedValue({ load: 'low', score: 1, reason: 'R' })

      await DocumentPipelineService.processPendingDocuments(['doc1'])

      expect(VisualCortexService.extractImageContent).toHaveBeenCalled()
      expect(OrchestratorService.analyzeDocumentMetadata).toHaveBeenCalledWith('doc1', 'Image content', 'general')
    })

    it('sets aiStatus to Failed if processing throws an error', async () => {
      const mockDoc = {
        _id: 'doc1',
        user: { _id: 'u1', persona: 'general' },
        fileType: 'TextSnippet',
        extractedText: 'Hello world'
      }
;(DocumentModel.findById as unknown as jest.Mock).mockReturnValue({ populate: jest.fn().mockResolvedValue(mockDoc), select: jest.fn().mockResolvedValue(mockDoc) })
      
      // Simulate failure in Orchestrator
      ;(OrchestratorService.analyzeDocumentMetadata as jest.Mock).mockRejectedValue(new Error('AI failed'))

      await DocumentPipelineService.processPendingDocuments(['doc1'])

      expect(DocumentModel.findByIdAndUpdate).toHaveBeenCalledWith('doc1', { aiStatus: 'Failed' })
      expect(aiEvents.emit).toHaveBeenCalledWith('status-update', expect.objectContaining({ aiStatus: 'Failed' }))
    })

    it('skips processing if document is not found', async () => {
      ;(DocumentModel.findById as unknown as jest.Mock).mockReturnValue({ populate: jest.fn().mockResolvedValue(null) })
      await DocumentPipelineService.processPendingDocuments(['doc1'])
      expect(DocumentModel.findByIdAndUpdate).not.toHaveBeenCalled()
    })
  })
})
