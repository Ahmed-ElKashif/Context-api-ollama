export class AppError extends Error {
  public readonly statusCode: number
  public readonly isOperational: boolean

  constructor(message: string, statusCode: number) {
    super(message)
    this.statusCode = statusCode
    // isOperational means it's an expected error (e.g., User not found),
    // not a random programming bug.
    this.isOperational = true

    // Captures the stack trace to help with debugging
    Error.captureStackTrace(this, this.constructor)
  }
}
