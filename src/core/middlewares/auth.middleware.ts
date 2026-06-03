import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { User } from '../../features/users/user.model';
import { AppError } from '../errors/AppError'; 

interface JwtPayload {
  id: string;
  tokenVersion?: number;
}

export const COOKIE_NAME = process.env.NODE_ENV === 'production' ? '__Host-context_token' : 'context_token';

export const protect = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let token: string | undefined;

    // 1. Try Authorization header (for SSE endpoints and non-browser clients)
    if (req.headers.authorization?.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.query.token) {
      // 1.5 Try Query string (specifically for EventSource/SSE which cannot send headers)
      token = req.query.token as string;
    }

    // 2. Fall back to httpOnly cookie (for browser sessions)
    if (!token && req.cookies && req.cookies[COOKIE_NAME]) {
      token = req.cookies[COOKIE_NAME];
    }

    // 2. If no token is found, kick them out
    if (!token) {
      return next(new AppError('You are not logged in. Please log in to get access.', 401));
    }

    // 3. Verify the token (Is it real? Has it expired?)
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as JwtPayload;

    // 4. Guard against crafted JWT payloads with non-ObjectId id values
    if (!mongoose.isValidObjectId(decoded.id)) {
      return next(new AppError('Invalid token payload.', 401));
    }

    // 5. Check if the user belonging to this token still exists in the database
    const currentUser = await User.findById(decoded.id);
    if (!currentUser) {
      return next(new AppError('The user belonging to this token no longer exists.', 401));
    }

    // 5.5 Check token version for global logout capability
    // Existing tokens without tokenVersion default to 0, which matches existing users
    const tokenVersion = decoded.tokenVersion ?? 0;
    const userTokenVersion = currentUser.tokenVersion ?? 0;
    if (tokenVersion !== userTokenVersion) {
      return next(new AppError('Session expired. Please log in again.', 401));
    }

    // 6. Check if the user has been suspended by an admin
    if (currentUser.isSuspended) {
      return next(new AppError('Your account has been suspended. Please contact support.', 403));
    }

    // 7. SUCCESS! Attach the user object to the request.
    req.user = currentUser;
    next();
    
  } catch (error) {
    return next(new AppError('Invalid or expired token. Please log in again.', 401));
  }
};