import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { User, IUser } from '../users/user.model'
import crypto from 'crypto'
import { sendResetPasswordEmail } from '../../core/services/mail.service'

export class AuthService {
  // Generate a JWT containing the user ID and their current tokenVersion
  static generateToken(id: string, tokenVersion: number): string {
    return jwt.sign({ id, tokenVersion }, process.env.JWT_SECRET as string, {
      expiresIn: (process.env.JWT_EXPIRES_IN || '30d') as any
    })
  }

  static async registerUser(
    data: Partial<IUser>
  ): Promise<{ user?: IUser; token?: string; error?: { message: string; statusCode: number } }> {
    const { fullName, username, email, passwordHash, persona } = data

    const userExists = await User.findOne({ $or: [{ email }, { username }] })

    if (userExists) {
      if (userExists.email === email)
        return { error: { message: 'User with this email already exists', statusCode: 400 } }
      if (userExists.username === username)
        return { error: { message: 'This username is already taken', statusCode: 400 } }
    }

    const salt = await bcrypt.genSalt(10)
    const hashedPwd = await bcrypt.hash(passwordHash as string, salt)

    const user = await User.create({
      fullName,
      username,
      email,
      passwordHash: hashedPwd,
      persona
    })

    const token = this.generateToken(user.id, user.tokenVersion || 0)
    return { user, token }
  }

  static async loginUser(
    email: string,
    passwordStr: string
  ): Promise<{ user?: IUser; token?: string; error?: { message: string; statusCode: number } }> {
    const user = await User.findOne({ email })
    if (!user) return { error: { message: 'Invalid email or password', statusCode: 401 } }

    const isMatch = await bcrypt.compare(passwordStr, user.passwordHash)
    if (!isMatch) return { error: { message: 'Invalid email or password', statusCode: 401 } }

    const token = this.generateToken(user.id, user.tokenVersion || 0)
    return { user, token }
  }

  static async forgotPassword(email: string): Promise<{ success: boolean; error?: { message: string; statusCode: number } }> {
    const user = await User.findOne({ email })
    if (!user) {
      // Return success regardless — prevents email enumeration attacks
      return { success: true }
    }

    // Generate a random raw token to send in the email link
    const rawToken = crypto.randomBytes(32).toString('hex')

    // Store only the SHA-256 hash — if the DB is breached the raw token is still safe
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex')
    user.resetPasswordToken = hashedToken
    user.resetPasswordExpires = new Date(Date.now() + 3600000) // 1 hour
    await user.save()

    try {
      // Send the RAW token in the email — the user pastes this into the reset form
      await sendResetPasswordEmail(user.email, rawToken)
      return { success: true }
    } catch (err) {
      console.error('[AuthService] Failed to send password reset email:', err)
      user.resetPasswordToken = undefined
      user.resetPasswordExpires = undefined
      await user.save()
      return { success: false, error: { message: 'Failed to send password reset email', statusCode: 500 } }
    }
  }

  static async resetPassword(token: string, passwordStr: string): Promise<{ success: boolean; error?: { message: string; statusCode: number } }> {
    // Hash the incoming raw token before comparing — DB only stores hashes
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex')

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() }
    })

    if (!user) {
      return { success: false, error: { message: 'Invalid or expired token', statusCode: 400 } }
    }

    const salt = await bcrypt.genSalt(10)
    user.passwordHash = await bcrypt.hash(passwordStr, salt)

    // Clear reset fields so the token can never be reused
    user.resetPasswordToken = undefined
    user.resetPasswordExpires = undefined

    // Global logout: increment tokenVersion to burn all existing JWTs for this user
    user.tokenVersion = (user.tokenVersion || 0) + 1

    await user.save()

    return { success: true }
  }
}
