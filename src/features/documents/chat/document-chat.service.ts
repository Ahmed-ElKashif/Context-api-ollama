import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages'
import { ChatMessageModel } from '../../ai/models/chat.model'
import { EmbeddingService } from '../../ai/search/vector.service'
import mongoose from 'mongoose'

// ─── Module-level default (production) ──────────────────────────────────────
// Instantiated once per process — never inside a method.

export class DocumentChatService {
  // ─── Injected Chat Model (injectable for unit tests) ───────────────────────
  private static _chatModel: BaseChatModel

  /**
   * Injection point — called by ModelRegistry at startup.
   * In unit tests: DocumentChatService.init(mockModel as any)
   */
  static init(chatModel: BaseChatModel): void {
    this._chatModel = chatModel
  }

  /**
   * Fetches the chat history for a specific document and user.
   */
  static async getDocumentChatHistory(documentId: string, userId: string) {
    return await ChatMessageModel.find({ documentId, user: userId })
      .sort({ createdAt: 1 }) // Ascending order for frontend UIs
      .select('role content createdAt -_id')
      .exec()
  }

  /**
   * Performs a vector search and generates an AI response using the
   * document's stored chunks as context.
   */
  static async chatWithDocument(
    documentId: string,
    userId: string,
    query: string
  ): Promise<string> {
    const llm = this._chatModel // ← uses injected singleton, never constructs inline
    const vectorStore = await EmbeddingService.getVectorStore()

    // 1. Retrieve Context
    const retriever = vectorStore.asRetriever({
      k: 5,
      filter: {
        preFilter: {
          documentId: { $eq: new mongoose.Types.ObjectId(documentId) },
          userId: { $eq: new mongoose.Types.ObjectId(userId) }
        }
      }
    })

    const relevantChunks = await retriever.invoke(query)
    const contextText = relevantChunks.map((chunk) => chunk.pageContent).join('\n\n---\n\n')

    if (!contextText) {
      return "I couldn't find any relevant information in this document to answer your question."
    }

    // 2. Fetch recent conversation memory
    const history = await ChatMessageModel.find({ documentId, user: userId })
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
      You are an insightful and collaborative AI thought partner.
      Your goal is to help the user understand, analyze, and brainstorm based on the provided document context.

      RULES FOR ENGAGEMENT:
      1. Grounding: Use the provided context as the absolute foundation for your factual answers.
      2. Synthesis & Brainstorming: You are encouraged to help the user connect ideas, draw logical conclusions, or brainstorm extensions of the document's concepts. 
      3. Missing Information: If the user asks for a hard fact that is NOT in the context, explicitly state: "The document does not mention this." 
      4. General Knowledge: If the document lacks a fact, you MAY use your general knowledge to help explain a concept, but you MUST clearly distinguish what is from the document versus what is from your general knowledge.
      5. Language: Detect the language the user is writing in and ALWAYS respond in that same language. If the user types in Arabic, respond in Arabic. Be consistent throughout the conversation.

      DOCUMENT CONTEXT:
      ${contextText}
    `)

    // ⏱️ 300s deadline: local chat processing can take longer.
    const response = await llm.withConfig({ timeout: 300_000 }).invoke([systemPrompt, ...formattedHistory, new HumanMessage(query)])
    const aiResponseText = (response.content as string).trim()

    // 4. Save to Database
    await ChatMessageModel.insertMany([
      { documentId, user: userId, role: 'user', content: query },
      { documentId, user: userId, role: 'assistant', content: aiResponseText }
    ])

    return aiResponseText
  }
}
