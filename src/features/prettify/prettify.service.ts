import { DocumentModel } from '../documents/document.model'
import { AppError } from '../../core/errors/AppError'
import { PrettifyValidatorService } from '../ai/prettify/prettify-validator.service'
import { PrettifyAgentService } from '../ai/prettify/prettify-agent.service'

export class PrettifyService {
  static async prettify(documentId: string, userId: string): Promise<any> {
    const document = await DocumentModel.findById(documentId)
    
    if (!document) {
      throw new AppError('Document not found.', 404)
    }

    if (document.user.toString() !== userId.toString()) {
      throw new AppError('You do not have permission to prettify this document.', 403)
    }

    const validTypes = ['Excel', 'Word', 'TextSnippet']
    if (!validTypes.includes(document.fileType)) {
      throw new AppError(`Prettify is not supported for ${document.fileType} files.`, 422)
    }

    const rawText = document.extractedText
    if (!rawText || rawText.trim().length === 0) {
      throw new AppError('No text content found. The document appears to be empty.', 400)
    }

    if (document.prettifiedJson) {
      console.log(`[Prettify] Cache hit for document ${documentId}`)
      return document.prettifiedJson
    }

    PrettifyValidatorService.validate(rawText, document.fileType)

    const result = await PrettifyAgentService.prettify(rawText, document.fileType)

    document.prettifiedJson = result
    await document.save()

    return result
  }
}
