import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { SystemMessage, HumanMessage } from '@langchain/core/messages'

// ─── Module-level default (production) ──────────────────────────────────────

export class SynthesizerAgent {
  // ==========================================
  // INJECTED MODEL (injectable for unit tests)
  // ==========================================

  private static _model: BaseChatModel

  /**
   * Injection point — called by ModelRegistry at startup.
   * In unit tests, call this in beforeEach() to inject a mock model.
   * @example SynthesizerAgent.init(mockModel)
   */
  static init(model: BaseChatModel): void {
    this._model = model
  }

  static async generateBulkSummary(documentsData: string): Promise<string> {
    const systemMessage = new SystemMessage(
      `You are an executive document synthesizer. You receive pre-extracted metadata ` +
      `(summaries, tags, cognitive load) for multiple documents.\n` +
      `RULES:\n` +
      `- Connect core concepts, common tags, and themes across documents.\n` +
      `- Highlight how documents complement each other.\n` +
      `- Group logically into an executive overview. Never dismiss documents as unrelated.\n` +
      `- Format in Markdown with headings (###), bullets, and bold emphasis.\n` +
      `- LANGUAGE: Write in the same language as the document summaries.\n` +
      `- LENGTH: 100-150 words maximum. Every sentence must carry weight. Be extremely concise.`
    )

    const humanMessage = new HumanMessage(
      `Here is the data for the selected files:\n${documentsData}`
    )

    const response = await this._model.invoke([systemMessage, humanMessage])

    const content = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content)

    return content.trim()
  }
}
