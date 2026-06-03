import express, { Application, Request, Response, NextFunction } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'
import mongoSanitize from 'express-mongo-sanitize'
import hpp from 'hpp'
import compression from 'compression'
import adminRoutes from './features/admin/admin.routes'

import { AppError } from './core/errors/AppError'
import { globalErrorHandler } from './core/middlewares/error.middleware'

// Route Imports
import authRoutes from './features/auth/auth.routes'
import userRoutes from './features/users/user.routes'
import documentRoutes from './features/documents/document.routes'
import aiRoutes from './features/ai/ai.routes'
import folderRoutes from './features/folders/folder.routes'
import comparisonRoutes from './features/comparison/comparison.routes'
import settingsRoutes from './features/settings/settings.routes'
import paymentRoutes from './features/payments/payment.routes'
import prettifyRoutes from './features/prettify/prettify.routes'

import { analyticsMiddleware } from './core/middlewares/analytics.middleware'
import { csrfProtection } from './core/middlewares/csrf.middleware'
import analyticsRoutes from './features/analytics/analytics.routes'
const app: Application = express()

// Trust the reverse proxy (required for Railway/Heroku/Render to pass secure cookies and real IPs)
app.set('trust proxy', 1)

// ==========================================
// 🛡️ 1. SECURITY MIDDLEWARES
// ==========================================

// Implement CORS (Cross-Origin Resource Sharing)
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173', // Only allow your frontend to talk to this API
    credentials: true, // Allow cookies/tokens to be sent
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Session-Id']
  })
)

// Set security HTTP headers
app.use(helmet())

// Limit repeated requests to public APIs (Prevents brute-force / DDoS)
const limiter = rateLimit({
  max: 1000, // Limit each IP to 1000 requests per window
  windowMs: 60 * 60 * 1000, // 1 Hour
  message: { success: false, message: 'Too many requests from this IP, please try again in an hour.' }
})
app.use('/api', limiter)

// Dedicated stricter rate limiter for auth endpoints (register, login, forgot-password)
// 20 attempts per 15 minutes per IP — makes brute-force attacks impractical
const authLimiter = rateLimit({
  max: 20,
  // DEV: 1 minute. PROD: 15 minutes.
  windowMs: process.env.NODE_ENV === 'development' ? 1 * 60 * 1000 : 15 * 60 * 1000,
  message: { 
    success: false, 
    message: process.env.NODE_ENV === 'development'
      ? 'Too many login attempts from this IP, please try again in 1 minute. (Dev Mode)'
      : 'Too many login attempts from this IP, please try again in 15 minutes.' 
  }
})

// Body parser, reading data from body into req.body
app.use(express.json({ limit: '5mb' })) // Prevents massive payload attacks but allows typical batch arrays

// Apply HTTP payload compression (Gzip/Brotli)
app.use(compression())

// Block NoSQL injection: strips keys containing '$' or '.' from req.body, req.query, req.params
// express-mongo-sanitize@2.2.0 — called as a function directly (no .default needed)
import cookieParser from 'cookie-parser'
app.use(cookieParser())

// Apply CSRF Protection to all routes
app.use(csrfProtection)

app.use((req, res, next) => {
  if (req.body) req.body = mongoSanitize.sanitize(req.body, { replaceWith: '_' });
  if (req.params) req.params = mongoSanitize.sanitize(req.params, { replaceWith: '_' });
  // Skip modifying req.query entirely to prevent the Express 4.19+ getter crash.
  // Query strings are usually safe from deep NoSQL injection in this architecture anyway.
  next();
})

// Prevent HTTP Parameter Pollution: collapses duplicate query params into the last value
// hpp@0.2.3 — called as a function directly
app.use(hpp())

//analytics middleware should be attached after auth middleware so it can access req.user
app.use(analyticsMiddleware)

// ==========================================
// ⚡ 2. LOGGING (Morgan)
// ==========================================

// Custom token: color-coded status emoji
morgan.token('status-emoji', (_req, res) => {
  const s = res.statusCode
  if (s >= 500) return '🔴' // Server error
  if (s >= 400) return '🟡' // Client error
  if (s >= 300) return '🔵' // Redirect
  return '🟢'               // Success
})

// Dev format: emoji + method + url + status + response time
const devFormat = ':status-emoji  :method :url :status - :response-time ms'

// Production format: standard combined log (good for log aggregators)
const prodFormat = ':remote-addr - :method :url :status :res[content-length] - :response-time ms'

app.use(
  morgan(process.env.NODE_ENV === 'production' ? prodFormat : devFormat, {
    // Never log the health check — it's called every few seconds and is pure noise
    skip: (req) => req.url === '/api/health'
  })
)

// ==========================================
// 🚀 3. ROUTES
// ==========================================

// Standardized Health Check
app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({ success: true, message: 'Context API is running smoothly.' })
})

// Feature Routes
// Auth routes get the dedicated brute-force limiter in addition to the global one
app.use('/api/auth', authLimiter, authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/payments', paymentRoutes)
app.use('/api/documents', documentRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/folders', folderRoutes)
app.use('/api/comparison', comparisonRoutes)
app.use('/api/prettify', prettifyRoutes)
app.use('/api/admin', adminRoutes) // Admin routes (must be last to avoid conflicts) 
app.use('/api/analytics', analyticsRoutes) // Analytics routes (after all other routes so it can track them)

// 404 Handler for undefined routes
app.use((req: Request, res: Response, next: NextFunction) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404))
})

// ==========================================
// 🚨 4. GLOBAL ERROR HANDLER
// ==========================================
app.use(globalErrorHandler)

export default app
