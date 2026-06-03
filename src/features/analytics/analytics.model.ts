import mongoose, { Document, Schema } from 'mongoose'

// ─── Event Types ─────────────────────────────────────────────────────────────

export type AnalyticsEventType = 
  | 'pageview'           // Page navigation
  | 'session_start'      // New session created
  | 'session_end'        // Session ended
  | 'api_request'        // Backend API call
  | 'feature_usage'      // Feature interaction (upload, compare, AI query)
  | 'error'              // Client or server error
  | 'user_action'        // Explicit user action (login, logout, etc)

// ─── Interface ───────────────────────────────────────────────────────────────

export interface IAnalyticsEvent extends Document {
  eventType: AnalyticsEventType
  userId?: mongoose.Types.ObjectId    // null for anonymous/pre-login events
  sessionId: string                    // Client-generated session ID
  
  // Event metadata
  timestamp: Date
  route?: string                       // Frontend route or API endpoint
  method?: string                      // HTTP method for API requests
  statusCode?: number                  // Response status for API requests
  duration?: number                    // Request duration in ms
  
  // User context
  userAgent?: string
  ip?: string                          // Hashed for privacy
  country?: string                     // Derived from IP
  
  // Custom event data
  metadata?: Record<string, any>       // Flexible JSON for feature-specific data
  
  // Error tracking
  errorMessage?: string
  errorStack?: string
  
  createdAt: Date                      // Auto-managed by timestamps
  expiresAt: Date                      // TTL index target
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const analyticsEventSchema = new Schema<IAnalyticsEvent>(
  {
    eventType: {
      type: String,
      required: true,
      enum: ['pageview', 'session_start', 'session_end', 'api_request', 'feature_usage', 'error', 'user_action'],
      index: true
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      sparse: true  // Allow null for anonymous events
    },
    sessionId: {
      type: String,
      required: true,
      index: true
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    },
    route: { type: String, index: true },
    method: { type: String },
    statusCode: { type: Number },
    duration: { type: Number },
    userAgent: { type: String },
    ip: { type: String },
    country: { type: String, index: true },
    metadata: { type: Schema.Types.Mixed },
    errorMessage: { type: String },
    errorStack: { type: String },
    expiresAt: {
      type: Date,
      required: true
      // TTL index is defined separately below
    }
  },
  {
    timestamps: { createdAt: true, updatedAt: false }  // Only track creation
  }
)

// ─── TTL Index (Auto-delete after 90 days) ──────────────────────────────────

analyticsEventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

// ─── Compound Indexes for Common Queries ────────────────────────────────────

// Traffic queries: date range + event type
analyticsEventSchema.index({ timestamp: -1, eventType: 1 })

// User activity: userId + date range
analyticsEventSchema.index({ userId: 1, timestamp: -1 })

// Session analysis: sessionId + timestamp
analyticsEventSchema.index({ sessionId: 1, timestamp: 1 })

// Route performance: route + method + timestamp
analyticsEventSchema.index({ route: 1, method: 1, timestamp: -1 })

export const AnalyticsEvent = mongoose.model<IAnalyticsEvent>('AnalyticsEvent', analyticsEventSchema)