import { requireAdmin } from '../requireAdmin.middleware'

describe('Require Admin Middleware', () => {
  let req: any
  let res: any
  let next: any

  beforeEach(() => {
    req = { user: {} }
    res = {}
    next = jest.fn()
  })

  it('returns 403 if req.user is undefined', () => {
    req.user = undefined
    requireAdmin(req, res, next)
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, message: expect.stringContaining('permission') }))
  })

  it('returns 403 if user role is not admin', () => {
    req.user.role = 'user'
    requireAdmin(req, res, next)
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }))
  })

  it('calls next if user role is admin', () => {
    req.user.role = 'admin'
    requireAdmin(req, res, next)
    expect(next).toHaveBeenCalledWith()
    expect(next).not.toHaveBeenCalledWith(expect.any(Error))
  })
})
