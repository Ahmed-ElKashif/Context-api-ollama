import mongoose, { Document, Schema } from 'mongoose'

export interface IDocumentChunk extends Document {
  documentId: mongoose.Types.ObjectId // Links back to the parent PDF
  userId: mongoose.Types.ObjectId // For security (only search their own chunks)
  text: string // The actual paragraph of text
  embedding: number[] // The 1536-dimensional vector for THIS paragraph
  chunkIndex: number // Order of the text (e.g., Chunk 1, Chunk 2)
}

const chunkSchema = new Schema<IDocumentChunk>({
  documentId: { type: Schema.Types.ObjectId, ref: 'Document', required: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true },
  embedding: { type: [Number], required: true, select: false }, // Hide from frontend
  chunkIndex: { type: Number, required: true }
})

// Performance index for rapid cleanup and security filtering
chunkSchema.index({ documentId: 1 })
chunkSchema.index({ userId: 1 })

export const ChunkModel = mongoose.model<IDocumentChunk>('DocumentChunk', chunkSchema)
