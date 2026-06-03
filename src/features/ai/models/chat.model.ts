import mongoose, { Document, Schema } from 'mongoose'

export interface IChatMessage extends Document {
  user: mongoose.Types.ObjectId
  documentId: mongoose.Types.ObjectId
  role: 'user' | 'assistant'
  content: string
  createdAt: Date
}

const chatMessageSchema = new Schema<IChatMessage>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    documentId: { type: Schema.Types.ObjectId, ref: 'Document', required: true },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true }
  },
  { timestamps: true }
)

// Compound index: user + documentId first, then time-sorted — defense-in-depth + query perf
chatMessageSchema.index({ documentId: 1, user: 1, createdAt: 1 })

export const ChatMessageModel = mongoose.model<IChatMessage>('ChatMessage', chatMessageSchema)
