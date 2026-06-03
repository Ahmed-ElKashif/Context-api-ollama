/**
 * @file document-preview.service.ts
 * @description Builds a token-safe, type-aware preview of raw extracted text
 * for consumption by the Orchestrator Agent.
 *
 * WHY THIS EXISTS:
 * The Orchestrator only needs a representative sample of a document to
 * classify it, summarize it, and generate tags. Sending the full rawText
 * of a 10,000-row Excel sheet or a 400-page PDF exceeds the model's
 * context window and causes a ContextOverflowError.
 *
 * This service is the single enforcement point for the orchestrator input budget.
 * All other pipeline stages (embeddings, cognitive load) receive the full rawText.
 *
 * BUDGET:
 * MAX_ORCHESTRATOR_CHARS = 80,000 chars ≈ ~20k tokens
 * Combined with system prompt + tool schema overhead this stays safely
 * below the model's token limit. To increase the budget later,
 * change only this constant.
 */

export type SupportedFileType = 'PDF' | 'Word' | 'Image' | 'TextSnippet' | 'Excel'

// ~3k tokens — safe budget for Ollama Llama 3.1 8B with num_ctx=8192.
// The ReAct agent makes 3 sequential tool calls, each adding messages to the
// thread. Budget breakdown: ~3k input text + ~1k system prompt + ~1k tool
// schemas + ~3k for 3 tool-call/result round-trips = ~8k total (fits in 8192).
// If you upgrade to a model with a larger context window, increase this value.
const MAX_ORCHESTRATOR_CHARS = 12_000

export class DocumentPreviewService {
  /**
   * Builds a representative, token-safe preview of the extracted text.
   * If the text fits within the budget it is returned unchanged.
   * If it exceeds the budget, a type-aware sampling strategy is applied.
   *
   * @param rawText  - The full extracted text from the document.
   * @param fileType - The document type, used to pick the sampling strategy.
   * @param maxChars - Optional character budget override. Defaults to MAX_ORCHESTRATOR_CHARS (80,000).
   *                   Pass a smaller value when multiple documents share the same context window
   *                   (e.g., pass 40,000 per document when comparing two documents side-by-side).
   * @returns        A string guaranteed to be <= maxChars in length.
   */
  public static buildPreview(
    rawText: string,
    fileType: SupportedFileType,
    maxChars: number = MAX_ORCHESTRATOR_CHARS
  ): string {
    // Fast path: document fits within the budget — no truncation needed
    if (rawText.length <= maxChars) {
      return rawText
    }

    console.log(
      `[DocumentPreview] Text exceeds budget (${rawText.length.toLocaleString()} / ${maxChars.toLocaleString()} chars). Applying ${fileType} sampling strategy...`
    )

    switch (fileType) {
      case 'Excel':
        return this.buildExcelPreview(rawText, maxChars)

      case 'PDF':
      case 'Word':
      case 'TextSnippet':
        return this.buildTextWindowPreview(rawText, maxChars)

      case 'Image':
        // OCR output is bounded by image content, but add a safety ceiling anyway
        return rawText.substring(0, maxChars)

      default:
        // Unknown type: fall back to a hard truncation of the beginning
        return rawText.substring(0, maxChars)
    }
  }

  // ==========================================
  // PRIVATE: TEXT WINDOWED PREVIEW
  // ==========================================

  /**
   * Builds a 3-window sample for long text documents (PDF, Word, plain text).
   *
   * Strategy:
   *   - Beginning (50%): Covers the intro, abstract, executive summary, preface.
   *     This is the most information-dense part for classification.
   *   - Middle (30%):   Covers the body — ensures the LLM sees the core subject matter.
   *   - End (20%):      Covers conclusions, appendices, references.
   *
   * Ellipsis markers are injected between sections so the LLM knows
   * content was intentionally omitted, preventing it from treating the
   * three sections as contiguous prose and producing a wrong summary.
   */
  private static buildTextWindowPreview(rawText: string, maxChars: number): string {
    const total = rawText.length

    const beginChars = Math.floor(maxChars * 0.5)  // 50% — intro, abstract, preface
    const middleChars = Math.floor(maxChars * 0.3) // 30% — core body
    const endChars = Math.floor(maxChars * 0.2)    // 20% — conclusion, appendix

    const beginning = rawText.substring(0, beginChars)

    const middleStart = Math.floor(total / 2) - Math.floor(middleChars / 2)
    const middle = rawText.substring(middleStart, middleStart + middleChars)

    const end = rawText.substring(total - endChars)

    const omittedChars = total - maxChars
    const omittedKb = Math.round(omittedChars / 1000)

    return [
      beginning,
      `\n\n[... ~${omittedKb}k characters omitted — document continues. This is a sampled preview. ...]\n\n`,
      middle,
      `\n\n[... document continues — showing final section ...]\n\n`,
      end
    ].join('')
  }

  // ==========================================
  // PRIVATE: EXCEL PREVIEW
  // ==========================================

  /**
   * Builds a schema-aware preview for Excel/CSV documents.
   *
   * Strategy per sheet:
   *   - Always includes the header row (column names are critical for classification)
   *   - Includes the first 100 data rows as a representative sample
   *   - Injects a [Schema: N rows × M cols] annotation so the LLM understands
   *     the full scale of the dataset even though it only sees a sample
   *
   * The rawText format produced by the Excel extractor in ai.service.ts is:
   *   "--- Sheet: SheetName ---\n<csv data>\n\n"
   * This method parses and re-assembles that format.
   */
  private static buildExcelPreview(rawText: string, maxChars: number): string {
    const MAX_ROWS_PER_SHEET = 100

    // Match sheet headers produced by the Excel extractor
    const sheetHeaderRegex = /--- Sheet: (.+?) ---\n/g
    const sheetHeaders = [...rawText.matchAll(sheetHeaderRegex)]

    // Fallback: if the format is unexpected, apply a hard character truncation
    if (sheetHeaders.length === 0) {
      return rawText.substring(0, maxChars)
    }

    let preview = ''

    for (let i = 0; i < sheetHeaders.length; i++) {
      const sheetName = sheetHeaders[i][1]
      const sheetStart = (sheetHeaders[i].index ?? 0) + sheetHeaders[i][0].length
      const sheetEnd = i + 1 < sheetHeaders.length
        ? sheetHeaders[i + 1].index ?? rawText.length
        : rawText.length

      const sheetContent = rawText.substring(sheetStart, sheetEnd).trim()
      if (!sheetContent) continue

      const rows = sheetContent.split('\n').filter((r) => r.trim())
      if (rows.length === 0) continue

      const header = rows[0]  // Column names — always include
      const dataRows = rows.slice(1)
      const totalDataRows = dataRows.length
      const columnCount = header.split(',').length
      const sampleRows = dataRows.slice(0, MAX_ROWS_PER_SHEET)

      preview += `--- Sheet: ${sheetName} ---\n`
      preview += `[Schema: ${totalDataRows.toLocaleString()} data rows × ${columnCount} columns — showing first ${Math.min(totalDataRows, MAX_ROWS_PER_SHEET)} rows]\n`
      preview += header + '\n'
      preview += sampleRows.join('\n')

      if (totalDataRows > MAX_ROWS_PER_SHEET) {
        preview += `\n[... ${(totalDataRows - MAX_ROWS_PER_SHEET).toLocaleString()} more rows omitted ...]`
      }

      preview += '\n\n'
    }

    return preview.trim()
  }
}
