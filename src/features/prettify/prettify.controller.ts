import { Request, Response, NextFunction } from 'express'
import { PrettifyService } from './prettify.service'
import { estimateTokens } from '../../core/services/token-budget.service'

export const prettifyDocument = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const documentId = req.params.documentId as string
    const userId = (req as any).user._id as string

    // Prettify logic
    const result = await PrettifyService.prettify(documentId, userId)

    // Log the tokens used if this was not a cache hit (which we roughly estimate)
    // Cache hits would be caught early in the service and returned
    // We add ~500 for system prompt overhead
    res.locals.aiMeta = {
      model: 'llama3.1:8b-instruct',
      tokensUsed: estimateTokens(JSON.stringify(result)) + 500,
      operation: 'prettify'
    }

    res.status(200).json({
      success: true,
      data: result
    })
  } catch (error) {
    next(error)
  }
}
