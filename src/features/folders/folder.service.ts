import mongoose from 'mongoose'
import Folder, { IFolder } from './folder.model'
import { DocumentModel, IDocument } from '../documents/document.model'
import { configureCloudinary } from '../../config/cloudinary'
import { EmbeddingService } from '../ai/search/vector.service'
import archiver from 'archiver'
const { ZipArchive } = require('archiver') as { ZipArchive: new (opts?: object) => archiver.Archiver }
import axios from 'axios'
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

export class FolderService {
  // 1. Create a Folder
  static async createFolder(
    userId: string,
    name: string,
    parentFolderId?: string
  ): Promise<{ folder?: IFolder; error?: string }> {
    let finalName = name;
    
    // Prevent overriding the system reserved "Random Files"
    if (finalName.trim().toLowerCase() === 'random files') {
      let counter = 1;
      finalName = `Random Files(${counter})`;
      let collision = await Folder.findOne({ name: finalName, user: userId, parentFolder: parentFolderId || null });
      while (collision) {
        counter++;
        finalName = `Random Files(${counter})`;
        collision = await Folder.findOne({ name: finalName, user: userId, parentFolder: parentFolderId || null });
      }
    } else {
      const existingFolder = await Folder.findOne({
        name: finalName,
        user: userId,
        parentFolder: parentFolderId || null
      });
      if (existingFolder) return { error: 'A folder with this name already exists here.' };
    }

    let newPath = finalName
    if (parentFolderId) {
      const parent = await Folder.findById(parentFolderId)
      if (!parent) return { error: 'Parent folder not found.' }
      newPath = `${parent.path}/${finalName}`
    }

    const folder = await Folder.create({
      name: finalName,
      user: userId,
      parentFolder: parentFolderId || null,
      path: newPath
    })

    return { folder }
  }

  // 2. Get Folder Contents (🛠️ THE PAGINATION FIX)
  static async getContents(
    userId: string,
    targetFolderId: string | null,
    skip: number,
    limit: number,
    search?: string,
    tags?: string,
    sortBy: string = 'updatedAt',
    sortOrder: 1 | -1 = -1
  ): Promise<{
    currentFolder: IFolder | null
    breadcrumbs: IFolder[]
    folders: IFolder[]
    documents: IDocument[]
    totalDocuments: number
  }> {
    let docQuery: any = { user: userId }
    if (search || tags) {
      if (targetFolderId) {
        const currentFolderData = await Folder.findById(targetFolderId)
        if (currentFolderData) {
          const escapedPath = currentFolderData.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const subfolders = await Folder.find({
            user: userId,
            path: { $regex: `^${escapedPath}(/|$)` }
          })
          docQuery.folder = { $in: subfolders.map((f) => f._id) }
        } else {
          docQuery.folder = targetFolderId
        }
      }
      
      if (search) {
        docQuery.$or = [
          { title: { $regex: search, $options: 'i' } },
          { tags: { $regex: search, $options: 'i' } }
        ]
      }
      if (tags) docQuery.tags = tags
    } else {
      docQuery.folder = targetFolderId
    }

    const folderQuery = { user: userId, parentFolder: targetFolderId }
    const folderCount = !search && !tags ? await Folder.countDocuments(folderQuery) : 0
    const documentCount = await DocumentModel.countDocuments(docQuery)
    const totalDocuments = folderCount + documentCount

    let folders: IFolder[] = []
    let documents: IDocument[] = []

    // 🛠️ THE FIX: Smart Sorting Objects!
    const folderSortField = sortBy === 'title' ? 'name' : sortBy
    const folderSortOptions: any = { isPinned: -1, [folderSortField]: sortOrder }

    const docSortOptions: any = { [sortBy]: sortOrder }

    if (!search && !tags) {
      if (skip < folderCount) {
        const folderLimit = Math.min(limit, folderCount - skip)
        folders = await Folder.find(folderQuery)
          .sort(folderSortOptions)
          .skip(skip)
          .limit(folderLimit)

        const remainingSpace = limit - folders.length
        if (remainingSpace > 0) {
          documents = await DocumentModel.find(docQuery)
            .sort(docSortOptions)
            .skip(0)
            .limit(remainingSpace)
        }
      } else {
        const docSkip = skip - folderCount
        documents = await DocumentModel.find(docQuery)
          .sort(docSortOptions)
          .skip(docSkip)
          .limit(limit)
      }
    } else {
      documents = await DocumentModel.find(docQuery).sort(docSortOptions).skip(skip).limit(limit)
    }

    // 4. Breadcrumbs logic
    let currentFolder: IFolder | null = null
    let breadcrumbs: IFolder[] = []

    if (targetFolderId) {
      currentFolder = await Folder.findById(targetFolderId)

      if (currentFolder) {
        const pathParts = currentFolder.path.split('/')
        const ancestorPaths = []
        let cumulativePath = ''

        for (let i = 0; i < pathParts.length - 1; i++) {
          cumulativePath = cumulativePath ? `${cumulativePath}/${pathParts[i]}` : pathParts[i]
          ancestorPaths.push(cumulativePath)
        }

        if (ancestorPaths.length > 0) {
          const ancestors = await Folder.find({ user: userId, path: { $in: ancestorPaths } })
          breadcrumbs = ancestors.sort((a, b) => a.path.length - b.path.length)
        }
      }
    }

    return { currentFolder, breadcrumbs, folders, documents, totalDocuments }
  }

