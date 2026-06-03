import mongoose, { Document, Schema } from 'mongoose'

export interface IComparisonRecord extends Document {
  user: mongoose.Types.ObjectId
  docIdA: mongoose.Types.ObjectId
  docIdB: mongoose.Types.ObjectId
  titleA: string
  titleB: string
  customTitle?: string
  comparison: Record<string, any>  // Full DeepThinker result payload
  createdAt: Date
  updatedAt: Date
}

const comparisonRecordSchema = new Schema<IComparisonRecord>(
  {
    user:  { type: Schema.Types.ObjectId, ref: 'User',     required: true },
    docIdA: { type: Schema.Types.ObjectId, ref: 'Document', required: true },
    docIdB: { type: Schema.Types.ObjectId, ref: 'Document', required: true },
    titleA: { type: String, required: true },
    titleB: { type: String, required: true },
    customTitle: { type: String, required: false },
    comparison: { type: Schema.Types.Mixed, required: true }
  },
  { timestamps: true }
)

// Fast descending list queries per user
comparisonRecordSchema.index({ user: 1, createdAt: -1 })

export const ComparisonRecordModel = mongoose.model<IComparisonRecord>(
  'ComparisonRecord',
  comparisonRecordSchema
)
