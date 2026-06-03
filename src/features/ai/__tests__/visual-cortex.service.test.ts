import { VisualCortexService } from '../agents/visual-cortex.service'
import { HumanMessage } from '@langchain/core/messages'

describe('VisualCortexService', () => {
  const mockPrimaryInvoke = jest.fn()
  const mockFallbackInvoke = jest.fn()

  const mockPrimary = {
    withConfig: jest.fn().mockReturnThis(),
    invoke: mockPrimaryInvoke
  }

  const mockFallback = {
    withConfig: jest.fn().mockReturnThis(),
    invoke: mockFallbackInvoke
  }

  beforeEach(() => {
    VisualCortexService.init(mockPrimary as any, mockFallback as any)
    jest.clearAllMocks()
  })

  describe('extractImageContent()', () => {
    const base64Image = 'base64-data-here'

    it('returns extracted text from the primary model successfully', async () => {
      mockPrimaryInvoke.mockResolvedValueOnce({ content: ' OCR Text from Groq \n' })

      const result = await VisualCortexService.extractImageContent(base64Image, 'image/png')

      expect(result).toBe('OCR Text from Groq')
      expect(mockPrimaryInvoke).toHaveBeenCalledTimes(1)
      expect(mockFallbackInvoke).not.toHaveBeenCalled()
      
      // Verify message structure
      const invokeArg = mockPrimaryInvoke.mock.calls[0][0][0]
      expect(invokeArg).toBeInstanceOf(HumanMessage)
      expect(invokeArg.content[1].image_url.url).toBe('data:image/png;base64,base64-data-here')
    })

    it('falls back to the secondary model if the primary model fails', async () => {
      mockPrimaryInvoke.mockRejectedValueOnce(new Error('Groq Timeout'))
      mockFallbackInvoke.mockResolvedValueOnce({ content: ' OCR Text from OpenAI ' })

      const result = await VisualCortexService.extractImageContent(base64Image)

      expect(result).toBe('OCR Text from OpenAI')
      expect(mockPrimaryInvoke).toHaveBeenCalledTimes(1)
      expect(mockFallbackInvoke).toHaveBeenCalledTimes(1)
    })

    it('throws a user-friendly error if both primary and fallback models fail', async () => {
      mockPrimaryInvoke.mockRejectedValueOnce(new Error('Groq Failed'))
      mockFallbackInvoke.mockRejectedValueOnce(new Error('OpenAI Failed'))

      await expect(
        VisualCortexService.extractImageContent(base64Image)
      ).rejects.toThrow('Our OCR engines are currently experiencing high traffic. Please try uploading the image again.')

      expect(mockPrimaryInvoke).toHaveBeenCalledTimes(1)
      expect(mockFallbackInvoke).toHaveBeenCalledTimes(1)
    })

    it('applies a 30s timeout to the primary model and 40s to the fallback model', async () => {
      mockPrimaryInvoke.mockRejectedValueOnce(new Error('Groq Failed'))
      mockFallbackInvoke.mockResolvedValueOnce({ content: 'Text' })

      await VisualCortexService.extractImageContent(base64Image)

      expect(mockPrimary.withConfig).toHaveBeenCalledWith({ timeout: 30_000 })
      expect(mockFallback.withConfig).toHaveBeenCalledWith({ timeout: 40_000 })
    })
  })
})
