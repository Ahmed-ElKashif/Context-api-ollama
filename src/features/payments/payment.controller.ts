import { Request, Response, NextFunction } from 'express'
import { PaymentRequest } from './payment.model'
import { User } from '../users/user.model'
import { AppError } from '../../core/errors/AppError'
import { configureCloudinary } from '../../config/cloudinary'

export const paymentController = {
  /**
   * Submit a new payment request with screenshot upload.
   * POST /api/payments/request
   */
  async submitRequest(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?._id?.toString() || (req as any).user?.id
      if (!userId) return next(new AppError('Unauthorized', 401))

      const user = await User.findById(userId)
      if (!user) return next(new AppError('User not found', 404))

      const { planId, billingCycle, amount, senderName, phoneNumber } = req.body || {}

      if (!planId || !billingCycle || !amount || !senderName || !phoneNumber) {
        return next(new AppError('All fields (planId, billingCycle, amount, senderName, phoneNumber) are required', 400))
      }

      if (!req.file || !req.file.buffer) {
        return next(new AppError('Payment screenshot is required', 400))
      }

      // Upload to Cloudinary using base64 data URI (similar to avatar uploads)
      const cloudinary = configureCloudinary()
      const dataUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`
      
      const uploadResult: any = await cloudinary.uploader.upload(dataUri, {
        folder: 'payments/screenshots',
        resource_type: 'image'
      })

      const newRequest = await PaymentRequest.create({
        userId,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        planId,
        billingCycle,
        amount: Number(amount),
        senderName: senderName.trim(),
        phoneNumber: phoneNumber.trim(),
        screenshotUrl: uploadResult.secure_url,
        screenshotPublicId: uploadResult.public_id,
        status: 'pending'
      })

      res.status(201).json({
        success: true,
        data: newRequest
      })
    } catch (error) {
      next(error)
    }
  },

  /**
   * Fetch payment requests for admin dashboard with filtering and pagination.
   * GET /api/admin/payments
   */
  async getRequests(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const status = req.query.status as 'pending' | 'approved' | 'rejected' | undefined
      const page = parseInt(req.query.page as string || '1', 10)
      const limit = parseInt(req.query.limit as string || '10', 10)

      const filter: any = {}
      if (status) {
        filter.status = status
      }

      const total = await PaymentRequest.countDocuments(filter)
      const requests = await PaymentRequest.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)

      // Aggregate counts for all tabs
      const allCount = await PaymentRequest.countDocuments({})
      const pendingCount = await PaymentRequest.countDocuments({ status: 'pending' })
      const approvedCount = await PaymentRequest.countDocuments({ status: 'approved' })
      const rejectedCount = await PaymentRequest.countDocuments({ status: 'rejected' })

      res.status(200).json({
        success: true,
        data: {
          requests,
          pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit)
          },
          counts: {
            all: allCount,
            pending: pendingCount,
            approved: approvedCount,
            rejected: rejectedCount
          }
        }
      })
    } catch (error) {
      next(error)
    }
  },

  /**
   * Approve or reject a payment request.
   * PATCH /api/admin/payments/:id/status
   */
  async updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const adminId = req.user?._id?.toString() || (req as any).user?.id
      if (!adminId) return next(new AppError('Unauthorized', 401))
      
      const { id } = req.params
      const { status } = req.body || {}

      if (!status || !['approved', 'rejected'].includes(status)) {
        return next(new AppError('Invalid status. Must be "approved" or "rejected"', 400))
      }

      const paymentRequest = await PaymentRequest.findById(id)
      if (!paymentRequest) {
        return next(new AppError('Payment request not found', 404))
      }

      if (paymentRequest.status !== 'pending') {
        return next(new AppError('Payment request has already been reviewed', 400))
      }

      // Update payment request
      paymentRequest.status = status
      paymentRequest.reviewedAt = new Date()
      paymentRequest.reviewedBy = adminId
      await paymentRequest.save()

      // If approved, update user's plan and cycle
      if (status === 'approved') {
        const user = await User.findById(paymentRequest.userId)
        if (user) {
          user.planId = paymentRequest.planId
          user.billingCycle = paymentRequest.billingCycle
          await user.save()
        }
      }

      res.status(200).json({
        success: true,
        data: paymentRequest
      })
    } catch (error) {
      next(error)
    }
  }
}
