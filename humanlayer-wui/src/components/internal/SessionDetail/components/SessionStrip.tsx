import { ChevronRight, Circle } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Session, SessionStatus } from '@/lib/daemon/types'
import { cn } from '@/lib/utils'

interface SessionStripProps {
  session: Session
  lastMessage?: string
  onRestore: () => void
}

function getStatusColor(status: SessionStatus): string {
  switch (status) {
    case SessionStatus.Running:
      return 'text-green-500'
    case SessionStatus.Starting:
      return 'text-yellow-500'
    case SessionStatus.WaitingInput:
      return 'text-orange-500'
    case SessionStatus.Interrupted:
    case SessionStatus.Interrupting:
      return 'text-yellow-600'
    case SessionStatus.Completed:
      return 'text-blue-500'
    case SessionStatus.Failed:
      return 'text-red-500'
    default:
      return 'text-muted-foreground'
  }
}

function getStatusLabel(status: SessionStatus): string {
  switch (status) {
    case SessionStatus.Running:
      return 'Running'
    case SessionStatus.Starting:
      return 'Starting'
    case SessionStatus.WaitingInput:
      return 'Waiting'
    case SessionStatus.Interrupted:
      return 'Interrupted'
    case SessionStatus.Interrupting:
      return 'Stopping'
    case SessionStatus.Completed:
      return 'Done'
    case SessionStatus.Failed:
      return 'Failed'
    default:
      return status
  }
}

export function SessionStrip({ session, lastMessage, onRestore }: SessionStripProps) {
  const title = session.title || session.query || 'Untitled Session'
  const truncatedTitle = title.length > 30 ? title.slice(0, 30) + '...' : title

  return (
    <Card
      className="h-full flex flex-col items-center py-4 px-2 cursor-pointer hover:bg-secondary/50 transition-colors border-r-2 border-accent/30"
      onClick={onRestore}
      title="Click to restore session view"
    >
      {/* Restore indicator */}
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-accent/20 border border-accent/30 mb-4">
        <ChevronRight className="w-4 h-4 text-accent" />
      </div>

      {/* Status indicator */}
      <div className="flex flex-col items-center gap-1 mb-4">
        <Circle className={cn('w-3 h-3 fill-current', getStatusColor(session.status))} />
        <span
          className={cn(
            'text-[10px] font-mono uppercase tracking-wider writing-mode-vertical',
            getStatusColor(session.status),
          )}
          style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
        >
          {getStatusLabel(session.status)}
        </span>
      </div>

      {/* Title (vertical) */}
      <div
        className="flex-1 text-xs font-mono text-muted-foreground overflow-hidden"
        style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
      >
        <span className="truncate">{truncatedTitle}</span>
      </div>

      {/* Last message preview */}
      {lastMessage && (
        <div
          className="mt-4 text-[10px] text-muted-foreground/70 max-h-24 overflow-hidden"
          style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
        >
          {lastMessage.length > 50 ? lastMessage.slice(0, 50) + '...' : lastMessage}
        </div>
      )}
    </Card>
  )
}