  // 3. Rename a Folder
  static async renameFolder(
    userId: string,
    folderId: string,
    newName: string
  ): Promise<{ folder?: IFolder; error?: string }> {
    const folder = await Folder.findOne({ _id: folderId, user: userId })
    if (!folder) return { error: 'Folder not found.' }

    let finalNewName = newName;
    if (finalNewName.trim().toLowerCase() === 'random files') {
      let counter = 1;
      finalNewName = `Random Files(${counter})`;
      let collision = await Folder.findOne({ name: finalNewName, user: userId, parentFolder: folder.parentFolder });
      while (collision && collision._id.toString() !== folderId) {
        counter++;
        finalNewName = `Random Files(${counter})`;
        collision = await Folder.findOne({ name: finalNewName, user: userId, parentFolder: folder.parentFolder });
      }
    } else {
      const collision = await Folder.findOne({
        name: finalNewName,
        parentFolder: folder.parentFolder,
        user: userId
      })

      if (collision) return { error: 'Name already in use in this destination.' }
    }

    const oldName = folder.name
    folder.name = finalNewName
    folder.path = folder.path.replace(new RegExp(`${oldName}$`), finalNewName)
    folder.updatedAt = new Date()

    await folder.save()
    return { folder }
  }

  // 4. Delete Folder, Sub-folders, and Physical Documents
  static async deleteFolderWithContents(
    userId: string,
    folderId: string
  ): Promise<{ error?: string; foldersDeleted?: number; documentsDeleted?: number }> {
    const targetFolder = await Folder.findOne({ _id: folderId, user: userId })
    if (!targetFolder) return { error: 'Folder not found.' }

    const escapedPath = targetFolder.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const foldersToDelete = await Folder.find({
      user: userId,
      path: { $regex: `^${escapedPath}(/|$)` }
    })

    const folderIdsToDelete = foldersToDelete.map((f) => f._id)

    const documentsToDelete = await DocumentModel.find({
      user: userId,
      folder: { $in: folderIdsToDelete }
    })

    // ☁️ Delete each document's Cloudinary asset in parallel
    await Promise.all(
      documentsToDelete
        .filter((doc) => doc.cloudinaryPublicId)
        .map((doc) =>
          cloudinary.uploader.destroy(doc.cloudinaryPublicId!, {
            resource_type: getResourceType(doc.fileType)
          })
        )
    )

    const docIdsToDelete = documentsToDelete.map((doc) => doc._id.toString())
    if (docIdsToDelete.length > 0) {
      await EmbeddingService.deleteDocumentChunks(docIdsToDelete, userId)

      // 🗑️ Delete associated chat history
      await ChatMessageModel.deleteMany({ documentId: { $in: docIdsToDelete }, user: userId })

      // 🗑️ Cascade delete any comparison records referencing these documents
      const comparisons = await ComparisonRecordModel.find({ 
        user: userId, 
        $or: [{ docIdA: { $in: docIdsToDelete } }, { docIdB: { $in: docIdsToDelete } }] 
      })
      if (comparisons.length > 0) {
        const compIds = comparisons.map(c => c._id)
        await ComparisonRecordModel.deleteMany({ _id: { $in: compIds } })
        await ComparisonMessageModel.deleteMany({ user: userId, $or: [{ docIdA: { $in: docIdsToDelete } }, { docIdB: { $in: docIdsToDelete } }] })
      }
    }

    await DocumentModel.deleteMany({ user: userId, folder: { $in: folderIdsToDelete } })
    await Folder.deleteMany({ user: userId, _id: { $in: folderIdsToDelete } })

    return {
      foldersDeleted: foldersToDelete.length,
      documentsDeleted: documentsToDelete.length
    }
  }

