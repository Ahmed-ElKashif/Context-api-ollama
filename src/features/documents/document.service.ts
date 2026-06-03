import { DocumentModel, IDocument } from './document.model'
import Folder from '../folders/folder.model'
import { User } from '../users/user.model'
import { configureCloudinary } from '../../config/cloudinary'
import { EmbeddingService } from '../ai/search/vector.service'
import { AppError } from '../../core/errors/AppError'
import { ChatMessageModel } from '../ai/models/chat.model'
import { ComparisonRecordModel } from '../comparison/comparison-record.model'
import { ComparisonMessageModel } from '../comparison/comparison-chat.model'

const cloudinary = configureCloudinary()

/**
 * Cloudinary stores images and PDFs under the 'image' resource type when uploaded with 'auto'.
 * Word documents and others are stored as 'raw'.
 * We must pass the correct resource_type to `destroy()` or the deletion silently fails.
 */
const VALID_FILE_TYPES = [
  'Image',
  'PDF',
  'Word',
  'Excel',
  'TextSnippet'
] as const;
type FileType = typeof VALID_FILE_TYPES[number];

const getResourceType = (fileType: string): 'image' | 'raw' => {
  if (!VALID_FILE_TYPES.includes(fileType as FileType)) {
    console.warn(`[Cloudinary] Unknown fileType: "${fileType}" — defaulting to raw`);
  }
  return fileType === 'Image' || fileType === 'PDF' ? 'image' : 'raw';
}

export class DocumentService {

  static async getAll(
    userId: string,
    filters: any,
    skip: number,
    limit: number,
    sortBy: string,
    sortOrder: 1 | -1
  ): Promise<{ documents: IDocument[]; totalDocuments: number }> {
    const query: any = { user: userId }

    if (filters.tags) query.tags = { $in: filters.tags }
    if (filters.fileType) query.fileType = filters.fileType
    if (filters.cognitiveLoad) query.cognitiveLoad = filters.cognitiveLoad

    // AI Semantic Folder Filter
    if (filters.semanticPath) {
      const folderName = filters.semanticPath.replace(/^\/+|\/+$/g, '')
      const escapedFolder = folderName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      query.semanticPath = { $regex: `^/?${escapedFolder}(/|$)`, $options: 'i' }
    }

    // Physical Client Folder Filter
    if (filters.originalClientPath) {
      const folderName = filters.originalClientPath.replace(/^\/+|\/+$/g, '')
      const escapedFolder = folderName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      query.originalClientPath = { $regex: `^/?${escapedFolder}(/|$)`, $options: 'i' }
    }

    const documents = await DocumentModel.find(query)
      .sort({ [sortBy]: sortOrder })
      .skip(skip)
      .limit(limit)
      .select('-extractedText -__v')

    const totalDocuments = await DocumentModel.countDocuments(query)

    return { documents, totalDocuments }
  }

