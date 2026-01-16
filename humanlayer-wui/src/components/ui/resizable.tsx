import {
  useState,
  useRef,
  useCallback,
  useEffect,
  ReactNode,
  Children,
  cloneElement,
  isValidElement,
} from 'react'
import { GripVerticalIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ResizablePanelGroupProps {
  children: ReactNode
  orientation?: 'horizontal' | 'vertical'
  className?: string
}

interface ResizablePanelProps {
  children: ReactNode
  defaultSize?: number
  minSize?: number
  maxSize?: number
  id?: string
  className?: string
  // Internal props set by parent
  _size?: number
}

interface ResizableHandleProps {
  withHandle?: boolean
  className?: string
  onDoubleClick?: () => void
  // Internal props set by parent
  _onMouseDown?: (e: React.MouseEvent) => void
  _isResizing?: boolean
  _orientation?: 'horizontal' | 'vertical'
}

function ResizablePanelGroup({
  children,
  orientation = 'horizontal',
  className,
}: ResizablePanelGroupProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [panelSizes, setPanelSizes] = useState<number[]>([])
  const [isResizing, setIsResizing] = useState(false)
  const [resizeHandleIndex, setResizeHandleIndex] = useState(-1)
  const panelConfigs = useRef<{ minSize: number; maxSize: number }[]>([])

  // Parse children to extract panels and handles
  const childArray = Children.toArray(children)

  // Initialize panel sizes on first render or when panel count changes
  useEffect(() => {
    const defaultSizes: number[] = []
    const configs: { minSize: number; maxSize: number }[] = []

    childArray.forEach(child => {
      if (isValidElement(child) && child.type === ResizablePanel) {
        defaultSizes.push(child.props.defaultSize ?? 50)
        configs.push({
          minSize: child.props.minSize ?? 10,
          maxSize: child.props.maxSize ?? 90,
        })
      }
    })

    // Initialize sizes if not set, or if panel count changed
    if (panelSizes.length === 0 || panelSizes.length !== defaultSizes.length) {
      setPanelSizes(defaultSizes)
      panelConfigs.current = configs
    }
  }, [childArray.length, panelSizes.length])

  const handleMouseDown = useCallback(
    (handleIndex: number) => (e: React.MouseEvent) => {
      e.preventDefault()
      setIsResizing(true)
      setResizeHandleIndex(handleIndex)
    },
    [],
  )

  useEffect(() => {
    if (!isResizing || resizeHandleIndex < 0) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return

      const rect = containerRef.current.getBoundingClientRect()
      const totalSize = orientation === 'horizontal' ? rect.width : rect.height
      const pos = orientation === 'horizontal' ? e.clientX - rect.left : e.clientY - rect.top

      // Calculate what percentage the mouse is at
      const mousePercentage = (pos / totalSize) * 100

      // The handle is between panel[resizeHandleIndex] and panel[resizeHandleIndex + 1]
      // We need to calculate cumulative sizes before the left panel
      let cumulativeBefore = 0
      for (let i = 0; i < resizeHandleIndex; i++) {
        cumulativeBefore += panelSizes[i] || 0
      }

      // New size for the left panel
      let newLeftSize = mousePercentage - cumulativeBefore

      // Apply constraints
      const leftConfig = panelConfigs.current[resizeHandleIndex] || { minSize: 10, maxSize: 90 }
      const rightConfig = panelConfigs.current[resizeHandleIndex + 1] || { minSize: 10, maxSize: 90 }

      newLeftSize = Math.max(leftConfig.minSize, Math.min(leftConfig.maxSize, newLeftSize))

      // Calculate remaining space for right panel
      let cumulativeAfter = 0
      for (let i = resizeHandleIndex + 2; i < panelSizes.length; i++) {
        cumulativeAfter += panelSizes[i] || 0
      }

      let newRightSize = 100 - cumulativeBefore - newLeftSize - cumulativeAfter
      newRightSize = Math.max(rightConfig.minSize, Math.min(rightConfig.maxSize, newRightSize))

      // Adjust left size if right hit its constraint
      if (newRightSize === rightConfig.minSize || newRightSize === rightConfig.maxSize) {
        newLeftSize = 100 - cumulativeBefore - newRightSize - cumulativeAfter
      }

      setPanelSizes(prev => {
        const newSizes = [...prev]
        newSizes[resizeHandleIndex] = newLeftSize
        newSizes[resizeHandleIndex + 1] = newRightSize
        return newSizes
      })
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      setResizeHandleIndex(-1)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, resizeHandleIndex, orientation, panelSizes])

  // Inject props into children
  let panelIndex = 0
  let handleIndex = 0

  const enhancedChildren = childArray.map(child => {
    if (!isValidElement(child)) return child

    if (child.type === ResizablePanel) {
      const size = panelSizes[panelIndex] ?? child.props.defaultSize ?? 50
      const enhanced = cloneElement(child, { _size: size } as any)
      panelIndex++
      return enhanced
    }

    if (child.type === ResizableHandle) {
      const currentHandleIndex = handleIndex
      const enhanced = cloneElement(child, {
        _onMouseDown: handleMouseDown(currentHandleIndex),
        _isResizing: isResizing && resizeHandleIndex === currentHandleIndex,
        _orientation: orientation,
      } as any)
      handleIndex++
      return enhanced
    }

    return child
  })

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex h-full w-full',
        orientation === 'vertical' ? 'flex-col' : 'flex-row',
        isResizing && 'select-none cursor-col-resize',
        className,
      )}
    >
      {enhancedChildren}
    </div>
  )
}

function ResizablePanel({ children, defaultSize = 50, className, _size }: ResizablePanelProps) {
  const size = _size ?? defaultSize

  return (
    <div
      data-resizable-panel
      className={cn('overflow-hidden h-full', className)}
      style={{
        width: `${size}%`,
        flexShrink: 0,
        flexGrow: 0,
      }}
    >
      {children}
    </div>
  )
}

function ResizableHandle({
  withHandle,
  className,
  onDoubleClick,
  _onMouseDown,
  _isResizing,
  _orientation = 'horizontal',
}: ResizableHandleProps) {
  const isHorizontal = _orientation === 'horizontal'

  return (
    <div
      data-resizable-handle
      className={cn(
        'relative flex items-center justify-center bg-border/30 hover:bg-accent/50 transition-colors flex-shrink-0',
        // Make the handle wider for easier grabbing
        isHorizontal ? 'w-3 cursor-col-resize' : 'h-3 cursor-row-resize',
        _isResizing && 'bg-accent',
        className,
      )}
      onMouseDown={_onMouseDown}
      onDoubleClick={onDoubleClick}
    >
      {withHandle && (
        <div
          className={cn(
            // Use pointer-events-none so clicks pass through to the handle
            'z-10 flex items-center justify-center rounded-sm border bg-border pointer-events-none',
            isHorizontal ? 'h-8 w-4' : 'w-8 h-4',
          )}
        >
          <GripVerticalIcon className={cn('h-3 w-3', !isHorizontal && 'rotate-90')} />
        </div>
      )}
    </div>
  )
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
