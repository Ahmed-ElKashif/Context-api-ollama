import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'

/**
 * @description Defines the output structure expected from the Orchestrator Agent.
 */
export interface DocumentMetadata {
  type: 'PDF' | 'Word' | 'Image' | 'TextSnippet' | 'Excel'
  summary: string
  tags: string[]
  cognitiveLoad: 'Light' | 'Medium' | 'Heavy'
}

// ─── Module-level default (production) ──────────────────────────────────────
// Instantiated ONCE per process — not inside a method.
// ModelRegistry.initialize() will call OrchestratorService.init() to override this.

export class OrchestratorService {
  // ==========================================
  // INJECTED MODEL (injectable for unit tests)
  // ==========================================

  private static _model: BaseChatModel

  /**
   * Injection point — called by ModelRegistry at startup.
   * In unit tests, call this in beforeEach() to inject a mock model.
   * @example OrchestratorService.init(mockModel)
   */
  static init(model: BaseChatModel): void {
    this._model = model
  }

  // ==========================================
  // AGENT EXECUTION
  // ==========================================

  /**
   * Invokes a single-shot LLM call to analyze document text and extract structured metadata.
   *
   * ARCHITECTURE NOTE — WHY NOT createReactAgent?
   * The previous implementation used createReactAgent with 3 tool definitions.
   * A ReAct agent makes 4–7 sequential LLM calls (think → tool → think → tool …),
   * each taking 60–90 seconds on CPU-only Ollama. That totals 4–7 minutes,
   * exceeding any practical timeout.
   *
   * This approach achieves the same result with a SINGLE LLM call by asking
   * the model to return all metadata as a JSON object. On CPU this takes ~60–90s
   * instead of 4–7 minutes.
   */
  public static async analyzeDocumentMetadata(
    documentId: string,
    textPreview: string,
    persona: string = 'general'
  ): Promise<DocumentMetadata> {
    // Dynamic Persona Dictionary
    const personaPrompts: Record<string, string> = {
      general: 'Write a clear, easy-to-understand summary that anyone can digest.',
      professional:
        'Write a concise, executive-level brief focusing on actionable business insights, bottom-line impacts, and key metrics.',
      student:
        'Write an educational summary highlighting key concepts, definitions, and potential study points or exam topics.',
      developer:
        'Write a highly technical summary focusing on architecture, code patterns, algorithms, system design, and technical specifications.'
    }

    const stylingRule = personaPrompts[persona.toLowerCase()] || personaPrompts['general']

    const systemPrompt = new SystemMessage(`You are an elite Document Orchestrator Agent.
Your sole responsibility is to analyze the provided document text and extract metadata.

CRITICAL INSTRUCTION FOR THE SUMMARY:
The user who uploaded this document has the persona: "${persona}".
When generating the summary, you MUST follow this style:
${stylingRule}

CRITICAL LANGUAGE RULE:
Detect the primary language of the document text provided. Write the summary and all tags
in that SAME language. If the document is in Arabic, respond in Arabic. If it is in French,
respond in French. Match the document's language exactly.

CRITICAL OUTPUT FORMAT:
You MUST respond with ONLY a valid JSON object. No markdown, no code fences, no extra text.
The JSON object must have exactly these fields:
{
  "type": "PDF" | "Word" | "Image" | "TextSnippet" | "Excel",
  "summary": "A clear, 7-10 sentence summary of the document content.",
  "tags": ["tag1", "tag2", "tag3", "tag4"],
  "cognitiveLoad": "Light" | "Medium" | "Heavy"
}

FIELD RULES:
- type: The document format. Must be one of: PDF, Word, Image, TextSnippet, Excel.
- summary: A clear summary of 7-10 sentences following the persona style above.
- tags: An array of 4 to 8 highly specific, descriptive tags.
- cognitiveLoad: Light = simple/short. Medium = standard business doc. Heavy = dense, technical, or highly complex.

Respond with ONLY the JSON object. Nothing else.`)

    let response

    // Single LLM call — no ReAct agent loop.
    try {
      console.log(`[OrchestratorService] Sending single-shot analysis request for document ${documentId}...`)
      const startTime = Date.now()

      response = await this._model.invoke([
        systemPrompt,
        new HumanMessage(`Analyze the following document text:\n\n${textPreview}`)
      ])

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      console.log(`[OrchestratorService] LLM responded in ${elapsed}s`)

      // Log Token Usage
      const tokens = response.usage_metadata
      if (tokens) {
        console.log(
          `[Orchestrator Token Usage] Prompt: ${tokens.input_tokens} | Completion: ${tokens.output_tokens} | Total: ${tokens.total_tokens}`
        )
      } else {
        console.log(`[Orchestrator Token Usage] Metrics unavailable for this payload.`)
      }
    } catch (error) {
      console.error('[OrchestratorService] Critical failure during LLM invocation:', error)
      throw new Error('Orchestrator execution failed.')
    }

    // ==========================================
    // JSON EXTRACTION
    // ==========================================

    const rawContent = typeof response.content === 'string'
      ? response.content
      : JSON.stringify(response.content)

    console.log(`[OrchestratorService] Raw LLM output (first 500 chars): ${rawContent.substring(0, 500)}`)

    let parsed: Partial<DocumentMetadata> = {}

    try {
      // Try to extract JSON from the response — the model might wrap it in markdown code fences
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0])
      } else {
        console.warn('[OrchestratorService] No JSON object found in LLM response. Using defaults.')
      }
    } catch (parseError) {
      console.warn('[OrchestratorService] Failed to parse JSON from LLM response:', parseError)
      console.warn('[OrchestratorService] Raw content was:', rawContent.substring(0, 1000))
    }

    // Validate and apply defaults
    const validTypes = ['PDF', 'Word', 'Image', 'TextSnippet', 'Excel'] as const
    const validLoads = ['Light', 'Medium', 'Heavy'] as const

    return {
      type: validTypes.includes(parsed.type as any) ? parsed.type! : 'TextSnippet',
      summary: parsed.summary && typeof parsed.summary === 'string'
        ? parsed.summary
        : 'Summary could not be generated.',
      tags: Array.isArray(parsed.tags) && parsed.tags.length > 0
        ? parsed.tags.filter((t): t is string => typeof t === 'string')
        : ['Uncategorized'],
      cognitiveLoad: validLoads.includes(parsed.cognitiveLoad as any)
        ? parsed.cognitiveLoad!
        : 'Medium'
    }
  }
}
