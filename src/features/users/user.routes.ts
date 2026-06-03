import { Router } from 'express';
// 1. Import your existing controllers + the new getUserSettings
import { 
  getUserProfile, 
  updateUserProfile, 
  uploadUserAvatar, 
  getUserSettings 
} from './user.controller';

// 2. Import 'protect' instead of 'requireAuth'
import { protect } from '../../core/middlewares/auth.middleware';
import { uploadMemory } from '../../core/middlewares/upload.middleware';

const router = Router();

// Protect all routes below this middleware (or you can apply it to each route individually)
router.use(protect);

// Existing routes (example structure based on standard REST conventions)
router.get('/profile', getUserProfile);
router.patch('/profile', updateUserProfile);
router.post('/avatar', uploadMemory.single('avatar'), uploadUserAvatar);

// 3. Your NEW Settings Route!
router.get('/settings', getUserSettings);

export default router; 