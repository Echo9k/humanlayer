import { homeDir, join } from '@tauri-apps/api/path'
import { mkdir, writeFile, exists, readFile, remove, readDir } from '@tauri-apps/plugin-fs'
import { logger } from '@/lib/logging'

// Constants
const IMAGES_DIR_NAME = 'images'
const HUMANLAYER_DIR = '.humanlayer'
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024 // 10MB
const MAX_IMAGES_PER_RESPONSE = 5
const THUMBNAIL_MAX_SIZE = 128 // pixels
const SUPPORTED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

export interface SavedImage {
  filePath: string
  fileName: string
  mimeType: string
  thumbnailDataUrl: string
  sizeBytes: number
}

export interface ImageValidationResult {
  valid: boolean
  error?: string
}

export interface ImageAttachment {
  filePath: string
  fileName: string
  mimeType: string
}

class ImageStorageService {
  private static instance: ImageStorageService
  private imagesBasePath: string | null = null

  static getInstance(): ImageStorageService {
    if (!ImageStorageService.instance) {
      ImageStorageService.instance = new ImageStorageService()
    }
    return ImageStorageService.instance
  }

  /**
   * Get the base path for image storage (~/.humanlayer/images)
   */
  async getImagesBasePath(): Promise<string> {
    if (this.imagesBasePath) {
      return this.imagesBasePath
    }

    const home = await homeDir()
    this.imagesBasePath = await join(home, HUMANLAYER_DIR, IMAGES_DIR_NAME)
    return this.imagesBasePath
  }

  /**
   * Get the directory path for a specific session's images
   */
  async getSessionImageDir(sessionId: string): Promise<string> {
    const basePath = await this.getImagesBasePath()
    return await join(basePath, sessionId)
  }

  /**
   * Ensure the session image directory exists
   */
  async ensureSessionImageDir(sessionId: string): Promise<string> {
    const dirPath = await this.getSessionImageDir(sessionId)

    if (!(await exists(dirPath))) {
      await mkdir(dirPath, { recursive: true })
      logger.log(`[ImageStorage] Created session image directory: ${dirPath}`)
    }

    return dirPath
  }

  /**
   * Validate an image blob before saving
   */
  validateImage(blob: Blob): ImageValidationResult {
    // Check MIME type
    if (!SUPPORTED_MIME_TYPES.includes(blob.type)) {
      return {
        valid: false,
        error: `Unsupported image format: ${blob.type}. Supported formats: PNG, JPEG, GIF, WebP`,
      }
    }

    // Check file size
    if (blob.size > MAX_IMAGE_SIZE_BYTES) {
      const sizeMB = (blob.size / (1024 * 1024)).toFixed(1)
      return {
        valid: false,
        error: `Image too large: ${sizeMB}MB. Maximum size is 10MB`,
      }
    }

    return { valid: true }
  }

