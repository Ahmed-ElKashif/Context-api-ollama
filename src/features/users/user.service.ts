import bcrypt from 'bcryptjs'
import { User, IUser } from './user.model'

export class UserService {
  static async getProfileById(userId: string): Promise<IUser | null> {
    return await User.findById(userId)
  }

  static async updateProfile(
    userId: string,
    updateData: {
      fullName?: string
      username?: string
      email?: string
      password?: string
      currentPassword?: string
      persona?: 'general' | 'professional' | 'student' | 'developer'
      lastActiveDocumentId?: string | null
      lastActiveComparisonId?: string | null
      hasCompletedTour?: boolean
      hasCompletedPopulatedTour?: boolean
      hasCompletedLibraryTour?: boolean
      hasCompletedComparisonTour?: boolean
    }
  ): Promise<{ user?: IUser; error?: { message: string; statusCode: number } }> {
    const user = await User.findById(userId)
    if (!user) return { error: { message: 'User not found', statusCode: 404 } }

    if (updateData.username && updateData.username !== user.username) {
      const usernameTaken = await User.findOne({ username: updateData.username })
      if (usernameTaken)
        return { error: { message: 'This username is already taken', statusCode: 400 } }
      user.username = updateData.username
    }

    if (updateData.email && updateData.email !== user.email) {
      const emailTaken = await User.findOne({ email: updateData.email })
      if (emailTaken)
        return { error: { message: 'This email is already taken', statusCode: 400 } }
      user.email = updateData.email
    }

    if (updateData.fullName) user.fullName = updateData.fullName
    if (updateData.persona) user.persona = updateData.persona

    // Persist the new cross-device state fields
    if (updateData.lastActiveDocumentId !== undefined) {
      (user as any).lastActiveDocumentId = updateData.lastActiveDocumentId
    }
    if (updateData.lastActiveComparisonId !== undefined) {
      (user as any).lastActiveComparisonId = updateData.lastActiveComparisonId
    }
    if (updateData.hasCompletedTour !== undefined) {
      (user as any).hasCompletedTour = updateData.hasCompletedTour
    }
    if (updateData.hasCompletedPopulatedTour !== undefined) {
      (user as any).hasCompletedPopulatedTour = updateData.hasCompletedPopulatedTour
    }
    if (updateData.hasCompletedLibraryTour !== undefined) {
      (user as any).hasCompletedLibraryTour = updateData.hasCompletedLibraryTour
    }
    if (updateData.hasCompletedComparisonTour !== undefined) {
      (user as any).hasCompletedComparisonTour = updateData.hasCompletedComparisonTour
    }

    if (updateData.password) {
      if (!updateData.currentPassword) {
        return { error: { message: 'Current master key is required to change password', statusCode: 400 } }
      }

      const isCurrentPasswordValid = await bcrypt.compare(updateData.currentPassword, user.passwordHash)
      if (!isCurrentPasswordValid) {
        return { error: { message: 'Current master key is incorrect', statusCode: 400 } }
      }

      const salt = await bcrypt.genSalt(10)
      user.passwordHash = await bcrypt.hash(updateData.password, salt)
    }

    await user.save()
    return { user }
  }
}
