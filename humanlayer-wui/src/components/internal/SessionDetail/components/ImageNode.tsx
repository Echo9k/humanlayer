import { NodeViewWrapper } from '@tiptap/react'
import { X, ImageIcon } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useState } from 'react'

interface ImageNodeProps {
  node: {
    attrs: {
      filePath: string
      fileName: string
      mimeType: string
      thumbnailDataUrl: string
    }
  }
  deleteNode: () => void
}

export const ImageNode = ({ node, deleteNode }: ImageNodeProps) => {
  const { filePath, fileName, thumbnailDataUrl } = node.attrs
  const [imageError, setImageError] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  const handleRemove = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    deleteNode()
  }

  return (
    <NodeViewWrapper
      as="span"
      className="image-attachment inline-block align-middle mx-0.5"
      contentEditable={false}
      data-image-path={filePath}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="relative inline-flex items-center justify-center rounded border border-border bg-muted/50 overflow-hidden cursor-default"
            style={{ width: 64, height: 64 }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            {/* Thumbnail or fallback icon */}
            {thumbnailDataUrl && !imageError ? (
              <img
                src={thumbnailDataUrl}
                alt={fileName}
                className="w-full h-full object-cover"
                onError={() => setImageError(true)}
                draggable={false}
              />
            ) : (
              <ImageIcon className="h-6 w-6 text-muted-foreground" />
            )}

            {/* Remove button on hover */}
            {isHovered && (
              <button
                type="button"
                onClick={handleRemove}
                className="absolute top-0 right-0 p-0.5 bg-destructive text-destructive-foreground rounded-bl hover:bg-destructive/90 transition-colors"
                aria-label="Remove image"
              >
                <X className="h-3 w-3" />
              </button>
            )}

            {/* Overlay on hover */}
            {isHovered && <span className="absolute inset-0 bg-black/20 pointer-events-none" />}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="flex flex-col gap-1">
            <span className="font-mono text-xs truncate">{fileName}</span>
            <span className="text-[10px] text-muted-foreground truncate">{filePath}</span>
          </div>
        </TooltipContent>
      </Tooltip>
    </NodeViewWrapper>
  )
}
