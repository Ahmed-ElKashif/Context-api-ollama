import { SystemMessage, HumanMessage } from '@langchain/core/messages'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { DocumentModel } from '../../documents/document.model'

export interface CognitiveLoadResult {
  load: 'Light' | 'Medium' | 'Heavy'
  score: number
  reason: string
}

export class CognitiveLoadService {
  // ==========================================
  // INJECTED MODEL (injectable for unit tests)
  // ==========================================

  private static _model: BaseChatModel

  /**
   * Injection point — called by ModelRegistry at startup.
   * In unit tests, inject a mock:
   * @example
   * CognitiveLoadService.init(mockModel as any)
   */
  static init(model: BaseChatModel): void {
    this._model = model
  }

  /**
   * Evaluates the text and returns structured cognitive load metrics.
   */
  static async evaluateText(text: string | undefined): Promise<CognitiveLoadResult> {
    if (!text || text.trim().length === 0) {
      return { load: 'Light', score: 1, reason: 'Document is empty or mostly images.' }
    }

    // Cost-Saver: Only analyze the first ~4000 characters.
    const sampleText = text.substring(0, 4000)

    const systemMessage = new SystemMessage(
      `Analyze the text's reading difficulty. Consider jargon density, sentence complexity, and subject accessibility.\n` +
      `Return ONLY a raw JSON object (no markdown, no code fences):\n` +
      `{"load": "Light" | "Medium" | "Heavy", "score": 1-10, "reason": "one sentence explanation"}`
    )

    const humanMessage = new HumanMessage(`TEXT SAMPLE:\n\n${sampleText}`)

    try {
      const response = await this._model.invoke([systemMessage, humanMessage])

      const rawContent = typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content)

      const jsonMatch = rawContent.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        const validLoads = ['Light', 'Medium', 'Heavy'] as const
        return {
          load: validLoads.includes(parsed.load) ? parsed.load : 'Medium',
          score: typeof parsed.score === 'number' ? Math.min(10, Math.max(1, parsed.score)) : 5,
          reason: typeof parsed.reason === 'string' ? parsed.reason : 'Analysis completed.'
        }
      }

      return { load: 'Medium', score: 5, reason: 'Could not parse AI response; defaulted to Medium.' }
    } catch (error) {
      console.error('[CognitiveLoad] Evaluation failed:', error)
      return { load: 'Medium', score: 5, reason: 'AI analysis failed; defaulted to Medium.' }
    }
  }

  /**
   * 🚜 BACKFILL JOB: Scans the DB for documents missing advanced analysis and updates them.
   */
  static async backfillExistingDocuments(): Promise<void> {
    console.log(`[Backfill] Starting Cognitive Load backfill job...`)

    const docsToUpdate = await DocumentModel.find({
      $or: [
        { cognitiveScore: { $exists: false } },
        { cognitiveScore: 1, cognitiveReason: { $exists: false } }
      ],
      extractedText: { $exists: true, $ne: '' }
    })

    console.log(`[Backfill] Found ${docsToUpdate.length} documents to analyze.`)

    let successCount = 0

    for (const doc of docsToUpdate) {
      console.log(`[Backfill] Analyzing: "${doc.title}"...`)

      const analysis = await this.evaluateText(doc.extractedText)

      doc.cognitiveLoad = analysis.load
      doc.cognitiveScore = analysis.score
      doc.cognitiveReason = analysis.reason

      await doc.save()
      successCount++

      // Brief pause to respect API rate limits
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    console.log(`[Backfill] Complete! Successfully updated ${successCount} documents.`)
  }
}

