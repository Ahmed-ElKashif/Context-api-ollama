import { v2 as cloudinary } from 'cloudinary'

const clean = (value?: string): string => {
  if (!value) return ''
  return value.trim().replace(/^['\"]|['\"]$/g, '')
}

export const configureCloudinary = () => {
  const cloudName = clean(process.env.CLOUDINARY_CLOUD_NAME)
  const apiKey = clean(process.env.CLOUDINARY_API_KEY)
  const apiSecret = clean(process.env.CLOUDINARY_API_SECRET)

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      'Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in Context-api/.env'
    )
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  })

  return cloudinary
}

export default cloudinary
