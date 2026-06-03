import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { HumanMessage } from '@langchain/core/messages'

// ─── Module-level defaults (production) ─────────────────────────────────────


export class VisualCortexService {
  // ==========================================
  // INJECTED MODELS (injectable for unit tests)
  // ==========================================

  private static _primary: BaseChatModel
  private static _fallback: BaseChatModel

  /**
   * Injection point — called by ModelRegistry at startup.
   * In unit tests, inject mocks:
   * @example
   * VisualCortexService.init(mockPrimary, mockFallback)
   */
  static init(primary: BaseChatModel, fallback: BaseChatModel): void {
    this._primary = primary
    this._fallback = fallback
  }

  /**
   * Processes an image to extract OCR text or provide a fallback description.
   */
  static async extractImageContent(
    base64Image: string,
    mimeType: string = 'image/jpeg'
  ): Promise<string> {
    const message = new HumanMessage({
      content: [
        {
          type: 'text',
          text: 'Extract all readable text from this image. If handwritten or a diagram, structure the text logically. If no text exists, describe the image briefly. Return ONLY the text or description.'
        },
        {
          type: 'image_url',
          image_url: { url: `data:${mimeType};base64,${base64Image}` }
        }
      ]
    })

    // Single attempt — primary and fallback are the same local LLaVA model
    try {
      console.log(`[Visual Cortex] Sending image to Vision Model...`)
      const startTime = Date.now()

      const response = await this._primary.invoke([message])

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      console.log(`[Visual Cortex] Vision model responded in ${elapsed}s`)

      return (response.content as string).trim()
    } catch (error) {
      console.error(
        `[Visual Cortex] Vision model failed:`,
        error instanceof Error ? error.message : 'Unknown Error'
      )
      throw new Error(
        'Our OCR engine could not process this image. Please try uploading again.'
      )
    }
  }
}
