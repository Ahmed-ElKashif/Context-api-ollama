import { Request, Response, NextFunction } from 'express'
import { ComparisonService } from './comparison.service'
import { AppError } from '../../core/errors/AppError'
import { estimateTokens } from '../../core/services/token-budget.service'
import { ComparisonRecordModel } from './comparison-record.model'
import { User } from '../users/user.model'

/**
 * @route POST /api/comparison/compare
 * @description Performs a deep conceptual comparison between two documents
 *              using the DeepThinkerService.
 */
export const compareDocuments = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString() || (req as any).user?.id
    if (!userId) return next(new AppError('Unauthorized', 401))

    const { documentIds } = req.body

    // 1. Validation
    if (!documentIds || !Array.isArray(documentIds) || documentIds.length !== 2) {
      return next(new AppError('Please provide exactly two document IDs for comparison.', 400))
    }

    const [id1, id2] = documentIds

    // 2. Check for existing duplicate comparison to save AI tokens
    const existingRecord = await ComparisonRecordModel.findOne({
      user: userId,
      $or: [
        { docIdA: id1, docIdB: id2 },
        { docIdA: id2, docIdB: id1 }
      ]
    })

    if (existingRecord) {
      return next(new AppError('You have already compared these two documents. Please check your comparison history.', 400))
    }

    // 3. Delegate to Service
    const result = await ComparisonService.performComparison(userId, id1, id2)

    if (result.error) {
      return next(new AppError(result.error, result.statusCode || 400))
    }

    // 3. Set AI meta for token-budget and logging middleware
    //    DeepThinker sends ~5000 chars of text per doc to the 70B model
    const estimatedInputChars = 5000 * 2 // 5k chars per document
    res.locals.aiMeta = {
      model: 'llama3.1:8b', // Local comparison model
      tokensUsed: estimateTokens(String(estimatedInputChars)) + 500,
      operation: 'document-comparison'
    }

    // 4. Send Response
    res.status(200).json({
      success: true,
      data: result
    })
  } catch (error) {
    next(error)
  }
}

/**
 * @route GET /api/comparison/:docIdA/:docIdB/chat
 * @description Retrieves the chat history for a specific dual-document comparison session.
 */
export const getComparisonChatHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString() || (req as any).user?.id
    if (!userId) return next(new AppError('Unauthorized', 401))

    const { docIdA, docIdB } = req.params as { docIdA: string; docIdB: string }

    if (!docIdA || !docIdB) {
      return next(new AppError('Both document IDs are required in the URL.', 400))
    }

    const history = await ComparisonService.getComparisonChatHistory(userId, docIdA, docIdB)

    res.status(200).json({
      success: true,
      count: history.length,
      data: history
    })
  } catch (error) {
    next(error)
  }
}

/**
 * @route POST /api/comparison/:docIdA/:docIdB/chat
 * @description Queries the dual-document RAG pipeline to answer questions about both files.
 */
export const chatWithComparison = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString() || (req as any).user?.id
    if (!userId) return next(new AppError('Unauthorized', 401))

    const { docIdA, docIdB } = req.params as { docIdA: string; docIdB: string }
    const { message } = req.body

    if (!docIdA || !docIdB) {
      return next(new AppError('Both document IDs are required in the URL.', 400))
    }

    if (!message) {
      return next(new AppError('Message is required in the request body.', 400))
    }

    // Delegate to the dual-document RAG pipeline
    const aiResponse = await ComparisonService.chatWithComparison(userId, docIdA, docIdB, message)

    // Set AI meta for token-budget and logging middleware
    res.locals.aiMeta = {
      model: 'llama3.1:8b-instruct-q4_K_M', // Assuming local offline model for chat
      tokensUsed: estimateTokens(message + aiResponse) + 200, // Rough conversational estimate
      operation: 'comparison-chat'
    }

    res.status(200).json({
      success: true,
      data: { role: 'assistant', content: aiResponse }
    })
  } catch (error) {
    next(error)
  }
}

// ==========================================
// 📚 COMPARISON HISTORY
// ==========================================

export const getComparisonHistory = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString() || (req as any).user?.id
    if (!userId) return next(new AppError('Unauthorized', 401))

    const history = await ComparisonRecordModel.find({ user: userId })
      .select('titleA titleB customTitle createdAt')
      .sort({ createdAt: -1 })
      .limit(50)

    res.status(200).json({ success: true, count: history.length, data: history })
  } catch (error) {
    next(error)
  }
}

export const getComparisonRecordById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString() || (req as any).user?.id
    if (!userId) return next(new AppError('Unauthorized', 401))

    const record = await ComparisonRecordModel.findOne({ _id: req.params.id, user: userId })
    if (!record) return next(new AppError('Comparison record not found', 404))

    res.status(200).json({ success: true, data: record })
  } catch (error) {
    next(error)
  }
}

export const saveComparisonRecord = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString() || (req as any).user?.id
    if (!userId) return next(new AppError('Unauthorized', 401))

    const { docIdA, docIdB, titleA, titleB, comparison } = req.body
    if (!docIdA || !docIdB || !titleA || !titleB || !comparison) {
      return next(new AppError('Missing required fields for comparison record', 400))
    }

    const newRecord = await ComparisonRecordModel.create({
      user: userId,
      docIdA,
      docIdB,
      titleA,
      titleB,
      comparison
    })

    // Auto-update user's active comparison ID
    await User.findByIdAndUpdate(userId, { lastActiveComparisonId: newRecord._id })

    res.status(201).json({ success: true, data: newRecord })
  } catch (error) {
    next(error)
  }
}

export const updateComparisonRecord = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString() || (req as any).user?.id
    if (!userId) return next(new AppError('Unauthorized', 401))

    const { customTitle } = req.body

    const record = await ComparisonRecordModel.findOneAndUpdate(
      { _id: req.params.id, user: userId },
      { customTitle },
      { new: true }
    )

    if (!record) return next(new AppError('Comparison record not found', 404))

    res.status(200).json({ success: true, data: record })
  } catch (error) {
    next(error)
  }
}

export const deleteComparisonRecord = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString() || (req as any).user?.id
    if (!userId) return next(new AppError('Unauthorized', 401))

    const record = await ComparisonRecordModel.findOneAndDelete({ _id: req.params.id, user: userId })
    if (!record) return next(new AppError('Comparison record not found', 404))

    // Cascade delete associated chat history to prevent orphans
    // We have to import ComparisonMessageModel dynamically or add it at the top,
    // let me just add it at the top. I'll need a separate replace chunk for the import.
    // Actually, I'll just require it here to keep it simple since it's a one-off.
    const { ComparisonMessageModel } = require('./comparison-chat.model')
    await ComparisonMessageModel.deleteMany({ user: userId, docIdA: record.docIdA, docIdB: record.docIdB })

    // If this was the user's active comparison, clear it out
    const user = await User.findById(userId)
    if (user && user.lastActiveComparisonId?.toString() === req.params.id) {
      user.lastActiveComparisonId = undefined
      await user.save()
    }

    res.status(200).json({ success: true, data: {} })
  } catch (error) {
    next(error)
  }
}

