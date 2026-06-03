import { Request, Response, NextFunction } from 'express'

/**
 * Shape of the AI metadata object set by AI controllers via res.locals.
 *
 * Controllers set this AFTER their service call completes:
 * @example
 * res.locals.aiMeta = {
 *   model: 'llama3.2',
 *   tokensUsed: 1240,
 *   operation: 'synthesize'
 * }
 */
export interface AiMeta {
  model: string
  tokensUsed: number
  operation: string
}

/**
 * @description Structured logging middleware for all AI endpoints.
 *
 * Registers a res.on('finish') listener that reads res.locals.aiMeta
 * (set by the controller) and emits a single, clean log line with:
 *   - HTTP method + route
 *   - AI operation name
 *   - Model used
 *   - Estimated tokens consumed
 *   - End-to-end latency (ms)
 *   - HTTP status code
 *   - User ID (first 8 chars for readability)
 *
 * Output example:
 *   [AI] POST /api/ai/synthesize | op=synthesize | model=llama3.2 | tokens=~1240 | latency=1823ms | 200 | user=abc12345
 *
 * Attach to routes AFTER protect middleware (so req.user is available).
 * Place BEFORE the controller in the route chain.
 */
export const aiLogger = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now()

  res.on('finish', () => {
    const latencyMs = Date.now() - startTime
    const meta: AiMeta | undefined = res.locals.aiMeta

    const method = req.method
    const route = req.originalUrl.split('?')[0] // strip query params
    const status = res.statusCode
    const userId = (req.user?._id?.toString() ?? 'anonymous').slice(0, 8)

    if (meta) {
      console.log(
        `[AI] ${method} ${route} | op=${meta.operation} | model=${meta.model} | tokens=~${meta.tokensUsed} | latency=${latencyMs}ms | ${status} | user=${userId}`
      )
    } else {
      // Fallback: log even if controller didn't set aiMeta (e.g. early 429 rejection)
      console.log(
        `[AI] ${method} ${route} | latency=${latencyMs}ms | ${status} | user=${userId}`
      )
    }
  })

  next()
}
