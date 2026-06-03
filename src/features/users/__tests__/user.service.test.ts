import bcrypt from 'bcryptjs'
import { UserService } from '../user.service'
import { User } from '../user.model'

// ─── Mocks ───────────────────────────────────────────────────────────────────

jest.mock('bcryptjs')
jest.mock('../user.model', () => ({
  User: {
    findById: jest.fn(),
    findOne: jest.fn()
  }
}))

beforeEach(() => {
  jest.clearAllMocks()
})

// ─────────────────────────────────────────────────────────────────────────────

describe('UserService', () => {
  describe('getProfileById()', () => {
    it('returns the user profile if found', async () => {
      const mockUser = { _id: 'u1', username: 'testuser' }
      ;(User.findById as jest.Mock).mockResolvedValueOnce(mockUser)

      const result = await UserService.getProfileById('u1')

      expect(User.findById).toHaveBeenCalledWith('u1')
      expect(result).toEqual(mockUser)
    })
  })

  describe('updateProfile()', () => {
    it('returns 404 if user not found', async () => {
      ;(User.findById as jest.Mock).mockResolvedValueOnce(null)

      const result = await UserService.updateProfile('u1', { fullName: 'New Name' })

      expect(result.error?.message).toBe('User not found')
      expect(result.error?.statusCode).toBe(404)
    })

    it('returns error if username is already taken', async () => {
      const mockUser = { _id: 'u1', username: 'olduser', save: jest.fn() }
      ;(User.findById as jest.Mock).mockResolvedValueOnce(mockUser)
      ;(User.findOne as jest.Mock).mockResolvedValueOnce({ _id: 'u2' }) // Collision

      const result = await UserService.updateProfile('u1', { username: 'takenuser' })

      expect(User.findOne).toHaveBeenCalledWith({ username: 'takenuser' })
      expect(result.error?.message).toBe('This username is already taken')
      expect(result.error?.statusCode).toBe(400)
    })

    it('returns error if email is already taken', async () => {
      const mockUser = { _id: 'u1', email: 'old@test.com', save: jest.fn() }
      ;(User.findById as jest.Mock).mockResolvedValueOnce(mockUser)
      ;(User.findOne as jest.Mock).mockResolvedValueOnce({ _id: 'u2' }) // Collision

      const result = await UserService.updateProfile('u1', { email: 'taken@test.com' })

      expect(User.findOne).toHaveBeenCalledWith({ email: 'taken@test.com' })
      expect(result.error?.message).toBe('This email is already taken')
      expect(result.error?.statusCode).toBe(400)
    })

    it('updates basic profile fields successfully', async () => {
      const mockUser = {
        _id: 'u1',
        fullName: 'Old Name',
        persona: 'Student',
        save: jest.fn().mockResolvedValue(true)
      }
      ;(User.findById as jest.Mock).mockResolvedValueOnce(mockUser)

      const result = await UserService.updateProfile('u1', { fullName: 'New Name', persona: 'developer' })

      expect(mockUser.fullName).toBe('New Name')
      expect(mockUser.persona).toBe('developer')
      expect(mockUser.save).toHaveBeenCalled()
      expect(result.user).toEqual(mockUser)
    })

    it('returns error if changing password without providing current password', async () => {
      const mockUser = { _id: 'u1', save: jest.fn() }
      ;(User.findById as jest.Mock).mockResolvedValueOnce(mockUser)

      const result = await UserService.updateProfile('u1', { password: 'newpassword' })

      expect(result.error?.message).toBe('Current master key is required to change password')
      expect(result.error?.statusCode).toBe(400)
    })

    it('returns error if current password does not match during password change', async () => {
      const mockUser = { _id: 'u1', passwordHash: 'oldhash', save: jest.fn() }
      ;(User.findById as jest.Mock).mockResolvedValueOnce(mockUser)
      ;(bcrypt.compare as jest.Mock).mockResolvedValueOnce(false)

      const result = await UserService.updateProfile('u1', {
        password: 'newpassword',
        currentPassword: 'wrongpassword'
      })

      expect(bcrypt.compare).toHaveBeenCalledWith('wrongpassword', 'oldhash')
      expect(result.error?.message).toBe('Current master key is incorrect')
      expect(result.error?.statusCode).toBe(400)
    })

    it('hashes and updates password successfully if current password is correct', async () => {
      const mockUser = { _id: 'u1', passwordHash: 'oldhash', save: jest.fn() }
      ;(User.findById as jest.Mock).mockResolvedValueOnce(mockUser)
      ;(bcrypt.compare as jest.Mock).mockResolvedValueOnce(true)
      ;(bcrypt.genSalt as jest.Mock).mockResolvedValueOnce('salt')
      ;(bcrypt.hash as jest.Mock).mockResolvedValueOnce('newhash')

      const result = await UserService.updateProfile('u1', {
        password: 'newpassword',
        currentPassword: 'correctpassword'
      })

      expect(bcrypt.compare).toHaveBeenCalledWith('correctpassword', 'oldhash')
      expect(bcrypt.genSalt).toHaveBeenCalledWith(10)
      expect(bcrypt.hash).toHaveBeenCalledWith('newpassword', 'salt')
      expect(mockUser.passwordHash).toBe('newhash')
      expect(mockUser.save).toHaveBeenCalled()
      expect(result.user).toEqual(mockUser)
    })
  })
})
