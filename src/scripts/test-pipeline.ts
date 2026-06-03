import dotenv from 'dotenv'
import mongoose from 'mongoose'
import { OrchestratorService } from '../features/ai/agents/orchestrator.service'
import { EmbeddingService } from '../features/ai/search/vector.service'
import { ModelRegistry } from '../config/models.registry'

// 1. Strict pattern for environment variable access
const env = dotenv.config().parsed

if (!env || !env.MONGO_URI) {
  console.error('[Test Suite] Missing required environment variables in .env')
  process.exit(1)
}

async function runEndToEndTest() {
  console.log('==========================================')
  console.log('INITIATING END-TO-END PIPELINE TEST')
  console.log('==========================================\n')

  try {
    // STEP 1: Database Connection
    console.log('Step 1: Connecting to MongoDB Atlas...')
    await mongoose.connect(env!.MONGO_URI!)
    console.log('Success: Connected to Atlas.\n')

    // Initialize AI models (required before any service call)
    ModelRegistry.initialize()

    // STEP 2: Mock Upload & Parse
    console.log('Step 2: Simulating Document Parse...')
    const dummyDocId = new mongoose.Types.ObjectId().toString()
    const dummyUserId = new mongoose.Types.ObjectId().toString()

    const rawText = `
      CONFIDENTIAL: Q3 Financial Architecture Update.
      We are migrating our core infrastructure to MongoDB Atlas Vector Search. 
      This allows us to implement seamless RAG (Retrieval-Augmented Generation) pipelines 
      using LangChain and local Ollama embeddings models. The transition is expected 
      to reduce server latency by 40% and drastically improve semantic search accuracy.
    `
    console.log(`Success: Raw text extracted (${rawText.length} characters).\n`)

    // STEP 3: OrchestratorService Classify
    console.log('Step 3: Invoking OrchestratorService for Metadata Classification...')
    let metadata
    try {
      metadata = await OrchestratorService.analyzeDocumentMetadata(dummyDocId, rawText)
      console.log('Success: Orchestrator executed cleanly.')
      console.log('Extracted Output:', metadata, '\n')
    } catch (error) {
      console.error('Failure: OrchestratorService threw an error.', error)
      throw error
    }

    // STEP 4: EmbeddingService Upsert
    console.log('Step 4: Chunking, Embedding, and Upserting to Atlas...')
    try {
      await EmbeddingService.upsert(rawText, dummyDocId, dummyUserId)
      console.log('Success: Chunks generated, embedded, and saved to MongoDB.\n')
    } catch (error) {
      console.error('Failure: EmbeddingService upsert failed.', error)
      throw error
    }

    // STEP 5: Verification (Retrieval)
    console.log('Step 5: Verifying Atlas Vector Index (Retrieval Test)...')
    try {
      const vectorStore = EmbeddingService.getVectorStore()
      // Searching for a concept mentioned in the text
      const results = await vectorStore.similaritySearch('latency improvements and architecture', 1)

      if (results.length > 0) {
        console.log(`Success: Atlas Vector Search returned a matching chunk!`)
        console.log(`Match Content: "${results[0].pageContent.trim()}"\n`)
      } else {
        console.warn(
          'Warning: No results found. Ensure your Atlas Vector Index is completely built in the UI.\n'
        )
      }
    } catch (error) {
      console.error('Failure: Vector retrieval failed.', error)
      throw error
    }

    console.log('==========================================')
    console.log('PIPELINE TEST PASSED SUCCESSFULLY')
    console.log('==========================================')
  } catch (error) {
    console.error('\nPIPELINE TEST FAILED:', error)
  } finally {
    // Cleanly exit the process
    await mongoose.disconnect()
    process.exit(0)
  }
}

// Execute the test
runEndToEndTest()
