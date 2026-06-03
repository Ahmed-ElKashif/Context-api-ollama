import mongoose from 'mongoose'
import { DocumentModel } from '../../documents/document.model'
import { EmbeddingService } from './vector.service'

/**
 * @description Owns global semantic vector search across a user's document library.
 *
 * Strategy:
 *  - Over-fetches 15 chunks from Atlas Vector Search to ensure a diverse pool.
 *  - Deduplicates by documentId, keeping only the highest-scoring chunk per document.
 *  - Hydrates the top 5 unique results with document metadata for the frontend.
 *
 * Security: The `preFilter` on `userId` strictly isolates every query to the
 * requesting user's vector space — cross-user data leakage is impossible.
 */
export class SearchService {
  /**
   * Performs a global semantic search across all documents owned by the user.
   *
   * @param userId - The authenticated user's ID (used as a strict vector space filter).
   * @param query  - The natural language search string.
   * @returns      An array of up to 5 unique, hydrated search results.
   */
  static async semanticSearch(userId: string, query: string) {
    const vectorStore = EmbeddingService.getVectorStore()

    console.log(`[Global Search] Scanning vector space for user ${userId}...`)

    // 1. Over-fetch: 15 chunks ensures diversity even with duplicate documents
    const rawResults = await vectorStore.similaritySearchWithScore(query, 15, {
      preFilter: {
        userId: { $eq: new mongoose.Types.ObjectId(userId) }
      }
    })

    if (rawResults.length === 0) return []

    // 2. Deduplicate: keep only the highest-scoring chunk per document.
    //    Results are already sorted by score descending, so the first occurrence wins.
    const uniqueResults = []
    const seenDocIds = new Set<string>()

    for (const [chunk, score] of rawResults) {
      const docId = chunk.metadata.documentId.toString()

      if (!seenDocIds.has(docId)) {
        seenDocIds.add(docId)
        uniqueResults.push([chunk, score] as const)
      }

      if (uniqueResults.length >= 5) break
    }

    // 3. Hydrate with document metadata from the main collection
    const uniqueDocIds = [...seenDocIds]

    const actualDocuments = await DocumentModel.find({
      _id: { $in: uniqueDocIds }
    }).select('title fileType cloudinaryUrl')

    const docLookup = actualDocuments.reduce(
      (acc, doc) => {
        acc[doc._id.toString()] = doc
        return acc
      },
      {} as Record<string, any>
    )

    // 4. Map to the frontend response shape
    return uniqueResults.map(([chunk, score]) => {
      const docId = chunk.metadata.documentId.toString()
      const parentDoc = docLookup[docId]

      return {
        text: chunk.pageContent,
        confidenceScore: Number((score * 100).toFixed(2)),
        documentId: docId,
        documentTitle: parentDoc?.title || 'Unknown Document',
        documentType: parentDoc?.fileType || 'Unknown',
        documentUrl: parentDoc?.cloudinaryUrl || null,
        chunkIndex: chunk.metadata.chunkIndex
      }
    })
  }
}
