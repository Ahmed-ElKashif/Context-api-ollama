import { Request, Response, NextFunction } from 'express'
import { AppError } from '../../../core/errors/AppError'
import { DocumentModel } from '../document.model'
import { DocumentChatService } from './document-chat.service'
import { estimateTokens } from '../../../core/services/token-budget.service'
import { AIService } from '../../ai/ai.service'

export const getDocumentChatHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string
    const userId = req.user!._id.toString()

    // Security: Ensure doc belongs to user
    const docExists = await DocumentModel.exists({ _id: id, user: userId })
    if (!docExists) {
      return next(new AppError('Document not found', 404))
    }

    const history = await DocumentChatService.getDocumentChatHistory(id, userId)

    res.status(200).json({ success: true, count: history.length, data: history })
  } catch (error) {
    next(error)
  }
}

export const chatWithDocument = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string
    const { message } = req.body
    const userId = req.user!._id.toString()

    if (!message) {
      return next(new AppError('Message is required', 400))
    }

    // Security: Ensure doc belongs to user
    const docExists = await DocumentModel.exists({ _id: id, user: userId })
    if (!docExists) {
      return next(new AppError('Document not found', 404))
    }

    const aiResponse = await DocumentChatService.chatWithDocument(id, userId, message)

    // Set AI meta for token-budget and logging middleware
    res.locals.aiMeta = {
      model: 'llama3.1:8b', // Local conversational model
      tokensUsed: estimateTokens(message + aiResponse) + 1200, // prompt overhead + context window estimation
      operation: 'document-chat'
    }

    res.status(200).json({
      success: true,
      data: { role: 'ai', content: aiResponse }
    })
  } catch (error) {
    next(error)
  }
}

// @route   POST /api/documents/:id/reanalyze
export const reanalyzeDocument = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params.id as string
    const userId = req.user!._id.toString()

    // Ensure document exists and belongs to user
    const document = await DocumentModel.findOne({ _id: id, user: userId })
    if (!document) {
      return next(new AppError('Document not found', 404))
    }

    // Set to pending so the UI updates
    document.aiStatus = 'Pending'
    await document.save()

    // Kick off background job using statically imported AIService
    AIService.processPendingDocuments([id]).catch((err: any) => {
      console.error(`[Reanalyze API] Failed to trigger background worker for ${id}:`, err)
    })

    res.status(200).json({
      success: true,
      message: 'Document re-analysis triggered successfully',
      data: document
    })
  } catch (error) {
    next(error)
  }
}
