import { DocumentModel } from '../documents/document.model'
import { DeepThinkerService } from './deep-thinker.service'
import { ComparisonMessageModel } from './comparison-chat.model'
import { EmbeddingService } from '../ai/search/vector.service'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages'
import mongoose from 'mongoose'

export class ComparisonService {
  // ==========================================
  // INJECTED CHAT MODEL (Dependency Injection)
  // ==========================================

  private static _chatModel: BaseChatModel | null = null

  /**
   * Injection point — called by ModelRegistry at startup.
   */
  static init(chatModel: BaseChatModel): void {
    this._chatModel = chatModel
  }

  // ==========================================
  // CORE COMPARISON GENERATION
  // ==========================================

  static async performComparison(userId: string, id1: string, id2: string) {
    // 1. Fetch documents securely
    const [doc1, doc2] = await Promise.all([
      DocumentModel.findOne({ _id: id1, user: userId }),
      DocumentModel.findOne({ _id: id2, user: userId })
    ])

    if (!doc1 || !doc2) {
      return { error: 'One or both documents not found or unauthorized.', statusCode: 404 }
    }

    if (doc1.aiStatus !== 'Analyzed' || doc2.aiStatus !== 'Analyzed') {
      return {
        error:
          'Please wait until the Neural Cortex finishes analyzing both documents before comparing.',
        statusCode: 400
      }
    }

    // Guard: both documents must have some content to compare against.
    // (The actual text sent to the LLM is built inside DeepThinkerService
    //  using DocumentPreviewService — see deep-thinker.service.ts)
    if (!(doc1.extractedText || doc1.summary) || !(doc2.extractedText || doc2.summary)) {
      return {
        error: 'Both documents must have extracted text or a summary to perform a comparison.',
        statusCode: 400
      }
    }

    const comparison = await DeepThinkerService.compareDocuments(userId, id1, id2)

    return {
      doc1: { _id: doc1._id, title: doc1.title },
      doc2: { _id: doc2._id, title: doc2.title },
      comparison
    }
  }

  // ==========================================
  // DUAL-DOCUMENT RAG CHAT
  // ==========================================

  /**
   * Fetches the chat history for a specific comparison session
   */
  static async getComparisonChatHistory(userId: string, docIdA: string, docIdB: string) {
    return await ComparisonMessageModel.find({
      user: userId,
      docIdA,
      docIdB
    })
      .sort({ createdAt: 1 }) // Ascending for frontend UI
      .select('role content createdAt -_id')
      .exec()
  }

  /**
   * Performs a vector search across TWO documents and generates a comparative AI response
   */
  static async chatWithComparison(
    userId: string,
    docIdA: string,
    docIdB: string,
    query: string
  ): Promise<string> {
    if (!this._chatModel) {
      throw new Error('[ComparisonService] Chat model not initialized. Call init() first.')
    }

    const llm = this._chatModel
    const vectorStore = await EmbeddingService.getVectorStore()

    // 1. Retrieve Context from BOTH documents
    const retriever = vectorStore.asRetriever({
      k: 8, // Increased from 5 to ensure coverage of both files
      filter: {
        preFilter: {
          userId: { $eq: new mongoose.Types.ObjectId(userId) },
          // 🚀 THE FIX: Use $in to pull chunks from either document A or B
          documentId: {
            $in: [new mongoose.Types.ObjectId(docIdA), new mongoose.Types.ObjectId(docIdB)]
          }
        }
      }
    })

    const relevantChunks = await retriever.invoke(query)
    const contextText = relevantChunks.map((chunk) => chunk.pageContent).join('\n\n---\n\n')

    if (!contextText) {
      return "I couldn't find any relevant information in these documents to answer your question."
    }

    // 2. Fetch recent conversation memory
    const history = await ComparisonMessageModel.find({ user: userId, docIdA, docIdB })
      .sort({ createdAt: -1 })
      .limit(5)
      .exec()

    const formattedHistory = history
      .reverse()
      .map((msg) =>
        msg.role === 'user' ? new HumanMessage(msg.content) : new AIMessage(msg.content)
      )

    // 3. Generate Answer
    const systemPrompt = new SystemMessage(`
      You are an insightful and collaborative comparative AI thought partner.
      The user is asking a question about a comparison between TWO documents.
      Your goal is to help the user understand, analyze, and brainstorm based on the provided dual-document context.
      
      RULES FOR ENGAGEMENT:
      1. Grounding: Use the provided context as the absolute foundation for your factual answers.
      2. Synthesis & Brainstorming: Help the user connect ideas, draw logical conclusions, or find contradictions between the two files. You are encouraged to brainstorm extensions of the concepts.
      3. Clarity: When citing details, try to clarify if the detail belongs to one document or the other based on the context.
      4. Missing Information: If the user asks for a hard fact that is NOT in the context, explicitly state: "These documents do not mention this."
      5. General Knowledge: If the documents lack a fact, you MAY use your general knowledge to help explain a concept, but you MUST clearly distinguish what is from the documents versus what is from your general knowledge.
      6. Language: Detect the language the user is writing in and ALWAYS respond in that same language. If the user types in Arabic, respond in Arabic. Be consistent throughout the conversation.

      DUAL-DOCUMENT CONTEXT:
      ${contextText}
    `)

    console.log(`[ComparisonService] Querying local model for dual-document comparison chat...`)

    // ⏱️ 30s deadline: comparison chat is interactive — same SLA as DocumentChatService.
    const response = await llm.withConfig({ timeout: 300_000 }).invoke([systemPrompt, ...formattedHistory, new HumanMessage(query)])
    const aiResponseText = (response.content as string).trim()

    // 4. Save to Database
    await ComparisonMessageModel.insertMany([
      { user: userId, docIdA, docIdB, role: 'user', content: query },
      { user: userId, docIdA, docIdB, role: 'assistant', content: aiResponseText }
    ])

    return aiResponseText
  }
}
