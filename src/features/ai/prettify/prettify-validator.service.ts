import { AppError } from '../../../core/errors/AppError'
import { PrettifyLimitError } from '../../../core/errors/PrettifyLimitError'

export class PrettifyValidatorService {
  // Downgraded limits for Ollama 8192 context window
  static readonly MAX_CELLS = 400
  static readonly MAX_ROWS = 40
  static readonly MAX_COLUMNS = 15
  static readonly MAX_WORD_CHARS = 8000
  static readonly MAX_SNIPPET_CHARS = 5000

  static validate(rawText: string, fileType: string): void {
    if (!rawText || rawText.trim().length === 0) {
      throw new AppError('No text content found. The document appears to be empty.', 400)
    }

    if (fileType === 'PDF' || fileType === 'Image') {
      throw new AppError(`Prettify is not supported for ${fileType} files.`, 422)
    }

    if (fileType === 'Excel') {
      this.validateExcel(rawText)
    } else if (fileType === 'Word') {
      this.validateWord(rawText)
    } else if (fileType === 'TextSnippet') {
      this.validateTextSnippet(rawText)
    } else {
      throw new AppError(`Prettify is not supported for ${fileType} files.`, 422)
    }
  }

  private static validateExcel(rawText: string): void {
    const lines = rawText.split('\n')
    let headerLine = ''
    let totalDataRows = 0

    for (const line of lines) {
      const trimmed = line.trim()
      // Skip empty lines and the sheet separator added by the pipeline
      if (!trimmed || trimmed.startsWith('--- Sheet:')) {
        continue
      }
      
      if (!headerLine) {
        headerLine = trimmed
      } else {
        totalDataRows++
      }
    }

    // Number of columns based on commas in the CSV header
    const columns = headerLine ? headerLine.split(',').length : 0
    // Total rows includes the header
    const rows = headerLine ? totalDataRows + 1 : 0
    const totalCells = rows * columns

    if (totalCells > this.MAX_CELLS) {
      throw new PrettifyLimitError({
        fileType: 'Excel',
        limit: { cells: this.MAX_CELLS, rows: this.MAX_ROWS, columns: this.MAX_COLUMNS },
        actual: { cells: totalCells, rows, columns },
        message: `Your Excel has ${rows} rows across ${columns} columns (${totalCells.toLocaleString()} cells). Prettify supports up to ${this.MAX_CELLS} cells (e.g. ${this.MAX_ROWS} rows × ${this.MAX_COLUMNS} columns).`,
        suggestion: "Delete unused rows or split the sheet into two files and prettify each separately."
      })
    }

    if (columns > this.MAX_COLUMNS) {
      throw new PrettifyLimitError({
        fileType: 'Excel',
        limit: { cells: this.MAX_CELLS, rows: this.MAX_ROWS, columns: this.MAX_COLUMNS },
        actual: { cells: totalCells, rows, columns },
        message: `Your Excel has ${rows} rows across ${columns} columns (${totalCells.toLocaleString()} cells). Prettify supports up to ${this.MAX_COLUMNS} columns.`,
        suggestion: "Hide or delete columns you don't need. Prettify works best on focused datasets."
      })
    }
  }

  private static validateWord(rawText: string): void {
    const actualChars = rawText.length
    if (actualChars > this.MAX_WORD_CHARS) {
      throw new PrettifyLimitError({
        fileType: 'Word',
        limit: { chars: this.MAX_WORD_CHARS },
        actual: { chars: actualChars },
        message: `Your document has ${actualChars.toLocaleString()} characters. Prettify supports up to ${this.MAX_WORD_CHARS.toLocaleString()} characters.`,
        suggestion: "Copy a specific section into a new document and prettify that instead."
      })
    }
  }

  private static validateTextSnippet(rawText: string): void {
    const actualChars = rawText.length
    if (actualChars > this.MAX_SNIPPET_CHARS) {
      throw new PrettifyLimitError({
        fileType: 'TextSnippet',
        limit: { chars: this.MAX_SNIPPET_CHARS },
        actual: { chars: actualChars },
        message: `Your snippet has ${actualChars.toLocaleString()} characters. Prettify supports up to ${this.MAX_SNIPPET_CHARS.toLocaleString()} characters.`,
        suggestion: "Trim the snippet to the core content you want structured."
      })
    }
  }
}
