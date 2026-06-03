import { protect } from '../auth.middleware'
import jwt from 'jsonwebtoken'
import { User } from '../../../features/users/user.model'
import mongoose from 'mongoose'

jest.mock('jsonwebtoken')
jest.mock('../../../features/users/user.model', () => ({
  User: {
    findById: jest.fn()
  }
}))

describe('Auth Middleware', () => {
  let req: any
  let res: any
  let next: any

  beforeEach(() => {
    jest.clearAllMocks()
    process.env.JWT_SECRET = 'secret'
    req = { headers: {} }
    res = {}
    next = jest.fn()
  })

  describe('protect()', () => {
    it('returns 401 if no authorization header', async () => {
      await protect(req, res, next)
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401, message: expect.stringContaining('not logged in') }))
    })

    it('returns 401 if authorization header is not Bearer', async () => {
      req.headers.authorization = 'Basic abc'
      await protect(req, res, next)
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }))
    })

    it('returns 401 if token is invalid', async () => {
      req.headers.authorization = 'Bearer invalidtoken'
      ;(jwt.verify as jest.Mock).mockImplementation(() => { throw new Error('invalid') })
      
      await protect(req, res, next)
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401, message: expect.stringContaining('Invalid or expired') }))
    })

    it('returns 401 if token payload has invalid ObjectId', async () => {
      req.headers.authorization = 'Bearer validtoken'
      ;(jwt.verify as jest.Mock).mockReturnValue({ id: 'not-an-object-id' })
      
      await protect(req, res, next)
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401, message: expect.stringContaining('Invalid token payload') }))
    })

    it('returns 401 if user no longer exists', async () => {
      req.headers.authorization = 'Bearer validtoken'
      const validId = new mongoose.Types.ObjectId().toString()
      ;(jwt.verify as jest.Mock).mockReturnValue({ id: validId })
      ;(User.findById as jest.Mock).mockResolvedValue(null)
      
      await protect(req, res, next)
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401, message: expect.stringContaining('no longer exists') }))
    })

    it('returns 403 if user is suspended', async () => {
      req.headers.authorization = 'Bearer validtoken'
      const validId = new mongoose.Types.ObjectId().toString()
      ;(jwt.verify as jest.Mock).mockReturnValue({ id: validId })
      ;(User.findById as jest.Mock).mockResolvedValue({ _id: validId, isSuspended: true })
      
      await protect(req, res, next)
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, message: expect.stringContaining('suspended') }))
    })

    it('calls next and attaches user to req if valid', async () => {
      req.headers.authorization = 'Bearer validtoken'
      const validId = new mongoose.Types.ObjectId().toString()
      ;(jwt.verify as jest.Mock).mockReturnValue({ id: validId })
      const mockUser = { _id: validId, isSuspended: false }
      ;(User.findById as jest.Mock).mockResolvedValue(mockUser)
      
      await protect(req, res, next)
      expect(req.user).toBe(mockUser)
      expect(next).toHaveBeenCalledWith()
      expect(next).not.toHaveBeenCalledWith(expect.any(Error))
    })
  })
})
