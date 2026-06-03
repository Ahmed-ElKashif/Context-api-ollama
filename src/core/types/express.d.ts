import { request } from 'http'
import { IUser } from '../../features/users/user.model'

// This tells TypeScript: "Hey, take the existing Express Request interface
// and add my custom 'user' property to it."
declare global {
  namespace Express {
    interface Request {
      user?: IUser
    }
  }
}
