import mongoose from 'mongoose'
import { Embeddings } from '@langchain/core/embeddings'
import { MongoDBAtlasVectorSearch } from '@langchain/mongodb'
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { ChunkModel } from '../../documents/chunk.model'

/**
 * @description Dedicated service for managing the LangChain MongoDB Vector Store.
 * Isolates all embedding generation, chunking, and database connections.
 */
export class EmbeddingService {
  // ==========================================
  // INJECTED EMBEDDINGS (injectable for unit tests)
  // ==========================================

  private static _embeddings: Embeddings

  /**
   * Injection point — called by ModelRegistry at startup.
   * In unit tests, inject a mock:
   * @example
   * const mockEmbeddings = { embedQuery: jest.fn().mockResolvedValue([0.1, 0.2]) }
   * EmbeddingService.init(mockEmbeddings as any)
   */
  static init(embeddings: Embeddings): void {
    this._embeddings = embeddings
  }

  /**
   * Helper to extract the pure Native MongoDB Driver collection from Mongoose.
   * LangChain requires the native driver, not the Mongoose wrapper.
   */
  private static getNativeCollection() {
    const client = mongoose.connection.getClient()
    const db = client.db()
    return db.collection(ChunkModel.collection.collectionName)
  }

  /**
   * Initializes and returns the LangChain VectorStore instance connected to our MongoDB cluster.
   * Used strictly for RAG retrieval.
   */
  public static getVectorStore(): MongoDBAtlasVectorSearch {
    const collection = this.getNativeCollection()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new MongoDBAtlasVectorSearch(this._embeddings, {
      collection: collection as any,
      indexName: 'vector_index',
      textKey: 'text',
      embeddingKey: 'embedding'
    })
  }

  public static getEmbeddingsModel(): Embeddings {
    return this._embeddings
  }

  /**
   * Slices raw text into semantic chunks and handles the bulk embedding
   * and insertion into MongoDB directly through LangChain.
   */
  public static async upsert(rawText: string, documentId: string, userId: string): Promise<void> {
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 512,
      chunkOverlap: 50,
      separators: ['\n\n', '\n', '.', '!', '?']
    })

    const chunks = await splitter.createDocuments([rawText])

    const mappedChunks = chunks.map((chunk, index) => {
      chunk.metadata = {
        documentId: new mongoose.Types.ObjectId(documentId),
        userId: new mongoose.Types.ObjectId(userId),
        chunkIndex: index
      }
      return chunk
    })

    const collection = this.getNativeCollection()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await MongoDBAtlasVectorSearch.fromDocuments(mappedChunks, this._embeddings, {
      collection: collection as any,
      indexName: 'vector_index',
      textKey: 'text',
      embeddingKey: 'embedding'
    })
  }

  /**
   * Deletes all semantic chunks associated with a specific document ID or array of document IDs.
   * Ensures no ghost chunks remain in Vector Search when documents or folders are deleted.
   */
  public static async deleteDocumentChunks(documentIds: string | string[], userId: string): Promise<void> {
    const ids = Array.isArray(documentIds) ? documentIds : [documentIds]
    const objectIds = ids.map(id => new mongoose.Types.ObjectId(id))

    const result = await ChunkModel.deleteMany({
      documentId: { $in: objectIds },
      userId: new mongoose.Types.ObjectId(userId)
    })
    console.log(`[VectorStore] Purged ${result.deletedCount} ghost chunks for deleted documents.`)
  }
}
