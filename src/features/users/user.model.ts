import mongoose, { Document, Schema } from 'mongoose'
import { IDocument } from '../documents/document.model'

export interface IUser extends Document {
  fullName: string
  username: string
  email: string
  passwordHash: string
  role: 'user' | 'admin'          // ← added
  persona: 'general' | 'professional' | 'student' | 'developer'
  avatar?: string
  avatarPublicId?: string
  resetPasswordToken?: string
  resetPasswordExpires?: Date
  isSuspended?: boolean            // ← added (needed by admin suspend endpoint)
  tokenVersion: number             // ← added for global token revocation
  hasCompletedTour?: boolean
  hasCompletedPopulatedTour?: boolean
  hasCompletedLibraryTour?: boolean
  hasCompletedComparisonTour?: boolean
  theme?: 'light' | 'dark' | 'system'
  notificationsEnabled?: boolean
  language?: string
  lastActiveDocumentId?: mongoose.Types.ObjectId | string
  lastActiveComparisonId?: mongoose.Types.ObjectId | string
  files?: IDocument[]
  planId?: 'sandbox' | 'startup' | 'growth' | 'embed'
  billingCycle?: 'monthly' | 'annual'
  createdAt: Date
  updatedAt: Date
}

const userSchema = new Schema<IUser>(
  {
    fullName: { type: String, required: true, trim: true },
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user'              // every new user is 'user' by default
    },
    persona: {
      type: String,
      required: true,
      enum: ['general', 'professional', 'student', 'developer'],
      default: 'general'
    },
    tokenVersion: { type: Number, default: 0 },
    avatar: { type: String, required: false },
    avatarPublicId: { type: String, required: false },
    isSuspended: { type: Boolean, default: false },
    planId: {
      type: String,
      enum: ['sandbox', 'startup', 'growth', 'embed'],
      default: 'sandbox'
    },
    billingCycle: {
      type: String,
      enum: ['monthly', 'annual'],
      default: 'monthly'
    },
    hasCompletedTour: { type: Boolean, default: false },
    hasCompletedPopulatedTour: { type: Boolean, default: false },
    hasCompletedLibraryTour: { type: Boolean, default: false },
    hasCompletedComparisonTour: { type: Boolean, default: false },
    theme: {
      type: String,
      enum: ['light', 'dark', 'system'],
      default: 'system'
    },
    notificationsEnabled: {
      type: Boolean,
      default: true
    },
    language: {
      type: String,
      default: 'en'
    },
    lastActiveDocumentId: { type: Schema.Types.Mixed, required: false }, // Can be ObjectId or string (for legacy data)
    lastActiveComparisonId: { type: Schema.Types.ObjectId, ref: 'ComparisonRecord', required: false },
    resetPasswordToken: { type: String, required: false },
    resetPasswordExpires: { type: Date, required: false },
  },
  {
    timestamps: true
  }
)

userSchema.virtual('files', {
  ref: 'Document',
  localField: '_id',
  foreignField: 'user'
})

userSchema.set('toJSON', { virtuals: true })
userSchema.set('toObject', { virtuals: true })

export const User = mongoose.model<IUser>('User', userSchema)