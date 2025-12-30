import type { Editor } from '@tiptap/react'
import type { SavedImage, ImageAttachment } from '@/services/ImageStorageService'

/**
 * Insert an image node into the TipTap editor at the current cursor position
 */
export function insertImageNode(editor: Editor, image: SavedImage): void {
  if (!editor || editor.isDestroyed) {
    return
  }

  editor
    .chain()
    .focus()
    .insertContent({
      type: 'imageAttachment',
      attrs: {
        filePath: image.filePath,
        fileName: image.fileName,
        mimeType: image.mimeType,
        thumbnailDataUrl: image.thumbnailDataUrl,
      },
    })
    .insertContent(' ') // Add space after image for better UX
    .run()
}

/**
 * Extract all image attachments from the TipTap editor content
 */
export function extractImagesFromEditor(editor: Editor | null): ImageAttachment[] {
  if (!editor || editor.isDestroyed) {
    return []
  }

  const images: ImageAttachment[] = []

  editor.state.doc.descendants((node) => {
    if (node.type.name === 'imageAttachment') {
      const { filePath, fileName, mimeType } = node.attrs
      if (filePath && mimeType) {
        images.push({
          filePath,
          fileName: fileName || filePath.split('/').pop() || 'image',
          mimeType,
        })
      }
    }
  })

  return images
}

/**
 * Extract text content from the editor, excluding image nodes
 */
export function extractTextFromEditor(editor: Editor | null): string {
  if (!editor || editor.isDestroyed) {
    return ''
  }

  // Get text content - TipTap's getText() already excludes non-text nodes
  return editor.getText().trim()
}

/**
 * Remove an image node from the editor by its file path
 */
export function removeImageByPath(editor: Editor, filePath: string): boolean {
  if (!editor || editor.isDestroyed) {
    return false
  }

  let removed = false
  const { state, dispatch } = editor.view
  const { tr } = state

  state.doc.descendants((node, pos) => {
    if (node.type.name === 'imageAttachment' && node.attrs.filePath === filePath) {
      tr.delete(pos, pos + node.nodeSize)
      removed = true
      return false // Stop searching after first match
    }
  })

  if (removed) {
    dispatch(tr)
  }

  return removed
}

/**
 * Count the number of image attachments in the editor
 */
export function countImagesInEditor(editor: Editor | null): number {
  if (!editor || editor.isDestroyed) {
    return 0
  }

  let count = 0

  editor.state.doc.descendants((node) => {
    if (node.type.name === 'imageAttachment') {
      count++
    }
  })

  return count
}

/**
 * Check if the editor has any image attachments
 */
export function hasImagesInEditor(editor: Editor | null): boolean {
  return countImagesInEditor(editor) > 0
}

/**
 * Clear all image attachments from the editor
 */
export function clearImagesFromEditor(editor: Editor): void {
  if (!editor || editor.isDestroyed) {
    return
  }

  const { state, dispatch } = editor.view
  let { tr } = state
  let hasChanges = false

  // Collect positions to delete (in reverse order to maintain positions)
  const toDelete: Array<{ from: number; to: number }> = []

  state.doc.descendants((node, pos) => {
    if (node.type.name === 'imageAttachment') {
      toDelete.push({ from: pos, to: pos + node.nodeSize })
    }
  })

  // Delete in reverse order to maintain positions
  toDelete.reverse().forEach(({ from, to }) => {
    tr = tr.delete(from, to)
    hasChanges = true
  })

  if (hasChanges) {
    dispatch(tr)
  }
}

/**
 * Check if a file extension indicates an image
 */
export function isImageExtension(ext: string): boolean {
  const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp']
  return imageExtensions.includes(ext.toLowerCase())
}

/**
 * Check if a MIME type indicates an image
 */
export function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith('image/')
}

/**
 * Get MIME type from file extension
 */
export function getMimeTypeFromExtension(ext: string): string | null {
  const extToMime: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
  }
  return extToMime[ext.toLowerCase()] || null
}

/**
 * Get file extension from path
 */
export function getExtensionFromPath(path: string): string {
  return path.split('.').pop()?.toLowerCase() || ''
}
