import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError';

/**
 * Enterprise CSRF Protection Middleware
 * 
 * Since we use httpOnly cookies for session management, the browser attaches them automatically
 * to every request. This makes the application vulnerable to Cross-Site Request Forgery (CSRF).
 * 
 * To mitigate this, we require a custom header (X-Requested-With) on all state-changing requests.
 * Browsers enforce a CORS preflight (OPTIONS) request before sending custom headers across origins.
 * Malicious sites cannot pass this preflight, completely neutralizing CSRF attacks.
 */
export const csrfProtection = (req: Request, res: Response, next: NextFunction): void => {
  // Only apply CSRF protection to state-changing methods
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const requestedWith = req.headers['x-requested-with'];
    
    // Check if the custom header is present and matches the expected value
    if (!requestedWith || requestedWith !== 'XMLHttpRequest') {
      return next(new AppError('CSRF token missing or invalid. Requires X-Requested-With header.', 403));
    }
  }
  
  next();
};
