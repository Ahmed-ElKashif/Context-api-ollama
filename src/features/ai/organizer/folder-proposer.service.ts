import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { SystemMessage, HumanMessage } from '@langchain/core/messages'
import { z } from 'zod'
import { DocumentModel } from '../../documents/document.model'
import { AppError } from '../../../core/errors/AppError'

// ─── Output Schemas (Zod) ────────────────────────────────────────────────────

/**
 * Subfolder node — one level of nesting.
 * Two-level max is intentional: prevents overly deep trees and keeps JSON Schema
 * simple enough for withStructuredOutput() to reliably parse.
 */
const SubfolderSchema = z.object({
  name: z.string().describe('A short, descriptive subfolder name (2–4 words max)'),
  reason: z
    .string()
    .describe('One sentence explaining why these documents are grouped here'),
  documentIds: z
    .array(z.string())
    .describe('Exact document IDs that belong in this subfolder')
})

/**
 * Top-level folder node.
 * documentIds holds docs that live directly here (no subfolder needed).
 * subfolders holds more granular clusters inside this folder.
 */
const FolderNodeSchema = z.object({
  name: z.string().describe('A short, descriptive top-level folder name (2–4 words max)'),
  reason: z
    .string()
    .describe('One sentence explaining why these documents are grouped here'),
  documentIds: z
    .array(z.string())
    .describe('Document IDs that live directly in this folder (NOT in any subfolder)'),
  subfolders: z
    .array(SubfolderSchema)
    .describe('Optional nested subfolders for more granular grouping. Empty array if not needed.')
})

/**
 * Root output schema — wrapped in an object so withStructuredOutput() works reliably.
 * The LLM always returns { folders: [...] }.
 */
const FolderTreeOutputSchema = z.object({
  folders: z
    .array(FolderNodeSchema)
    .describe('The complete proposed folder tree. Every document must appear exactly once.')
})

// ─── Exported Types ───────────────────────────────────────────────────────────

export type SubfolderNode = z.infer<typeof SubfolderSchema>
export type FolderNode = z.infer<typeof FolderNodeSchema>
export type FolderTreeOutput = z.infer<typeof FolderTreeOutputSchema>

// ─── Module-level default (production) ──────────────────────────────────────

// ─── FolderProposerService ───────────────────────────────────────────────────

/**
 * @description Proposes a semantic folder tree for ALL of a user's analyzed documents.
 *
 * Differs from AIService.generateSemanticProposal() which:
 *   - Requires explicit document IDs from the caller
 *   - Returns flat { documentId, newPath }[] pairs
 *   - Is designed for apply-then-write flow
 *
 * FolderProposerService:
 *   - Fetches ALL analyzed docs automatically (no input required)
 *   - Returns a hierarchical FolderTree[] structure
 *   - Is read-only (pure proposal, no DB writes)
 */
export class FolderProposerService {
  // ─── Injected Model (injectable for unit tests) ──────────────────────────

  private static _model: BaseChatModel

  /**
   * Injection point — called by ModelRegistry at startup.
   * In unit tests, inject a mock:
   * @example FolderProposerService.init(mockModel)
   */
  static init(model: BaseChatModel): void {
    this._model = model
  }

  // ─── Core Method ─────────────────────────────────────────────────────────

  /**
   * Fetches all analyzed documents for a user, batches their summaries + tags
   * into a single prompt, and asks the AI model to cluster them into a semantic
   * FolderTree via withStructuredOutput().
   *
   * Returns the proposed tree without making any DB changes.
   * Safety cap: processes at most 100 documents per request.
   */
  static async proposeStructure(userId: string): Promise<{
    tree: FolderTreeOutput['folders']
    documentCount: number
    wasCapped: boolean
  }> {
    // ── 0. Ensure no unanalyzed documents exist in the pool ───────────────
    const unanalyzedDocs = await DocumentModel.exists({
      user: userId,
      isOrganized: false,
      aiStatus: { $ne: 'Analyzed' }
    })

    if (unanalyzedDocs) {
      throw new AppError('Please wait until the Neural Cortex finishes analyzing all your unorganized documents before generating a global folder proposal.', 400)
    }

    // ── 1. Fetch all analyzed documents for this user ─────────────────────
    const allDocs = await DocumentModel.find({
      user: userId,
      aiStatus: 'Analyzed',
      isOrganized: false
    })
      .select('_id title summary tags fileType cognitiveLoad')
      .sort({ updatedAt: -1 })
      .limit(101) // fetch one extra to detect if capping occurred

    const wasCapped = allDocs.length > 100
    const docs = allDocs.slice(0, 100)

    if (docs.length < 2) {
      console.log(`[FolderProposer] Not enough documents to cluster (found ${docs.length}).`)
      return {
        tree: [],
        documentCount: docs.length,
        wasCapped: false
      }
    }

    // ── 2. Build a compact JSON payload (summary + tags drive clustering) ──
    const docPayload = docs.map((doc) => ({
      id: doc._id.toString(),
      title: doc.title,
      summary: doc.summary || 'No summary available.',
      tags: doc.tags ?? [],
      type: doc.fileType
    }))

    // ── 3. Direct JSON prompting (NOT withStructuredOutput, which uses
    //    tool calling internally and causes retry loops on Ollama) ──────────
    const systemMessage = new SystemMessage(
      `You are a digital librarian. Organize documents into a semantic folder tree.\n` +
      `RULES:\n` +
      `- Group by topic, NOT by file type.\n` +
      `- Every document must appear exactly once.\n` +
      `- Folder names: 2-4 words, Title Case.\n` +
      `- Max 2 levels deep. Max 8 top-level folders.\n` +
      `- Merge tiny groups (1-2 docs) into "Miscellaneous".\n` +
      `- NEVER use "Random Files" as a name.\n` +
      `- Use exact document IDs from input.\n\n` +
      `Return ONLY a raw JSON object (no markdown, no code fences):\n` +
      `{"folders": [\n` +
      `  {"name": "Folder Name", "reason": "why grouped", "documentIds": ["id1"],\n` +
      `   "subfolders": [{"name": "Sub Name", "reason": "why", "documentIds": ["id2"]}]}\n` +
      `]}`
    )

    const humanMessage = new HumanMessage(
      `Organize these ${docs.length} documents:\n${JSON.stringify(docPayload)}`
    )

    // ── 4. Invoke and parse ───────────────────────────────────────────────
    console.log(`[FolderProposer] Clustering ${docs.length} documents into semantic folders...`)

    const startTime = Date.now()
    const response = await this._model.invoke([systemMessage, humanMessage])

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`[FolderProposer] LLM responded in ${elapsed}s`)

    const rawContent = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content)

    let tree: FolderTreeOutput['folders'] = []

    try {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        // Validate with Zod but don't use it for structured output binding
        const validated = FolderTreeOutputSchema.parse(parsed)
        tree = validated.folders
      } else {
        console.warn('[FolderProposer] No JSON found in LLM response:', rawContent.substring(0, 500))
      }
    } catch (parseError) {
      console.warn('[FolderProposer] Failed to parse/validate LLM response:', parseError)
    }

    console.log(
      `[FolderProposer] Proposed ${tree.length} top-level folders for ${docs.length} documents.`
    )

    return {
      tree,
      documentCount: docs.length,
      wasCapped
    }
  }
}
