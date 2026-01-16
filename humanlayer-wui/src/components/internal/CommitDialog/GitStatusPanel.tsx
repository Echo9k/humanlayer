import { cn } from '@/lib/utils'
import type { GitFile, GitStatusResponse } from '@/lib/daemon/types'
import { FileIcon, Plus, Minus, Edit3, ArrowRight, Circle } from 'lucide-react'

interface GitStatusPanelProps {
  gitStatus: GitStatusResponse
  className?: string
}

function getStatusIcon(status: GitFile['status']) {
  switch (status) {
    case 'added':
      return <Plus className="h-3 w-3 text-green-500" />
    case 'modified':
      return <Edit3 className="h-3 w-3 text-yellow-500" />
    case 'deleted':
      return <Minus className="h-3 w-3 text-red-500" />
    case 'renamed':
      return <ArrowRight className="h-3 w-3 text-blue-500" />
    case 'untracked':
      return <Circle className="h-3 w-3 text-muted-foreground" />
    default:
      return <FileIcon className="h-3 w-3 text-muted-foreground" />
  }
}

function getStatusLabel(status: GitFile['status']) {
  switch (status) {
    case 'added':
      return 'new'
    case 'modified':
      return 'modified'
    case 'deleted':
      return 'deleted'
    case 'renamed':
      return 'renamed'
    case 'untracked':
      return 'untracked'
    default:
      return status
  }
}

function FileRow({ file, type }: { file: GitFile; type: 'staged' | 'unstaged' | 'untracked' }) {
  const bgClass =
    type === 'staged' ? 'bg-green-500/5' : type === 'unstaged' ? 'bg-yellow-500/5' : 'bg-muted/30'

  return (
    <div className={cn('flex items-center gap-2 px-2 py-1 rounded text-xs font-mono', bgClass)}>
      {getStatusIcon(file.status)}
      <span className="flex-1 truncate" title={file.path}>
        {file.path}
      </span>
      <span className="text-muted-foreground text-[10px]">{getStatusLabel(file.status)}</span>
    </div>
  )
}

function FileSection({
  title,
  files,
  type,
  emptyMessage,
}: {
  title: string
  files: GitFile[]
  type: 'staged' | 'unstaged' | 'untracked'
  emptyMessage?: string
}) {
  if (files.length === 0 && !emptyMessage) return null

  const titleColor =
    type === 'staged'
      ? 'text-green-600 dark:text-green-400'
      : type === 'unstaged'
        ? 'text-yellow-600 dark:text-yellow-400'
        : 'text-muted-foreground'

  return (
    <div className="space-y-1">
      <div className={cn('text-xs font-medium flex items-center gap-2', titleColor)}>
        <span>{title}</span>
        <span className="text-muted-foreground">({files.length})</span>
      </div>
      {files.length > 0 ? (
        <div className="space-y-0.5 max-h-32 overflow-y-auto">
          {files.map((file, idx) => (
            <FileRow key={`${file.path}-${idx}`} file={file} type={type} />
          ))}
        </div>
      ) : (
        emptyMessage && (
          <div className="text-xs text-muted-foreground italic px-2 py-1">{emptyMessage}</div>
        )
      )}
    </div>
  )
}

export function GitStatusPanel({ gitStatus, className }: GitStatusPanelProps) {
  const totalChanges = gitStatus.staged.length + gitStatus.unstaged.length + gitStatus.untracked.length

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span className="font-medium">Branch:</span>
          <code className="px-1.5 py-0.5 bg-muted rounded text-xs">{gitStatus.branch}</code>
        </div>
        <div className="text-muted-foreground text-xs">
          {totalChanges} {totalChanges === 1 ? 'change' : 'changes'}
          {gitStatus.ahead !== undefined && gitStatus.ahead > 0 && (
            <span className="ml-2 text-green-600">+{gitStatus.ahead} ahead</span>
          )}
          {gitStatus.behind !== undefined && gitStatus.behind > 0 && (
            <span className="ml-2 text-yellow-600">{gitStatus.behind} behind</span>
          )}
        </div>
      </div>

      <div className="space-y-3 border rounded-md p-3 bg-muted/20">
        <FileSection
          title="Staged changes"
          files={gitStatus.staged}
          type="staged"
          emptyMessage="No staged changes"
        />
        <FileSection title="Unstaged changes" files={gitStatus.unstaged} type="unstaged" />
        <FileSection title="Untracked files" files={gitStatus.untracked} type="untracked" />
      </div>
    </div>
  )
}

export default GitStatusPanel
