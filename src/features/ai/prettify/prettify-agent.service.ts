import { z } from 'zod'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AppError } from '../../../core/errors/AppError'

export const ExcelPrettifySchema = z.object({
  type: z.literal('spreadsheet'),
  sheets: z.array(
    z.object({
      name: z.string(),
      headers: z.array(z.string()),
      rows: z.array(z.array(z.string()))
    })
  )
})

export const DocumentPrettifySchema = z.object({
  type: z.literal('document'),
  sections: z.array(
    z.object({
      heading: z.string(),
      level: z.number().int().min(1).max(3),
      content: z.string().optional(),
      items: z.array(z.string()).optional()
    })
  )
})

export class PrettifyAgentService {
  private static _model: BaseChatModel

  static init(model: BaseChatModel): void {
    this._model = model
  }

  static async prettify(rawText: string, fileType: string): Promise<any> {
    const schema = fileType === 'Excel' ? ExcelPrettifySchema : DocumentPrettifySchema

    try {
      return await this._invokeModel(rawText, schema)
    } catch (error) {
      console.warn('[PrettifyAgent] Initial parse failed, retrying with stripped text...', error)
      // Attempt 2: Strip special characters that might be confusing the model
      const strippedText = rawText.replace(/[^\w\s.,;:!?()"-]/g, '')
      try {
        return await this._invokeModel(strippedText, schema)
      } catch (retryError) {
        console.error('[PrettifyAgent] Retry parse failed:', retryError)
        throw new AppError('AI failed to structure this document. The content may contain unsupported formatting.', 500)
      }
    }
  }

  private static async _invokeModel(text: string, schema: z.ZodType<any>): Promise<any> {
    const controller = new AbortController()
    // Local Ollama models can be much slower, so we give them a 60-second timeout
    const timeoutId = setTimeout(() => controller.abort(), 60000)

    try {
      const structuredModel = this._model.withStructuredOutput(schema)
      const response = await structuredModel.invoke(
        [
          ['system', 'You are an elite AI document formatter. Reorganize and structure the following content cleanly into the requested JSON schema without losing important information. Group into logical sections or sheets.'],
          ['human', `Format the following content:\n\n${text}`]
        ],
        { signal: controller.signal }
      )
      return response
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new AppError('Prettify timed out. The local model took too long to generate JSON. Try a shorter document.', 504)
      }
      throw error // Propagate to retry block
    } finally {
      clearTimeout(timeoutId)
    }
  }
}
