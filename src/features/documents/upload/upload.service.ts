import { DocumentModel, DocumentType } from '../document.model'
import Folder, { IFolder } from '../../folders/folder.model'
import { configureCloudinary } from '../../../config/cloudinary'
import streamifier from 'streamifier'
import { AIService } from '../../ai/ai.service'
import crypto from 'crypto'

const cloudinary = configureCloudinary()

// ─── Private Helpers ──────────────────────────────────────────────────────────

const getFileTypeFromMime = (mimeType: string): DocumentType => {
  if (mimeType.includes('pdf')) return 'PDF'
  if (
    mimeType.includes('excel') ||
    mimeType.includes('spreadsheetml') ||
    mimeType.includes('csv')
  ) {
    return 'Excel'
  }
  if (mimeType.includes('word') || mimeType.includes('officedocument')) return 'Word'
  if (mimeType.includes('image')) return 'Image'
  return 'TextSnippet'
}

const getCloudinaryFolder = (docType: DocumentType): string => {
  switch (docType) {
    case 'PDF':
      return 'documents/pdf'
    case 'Image':
      return 'documents/images'
    case 'Word':
      return 'documents/word'
    case 'Excel':
      return 'documents/excel'
    default:
      return 'documents/other'
  }
}

const uploadBufferToCloudinary = (
  buffer: Buffer,
  folder: string,
  originalName: string,
  mimeType: string
): Promise<{ secure_url: string; public_id: string }> => {
  return new Promise((resolve, reject) => {
    const isRaw =
      mimeType.includes('word') ||
      mimeType.includes('officedocument') ||
      mimeType.includes('octet-stream')

    const resourceType: 'raw' | 'image' | 'video' | 'auto' = isRaw ? 'raw' : 'auto'
    const publicId = `${Date.now()}-${originalName}`

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: resourceType,
        use_filename: false,
        unique_filename: false
      },
      (error, result) => {
        if (error || !result) return reject(error ?? new Error('Cloudinary upload failed'))
        resolve({ secure_url: result.secure_url, public_id: result.public_id })
      }
    )
    streamifier.createReadStream(buffer).pipe(uploadStream)
  })
}

const splitExtension = (filename: string): [string, string] => {
  const dotIdx = filename.lastIndexOf('.')
  if (dotIdx <= 0) return [filename, '']
  return [filename.slice(0, dotIdx), filename.slice(dotIdx)]
}

const loadFolderTitles = async (
  userId: any,
  folderId: any,
  cache: Map<string, Set<string>>
): Promise<Set<string>> => {
  const folderKey = folderId ? String(folderId) : 'root'
  if (cache.has(folderKey)) return cache.get(folderKey)!

  const existing = await DocumentModel.find({ user: userId, folder: folderId }).select('title')
  const titles = new Set<string>(existing.map((d: any) => d.title.toLowerCase()))
  cache.set(folderKey, titles)
  return titles
}

const resolveUniqueTitle = (filename: string, takenTitles: Set<string>): string => {
  if (!takenTitles.has(filename.toLowerCase())) return filename

  const [base, ext] = splitExtension(filename)
  const baseMatch = base.match(/^(.*?)\((\d+)\)$/)
  const cleanBase = baseMatch ? baseMatch[1] : base

  let index = 1
  let candidate = `${cleanBase}(${index})${ext}`
  while (takenTitles.has(candidate.toLowerCase())) {
    index++
    candidate = `${cleanBase}(${index})${ext}`
  }
  return candidate
}

// ─── Public Service Methods ───────────────────────────────────────────────────

export interface TextSnippetInput {
  title?: string
  extractedText: string
  tags?: string
}

export interface PhysicalUploadResult {
  createdDocs: any[]
  skippedFiles: string[]
}

export class UploadService {
  /**
   * Flow A — creates a plain text snippet document and places it
   * in the pinned "Random files" folder (auto-created if missing).
   */
  static async uploadTextSnippet(userId: any, input: TextSnippetInput) {
    const { title, extractedText, tags } = input

    // Resolve "Random files" folder — create and pin it if it doesn't yet exist
    let randomFilesFolder = await Folder.findOne({
      name: 'Random files',
      user: userId,
      parentFolder: null
    })

    if (!randomFilesFolder) {
      randomFilesFolder = await Folder.create({
        name: 'Random files',
        user: userId,
        parentFolder: null,
        path: 'Random files',
        isPinned: true
      })
    } else if (!randomFilesFolder.isPinned) {
      await Folder.findByIdAndUpdate(randomFilesFolder._id, { isPinned: true })
    }

    const snippet = await DocumentModel.create({
      user: userId,
      title: title || `Snippet: ${extractedText.substring(0, 20)}...`,
      fileType: 'TextSnippet',
      aiStatus: 'Pending',
      cognitiveLoad: 'Light',
      extractedText,
      tags: tags ? JSON.parse(tags) : [],
      originalClientPath: 'Random files',
      semanticPath: '/',
      folder: randomFilesFolder._id,
      fileSize: 0
    })

    // Bump the folder's updatedAt so it sorts correctly in the library
    await Folder.findByIdAndUpdate(randomFilesFolder._id, { updatedAt: new Date() })

    // ── Fire-and-forget AI enrichment ─────────────────────────────────────
    AIService.processPendingDocuments([snippet._id.toString()]).catch((err) => {
      console.error('[UploadService] Background AI processing failed for TextSnippet:', err)
    })

    return snippet
  }

