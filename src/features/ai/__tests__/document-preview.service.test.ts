import { DocumentPreviewService, SupportedFileType } from '../pipeline/document-preview.service'

describe('DocumentPreviewService', () => {
  describe('buildPreview()', () => {
    it('returns raw text unchanged if it fits within the maxChars budget', () => {
      const shortText = 'This is a short document.'
      const result = DocumentPreviewService.buildPreview(shortText, 'PDF')
      expect(result).toBe(shortText)
    })

    describe('Text Window Preview (PDF, Word, TextSnippet)', () => {
      it('builds a 3-window sample for long text documents', () => {
        const longText = 'A'.repeat(100) + 'B'.repeat(100) + 'C'.repeat(100)
        // total = 300, maxChars = 10. middle = index 149.
        const result = DocumentPreviewService.buildPreview(longText, 'PDF', 10)
        
        expect(result).toContain('AAAAA')
        expect(result).toContain('BBB')
        expect(result).toContain('CC')
        expect(result).toContain('[... ~0k characters omitted')
      })
    })

    describe('Excel Preview', () => {
      it('returns hard truncation if sheet headers are not found', () => {
        const invalidExcelFormat = 'Just some comma, separated, values\n1,2,3'
        const result = DocumentPreviewService.buildPreview(invalidExcelFormat, 'Excel', 10)
        expect(result).toBe('Just some ')
      })

      it('builds a schema-aware preview for valid Excel extraction format', () => {
        const header = 'id,name,value'
        const row = '1,item,100'
        const manyRows = Array(150).fill(row).join('\n')
        
        const rawExcel = `--- Sheet: Sheet1 ---\n${header}\n${manyRows}\n\n`
        
        // Use maxChars = 50 to force truncation and trigger the builder logic
        const result = DocumentPreviewService.buildPreview(rawExcel, 'Excel', 50)
        
        expect(result).toContain('--- Sheet: Sheet1 ---')
        expect(result).toContain('[Schema: 150 data rows × 3 columns — showing first 100 rows]')
        expect(result).toContain(header)
        // 100 sample rows + schema + header => length should be predictable
        expect(result).toContain('[... 50 more rows omitted ...]')
      })
      
      it('handles multiple sheets correctly', () => {
        const rawExcel = `--- Sheet: S1 ---\nA,B\n1,2\n\n--- Sheet: S2 ---\nC,D\n3,4\n\n`
        // Force truncation
        const result = DocumentPreviewService.buildPreview(rawExcel, 'Excel', 10)
        expect(result).toContain('--- Sheet: S1 ---')
        expect(result).toContain('--- Sheet: S2 ---')
        expect(result).toContain('[Schema: 1 data rows × 2 columns — showing first 1 rows]')
      })

      it('ignores empty sheets', () => {
        const rawExcel = `--- Sheet: Empty ---\n\n--- Sheet: S1 ---\nA,B\n1,2\n\n`
        // Force truncation
        const result = DocumentPreviewService.buildPreview(rawExcel, 'Excel', 10)
        expect(result).not.toContain('--- Sheet: Empty ---')
        expect(result).toContain('--- Sheet: S1 ---')
      })
    })

    describe('Image Preview', () => {
      it('returns a hard truncated string for Image type', () => {
        const longText = '1234567890'
        const result = DocumentPreviewService.buildPreview(longText, 'Image', 5)
        expect(result).toBe('12345')
      })
    })

    describe('Unknown/Fallback type', () => {
      it('returns a hard truncated string for an unknown type', () => {
        const longText = '1234567890'
        const result = DocumentPreviewService.buildPreview(longText, 'Unknown' as SupportedFileType, 5)
        expect(result).toBe('12345')
      })
    })
  })
})
