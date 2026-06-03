import 'dotenv/config'
import app from './app'
import { connectDB } from './config/db'
import { ModelRegistry } from './config/models.registry'

// Connect to MongoDB
connectDB()

// Initialize all AI model instances (SRP: no model construction inside service methods)
ModelRegistry.initialize()

const PORT = process.env.PORT || 5000

app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`)
})

