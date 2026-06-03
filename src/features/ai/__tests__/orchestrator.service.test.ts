/**
 * OrchestratorService — unit tests
 *
 * Strategy:
 * - Mock @langchain/langgraph/prebuilt so createReactAgent() returns a fake agent
 * - The fake agent's invoke() returns a controlled message array
 * - OrchestratorService.init() is called with a mock BaseChatModel
 *
 * OrchestratorService parses tool_calls from AI messages to extract metadata.
 * We construct fake AI messages that satisfy isAIMessage() by setting _getType().
 */

// ─── Mock createReactAgent ────────────────────────────────────────────────────
const mockAgentInvoke = jest.fn()

jest.mock('@langchain/langgraph/prebuilt', () => ({
  createReactAgent: jest.fn().mockImplementation(() => ({
    invoke: mockAgentInvoke
  }))
}))

import { OrchestratorService } from '../agents/orchestrator.service'

// ─── Mock model (injected — not used directly, just needs to exist) ───────────
const mockModel = { invoke: jest.fn(), bindTools: jest.fn() }

// ─── Helpers to build fake AI messages with tool_calls ───────────────────────
const makeAIMessage = (toolCalls: { name: string; args: Record<string, any> }[]) => ({
  _getType: () => 'ai' as const,
  tool_calls: toolCalls,
  usage_metadata: { input_tokens: 100, output_tokens: 50, total_tokens: 150 }
})

// Full happy-path response: all 3 tools called
const fullAgentResponse = {
  messages: [
    makeAIMessage([
      { name: 'classifyDocument',  args: { type: 'PDF', summary: 'A research paper on AI.' } },
      { name: 'labelCognitiveLoad', args: { load: 'Heavy' } },
      { name: 'generateTags',       args: { tags: ['AI', 'Research', 'Deep Learning'] } }
    ])
  ]
}

beforeEach(() => {
  OrchestratorService.init(mockModel as any)
})

// ─────────────────────────────────────────────────────────────────────────────

describe('OrchestratorService', () => {
  describe('analyzeDocumentMetadata()', () => {
    it('extracts type, summary, cognitiveLoad, and tags from agent tool_calls', async () => {
      mockAgentInvoke.mockResolvedValueOnce(fullAgentResponse)

      const result = await OrchestratorService.analyzeDocumentMetadata(
        'doc123',
        'Text content of the PDF...'
      )

      expect(result.type).toBe('PDF')
      expect(result.summary).toBe('A research paper on AI.')
      expect(result.cognitiveLoad).toBe('Heavy')
      expect(result.tags).toEqual(['AI', 'Research', 'Deep Learning'])
    })

    it('returns safe defaults when agent returns no tool_calls', async () => {
      mockAgentInvoke.mockResolvedValueOnce({ messages: [] })
      const result = await OrchestratorService.analyzeDocumentMetadata('doc123', 'Some text')
      expect(result.type).toBe('TextSnippet')
      expect(result.summary).toBe('Summary could not be generated.')
      expect(result.cognitiveLoad).toBe('Medium')
      expect(result.tags).toEqual(['Uncategorized'])
    })

    it('invokes agent with a 60-second timeout config', async () => {
      mockAgentInvoke.mockResolvedValueOnce(fullAgentResponse)
      await OrchestratorService.analyzeDocumentMetadata('my-doc-id', 'document content here')

      const [, config] = mockAgentInvoke.mock.calls[0]
      expect(config.timeout).toBe(60_000)
    })

    it('throws when agent.invoke() rejects', async () => {
      mockAgentInvoke.mockRejectedValueOnce(new Error('LangGraph crash'))
      await expect(
        OrchestratorService.analyzeDocumentMetadata('doc123', 'text')
      ).rejects.toThrow('Orchestrator execution failed.')
    })
  })
})
