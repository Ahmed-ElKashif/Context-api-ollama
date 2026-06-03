/**
 * SynthesizerAgent — unit tests
 *
 * Strategy: SynthesizerAgent builds a chain internally:
 *   prompt.pipe(this._model).pipe(new StringOutputParser())
 *
 * We mock @langchain/core/prompts so that ChatPromptTemplate.fromMessages()
 * returns a fake chain whose final invoke() we fully control.
 * This avoids instantiating real LangChain models in tests.
 */

// ─── Module-level mock (hoisted by Jest before imports) ──────────────────────
const mockChainInvoke = jest.fn()

jest.mock('@langchain/core/prompts', () => ({
  ChatPromptTemplate: {
    fromMessages: jest.fn().mockImplementation(() => ({
      pipe: jest.fn().mockImplementation(() => ({
        pipe: jest.fn().mockReturnValue({
          invoke: mockChainInvoke
        })
      }))
    }))
  }
}))

// ─── Import AFTER mock declaration ───────────────────────────────────────────
import { SynthesizerAgent } from '../agents/synthesizer.service'

const mockWithConfig = jest.fn().mockReturnThis()
const mockModel = { invoke: jest.fn(), pipe: jest.fn(), withConfig: mockWithConfig }

beforeEach(() => {
  SynthesizerAgent.init(mockModel as any)
})

// ─────────────────────────────────────────────────────────────────────────────

describe('SynthesizerAgent', () => {
  describe('generateBulkSummary()', () => {
    it('returns trimmed model output for related documents', async () => {
      mockChainInvoke.mockResolvedValueOnce(
        '  These documents share machine learning fundamentals.  '
      )
      const result = await SynthesizerAgent.generateBulkSummary('doc data payload')
      expect(result).toBe('These documents share machine learning fundamentals.')
    })

    it('returns exact "The files are not related" string for unrelated docs', async () => {
      mockChainInvoke.mockResolvedValueOnce('The files are not related')
      const result = await SynthesizerAgent.generateBulkSummary('doc data payload')
      expect(result).toBe('The files are not related')
    })

    it('passes documentsData to chain.invoke()', async () => {
      mockChainInvoke.mockResolvedValueOnce('A combined summary.')
      await SynthesizerAgent.generateBulkSummary('MY_DOC_PAYLOAD')
      expect(mockChainInvoke).toHaveBeenCalledWith({ documentsData: 'MY_DOC_PAYLOAD' })
    })

    it('propagates errors from the chain', async () => {
      mockChainInvoke.mockRejectedValueOnce(new Error('API timeout'))
      await expect(SynthesizerAgent.generateBulkSummary('data')).rejects.toThrow('API timeout')
    })
  })
})