  // 5. Get Entire Folder Tree
  static async getTree(userId: string): Promise<IFolder[]> {
    return await Folder.find({ user: userId }).sort({ path: 1 })
  }

  // ==========================================
  // 📦 ZIP EXPORT ENGINE
  // ==========================================

  /**
   * Recursively finds all documents within a folder (and its subfolders),
   * opens a read stream from Cloudinary, and pipes them directly into a ZIP archive.
   */
  static async exportFolderToZip(
    userId: string,
    folderId: string,
    archive: archiver.Archiver
  ): Promise<void> {
    const rootFolder = await Folder.findOne({ _id: folderId, user: userId })
    if (!rootFolder) throw new Error('Target folder not found.')

    // 1. Fetch the root folder and ALL nested subfolders
    const escapedPath = rootFolder.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const allFolders = await Folder.find({
      user: userId,
      path: { $regex: `^${escapedPath}(/|$)` }
    })

    // Create a fast lookup map for folder paths: FolderID -> "Parent/Child"
    const folderPathMap = new Map<string, string>()
    allFolders.forEach((f) => folderPathMap.set(f._id.toString(), f.path))

    // 2. Fetch all physical documents inside these folders
    const documents = await DocumentModel.find({
      user: userId,
      folder: { $in: allFolders.map((f) => f._id) }
    })

    if (documents.length === 0) {
      archive.append('This folder is empty.', { name: 'empty_folder_notice.txt' })
      return
    }

    // 3. Calculate the base path to trim (so the ZIP doesn't have an ugly nested structure)
    const prefixToRemoveLength = rootFolder.path.length - rootFolder.name.length

    // 4. Stream documents into the archive
    for (const doc of documents) {
      // Calculate relative internal ZIP path
      const fullFolderPath = folderPathMap.get(doc.folder!.toString()) || rootFolder.name
      const relativeFolderPath = fullFolderPath.substring(prefixToRemoveLength)

      // Ensure file has an extension (Cloudinary sometimes strips it, but users need it to open the file)
      let fileName = doc.title
      const extMap: Record<string, string> = {
        PDF: '.pdf',
        Word: '.docx',
        Image: '.jpg',
        Excel: '.xlsx',
        TextSnippet: '.txt'
      }
      const extension = extMap[doc.fileType] || ''
      if (extension && !fileName.toLowerCase().endsWith(extension.toLowerCase())) {
        fileName += extension
      }

      const zipFilePath = `${relativeFolderPath}/${fileName}`

      // Handle TextSnippets directly since they don't have a Cloudinary URL
      if (doc.fileType === 'TextSnippet') {
        const content = doc.extractedText || ''
        archive.append(content, { name: zipFilePath })
        continue
      }

      if (!doc.cloudinaryUrl) continue

      const ALLOWED_CDN_PREFIX = 'https://res.cloudinary.com/'
      if (!doc.cloudinaryUrl.startsWith(ALLOWED_CDN_PREFIX)) {
        console.warn(`[ZIP Export] Blocked suspicious URL for doc: ${doc.title}`)
        continue
      }

      try {
        // 🚀 THE MAGIC: Stream the file directly from Cloudinary into the ZIP
        // memory footprint stays close to zero, no matter how big the file is!
        const response = await axios({
          method: 'GET',
          url: doc.cloudinaryUrl,
          responseType: 'stream'
        })

        await new Promise<void>((resolve, reject) => {
          archive.append(response.data, { name: zipFilePath })
          response.data.on('end', () => resolve())
          response.data.on('error', (err: any) => reject(err))
        })
      } catch (err) {
        console.error(`[ZIP Export] Failed to stream ${doc.title}:`, err)
        archive.append(`Failed to download this file from the server.`, {
          name: `${zipFilePath}_error.txt`
        })
      }
    }
  }
}
