import { CognitiveLoadService } from '../agents/cognitive-load.service'

// ─── Mock: inject a Runnable (already withStructuredOutput-wrapped) ───────────
// CognitiveLoadService.init() accepts a pre-wrapped Runnable — plain object is fine.
const mockInvoke = jest.fn()
const mockModel = { invoke: mockInvoke }

beforeEach(() => {
  CognitiveLoadService.init(mockModel as any)
})

// ─────────────────────────────────────────────────────────────────────────────

describe('CognitiveLoadService', () => {
  describe('evaluateText()', () => {
    it('returns Light/score 1 immediately for empty string — no model call', async () => {
      const result = await CognitiveLoadService.evaluateText('')
      expect(result).toEqual({
        load: 'Light',
        score: 1,
        reason: 'Document is empty or mostly images.'
      })
      expect(mockInvoke).not.toHaveBeenCalled()
    })

    it('returns Light/score 1 immediately for whitespace-only text — no model call', async () => {
      const result = await CognitiveLoadService.evaluateText('   \n  ')
      expect(result).toEqual({
        load: 'Light',
        score: 1,
        reason: 'Document is empty or mostly images.'
      })
      expect(mockInvoke).not.toHaveBeenCalled()
    })

    it('returns Light/score 1 immediately for undefined — no model call', async () => {
      const result = await CognitiveLoadService.evaluateText(undefined)
      expect(result).toEqual({
        load: 'Light',
        score: 1,
        reason: 'Document is empty or mostly images.'
      })
      expect(mockInvoke).not.toHaveBeenCalled()
    })

    it('calls model.invoke() with correct SystemMessage + HumanMessage for real text', async () => {
      const expected = { load: 'Heavy', score: 9, reason: 'Highly technical content.' }
      mockInvoke.mockResolvedValueOnce(expected)

      const result = await CognitiveLoadService.evaluateText('Quantum entanglement involves...')
      expect(result).toEqual(expected)
      expect(mockInvoke).toHaveBeenCalledTimes(1)

      const [messages] = mockInvoke.mock.calls[0]
      expect(messages).toHaveLength(2)
      expect(messages[0]._getType()).toBe('system')
      expect(messages[1]._getType()).toBe('human')
    })

    it('truncates text longer than 4000 chars before sending to model', async () => {
      mockInvoke.mockResolvedValueOnce({ load: 'Medium', score: 5, reason: 'Standard text.' })
      const longText = 'a'.repeat(10_000)
      await CognitiveLoadService.evaluateText(longText)

      const [messages] = mockInvoke.mock.calls[0]
      const humanContent = messages[1].content as string
      expect(humanContent.length).toBeLessThanOrEqual(4100) // ~4000 chars + label prefix
    })

    it('returns Medium fallback when model.invoke() throws', async () => {
      mockInvoke.mockRejectedValueOnce(new Error('OpenAI rate limit'))
      const result = await CognitiveLoadService.evaluateText('Some real document text here.')
      expect(result).toEqual({
        load: 'Medium',
        score: 5,
        reason: 'AI analysis failed; defaulted to Medium.'
      })
    })
  })
})
