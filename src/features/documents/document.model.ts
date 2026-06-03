import mongoose, { Document, Schema } from 'mongoose'

// 📊 NEW: Added 'Excel' to the TypeScript type
export type DocumentType = 'PDF' | 'Word' | 'Image' | 'TextSnippet' | 'Excel'
export type AIStatus = 'Pending' | 'Processing' | 'Analyzed' | 'Failed'
export type CognitiveLoad = 'Light' | 'Medium' | 'Heavy'

// 1. TYPESCRIPT INTERFACE (Pure Types Only)
export interface IDocument extends Document {
  user: mongoose.Types.ObjectId
  title: string
  fileType: DocumentType
  aiStatus: AIStatus
  cognitiveLoad: CognitiveLoad

  //  Detailed Cognitive Metrics
  cognitiveScore?: number
  cognitiveReason?: string

  summary?: string
  tags: string[]
  extractedText?: string
  fileSize?: number
  cloudinaryUrl?: string
  cloudinaryPublicId?: string
  folder: mongoose.Types.ObjectId | null
  originalClientPath?: string
  semanticPath?: string
  createdAt: Date
  updatedAt: Date

  // 🛠️ THE FIX: Use pure TypeScript types here
  contentType: string
  isOrganized: boolean
  fileHash?: string
  isUnread: boolean

  // ✨ NEW: Cache for structured document formats
  prettifiedJson?: any
}

// 2. MONGOOSE SCHEMA (Configuration Objects)
const documentSchema = new Schema<IDocument>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    fileType: {
      type: String,
      // 📊 NEW: Added 'Excel' to the allowed Mongoose enum
      enum: ['PDF', 'Word', 'Image', 'TextSnippet', 'Excel'],
      required: true
    },
    aiStatus: {
      type: String,
      enum: ['Pending', 'Processing', 'Analyzed', 'Failed'],
      default: 'Pending'
    },
    cognitiveLoad: {
      type: String,
      enum: ['Light', 'Medium', 'Heavy'],
      default: 'Light'
    },

    //  Adding the detailed metrics to the DB schema
    cognitiveScore: {
      type: Number,
      min: 1,
      max: 10,
      default: 1
    },
    cognitiveReason: { type: String },

    summary: { type: String },
    tags: { type: [String], default: [] },
    extractedText: { type: String },
    fileSize: { type: Number, default: 0 },
    cloudinaryUrl: { type: String },
    cloudinaryPublicId: { type: String },
    folder: {
      type: Schema.Types.ObjectId,
      ref: 'Folder',
      default: null
    },
    originalClientPath: { type: String, default: '/' },
    semanticPath: { type: String, default: '/' },

    // 🛠️ THE FIX: Add the new fields to the actual database schema!
    contentType: { type: String, default: 'Uncategorized' },
    isOrganized: { type: Boolean, default: false },
    fileHash: { type: String },
    isUnread: { type: Boolean, default: true },
    
    // ✨ NEW: Cache for structured document formats
    prettifiedJson: { type: Schema.Types.Mixed }
  },
  { timestamps: true }
)

// ==========================================
// ⚡ DATABASE INDEXES
// ==========================================

documentSchema.index({ user: 1, folder: 1 })

// 🛠️ NEW: Makes your SHA-256 deduplication check instant (O(1) time complexity)
documentSchema.index({ user: 1, fileHash: 1 })

documentSchema.index(
  {
    title: 'text',
    tags: 'text',
    summary: 'text',
    extractedText: 'text'
  },
  {
    weights: { title: 10, tags: 5, summary: 2, extractedText: 1 },
    name: 'DocumentTextIndex'
  }
)

export const DocumentModel = mongoose.model<IDocument>('Document', documentSchema)
