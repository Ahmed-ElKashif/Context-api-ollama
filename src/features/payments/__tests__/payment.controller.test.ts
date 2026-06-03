import { paymentController } from '../payment.controller'
import { User } from '../../users/user.model'
import { PaymentRequest } from '../payment.model'
import { configureCloudinary } from '../../../config/cloudinary'

jest.mock('../../users/user.model', () => ({
  User: {
    findById: jest.fn()
  }
}))

jest.mock('../payment.model', () => ({
  PaymentRequest: {
    create: jest.fn(),
    countDocuments: jest.fn(),
    find: jest.fn(),
    findById: jest.fn()
  }
}))

jest.mock('../../../config/cloudinary', () => ({
  configureCloudinary: jest.fn()
}))

describe('PaymentController', () => {
  let req: any
  let res: any
  let next: any

  beforeEach(() => {
    jest.clearAllMocks()
    
    req = {
      user: { _id: 'u1' },
      body: {},
      query: {},
      params: {},
      file: undefined
    }
    
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    }
    
    next = jest.fn()
  })

  describe('submitRequest()', () => {
    it('returns 401 if user not authenticated', async () => {
      req.user = undefined
      await paymentController.submitRequest(req, res, next)
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }))
    })

    it('returns 404 if user not found', async () => {
      ;(User.findById as jest.Mock).mockResolvedValue(null)
      await paymentController.submitRequest(req, res, next)
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }))
    })

    it('returns 400 if required fields are missing', async () => {
      ;(User.findById as jest.Mock).mockResolvedValue({ _id: 'u1' })
      req.body = { planId: 'premium' } // Missing other fields
      await paymentController.submitRequest(req, res, next)
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400, message: expect.stringContaining('All fields') }))
    })

    it('returns 400 if screenshot is missing', async () => {
      ;(User.findById as jest.Mock).mockResolvedValue({ _id: 'u1' })
      req.body = { planId: 'premium', billingCycle: 'monthly', amount: 10, senderName: 'John', phoneNumber: '123' }
      // req.file is undefined
      await paymentController.submitRequest(req, res, next)
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400, message: expect.stringContaining('Payment screenshot is required') }))
    })

    it('uploads to Cloudinary and creates payment request', async () => {
      ;(User.findById as jest.Mock).mockResolvedValue({ _id: 'u1', username: 'john', email: 'john@test.com', avatar: 'av1' })
      req.body = { planId: 'premium', billingCycle: 'monthly', amount: '10', senderName: 'John', phoneNumber: '123' }
      req.file = { buffer: Buffer.from('test'), mimetype: 'image/png' }

      const mockUploader = { upload: jest.fn().mockResolvedValue({ secure_url: 'http://url', public_id: 'pub1' }) }
      ;(configureCloudinary as jest.Mock).mockReturnValue({ uploader: mockUploader })

      ;(PaymentRequest.create as jest.Mock).mockResolvedValue({ _id: 'pr1', status: 'pending' })

      await paymentController.submitRequest(req, res, next)

      expect(mockUploader.upload).toHaveBeenCalled()
      expect(PaymentRequest.create).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'u1',
        amount: 10,
        screenshotUrl: 'http://url'
      }))
      expect(res.status).toHaveBeenCalledWith(201)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: { _id: 'pr1', status: 'pending' } }))
    })
  })

  describe('getRequests()', () => {
    it('returns paginated requests and tab counts', async () => {
      req.query = { page: '1', limit: '10', status: 'pending' }

      const mockFind = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([{ _id: 'pr1' }])
      }
      ;(PaymentRequest.find as jest.Mock).mockReturnValue(mockFind)
      
      // Mocks for total, all, pending, approved, rejected
      ;(PaymentRequest.countDocuments as jest.Mock)
        .mockResolvedValueOnce(1) // total
        .mockResolvedValueOnce(10) // all
        .mockResolvedValueOnce(5) // pending
        .mockResolvedValueOnce(3) // approved
        .mockResolvedValueOnce(2) // rejected

      await paymentController.getRequests(req, res, next)

      expect(PaymentRequest.find).toHaveBeenCalledWith({ status: 'pending' })
      expect(res.status).toHaveBeenCalledWith(200)
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          requests: [{ _id: 'pr1' }],
          counts: { all: 10, pending: 5, approved: 3, rejected: 2 }
        })
      }))
    })
  })

  describe('updateStatus()', () => {
    it('returns 400 if invalid status', async () => {
      req.params = { id: 'pr1' }
      req.body = { status: 'invalid' }
      await paymentController.updateStatus(req, res, next)
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }))
    })

    it('returns 404 if payment request not found', async () => {
      req.params = { id: 'pr1' }
      req.body = { status: 'approved' }
      ;(PaymentRequest.findById as jest.Mock).mockResolvedValue(null)
      
      await paymentController.updateStatus(req, res, next)
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }))
    })

    it('returns 400 if already reviewed', async () => {
      req.params = { id: 'pr1' }
      req.body = { status: 'approved' }
      ;(PaymentRequest.findById as jest.Mock).mockResolvedValue({ status: 'approved' })
      
      await paymentController.updateStatus(req, res, next)
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400, message: expect.stringContaining('already been reviewed') }))
    })

    it('updates status and modifies user on approval', async () => {
      req.params = { id: 'pr1' }
      req.body = { status: 'approved' }
      
      const mockPaymentReq = {
        userId: 'u1', planId: 'pro', billingCycle: 'yearly', status: 'pending', save: jest.fn()
      }
      ;(PaymentRequest.findById as jest.Mock).mockResolvedValue(mockPaymentReq)
      
      const mockUser = { planId: 'free', billingCycle: 'monthly', save: jest.fn() }
      ;(User.findById as jest.Mock).mockResolvedValue(mockUser)
      
      await paymentController.updateStatus(req, res, next)

      expect(mockPaymentReq.status).toBe('approved')
      expect(mockPaymentReq.save).toHaveBeenCalled()

      expect(mockUser.planId).toBe('pro')
      expect(mockUser.billingCycle).toBe('yearly')
      expect(mockUser.save).toHaveBeenCalled()

      expect(res.status).toHaveBeenCalledWith(200)
    })

    it('updates status but does not modify user on rejection', async () => {
      req.params = { id: 'pr1' }
      req.body = { status: 'rejected' }
      
      const mockPaymentReq = {
        userId: 'u1', planId: 'pro', billingCycle: 'yearly', status: 'pending', save: jest.fn()
      }
      ;(PaymentRequest.findById as jest.Mock).mockResolvedValue(mockPaymentReq)
      
      const mockUser = { planId: 'free', billingCycle: 'monthly', save: jest.fn() }
      ;(User.findById as jest.Mock).mockResolvedValue(mockUser)
      
      await paymentController.updateStatus(req, res, next)

      expect(mockPaymentReq.status).toBe('rejected')
      expect(mockPaymentReq.save).toHaveBeenCalled()

      expect(mockUser.save).not.toHaveBeenCalled()
      expect(res.status).toHaveBeenCalledWith(200)
    })
  })
})