  /**
   * Flow B — batch-uploads physical files (PDF, Word, Image) to Cloudinary,
   * resolves/creates the folder tree, deduplicates by SHA-256 hash, and
   * triggers background AI processing for every newly created document.
   */
  static async uploadPhysicalFiles(
    userId: any,
    files: Express.Multer.File[],
    tags: string | undefined,
    clientPaths: string[]
  ): Promise<PhysicalUploadResult> {
    const folderCache = new Map<string, any>()
    const dbTitleCache = new Map<string, Set<string>>()
    const batchTitleCache = new Map<string, Set<string>>()
    const docsToInsert: any[] = []
    const skippedFiles: string[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      //Fixed for mobile devices file name issues
      let originalName = Buffer.from(file.originalname, 'latin1').toString('utf8')
      try {
        originalName = decodeURIComponent(originalName)
      } catch (e) {
        // Fallback to original if decoding fails
      }

      // ── SHA-256 deduplication ─────────────────────────────────────────────
      const fileHash = crypto.createHash('sha256').update(file.buffer).digest('hex')
      const isDuplicate = await DocumentModel.exists({ user: userId, fileHash })

      if (isDuplicate) {
        console.log(`[Upload] Skipped duplicate file: ${originalName}`)
        skippedFiles.push(originalName)
        continue
      }

      // ── Cognitive load estimation ─────────────────────────────────────────
      const fileSizeMB = file.size / (1024 * 1024)
      let load: 'Light' | 'Medium' | 'Heavy' = 'Medium'
      if (fileSizeMB < 2) load = 'Light'
      if (fileSizeMB > 5) load = 'Heavy'

      const inferredType = getFileTypeFromMime(file.mimetype)
      const originalPath = clientPaths[i] || `/${originalName}`

      // ── Upload to Cloudinary ──────────────────────────────────────────────
      const cloudinaryFolder = getCloudinaryFolder(inferredType)
      const { secure_url, public_id } = await uploadBufferToCloudinary(
        file.buffer,
        cloudinaryFolder,
        originalName,
        file.mimetype
      )

      // ── Resolve / create folder tree ──────────────────────────────────────
      const pathParts = originalPath.split('/').filter((p) => p.trim() !== '' && p !== '.')

      if (pathParts.length > 0) {
        const lastPart = pathParts[pathParts.length - 1]
        if (lastPart === originalName || lastPart === file.originalname || lastPart.includes('.')) {
          pathParts.pop()
        }
      }

      if (pathParts.length === 0) pathParts.push('Random files')

      let currentParentId: any = null
      let accumulatedPath = ''

      const folderPathKey = pathParts.join('/')
      if (folderCache.has(folderPathKey)) {
        currentParentId = folderCache.get(folderPathKey)
      } else {
        for (const part of pathParts) {
          accumulatedPath = accumulatedPath ? `${accumulatedPath}/${part}` : part

          let folder: IFolder | null = await Folder.findOne({
            name: part,
            user: userId,
            parentFolder: currentParentId
          })

          if (!folder) {
            folder = await Folder.create({
              name: part,
              user: userId,
              parentFolder: currentParentId,
              path: accumulatedPath,
              isPinned: part === 'Random files'
            })
          } else if (part === 'Random files' && !folder.isPinned) {
            await Folder.findByIdAndUpdate(folder._id, { isPinned: true })
          }

          currentParentId = folder._id
        }
        folderCache.set(folderPathKey, currentParentId)
      }

      // ── Windows-style duplicate title resolution ──────────────────────────
      const folderKey = currentParentId ? String(currentParentId) : 'root'
      const dbTitles = await loadFolderTitles(userId, currentParentId, dbTitleCache)
      const batchTitles = batchTitleCache.get(folderKey) ?? new Set<string>()
      const allTaken = new Set<string>([...dbTitles, ...batchTitles])

      const uniqueTitle = resolveUniqueTitle(originalName, allTaken)
      batchTitles.add(uniqueTitle.toLowerCase())
      batchTitleCache.set(folderKey, batchTitles)

      docsToInsert.push({
        user: userId,
        title: uniqueTitle,
        fileType: inferredType,
        aiStatus: 'Pending',
        cognitiveLoad: load,
        cloudinaryUrl: secure_url,
        cloudinaryPublicId: public_id,
        originalClientPath: originalPath,
        semanticPath: '/',
        folder: currentParentId,
        tags: tags ? JSON.parse(tags) : [],
        fileSize: file.size,
        fileHash
      })
    }

    // All files were duplicates — return early with empty result
    if (docsToInsert.length === 0) {
      return { createdDocs: [], skippedFiles }
    }

    const createdDocs = await DocumentModel.insertMany(docsToInsert)

    // Bump updatedAt on every affected folder
    const folderIdsToUpdate = [
      ...new Set(docsToInsert.map((d) => d.folder).filter((id) => id !== null))
    ]
    if (folderIdsToUpdate.length > 0) {
      await Folder.updateMany(
        { _id: { $in: folderIdsToUpdate } },
        { $set: { updatedAt: new Date() } }
      )
    }

    // ── Fire-and-forget AI enrichment ─────────────────────────────────────
    const docIds = createdDocs.map((doc) => doc._id.toString())
    AIService.processPendingDocuments(docIds).catch((err) => {
      console.error('[UploadService] Background AI processing failed:', err)
    })

    return { createdDocs: createdDocs as any[], skippedFiles }
  }
}
