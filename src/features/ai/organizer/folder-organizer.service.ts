import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { SystemMessage, HumanMessage } from '@langchain/core/messages'
import { DocumentModel } from '../../documents/document.model'
import Folder from '../../folders/folder.model'
import { AppError } from '../../../core/errors/AppError'

// ─── Module-level default (production) ──────────────────────────────────────
// Instantiated ONCE per process. ModelRegistry.initialize() overrides this.

/**
 * @description Owns all AI-driven folder organization logic.
 *
 * Responsibilities:
 *  1. Generating a semantic folder proposal for a set of documents (LLM call)
 *  2. Applying that proposal by physically creating MongoDB folders and
 *     moving documents, including pruning empty ghost folders afterwards.
 *
 * The LLM model is injected via `init()` — never constructed inside a method.
 * ModelRegistry calls `FolderOrganizerService.init()` at startup.
 */
export class FolderOrganizerService {
  // ==========================================
  // INJECTED MODEL (injectable for unit tests)
  // ==========================================

  private static _organizerModel: BaseChatModel

  /**
   * Injection point — called by ModelRegistry at startup.
   * In unit tests, call this in beforeEach() to inject a mock model.
   * @example FolderOrganizerService.init(mockModel)
   */
  static init(model: BaseChatModel): void {
    this._organizerModel = model
  }

  // ==========================================
  // SEMANTIC FOLDER PROPOSAL (AI)
  // ==========================================

  /**
   * Asks the LLM to propose a logical folder structure for the given documents.
   * Uses existing summaries and tags — zero raw text is sent to the model.
   */
  static async generateSemanticProposal(
    userId: string,
    documents: { _id?: string; id?: string; title: string }[]
  ) {
    // 1. Get existing folder paths so the AI doesn't reinvent the wheel
    const allPaths = await Folder.distinct('path', { user: userId })
    const existingPaths = allPaths.filter((p: string) => !p.toLowerCase().includes('random files'))

    // 2. Fetch rich semantic metadata for each document from the DB
    const docIds = documents.map((d) => d._id || d.id).filter(Boolean) as string[]
    const dbDocs = await DocumentModel.find({ _id: { $in: docIds }, user: userId })
      .select('_id title summary tags fileType contentType isOrganized aiStatus folder originalClientPath semanticPath')
      .populate('folder')

    if (dbDocs.length === 0) return []

    // Guard: all documents must be fully analyzed before organizing
    const unanalyzedDocs = dbDocs.filter((doc) => doc.aiStatus !== 'Analyzed')
    if (unanalyzedDocs.length > 0) {
      throw new AppError(
        'Please wait until the Neural Cortex finishes analyzing all selected documents before organizing.',
        400
      )
    }

    // Guard: skip documents that are already organized
    const alreadyOrganizedDocs = dbDocs.filter((doc) => doc.isOrganized)
    if (alreadyOrganizedDocs.length > 0) {
      throw new AppError('One or more selected documents are already organized.', 400)
    }

    // 4. Build the lightweight document payload (summaries + tags only — no raw text)
    const docPayload = dbDocs.map((doc) => ({
      id: doc._id.toString(),
      title: doc.title,
      summary: doc.summary,
      tags: doc.tags,
      type: doc.contentType || doc.fileType
    }))

    // 5. System prompt — direct JSON output (NOT withStructuredOutput, which uses
    //    tool calling internally and causes schema validation retry loops on Ollama)
    const systemPrompt = new SystemMessage(
      `You are a digital librarian. Organize documents into logical folders based on their content.\n` +
      (existingPaths.length > 0
        ? `EXISTING FOLDERS:\n${existingPaths.join('\n')}\nReuse these if they fit.\n`
        : '') +
      `RULES:\n` +
      `- Return ONLY a raw JSON object, no markdown, no code fences.\n` +
      `- Propose a folder path for EVERY document ID in the input.\n` +
      `- Paths use "/" for nesting, max 3 levels (e.g. "Finance/Invoices").\n` +
      `- NEVER use "Random Files" as a folder name.\n` +
      `- Group similar documents together.\n\n` +
      `FORMAT:\n` +
      `{"updates": [{"documentId": "exact_id", "newPath": "Folder/Subfolder"}, ...]}`
    )

    const humanPrompt = new HumanMessage(JSON.stringify(docPayload))

    console.log(`[AI Organizer] Proposing folders for ${dbDocs.length} documents...`)

    // 6. Invoke the model and parse JSON response
    try {
      const startTime = Date.now()
      const response = await this._organizerModel.invoke([systemPrompt, humanPrompt])

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      console.log(`[AI Organizer] LLM responded in ${elapsed}s`)

      const rawContent = typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content)

      // Extract JSON from response (model might wrap it in markdown code fences)
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        console.warn('[AI Organizer] No JSON found in LLM response:', rawContent.substring(0, 500))
        return []
      }

      const parsed = JSON.parse(jsonMatch[0])
      const updates: { documentId: string; newPath: string }[] = parsed.updates || []