  /**
   * Generate a thumbnail data URL from an image blob
   */
  async generateThumbnail(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(blob)

      img.onload = () => {
        try {
          // Calculate thumbnail dimensions maintaining aspect ratio
          let width = img.width
          let height = img.height

          if (width > height) {
            if (width > THUMBNAIL_MAX_SIZE) {
              height = Math.round((height * THUMBNAIL_MAX_SIZE) / width)
              width = THUMBNAIL_MAX_SIZE
            }
          } else {
            if (height > THUMBNAIL_MAX_SIZE) {
              width = Math.round((width * THUMBNAIL_MAX_SIZE) / height)
              height = THUMBNAIL_MAX_SIZE
            }
          }

          // Create canvas and draw scaled image
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height

          const ctx = canvas.getContext('2d')
          if (!ctx) {
            throw new Error('Failed to get canvas context')
          }

          ctx.drawImage(img, 0, 0, width, height)

          // Convert to data URL (JPEG for smaller size)
          const thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.8)

          URL.revokeObjectURL(url)
          resolve(thumbnailDataUrl)
        } catch (error) {
          URL.revokeObjectURL(url)
          reject(error)
        }
      }

      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('Failed to load image for thumbnail generation'))
      }

      img.src = url
    })
  }

  /**
   * Get file extension from MIME type
   */
  private getExtensionFromMimeType(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/gif': 'gif',
      'image/webp': 'webp',
    }
    return mimeToExt[mimeType] || 'png'
  }

  /**
   * Generate a unique filename for an image
   */
  private generateFileName(mimeType: string): string {
    const timestamp = Date.now()
    const randomPart = Math.random().toString(36).substring(2, 8)
    const ext = this.getExtensionFromMimeType(mimeType)
    return `${timestamp}-${randomPart}.${ext}`
  }

  /**
   * Save an image blob to the session's image directory
   */
  async saveImage(sessionId: string, blob: Blob, mimeType: string): Promise<SavedImage> {
    // Validate first
    const validation = this.validateImage(blob)
    if (!validation.valid) {
      throw new Error(validation.error)
    }

    // Ensure directory exists
    const dirPath = await this.ensureSessionImageDir(sessionId)

    // Generate filename and full path
    const fileName = this.generateFileName(mimeType)
    const filePath = await join(dirPath, fileName)

    // Generate thumbnail before saving
    const thumbnailDataUrl = await this.generateThumbnail(blob)

    // Convert blob to Uint8Array for Tauri FS
    const arrayBuffer = await blob.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)

    // Write file
    await writeFile(filePath, uint8Array)

    logger.log(`[ImageStorage] Saved image: ${filePath} (${blob.size} bytes)`)

    return {
      filePath,
      fileName,
      mimeType,
      thumbnailDataUrl,
      sizeBytes: blob.size,
    }
  }

  /**
   * Import an external image file (from drag & drop or file picker)
   * Copies the file to the session directory
   */
  async importExternalImage(sessionId: string, externalPath: string): Promise<SavedImage> {
    // Read the external file
    const fileData = await readFile(externalPath)

    // Determine MIME type from extension
    const ext = externalPath.split('.').pop()?.toLowerCase() || ''
    const extToMime: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
    }
    const mimeType = extToMime[ext] || 'image/png'

    // Create blob for validation and thumbnail generation
    const blob = new Blob([fileData], { type: mimeType })

    // Validate
    const validation = this.validateImage(blob)
    if (!validation.valid) {
      throw new Error(validation.error)
    }

    // Save using the normal flow
    return this.saveImage(sessionId, blob, mimeType)
  }

  /**
   * Check if an image file exists
   */
  async imageExists(filePath: string): Promise<boolean> {
    try {
      return await exists(filePath)
    } catch {
      return false
    }
  }

  /**
   * Delete a single image file
   */
  async deleteImage(filePath: string): Promise<void> {
    try {
      if (await exists(filePath)) {
        await remove(filePath)
        logger.log(`[ImageStorage] Deleted image: ${filePath}`)
      }
    } catch (error) {
      logger.error(`[ImageStorage] Failed to delete image: ${filePath}`, error)
    }
  }

  /**
   * Delete all images for a session
   */
  async deleteSessionImages(sessionId: string): Promise<void> {
    try {
      const dirPath = await this.getSessionImageDir(sessionId)

      if (await exists(dirPath)) {
        // Read all files in directory and delete them
        const entries = await readDir(dirPath)
        for (const entry of entries) {
          if (entry.isFile && entry.name) {
            const filePath = await join(dirPath, entry.name)
            await remove(filePath)
          }
        }

        // Remove the directory itself
        await remove(dirPath)
        logger.log(`[ImageStorage] Deleted session images directory: ${dirPath}`)
      }
    } catch (error) {
      logger.error(`[ImageStorage] Failed to delete session images for: ${sessionId}`, error)
    }
  }

  /**
   * Get all images for a session
   */
  async getSessionImages(sessionId: string): Promise<ImageAttachment[]> {
    try {
      const dirPath = await this.getSessionImageDir(sessionId)

      if (!(await exists(dirPath))) {
        return []
      }

      const entries = await readDir(dirPath)
      const images: ImageAttachment[] = []

      for (const entry of entries) {
        if (entry.isFile && entry.name) {
          const ext = entry.name.split('.').pop()?.toLowerCase() || ''
          const extToMime: Record<string, string> = {
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            gif: 'image/gif',
            webp: 'image/webp',
          }

          if (extToMime[ext]) {
            images.push({
              filePath: await join(dirPath, entry.name),
              fileName: entry.name,
              mimeType: extToMime[ext],
            })
          }
        }
      }

      return images
    } catch (error) {
      logger.error(`[ImageStorage] Failed to get session images for: ${sessionId}`, error)
      return []
    }
  }

  /**
   * Check if adding more images would exceed the limit
   */
  canAddMoreImages(currentCount: number): boolean {
    return currentCount < MAX_IMAGES_PER_RESPONSE
  }

  /**
   * Get the maximum allowed images per response
   */
  getMaxImagesPerResponse(): number {
    return MAX_IMAGES_PER_RESPONSE
  }

  /**
   * Get the maximum allowed image size in bytes
   */
  getMaxImageSizeBytes(): number {
    return MAX_IMAGE_SIZE_BYTES
  }

  /**
   * Get supported MIME types
   */
  getSupportedMimeTypes(): string[] {
    return [...SUPPORTED_MIME_TYPES]
  }
}

export const imageStorageService = ImageStorageService.getInstance()
