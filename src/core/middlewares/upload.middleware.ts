import multer from 'multer'
import { AppError } from '../errors/AppError'

// Allowed MIME types — PDFs, Word Docs, Images, and Spreadsheets
const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimeTypes = [
    'application/pdf', // PDFs
    'application/msword', // Word (.doc)
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // Word (.docx)
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    //  Spreadsheet Formats
    'application/vnd.ms-excel', // Excel (.xls)
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // Excel (.xlsx)
    'text/csv' // CSVs
  ]

  // Add this line to see exactly what Postman is trying to sneak past the bouncer:
  console.log(`[Multer] Incoming file: ${file.originalname} | MimeType: ${file.mimetype}`)

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true)
  } else {
    cb(
      new AppError(
        `Rejected: "${file.originalname}" is an unsupported format (${file.mimetype || 'Unknown'}).`,
        400
      )
    )
  }
}

// Files are held in memory as a Buffer and streamed directly to Cloudinary.
// Nothing is ever written to disk.
//
// FILE SIZE LIMIT:
// The AI layer (DocumentPreviewService) caps all content at 80k chars before
// passing it to any LLM, so there is no longer an AI-driven reason to restrict
// file sizes here. The limit below is driven purely by the Cloudinary plan:
//
//   Free plan  →  10 MB  (active)
//   Paid plan  →  50 MB  (realistic ceiling across all supported types:
//                          PDF ≤ 50 MB, Excel ≤ 50 MB, Word ≤ 25 MB, Image ≤ 25 MB)
//
// To upgrade: comment out the 10 MB line and uncomment the 50 MB line.
export const uploadMemory = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024  // 10 MB  — Cloudinary free plan
    // fileSize: 50 * 1024 * 1024 // 50 MB  — uncomment when upgrading Cloudinary plan
  }
})
