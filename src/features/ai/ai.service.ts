/**
 * @file ai.service.ts — Façade
 * @description Backward-compatible façade that re-exports all public methods
 * from the focused, single-responsibility AI services.
 *
 * WHY THIS FILE EXISTS:
 * `AIService` is imported by ai.controller.ts, upload.service.ts,
 * document.controller.ts, models.registry.ts, and unit test mocks.
 * Rather than updating all those import sites simultaneously, this façade
 * preserves the original `AIService` surface so all consumers continue
 * to work without any changes.
 *
 * WHERE THE LOGIC LIVES:
 * ┌─────────────────────────────────┬──────────────────────────────────────────┐
 * │ AIService method                │ Actual implementation                    │
 * ├─────────────────────────────────┼──────────────────────────────────────────┤
 * │ processPendingDocuments()       │ document-pipeline.service.ts             │
 * │ generateSemanticProposal()      │ folder-organizer.service.ts              │
 * │ applyPhysicalFolders()          │ folder-organizer.service.ts              │
 * │ semanticSearch()                │ search.service.ts                        │
 * │ synthesizeDocuments()           │ synthesis.service.ts                     │
 * │ generateEmbedding()             │ vector.service.ts                        │
 * │ init() [organizer model]        │ folder-organizer.service.ts              │
 * └─────────────────────────────────┴──────────────────────────────────────────┘
 */

import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { DocumentPipelineService } from './pipeline/document-pipeline.service'
import { FolderOrganizerService } from './organizer/folder-organizer.service'
import { SearchService } from './search/search.service'
import { SynthesisService } from './synthesis/synthesis.service'
import { EmbeddingService } from './search/vector.service'

export class AIService {
  /**
   * Injects the organizer LLM model.
   * Called by ModelRegistry at startup.
   * In tests, call this in beforeEach() with a mock model.
   */
  static init(organizerModel: BaseChatModel): void {
    FolderOrganizerService.init(organizerModel)
  }

  /**
   * Processes a batch of uploaded documents through the full AI pipeline.
   * @see DocumentPipelineService.processPendingDocuments
   */
  static processPendingDocuments(documentIds: string[]): Promise<void> {
    return DocumentPipelineService.processPendingDocuments(documentIds)
  }

  /**
   * Asks the LLM to propose a semantic folder structure for the given documents.
   * @see FolderOrganizerService.generateSemanticProposal
   */
  static generateSemanticProposal(
    userId: string,
    documents: { _id?: string; id?: string; title: string }[]
  ) {
    return FolderOrganizerService.generateSemanticProposal(userId, documents)
  }

  /**
   * Applies the AI-proposed folder structure to the database.
   * @see FolderOrganizerService.applyPhysicalFolders
   */
  static applyPhysicalFolders(userId: string, updates: { documentId: string; newPath: string }[]) {
    return FolderOrganizerService.applyPhysicalFolders(userId, updates)
  }

  /**
   * Performs a global semantic search across all documents owned by the user.
   * @see SearchService.semanticSearch
   */
  static semanticSearch(userId: string, query: string) {
    return SearchService.semanticSearch(userId, query)
  }

  /**
   * Generates a combined summary for the given set of documents.
   * @see SynthesisService.synthesizeDocuments
   */
  static synthesizeDocuments(documentIds: string[], userId: string): Promise<string> {
    return SynthesisService.synthesizeDocuments(documentIds, userId)
  }

  /**
   * Generates a vector embedding for the given text.
   * Delegates directly to EmbeddingService — kept here for backward compatibility.
   */
  static async generateEmbedding(text: string): Promise<number[]> {
    try {
      const safeText = text.substring(0, 30000)
      return await EmbeddingService.getEmbeddingsModel().embedQuery(safeText)
    } catch (error) {
      console.error('Failed to generate embedding:', error)
      throw new Error('AI Embedding generation failed.')
    }
  }
}
