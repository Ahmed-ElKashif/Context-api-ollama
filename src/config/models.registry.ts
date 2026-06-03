import { ChatOllama, OllamaEmbeddings } from '@langchain/ollama'
import { OrchestratorService } from '../features/ai/agents/orchestrator.service'
import { SynthesizerAgent } from '../features/ai/agents/synthesizer.service'
import { CognitiveLoadService } from '../features/ai/agents/cognitive-load.service'
import { VisualCortexService } from '../features/ai/agents/visual-cortex.service'
import { DeepThinkerService } from '../features/comparison/deep-thinker.service'
import { EmbeddingService } from '../features/ai/search/vector.service'
import { FolderOrganizerService } from '../features/ai/organizer/folder-organizer.service'
import { FolderProposerService } from '../features/ai/organizer/folder-proposer.service'
import { DocumentChatService } from '../features/documents/chat/document-chat.service'
import { ComparisonService } from '../features/comparison/comparison.service'
import { PrettifyAgentService } from '../features/ai/prettify/prettify-agent.service'

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'

/**
 * @description Central model registry. Instantiates local Ollama models once
 * at server startup and injects them into every AI service via static init() setters.
 */
export class ModelRegistry {
  static initialize(): void {
    console.log('[ModelRegistry] 🔄 Initializing Local Ollama Models...')

    // ─── Workhorse Text Model (Llama 3.1 8B Instruct) ──────────────────────────
    // num_ctx MUST be set explicitly — Ollama defaults to 2048 tokens which is
    // far too small for the Orchestrator pipeline (system prompt + tool schemas
    // + document preview). Without this, the model silently overflows, hangs,
    // and causes a LangGraph TimeoutError before generating a single token.
    const standardTextModel = new ChatOllama({
      baseUrl: OLLAMA_BASE_URL,
      model: 'llama3.1:8b-instruct-q4_K_M',
      temperature: 0.3,
      numCtx: 8192,       // Explicitly allocate the full 8k context window
      keepAlive: '30m',   // Keep the model loaded in memory between requests
    })

    // ─── Conversational RAG Text Model (Llama 3.1 8B Instruct) ──────────────────
    const conversationalModel = new ChatOllama({
      baseUrl: OLLAMA_BASE_URL,
      model: 'llama3.1:8b-instruct-q4_K_M',
      temperature: 0.4, // Higher temperature for conversational responsiveness
      numCtx: 8192,
      keepAlive: '30m',
    })

    // ─── Vision Model (LLaVA 7B) ───────────────────────────────────────────────
    const visionModel = new ChatOllama({
      baseUrl: OLLAMA_BASE_URL,
      model: 'llava:7b-v1.6-mistral-q4_K_M',
      temperature: 0.1,
      numCtx: 4096,      // Vision model needs less text context
      keepAlive: '30m',
    })

    // ─── Local Embedding Model (Nomic Text - 768 dims) ──────────────────────────
    const embeddingModel = new OllamaEmbeddings({
      baseUrl: OLLAMA_BASE_URL,
      model: 'nomic-embed-text:latest'
    })

    // ─── Injection Flow ────────────────────────────────────────────────────────

    // 1. Orchestrator (Classify, Tag, Summarize)
    OrchestratorService.init(standardTextModel)

    // 2. Synthesizer (Bulk document synthesis)
    SynthesizerAgent.init(standardTextModel)

    // 3. Cognitive Load (Reading complexity scoring)
    CognitiveLoadService.init(standardTextModel)

    // 4. Visual Cortex
    // Both primary and fallback are re-routed to your local LLaVA vision cluster
    VisualCortexService.init(visionModel, visionModel)

    // 5. Deep Thinker
    // Re-routed entirely to local Llama 3.1 8B since external Groq keys are stripped
    DeepThinkerService.init(standardTextModel, standardTextModel, standardTextModel)

    // 6. Embedding Service (Nomic Embed 768 dimensions)
    EmbeddingService.init(embeddingModel)

    // 7. Folder Organizer (Semantic folder proposals)
    FolderOrganizerService.init(standardTextModel)

    // 8. Folder Proposer (Full-library semantic tree proposals)
    FolderProposerService.init(standardTextModel)

    // 9. DocumentChatService (RAG chat with single documents)
    DocumentChatService.init(conversationalModel)

    // 10. ComparisonService (RAG chat with dual compared documents)
    ComparisonService.init(standardTextModel)

    // 11. PrettifyAgentService (Format documents to structured JSON)
    PrettifyAgentService.init(standardTextModel)

    console.log('[ModelRegistry] ✅ Local Ollama infrastructure injected successfully.')
  }
}
