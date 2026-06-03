import 'dotenv/config'
import mongoose from 'mongoose'
import { TokenBudgetModel } from './features/ai/models/token-budget.model'
import { User } from './features/users/user.model'

async function run() {
  await mongoose.connect(process.env.MONGO_URI!)
  console.log('Connected to MongoDB')
  
  while (true) {
    console.clear()
    console.log('=== DATABASE AUTO WATCHER ===')
    console.log('Last updated:', new Date().toLocaleTimeString())
    console.log('--------------------------------------------------')

    const budgets = await TokenBudgetModel.find({}).lean()
    console.log('Token Budgets in DB:')
    console.table(budgets.map((b: any) => ({
      userId: b.userId.toString(),
      date: b.date,
      tokensUsed: b.tokensUsed,
      requestCount: b.requestCount
    })))

    const users = await User.find({}).lean()
    console.log('\nUsers in DB:')
    console.table(users.map((u: any) => ({
      id: u._id.toString(),
      username: u.username,
      theme: u.theme || 'system'
    })))

    console.log('\nPress Ctrl+C to exit.')
    await new Promise(resolve => setTimeout(resolve, 2000))
  }
}

run().catch(console.error)