      const enrichedUpdates = updates.map((update: any) => {
        const doc = dbDocs.find((d) => d._id.toString() === update.documentId)
        let originalPath = doc?.title || update.documentId

        if (doc) {
          if (doc.semanticPath && doc.semanticPath !== '/') {
            originalPath = `${doc.semanticPath}/${doc.title}`
          } else if (doc.folder) {
            const folderObj = doc.folder as any
            const folderName = folderObj.path || folderObj.name
            if (folderName) {
              originalPath = `${folderName}/${doc.title}`
            }
          } else if (doc.originalClientPath && doc.originalClientPath !== doc.title) {
            originalPath = doc.originalClientPath
          }
        }

        return { ...update, title: doc?.title, originalPath }
      })

      return enrichedUpdates
    } catch (error: any) {
      if (
        error?.status === 429 ||
        error?.message?.includes('429') ||
        error?.message?.includes('rate limit') ||
        error?.message?.includes('Too Many Requests')
      ) {
        throw new AppError('AI provider rate limit exceeded. Please try again later.', 429)
      }
      throw error
    }
  }

  // ==========================================
  // PHYSICAL FOLDER APPLICATION
  // ==========================================

  /**
   * Applies the AI-proposed folder structure to the database.
   * Uses an in-memory folder cache + atomic upserts to minimize DB round-trips.
   * Prunes empty ghost folders left behind after documents are moved.
   */
  static async applyPhysicalFolders(
    userId: string,
    updates: { documentId: string; newPath: string }[]
  ) {
    if (!updates || updates.length === 0) return

    // Pre-fetch old folder IDs so we can prune ghost folders after the move
    const documentIds = updates.map((u) => u.documentId).filter(Boolean)
    const docsToMove = await DocumentModel.find({ _id: { $in: documentIds }, user: userId }).select('folder')
    const oldFolderIds = [...new Set(docsToMove.map((d) => d.folder?.toString()).filter(Boolean))]

    // Pre-fetch all existing folders into an in-memory cache (O(1) lookups)
    const existingFolders = await Folder.find({ user: userId }).select('_id path')
    const folderCache = new Map<string, string>()
    existingFolders.forEach((folder) => {
      folderCache.set(folder.path, folder._id.toString())
    })

    const documentOperations = []

    // Process each AI proposal — build the folder path incrementally
    for (const update of updates) {
      let { documentId, newPath } = update
      if (!documentId || !newPath) continue

      // Hard logic guard: if AI hallucinates and uses "Random Files", force it to "Miscellaneous"
      if (newPath.toLowerCase().includes('random files')) {
        newPath = newPath.replace(/random files/gi, 'Miscellaneous')
      }

      const pathParts = newPath.split('/').filter((p) => p.trim() !== '')
      let currentParentId = null
      let accumulatedPath = ''

      for (const part of pathParts) {
        accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part

        // Check the in-memory cache first before hitting the DB
        if (folderCache.has(accumulatedPath)) {
          currentParentId = folderCache.get(accumulatedPath)
          continue
        }

        // Atomic upsert: find the folder or create it if it doesn't exist
        const upsertedFolder = (await Folder.findOneAndUpdate(
          { name: part, user: userId, parentFolder: currentParentId },
          {
            $setOnInsert: {
              name: part,
              user: userId,
              parentFolder: currentParentId,
              path: accumulatedPath,
              isAIGenerated: true
            }
          },
          { upsert: true, returnDocument: 'after' }
        )) as any

        currentParentId = upsertedFolder._id.toString()
        folderCache.set(accumulatedPath, currentParentId)
      }

      // Queue the document update for bulk execution
      documentOperations.push({
        updateOne: {
          filter: { _id: documentId },
          update: {
            $set: {
              folder: currentParentId,
              semanticPath: newPath,
              isOrganized: true
            }
          }
        }
      })
    }

    // Execute all document updates in a single DB round-trip
    if (documentOperations.length > 0) {
      await DocumentModel.bulkWrite(documentOperations)
      console.log(
        `[Folder Organizer] Successfully applied ${documentOperations.length} folder updates via BulkWrite.`
      )
    }

    // Prune empty ghost folders left behind by moved documents
    if (oldFolderIds.length > 0) {
      for (const oldFolderId of oldFolderIds) {
        let currentId = oldFolderId
        while (currentId) {
          const docCount = await DocumentModel.countDocuments({ folder: currentId })
          const childCount = await Folder.countDocuments({ parentFolder: currentId })

          if (docCount === 0 && childCount === 0) {
            const folderToDelete = await Folder.findById(currentId)
            if (folderToDelete) {
              const parentId = folderToDelete.parentFolder?.toString()
              await Folder.findByIdAndDelete(currentId)
              console.log(`[Folder Organizer] Pruned empty ghost folder: ${folderToDelete.name}`)
              currentId = parentId
            } else {
              break
            }
          } else {
            break
          }
        }
      }
    }
  }
}
