import { DocumentModel } from '../../documents/document.model'
import { SynthesizerAgent } from '../agents/synthesizer.service'
import { AppError } from '../../../core/errors/AppError'

/**
 * @description Owns the business logic layer for bulk document synthesis.
 *
 * This service is distinct from `SynthesizerAgent` (which is the raw LangChain
 * agent wrapper). This layer handles:
 *  - Fetching and validating the selected documents from the DB
 *  - Formatting the lightweight metadata payload for the agent
 *  - Short-circuiting single-document requests (no LLM call needed)
 *
 * The actual LLM call is delegated to `SynthesizerAgent.generateBulkSummary()`.
 */
export class SynthesisService {
  /**
   * Generates a combined summary for the given set of documents.
   * Requires all selected documents to be fully analyzed (aiStatus === 'Analyzed').
   * If only one document is selected, returns its existing summary directly.
   *
   * @param documentIds - Array of document IDs to synthesize.
   * @param userId      - The authenticated user's ID (used to scope the DB query).
   * @returns           The generated bulk summary string.
   */
  static async synthesizeDocuments(documentIds: string[], userId: string): Promise<string> {
    // 1. Fetch documents, scoped strictly to the requesting user
    const documents = await DocumentModel.find({
      _id: { $in: documentIds },
      user: userId
    })

    if (!documents || documents.length === 0) {
      throw new Error('No valid documents found for synthesis.')
    }

    // Guard: all documents must be fully analyzed
    const unanalyzedDocs = documents.filter((doc) => doc.aiStatus !== 'Analyzed')
    if (unanalyzedDocs.length > 0) {
      throw new AppError(
        'Please wait until the Neural Cortex finishes analyzing all selected documents before synthesizing.',
        400
      )
    }

    // Short-circuit: a single document already has a summary — no LLM call needed
    if (documents.length === 1) {
      return documents[0].summary || 'No summary available for this document.'
    }

    // Safety caps tuned for Ollama llama3.1:8b (num_ctx=8192):
    //  - PER_SUMMARY_CAP (500 chars): keeps individual summaries tight
    //  - PAYLOAD_CAP (8,000 chars ≈ 2k tokens): leaves ~6k tokens for
    //    system prompt + output within the 8k context window
    const PER_SUMMARY_CAP = 500
    const PAYLOAD_CAP     = 8_000

    const formattedData = documents
      .map((doc, index) => {
        const summary = doc.summary || 'No summary available.'
        const safeSummary = summary.length > PER_SUMMARY_CAP
          ? summary.substring(0, PER_SUMMARY_CAP) + '... [truncated]'
          : summary

        return `
      Document ${index + 1}:
      Title: ${doc.title || 'Unknown'}
      Category/Type: ${doc.contentType || doc.fileType}
      Cognitive Load: ${doc.cognitiveLoad || 'Medium'} (${doc.cognitiveScore || 5}/10)
      Tags: ${doc.tags?.join(', ')}
      Orchestrator Summary: ${safeSummary}
      ---`
      })
      .join('\n')

    // Final safety ceiling — log a warning and truncate if the total payload is still too large
    const safePayload = formattedData.length > PAYLOAD_CAP
      ? formattedData.substring(0, PAYLOAD_CAP) + '\n\n[... additional documents omitted due to payload size ...]'
      : formattedData

    if (formattedData.length > PAYLOAD_CAP) {
      console.warn(
        `[Synthesizer] Payload exceeded cap (${formattedData.length.toLocaleString()} / ${PAYLOAD_CAP.toLocaleString()} chars). Truncated before sending.`
      )
    }

    // 3. Delegate to the LangChain Synthesizer Agent
    console.log(`[Synthesizer] Synthesizing ${documents.length} documents (payload: ${safePayload.length.toLocaleString()} chars)...`)
    return await SynthesizerAgent.generateBulkSummary(safePayload)
  }
}
