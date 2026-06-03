import mongoose, { Document, Schema } from 'mongoose'

export interface IPaymentRequest extends Document {
  userId: mongoose.Types.ObjectId | string
  username: string
  email: string
  avatar?: string
  planId: 'sandbox' | 'startup' | 'growth' | 'embed'
  billingCycle: 'monthly' | 'annual'
  amount: number
  senderName: string
  phoneNumber: string
  screenshotUrl: string
  screenshotPublicId?: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: Date
  updatedAt: Date
  reviewedAt?: Date
  reviewedBy?: mongoose.Types.ObjectId | string
  notes?: string
}

const paymentRequestSchema = new Schema<IPaymentRequest>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    username: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    avatar: { type: String, required: false },
    planId: {
      type: String,
      enum: ['sandbox', 'startup', 'growth', 'embed'],
      required: true
    },
    billingCycle: {
      type: String,
      enum: ['monthly', 'annual'],
      required: true
    },
    amount: { type: Number, required: true },
    senderName: { type: String, required: true, trim: true },
    phoneNumber: { type: String, required: true, trim: true },
    screenshotUrl: { type: String, required: true },
    screenshotPublicId: { type: String, required: false },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    reviewedAt: { type: Date, required: false },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', required: false },
    notes: { type: String, required: false }
  },
  {
    timestamps: true
  }
)

export const PaymentRequest = mongoose.model<IPaymentRequest>('PaymentRequest', paymentRequestSchema)
