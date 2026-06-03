import mongoose, { Document, Schema } from 'mongoose'

export interface IComparisonMessage extends Document {
  user: mongoose.Types.ObjectId
  docIdA: mongoose.Types.ObjectId
  docIdB: mongoose.Types.ObjectId
  role: 'user' | 'assistant'
  content: string
  createdAt: Date
}

const comparisonMessageSchema = new Schema<IComparisonMessage>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    docIdA: { type: Schema.Types.ObjectId, ref: 'Document', required: true },
    docIdB: { type: Schema.Types.ObjectId, ref: 'Document', required: true },
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true }
  },
  { timestamps: true }
)

// 🚀 Compound index: Sorts by user, the two documents, and time.
// This guarantees blazing fast queries when loading the chat UI.
comparisonMessageSchema.index({ user: 1, docIdA: 1, docIdB: 1, createdAt: 1 })

export const ComparisonMessageModel = mongoose.model<IComparisonMessage>(
  'ComparisonMessage',
  comparisonMessageSchema
)
