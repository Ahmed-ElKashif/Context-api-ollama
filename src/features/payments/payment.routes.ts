import { Router } from 'express'
import { protect } from '../../core/middlewares/auth.middleware'
import { uploadMemory } from '../../core/middlewares/upload.middleware'
import { paymentController } from './payment.controller'

const router = Router()

// User submitting a payment screenshot upload request
router.post('/request', protect, uploadMemory.single('screenshot'), paymentController.submitRequest)

export default router
