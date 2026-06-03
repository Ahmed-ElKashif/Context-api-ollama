import { Request, Response, NextFunction } from 'express'
import { AppError } from '../../core/errors/AppError'
import { AIService } from './ai.service'
import { estimateTokens } from '../../core/services/token-budget.service'

/**
 * @description AI Controller — HTTP parsing and response formatting only.
 * Each handler sets res.locals.aiMeta after its service call so that:
 *   - checkTokenBudget middleware can record token usage
 *   - aiLogger middleware can emit a structured log line
 *
 * res.locals.aiMeta shape: { model: string, tokensUsed: number, operation: string }
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getLatency(res: Response): number {
  return Date.now() - (res.locals.startTime ?? Date.now())
}

// ─── Controllers ─────────────────────────────────────────────────────────────

import { DocumentModel } from '../documents/document.model'
import Folder from '../folders/folder.model'

/**
 * Analyzes a batch of unstructured documents and generates a proposed
 * relational folder structure based on semantic context.
 * @route POST /api/ai/organize-folder
 */
export const generateSemanticStructure = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = (req as any).user._id
    let { documents, folderIds } = req.body

    documents = documents || []

    // If folderIds are provided, fetch all documents recursively inside those folders
    if (folderIds && folderIds.length > 0) {
      const targetFolders = await Folder.find({ _id: { $in: folderIds }, user: userId }).select('_id path')
      const allFolderIds = new Set<string>()

      for (const folder of targetFolders) {
        allFolderIds.add(folder._id.toString())
        const escapedPath = folder.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const subfolders = await Folder.find({
          user: userId,
          path: { $regex: `^${escapedPath}/` }
        }).select('_id')
        
        subfolders.forEach(sf => allFolderIds.add(sf._id.toString()))
      }

      const folderDocs = await DocumentModel.find({ 
        user: userId, 
        folder: { $in: Array.from(allFolderIds) },
        isOrganized: { $ne: true } 
      }).select('_id title')

      const existingIds = new Set(documents.map((d: any) => d._id || d.id))
      
      for (const fDoc of folderDocs) {
        if (!existingIds.has(fDoc._id.toString())) {
          documents.push({ _id: fDoc._id.toString(), title: fDoc.title })
          existingIds.add(fDoc._id.toString())
        }
      }
    }

    if (documents.length === 0) {
      res.status(400).json({
        success: false,
        message: 'No valid documents found in the selection to organize.'
      })
      return
    }

    const proposedUpdates = await AIService.generateSemanticProposal(userId, documents)

    // Estimate tokens: document titles + summaries + system prompt overhead
    const inputText = JSON.stringify(documents)
    res.locals.aiMeta = {
      model: 'llama3.1:8b', // Local text model
      tokensUsed: estimateTokens(inputText) + 800, // +800 system prompt overhead
      operation: 'organize-folder'
    }

    res.status(200).json({
      success: true,
      message: 'AI successfully mapped documents to semantic folders.',
      data: { updates: proposedUpdates }
    })
  } catch (error) {
    next(error)
  }
}

// ==========================================
// 📂 SEMANTIC ORGANIZER (FOLDER PROPOSALS)
// ==========================================

/**
 * Executes the AI's proposed structure, recursively building physical
 * MongoDB folders and moving the documents into them.
 * @route PUT /api/ai/apply-folders
 */
export const applySemanticFolders = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = (req as any).user._id
    const { updates } = req.body

    await AIService.applyPhysicalFolders(userId, updates)

    // No AI call — no aiMeta needed
    res.status(200).json({
      success: true,
      message: 'Physical folder structure generated and documents routed successfully!'
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Performs a global semantic search across all of a user's embedded documents.
 * @route GET /api/ai/search?q=your_search_term
 */
export const searchDocuments = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = (req as any).user._id.toString()
    const query = req.query.q as string

    if (!query) {
      res.status(400).json({
        success: false,
        message: 'Search query is required (e.g., ?q=recipe).'
      })
      return
    }

    const results = await AIService.semanticSearch(userId, query)

    // Semantic search uses embeddings — estimate query tokens
    res.locals.aiMeta = {
      model: 'nomic-embed-text', // Local embedding model
      tokensUsed: estimateTokens(query),
      operation: 'semantic-search'
    }

    res.status(200).json({
      success: true,
      count: results.length,
      data: results
    })
  } catch (error) {
    next(error)
  }
}

/**
 * Generates a combined summary of multiple selected files.
 * @route POST /api/ai/synthesize
 */
export const synthesizeDocuments = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = (req as any).user._id
    let { documentIds, folderIds } = req.body

    documentIds = documentIds || []

    if (folderIds && folderIds.length > 0) {
      const targetFolders = await Folder.find({ _id: { $in: folderIds }, user: userId }).select('_id path')
      const allFolderIds = new Set<string>()

      for (const folder of targetFolders) {
        allFolderIds.add(folder._id.toString())
        const escapedPath = folder.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const subfolders = await Folder.find({
          user: userId,
          path: { $regex: `^${escapedPath}/` }
        }).select('_id')
        
        subfolders.forEach(sf => allFolderIds.add(sf._id.toString()))
      }

      const folderDocs = await DocumentModel.find({
        user: userId,
        folder: { $in: Array.from(allFolderIds) }
      }).select('_id')
      
      const existingIds = new Set(documentIds)
      for (const fDoc of folderDocs) {
        if (!existingIds.has(fDoc._id.toString())) {
          documentIds.push(fDoc._id.toString())
          existingIds.add(fDoc._id.toString())
        }
      }
    }

    if (!documentIds || !Array.isArray(documentIds) || documentIds.length < 2) {
      return next(new AppError('Please select at least 2 documents to synthesize.', 400))
    }

    const bulkSummary = await AIService.synthesizeDocuments(documentIds, userId)

    // Synthesizer uses existing document summaries + tags — relatively light
    // Estimate: average summary ~200 chars × documentCount + system prompt
    const estimatedInputChars = documentIds.length * 800 // summary + tags per doc
    res.locals.aiMeta = {
      model: 'llama3.1:8b', // Local text model
      tokensUsed: estimateTokens(String(estimatedInputChars)) + 600,
      operation: 'synthesize'
    }

    res.status(200).json({
      success: true,
      data: {
        summary: bulkSummary
      }
    })
  } catch (error) {
    next(error)
  }
}
