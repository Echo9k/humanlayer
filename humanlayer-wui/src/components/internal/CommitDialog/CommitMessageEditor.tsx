import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RefreshCw, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react'
import type { CommitMessage, CommitSuggestion } from '@/lib/daemon/types'

interface CommitMessageEditorProps {
  commits: CommitMessage[]
  onChange: (commits: CommitMessage[]) => void
  suggestion: CommitSuggestion | null
  onRegenerate?: () => void
  isRegenerating?: boolean
  className?: string
}

const SUBJECT_CHAR_LIMIT = 72
const SUBJECT_RECOMMENDED_LIMIT = 50

function SingleCommitEditor({
  commit,
  onChange,
  index,
  total,
}: {
  commit: CommitMessage
  onChange: (commit: CommitMessage) => void
  index: number
  total: number
}) {
  const [showBody, setShowBody] = useState(Boolean(commit.body))
  const [showFooter, setShowFooter] = useState(Boolean(commit.footer))

  const subjectLength = commit.subject.length
  const isSubjectWarning =
    subjectLength > SUBJECT_RECOMMENDED_LIMIT && subjectLength <= SUBJECT_CHAR_LIMIT
  const isSubjectError = subjectLength > SUBJECT_CHAR_LIMIT

  return (
    <div className="space-y-3 p-3 border rounded-md bg-background">
      {total > 1 && (
        <div className="text-xs font-medium text-muted-foreground">
          Commit {index + 1} of {total}
        </div>
      )}

      {/* Subject line */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor={`subject-${index}`} className="text-xs">
            Subject
          </Label>
          <div
            className={cn(
              'text-xs',
              isSubjectError
                ? 'text-red-500'
                : isSubjectWarning
                  ? 'text-yellow-500'
                  : 'text-muted-foreground',
            )}
          >
            {subjectLength}/{SUBJECT_RECOMMENDED_LIMIT}
            {isSubjectWarning && ' (recommended)'}
            {isSubjectError && (
              <span className="ml-1">
                <AlertCircle className="h-3 w-3 inline" />
              </span>
            )}
          </div>
        </div>
        <Input
          id={`subject-${index}`}
          value={commit.subject}
          onChange={e => onChange({ ...commit, subject: e.target.value })}
          placeholder="type(scope): description"
          className={cn(
            'font-mono text-sm',
            isSubjectError && 'border-red-500 focus-visible:ring-red-500',
          )}
        />
      </div>

      {/* Body (collapsible) */}
      <div>
        <button
          type="button"
          onClick={() => setShowBody(!showBody)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {showBody ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          Body (optional)
        </button>
        {showBody && (
          <div className="mt-2">
            <Textarea
              value={commit.body || ''}
              onChange={e => onChange({ ...commit, body: e.target.value || undefined })}
              placeholder="Explain what and why (not how)..."
              className="font-mono text-xs min-h-[80px] resize-y"
            />
            <p className="text-[10px] text-muted-foreground mt-1">Wrap at 72 characters per line</p>
          </div>
        )}
      </div>

      {/* Footer (collapsible) */}
      <div>
        <button
          type="button"
          onClick={() => setShowFooter(!showFooter)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {showFooter ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          Footer (optional)
        </button>
        {showFooter && (
          <div className="mt-2">
            <Input
              value={commit.footer || ''}
              onChange={e => onChange({ ...commit, footer: e.target.value || undefined })}
              placeholder="Closes #123, BREAKING CHANGE: ..."
              className="font-mono text-xs"
            />
          </div>
        )}
      </div>

      {/* Files included */}
      {commit.files.length > 0 && (
        <div className="pt-2 border-t">
          <div className="text-xs text-muted-foreground">Files: {commit.files.length}</div>
          <div className="text-[10px] text-muted-foreground font-mono mt-1 max-h-16 overflow-y-auto">
            {commit.files.join(', ')}
          </div>
        </div>
      )}
    </div>
  )
}

export function CommitMessageEditor({
  commits,
  onChange,
  suggestion,
  onRegenerate,
  isRegenerating,
  className,
}: CommitMessageEditorProps) {
  // Update individual commit
  const updateCommit = (index: number, updated: CommitMessage) => {
    const newCommits = [...commits]
    newCommits[index] = updated
    onChange(newCommits)
  }

  // Show suggestion reasoning if available
  const reasoning = suggestion?.reasoning

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Commit Message</Label>
        {onRegenerate && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRegenerate}
            disabled={isRegenerating}
            className="h-7 text-xs"
          >
            <RefreshCw className={cn('h-3 w-3 mr-1', isRegenerating && 'animate-spin')} />
            Regenerate
          </Button>
        )}
      </div>

      {reasoning && (
        <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
          <span className="font-medium">Claude's reasoning:</span> {reasoning}
        </div>
      )}

      <div className="space-y-2">
        {commits.map((commit, index) => (
          <SingleCommitEditor
            key={index}
            commit={commit}
            onChange={updated => updateCommit(index, updated)}
            index={index}
            total={commits.length}
          />
        ))}
      </div>
    </div>
  )
}

export default CommitMessageEditor
