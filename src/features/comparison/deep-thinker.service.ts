import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { SystemMessage, HumanMessage } from '@langchain/core/messages'
import { JsonOutputParser } from '@langchain/core/output_parsers'
import { z } from 'zod'
import { DocumentModel } from '../documents/document.model'
import { DocumentPreviewService, SupportedFileType } from '../ai/pipeline/document-preview.service'

// 1. Define the Comparison Output Schema
const ComparisonSchema = z.object({
  synthesis: z
    .string()
    .describe(
      'A 2-3 sentence overarching summary of how the documents compare, highlighting the most critical shifts or themes.'
    ),
  similarityPercentage: z
    .number()
    .min(0)
    .max(100)
    .describe('An estimated percentage of semantic similarity between 0 and 100.'),
  similarities: z.array(z.string()).describe('Key shared concepts between the two documents.'),
  differences: z.array(z.string()).describe('Key differences between the two documents.'),
  uniqueToA: z.array(z.string()).describe('Important points found ONLY in Document A (Base File).'),
  uniqueToB: z
    .array(z.string())
    .describe('Important points found ONLY in Document B (Comparison File).')
})

export type ComparisonResult = z.infer<typeof ComparisonSchema> & {
  _warning?: string
}

// ─── Module-level defaults (production) ─────────────────────────────────────

// Per-document character budget for comparison.
// With Ollama llama3.1:8b (num_ctx=8192), both documents + system prompt + output
// must fit in ~8k tokens. Budget: ~2.5k tokens per doc = ~5k chars each.
const MAX_COMPARISON_CHARS_PER_DOC = 5_000

export class DeepThinkerService {
  // ==========================================
  // INJECTED MODELS (injectable for unit tests)
  // ==========================================

  private static _primary: BaseChatModel
  private static _fallback: BaseChatModel
  private static _lastResort: BaseChatModel

  /**
   * Injection point — called by ModelRegistry at startup.
   * The third `lastResort` parameter is optional so existing unit tests
   * that only inject two mocks continue to work unchanged.
   * @example
   * DeepThinkerService.init(mockPrimary, mockFallback, mockLastResort)
   */
  static init(primary: BaseChatModel, fallback: BaseChatModel, lastResort?: BaseChatModel): void {
    this._primary = primary
    this._fallback = fallback
    if (lastResort) this._lastResort = lastResort
  }

  static async compareDocuments(
    userId: string,
    docIdA: string,
    docIdB: string
  ): Promise<ComparisonResult> {
    const [docA, docB] = await Promise.all([
      DocumentModel.findOne({ _id: docIdA, user: userId }),
      DocumentModel.findOne({ _id: docIdB, user: userId })
    ])

    if (!docA || !docB) throw new Error('Documents not found or unauthorized.')

    // Build a token-safe preview of each document.
    // Each document gets MAX_COMPARISON_CHARS_PER_DOC (5k chars ≈ 1.25k tokens) so that
    // both together stay within the 8k context window of the local Ollama model.
    // The fileType drives the sampling strategy (windowed text vs. schema-first Excel).
    const previewA = DocumentPreviewService.buildPreview(
      docA.extractedText || '',
      docA.fileType as SupportedFileType,
      MAX_COMPARISON_CHARS_PER_DOC
    )
    const previewB = DocumentPreviewService.buildPreview(
      docB.extractedText || '',
      docB.fileType as SupportedFileType,
      MAX_COMPARISON_CHARS_PER_DOC
    )

    console.log(
      `[DeepThinker] Input sizes — A: ${previewA.length.toLocaleString()} chars, B: ${previewB.length.toLocaleString()} chars (combined: ${(previewA.length + previewB.length).toLocaleString()})`
    )

    const parser = new JsonOutputParser<ComparisonResult>()
    const humanMessage = new HumanMessage(
      `DOCUMENT A:\n${previewA}\n\nDOCUMENT B:\n${previewB}`
    )

    // ==========================================
    // SINGLE ATTEMPT (all 3 injected models are the same local Ollama instance)
    // ==========================================
    try {
      console.log(`[DeepThinker] Performing comparison analysis...`)
      const startTime = Date.now()

      const systemMessage = new SystemMessage(
        `You are a document comparison analyst. Compare documents A and B.\n` +
        `LANGUAGE RULE: Write ALL output in the same language as the documents.\n` +
        `Return ONLY a raw JSON object (no markdown, no code fences, no extra text):\n` +
        `{\n` +
        `  "synthesis": "2-3 sentence summary of how the documents compare",\n` +
        `  "similarityPercentage": number (0-100),\n` +
        `  "similarities": ["shared concept 1", "shared concept 2"],\n` +
        `  "differences": ["difference 1", "difference 2"],\n` +
        `  "uniqueToA": ["point only in doc A"],\n` +
        `  "uniqueToB": ["point only in doc B"]\n` +
        `}`
      )

      const chain = this._primary.pipe(parser)
      const result = await chain.invoke([systemMessage, humanMessage])

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      console.log(`[DeepThinker] Comparison completed in ${elapsed}s`)

      return ComparisonSchema.parse(result)
    } catch (error) {
      console.error(
        `[DeepThinker] Comparison failed:`,
        error instanceof Error ? error.message : 'Unknown Error'
      )
      throw new Error(
        'Our AI engine could not complete the comparison. Please try again in a moment.'
      )
    }
  }
}
