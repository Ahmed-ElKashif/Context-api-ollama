import { Request, Response, NextFunction } from 'express'
import { AppError } from '../../core/errors/AppError'
import { DocumentService } from './document.service'
import { SuggestedFocusService } from './analysis/suggested-focus.service'

// @route   GET /api/documents/suggested-focus
export const getSuggestedFocus = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user!._id.toString()
    const docs = await SuggestedFocusService.getTopFocusDocuments(userId)
    res.status(200).json({ success: true, count: docs.length, data: docs })
  } catch (error) {
    next(error)
  }
}

// @route   GET /api/documents
export const getAllDocuments = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // 🛡️ THE GUARD CLAUSE
    const userId = req.user?._id?.toString()
    if (!userId) return next(new AppError('Unauthorized', 401))

    const page = parseInt(req.query.page as string, 10) || 1
    const limit = parseInt(req.query.limit as string, 10) || 10
    const skip = (page - 1) * limit
    const sortBy = (req.query.sortBy as string) || 'createdAt'
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1

    const filters = {
      tags: req.query.tags
        ? (req.query.tags as string).split(',').map((tag) => tag.trim())
        : undefined,
      fileType: req.query.fileType,
      cognitiveLoad: req.query.cognitiveLoad,
      semanticPath: req.query.semanticPath,
      originalClientPath: req.query.originalClientPath
    }

    const { documents, totalDocuments } = await DocumentService.getAll(
      userId,
      filters,
      skip,
      limit,
      sortBy,
      sortOrder
    )

    res.status(200).json({
      success: true,
      count: documents.length,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalDocuments / limit),
        totalItems: totalDocuments,
        limit
      },
      data: documents
    })
  } catch (error) {
    next(error)
  }
}

// @route   GET /api/documents/search
export const searchDocuments = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString()
    if (!userId) return next(new AppError('Unauthorized', 401))

    const { q, page = 1, limit = 10 } = req.query
    const skip = (Number(page) - 1) * Number(limit)

    const { documents, totalMatches } = await DocumentService.search(
      userId,
      q as string,
      skip,
      Number(limit)
    )

    res.status(200).json({
      success: true,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(totalMatches / Number(limit)),
        totalItems: totalMatches,
        limit: Number(limit)
      },
      data: documents
    })
  } catch (error) {
    next(error)
  }
}

// @route   PUT /api/documents/:id
export const updateDocument = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString()
    if (!userId) return next(new AppError('Unauthorized', 401))

    const id = req.params?.id
    if (typeof id !== 'string') {
      return next(new AppError('Invalid document ID', 400))
    }

    // ==========================================
    // 🛡️ SECURITY: Data Sanitization (Prevent Mass Assignment)
    // ==========================================
    // Extract ONLY the fields the user is explicitly allowed to edit manually.
    const { title, tags, summary, cognitiveLoad, folder } = req.body

    // Remove any undefined fields so we don't accidentally overwrite DB fields with nulls
    const safeUpdates = Object.fromEntries(
      Object.entries({ title, tags, summary, cognitiveLoad, folder }).filter(
        ([_, value]) => value !== undefined
      )
    )

    // Stop early if no valid fields were sent
    if (Object.keys(safeUpdates).length === 0) {
      return next(new AppError('No valid fields provided for update', 400))
    }

    // Pass ONLY the sanitized object to the service
    const document = await DocumentService.updateById(userId, id, safeUpdates)

    if (!document) {
      return next(new AppError('Document not found or unauthorized', 404))
    }

    res.status(200).json({ success: true, data: document })
  } catch (error) {
    next(error)
  }
}

// @route   PUT /api/documents/bulk/semantic-paths
export const bulkUpdateSemanticPaths = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString()
    if (!userId) return next(new AppError('Unauthorized', 401))

    const result = await DocumentService.bulkUpdatePaths(userId, req.body.updates)

    res.status(200).json({
      success: true,
      message: `${result.modifiedCount} documents successfully routed to semantic folders.`
    })
  } catch (error) {
    next(error)
  }
}

// @route   DELETE /api/documents/:id
export const deleteDocument = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString()
    if (!userId) return next(new AppError('Unauthorized', 401))

    const id = req.params?.id
    if (typeof id !== 'string') {
      return next(new AppError('Invalid document ID', 400))
    }

    const deleted = await DocumentService.deleteById(userId, id)

    if (!deleted) {
      return next(new AppError('Document not found or unauthorized', 404))
    }

    res.status(200).json({ success: true, message: 'Document deleted successfully' })
  } catch (error) {
    next(error)
  }
}

// @route   DELETE /api/documents/bulk
export const bulkDeleteDocuments = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString()
    if (!userId) return next(new AppError('Unauthorized', 401))

    const result = await DocumentService.bulkDelete(userId, req.body.ids)

    res.status(200).json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} documents.`
    })
  } catch (error) {
    next(error)
  }
}

// @route   GET /api/documents/:id
export const getDocumentById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString()
    if (!userId) return next(new AppError('Unauthorized', 401))

    const id = req.params?.id
    if (typeof id !== 'string') {
      return next(new AppError('Invalid document ID', 400))
    }

    const document = await DocumentService.getById(userId, id)

    if (!document) {
      return next(new AppError('Document not found or unauthorized', 404))
    }

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    res.setHeader('Pragma', 'no-cache')
    res.setHeader('Expires', '0')
    res.status(200).json({ success: true, data: document })
  } catch (error) {
    next(error)
  }
}

// @route   GET /api/documents/:id/file
// Redirects to the Cloudinary URL — the file is no longer stored locally.
export const serveDocumentFile = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?._id?.toString()
    if (!userId) return next(new AppError('Unauthorized', 401))

    const id = req.params?.id
    if (typeof id !== 'string') {
      return next(new AppError('Invalid document ID', 400))
    }

    // getFilePath now returns the cloudinaryUrl
    const cloudinaryUrl = await DocumentService.getFilePath(userId, id)

    if (!cloudinaryUrl) {
      return next(new AppError('File not found or unauthorized', 404))
    }

    // 302 redirect: browser/client follows the URL directly to Cloudinary CDN
    res.redirect(cloudinaryUrl)
  } catch (error) {
    next(error)
  }
}


