import { PDFParse } from 'pdf-parse'
import mammoth from 'mammoth'
import * as xlsx from 'xlsx'
import { DocumentModel } from '../../documents/document.model'
import { EmbeddingService } from '../search/vector.service'
import { aiEvents } from '../ai.events'
import { OrchestratorService } from '../agents/orchestrator.service'
import { CognitiveLoadService } from '../agents/cognitive-load.service'
import { DocumentPreviewService } from './document-preview.service'
import { VisualCortexService } from '../agents/visual-cortex.service'
import {
  TokenBudgetService,
  estimateDocumentPipelineTokens
} from '../../../core/services/token-budget.service'

/**
 * @description Owns the background AI processing pipeline for uploaded documents.
 *
 * Responsibilities:
 *  1. Multi-modal text extraction (PDF, Word, Excel, Image, TextSnippet)
 *  2. Orchestrator metadata analysis (via a token-safe preview)
 *  3. Cognitive load scoring
 *  4. Vector embedding upsert
 *  5. DB status updates + SSE event emission
 *  6. Token budget recording
 *
 * This service contains no injected LLM model — it delegates all AI calls
 * to the specialized services (OrchestratorService, CognitiveLoadService, etc.)
 * which each manage their own injected model.
 */
export class DocumentPipelineService {
  // ==========================================
  // BACKGROUND WORKER
  // ==========================================

