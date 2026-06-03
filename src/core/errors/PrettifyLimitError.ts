import { AppError } from './AppError'

export interface PrettifyLimitPayload {
  error: 'PRETTIFY_LIMIT_EXCEEDED'
  fileType: string
  limit: Record<string, number>
  actual: Record<string, number>
  message: string
  suggestion: string
}

export class PrettifyLimitError extends AppError {
  public readonly payload: PrettifyLimitPayload

  constructor(payload: Omit<PrettifyLimitPayload, 'error'>) {
    // Pass a fallback message to the parent AppError, with status code 422
    super(payload.message, 422)
    this.payload = {
      ...payload,
      error: 'PRETTIFY_LIMIT_EXCEEDED'
    }

    // Ensures stack trace accurately points to where the error was thrown
    Error.captureStackTrace(this, this.constructor)
  }
}