  // 2. Search Text Indexes
  static async search(
    userId: string,
    q: string,
    skip: number,
    limit: number
  ): Promise<{ documents: IDocument[]; totalMatches: number }> {
    const searchQuery = {
      user: userId,
      $or: [
        { $text: { $search: q } },
        { title: { $regex: q, $options: 'i' } },
        { tags: { $regex: q, $options: 'i' } }
      ]
    }

    const documents = await DocumentModel.find(searchQuery, { score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' }, updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-extractedText -__v')

    const totalMatches = await DocumentModel.countDocuments(searchQuery)

    return { documents, totalMatches }
  }

  // 3. Update Single Document
  static async updateById(
    userId: string,
    docId: string,
    updateData: Partial<IDocument>
  ): Promise<IDocument | null> {
    const document = await DocumentModel.findOne({ _id: docId, user: userId })
    if (!document) return null

    if (updateData.title) document.title = updateData.title
    if (updateData.tags) document.tags = updateData.tags
    if (updateData.cognitiveLoad) document.cognitiveLoad = updateData.cognitiveLoad
    if (updateData.semanticPath) document.semanticPath = updateData.semanticPath
    if (updateData.originalClientPath) document.originalClientPath = updateData.originalClientPath

    await document.save()

    // 🛠️ THE FIX 2: Update the parent folder's timestamp when a document is edited!
    if (document.folder) {
      await Folder.findByIdAndUpdate(document.folder, { updatedAt: new Date() })
    }

    return document
  }

  // 4. Bulk Update Semantic Paths
  static async bulkUpdatePaths(userId: string, updates: { documentId: string; newPath: string }[]) {
    // 🛠️ Check if any of these documents are already organized
    const documentIds = updates.map((u) => u.documentId)
    const alreadyOrganizedDocs = await DocumentModel.find({
      _id: { $in: documentIds },
      user: userId,
      isOrganized: true
    })

    if (alreadyOrganizedDocs.length > 0) {
      throw new AppError('One or more selected documents are already organized.', 400)
    }

    const bulkOps = updates.map((update) => ({
      updateOne: {
        filter: { _id: update.documentId, user: userId },
        update: { $set: { semanticPath: update.newPath, isOrganized: true } }
      }
    }))

    return await DocumentModel.bulkWrite(bulkOps)
  }

  // 5. Delete Single Document + Cloudinary Asset
  static async deleteById(userId: string, docId: string): Promise<boolean> {
    const document = await DocumentModel.findOne({ _id: docId, user: userId })
    if (!document) return false

    // ☁️ Delete from Cloudinary if asset exists
    if (document.cloudinaryPublicId) {
      const resourceType = getResourceType(document.fileType)
      await cloudinary.uploader.destroy(document.cloudinaryPublicId, {
        resource_type: resourceType
      })
    }

    // 🛠️ Store the folder ID before we delete the document
    const folderId = document.folder

    await document.deleteOne()

    // 🗑️ Purge all semantic chunks from Vector Store
    await EmbeddingService.deleteDocumentChunks(docId, userId)

    // 🗑️ Delete associated chat history
    await ChatMessageModel.deleteMany({ documentId: docId, user: userId })

    // 🗑️ Cascade delete any comparison records referencing this document, plus their chats
    const comparisons = await ComparisonRecordModel.find({ 
      user: userId, 
      $or: [{ docIdA: docId }, { docIdB: docId }] 
    })
    if (comparisons.length > 0) {
      const compIds = comparisons.map(c => c._id)
      await ComparisonRecordModel.deleteMany({ _id: { $in: compIds } })
      await ComparisonMessageModel.deleteMany({ user: userId, $or: [{ docIdA: docId }, { docIdB: docId }] })
    }

    // 🛠️ THE FIX 3: Update the parent folder's timestamp when a document is deleted!
    if (folderId) {
      await Folder.findByIdAndUpdate(folderId, { updatedAt: new Date() })
    }

    // 🛠️ THE FIX: Clear lastActiveDocumentId if it matches the deleted document
    await User.updateOne(
      { _id: userId, lastActiveDocumentId: docId },
      { $unset: { lastActiveDocumentId: "" } }
    )

    return true
  }

  // 6. Bulk Delete Documents + Cloudinary Assets
  static async bulkDelete(userId: string, ids: string[]) {
    const query = { _id: { $in: ids }, user: userId }
    const documents = await DocumentModel.find(query)

    // ☁️ Delete each asset from Cloudinary in parallel
    await Promise.all(
      documents
        .filter((doc) => doc.cloudinaryPublicId)
        .map((doc) =>
          cloudinary.uploader.destroy(doc.cloudinaryPublicId!, {
            resource_type: getResourceType(doc.fileType)
          })
        )
    )

    // 🛠️ Collect all unique folder IDs that these documents belong to
    const folderIdsToUpdate = [
      ...new Set(documents.map((doc) => doc.folder).filter((id) => id !== null))
    ]

    const result = await DocumentModel.deleteMany(query)

    // 🗑️ Purge all semantic chunks from Vector Store
    await EmbeddingService.deleteDocumentChunks(ids, userId)

    // 🗑️ Delete associated chat history
    await ChatMessageModel.deleteMany({ documentId: { $in: ids }, user: userId })

    // 🗑️ Cascade delete any comparison records referencing these documents
    const comparisons = await ComparisonRecordModel.find({ 
      user: userId, 
      $or: [{ docIdA: { $in: ids } }, { docIdB: { $in: ids } }] 
    })
    if (comparisons.length > 0) {
      const compIds = comparisons.map(c => c._id)
      await ComparisonRecordModel.deleteMany({ _id: { $in: compIds } })
      await ComparisonMessageModel.deleteMany({ user: userId, $or: [{ docIdA: { $in: ids } }, { docIdB: { $in: ids } }] })
    }

    // 🛠️ THE FIX 4: Update timestamps for all affected folders at once!
    if (folderIdsToUpdate.length > 0) {
      await Folder.updateMany(
        { _id: { $in: folderIdsToUpdate } },
        { $set: { updatedAt: new Date() } }
      )
    }

    // 🛠️ THE FIX: Clear lastActiveDocumentId if any of the deleted documents were active
    await User.updateOne(
      { _id: userId, lastActiveDocumentId: { $in: ids } },
      { $unset: { lastActiveDocumentId: "" } }
    )

    return result
  }

  // 7. Get Document by ID (Full payload)
  static async getById(userId: string, docId: string): Promise<IDocument | null> {
    return await DocumentModel.findOne({ _id: docId, user: userId }).populate('folder', 'name')
  }

  // 8. Get Cloudinary URL for serving a file
  // The controller can redirect to this URL or return it — no proxying needed.
  static async getFilePath(userId: string, docId: string): Promise<string | null> {
    const document = await DocumentModel.findOne({ _id: docId, user: userId })
    if (!document || !document.cloudinaryUrl) return null
    return document.cloudinaryUrl
  }

  // 9. Get document statuses
  static async getStatuses(userId: string, ids: string[]) {
    return await DocumentModel.find({ _id: { $in: ids }, user: userId })
      .select('_id title aiStatus tags cognitiveLoad summary')
  }
}
