import { Request, Response, NextFunction } from 'express'
import { AppError } from '../../../core/errors/AppError'
import { DocumentService } from '../document.service'
import { aiEvents } from '../../ai/ai.events'

// @route   GET /api/documents/status
// Lightweight endpoint to poll document aiStatus
export const getDocumentStatuses = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString()
    if (!userId) return next(new AppError('Unauthorized', 401))

    const idsParam = req.query.ids as string
    if (!idsParam) {
      res.status(200).json({ success: true, data: [] })
      return
    }

    const ids = idsParam.split(',')
    const documents = await DocumentService.getStatuses(userId, ids)

    res.status(200).json({ success: true, data: documents })
  } catch (error) {
    next(error)
  }
}

// @route   GET /api/documents/status/stream
// SSE stream endpoint to notify client about real-time document aiStatus changes
export const streamDocumentStatuses = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString()
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' })
      return
    }

    // Set headers for Server-Sent Events (SSE)
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform') // no-transform disables compression buffering
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no') // Disable proxy buffering (e.g. Nginx)

    // Send initial handshake event
    res.write('retry: 10000\n') // Ask client to retry connection every 10s if closed
    res.write(`data: ${JSON.stringify({ connected: true })}\n\n`)
    if (typeof (res as any).flush === 'function') (res as any).flush() // Force flush if compression is active

    const onStatusUpdate = (event: {
      userId: string
      documentId: string
      aiStatus: string
      document?: any
    }) => {
      if (event.userId === userId) {
        res.write(`data: ${JSON.stringify(event)}\n\n`)
        if (typeof (res as any).flush === 'function') (res as any).flush() // Force flush
      }
    }

    aiEvents.on('status-update', onStatusUpdate)

    // Cleanup when browser closes the connection
    req.on('close', () => {
      aiEvents.off('status-update', onStatusUpdate)
      res.end()
    })
  } catch (error) {
    next(error)
  }
}