  /**
   * Processes a batch of uploaded documents through the full AI pipeline.
   * Called fire-and-forget from the upload service — errors per document are
   * caught individually so one bad file never blocks the rest of the batch.
   */
  static async processPendingDocuments(documentIds: string[]): Promise<void> {
    console.log(`[AI Worker] Started processing ${documentIds.length} documents...`)

    for (const id of documentIds) {
      try {
        // Populate the user to grab their persona
        const doc = await DocumentModel.findById(id).populate('user')
        if (!doc) continue

        const userPersona = (doc.user as any).persona || 'general'

        await DocumentModel.findByIdAndUpdate(id, { aiStatus: 'Processing' })
        aiEvents.emit('status-update', {
          userId: (doc.user as any)._id.toString(),
          documentId: id,
          aiStatus: 'Processing'
        })

        // ==========================================
        // 🧠 MULTIMODAL EXTRACTION ROUTER
        // ==========================================
        console.log(`[AI Worker] Extracting text for type: ${doc.fileType}...`)

        let rawText = ''

        switch (doc.fileType) {
          case 'TextSnippet':
            rawText = doc.extractedText || ''
            break

          case 'PDF':
            if (!doc.cloudinaryUrl) throw new Error('PDF missing Cloudinary URL')
            const pdfBuffer = await this.downloadFromCloudinary(doc.cloudinaryUrl)
            const parser = new PDFParse({ data: pdfBuffer })
            const pdfData = await parser.getText()
            rawText = pdfData.text
            break

          case 'Word':
            if (!doc.cloudinaryUrl) throw new Error('Word doc missing Cloudinary URL')
            const wordBuffer = await this.downloadFromCloudinary(doc.cloudinaryUrl)
            const wordData = await mammoth.extractRawText({ buffer: wordBuffer })
            rawText = wordData.value
            break

          case 'Image':
            if (!doc.cloudinaryUrl) throw new Error('Image missing Cloudinary URL')
            console.log(`[AI Worker] Activating Visual Cortex for Image OCR...`)
            const imageBuffer = await this.downloadFromCloudinary(doc.cloudinaryUrl)
            const base64Data = imageBuffer.toString('base64')
            rawText = await VisualCortexService.extractImageContent(base64Data, 'image/jpeg')
            break

          case 'Excel':
            if (!doc.cloudinaryUrl) throw new Error('Excel missing Cloudinary URL')
            const excelBuffer = await this.downloadFromCloudinary(doc.cloudinaryUrl)
            const workbook = xlsx.read(excelBuffer, { type: 'buffer' })
            let combinedExcelText = ''

            for (const sheetName of workbook.SheetNames) {
              const worksheet = workbook.Sheets[sheetName]
              // Convert each sheet to CSV (token-efficient for LLMs)
              const csvData = xlsx.utils.sheet_to_csv(worksheet)
              if (csvData.trim()) {
                combinedExcelText += `--- Sheet: ${sheetName} ---\n${csvData}\n\n`
              }
            }
            rawText = combinedExcelText
            break

          default:
            throw new Error(`Unsupported file type: ${doc.fileType}`)
        }

        if (!rawText || rawText.trim().length === 0) {
          throw new Error('No readable text found in document.')
        }

        // Save extracted text early — ensures the user can view raw text / Excel grid
        // even if AI analysis subsequently fails (e.g. rate limit).
        await DocumentModel.findByIdAndUpdate(id, { extractedText: rawText })

        // ==========================================
        // 🚀 UNIFIED AI PIPELINE
        // ==========================================

        // Build the indexable text — 80k-char cap, type-aware sampling.
        // This single variable is reused for the orchestrator, the DB field,
        // and the embedding upsert so Atlas chunks stay bounded regardless of
        // how large the source file is.
        // Full rawText is kept only for CognitiveLoadService (has its own 4k cap).
        const indexableText = DocumentPreviewService.buildPreview(rawText, doc.fileType as any)

        if (rawText.length > indexableText.length) {
          console.log(
            `[AI Worker] Text capped for storage/indexing: ${rawText.length.toLocaleString()} → ${indexableText.length.toLocaleString()} chars (${doc.fileType} sampling)`
          )
        }

        // (extractedText is already saved as rawText above; we don't overwrite it with indexableText)

        // 1. Run the Orchestrator Agent — reuses the same indexableText
        console.log(`[AI Worker] Running Orchestrator Agent on document ${id}...`)
        const metadata = await OrchestratorService.analyzeDocumentMetadata(
          id,
          indexableText,
          userPersona
        )

        // 2. Cognitive Load — receives full rawText (CognitiveLoadService caps to 4k internally)
        console.log(`[AI Worker] Evaluating Cognitive Load...`)
        const loadMetrics = await CognitiveLoadService.evaluateText(rawText)

        // 3. Embed the indexable text into MongoDB Atlas Vector Search
        //    Using indexableText (not rawText) keeps chunk count bounded.
        console.log(`[AI Worker] Embedding chunks into Atlas...`)
        await EmbeddingService.upsert(indexableText, id, (doc.user as any)._id.toString())

        // 4. Persist all results in a single DB write
        const updatedDoc = await DocumentModel.findByIdAndUpdate(
          id,
          {
            aiStatus: 'Analyzed',
            summary: metadata.summary,
            tags: metadata.tags,
            cognitiveLoad: loadMetrics.load,
            cognitiveScore: loadMetrics.score,
            cognitiveReason: loadMetrics.reason,
            contentType: metadata.type
          },
          { new: true }
        )

        aiEvents.emit('status-update', {
          userId: (doc.user as any)._id.toString(),
          documentId: id,
          aiStatus: 'Analyzed',
          document: updatedDoc
        })

        console.log(
          `[AI Worker] Document ${id} successfully analyzed, orchestrated, scored, and embedded.`
        )

        // 5. Record token usage (fire-and-forget, non-blocking)
        const estimatedTokens = estimateDocumentPipelineTokens(rawText)
        TokenBudgetService.recordUsage((doc.user as any)._id.toString(), estimatedTokens).catch(
          (err) => console.error('[TokenBudget] Failed to record upload usage:', err)
        )
      } catch (error) {
        console.error(`[AI Worker] Failed to process document ${id}:`, error)
        await DocumentModel.findByIdAndUpdate(id, { aiStatus: 'Failed' })

        try {
          const fallbackDoc = await DocumentModel.findById(id).select('user title')
          if (fallbackDoc && fallbackDoc.user) {
            aiEvents.emit('status-update', {
              userId: fallbackDoc.user.toString(),
              documentId: id,
              aiStatus: 'Failed',
              document: fallbackDoc
            })
          }
        } catch (emitErr) {
          console.error('[AI Worker] Failed to emit failure status update:', emitErr)
        }
      }
    }
  }

  // ==========================================
  // PRIVATE HELPERS
  // ==========================================

  /**
   * Downloads a file from a Cloudinary URL into a Node.js Buffer
   * so that the parsers (pdf-parse, mammoth, xlsx) can process it in memory.
   */
  private static async downloadFromCloudinary(url: string): Promise<Buffer> {
    const response = await fetch(url)
    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }
}
