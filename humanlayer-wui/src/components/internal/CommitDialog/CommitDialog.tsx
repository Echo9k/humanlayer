import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Loader2, GitCommit, AlertCircle, GitBranch } from 'lucide-react'
import { toast } from 'sonner'

import { useStore } from '@/AppStore'
import { daemonClient } from '@/lib/daemon'
import { HotkeyScopeBoundary } from '@/components/HotkeyScopeBoundary'
import { HOTKEY_SCOPES } from '@/hooks/hotkeys/scopes'
import { useCommitContext } from '@/hooks/useCommitContext'
import { getCommitAutoArchivePreference, setCommitAutoArchivePreference } from '@/lib/preferences'

import type { Session, GitStatusResponse, CommitSuggestion, CommitMessage } from '@/lib/daemon/types'
import type { ConversationEvent } from '@humanlayer/hld-sdk'
import type { CommitDialogState } from './types'

import { GitStatusPanel } from './GitStatusPanel'
import { CommitMessageEditor } from './CommitMessageEditor'

interface CommitDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  session: Session
  conversation: ConversationEvent[]
}

export function CommitDialog({ open, onOpenChange, session, conversation }: CommitDialogProps) {
  // State
  const [dialogState, setDialogState] = useState<CommitDialogState>('loading')
  const [gitStatus, setGitStatus] = useState<GitStatusResponse | null>(null)
  const [suggestion, setSuggestion] = useState<CommitSuggestion | null>(null)
  const [editedCommits, setEditedCommits] = useState<CommitMessage[]>([])
  const [error, setError] = useState<string | null>(null)
  const [autoArchive, setAutoArchive] = useState(() => getCommitAutoArchivePreference())
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [createBranch, setCreateBranch] = useState(false)
  const [branchName, setBranchName] = useState('')

  // Store
  const archiveSession = useStore(state => state.archiveSession)

  // Extract context from conversation
  const context = useCommitContext(session, conversation)

  // Check if session is executing
  const isSessionExecuting = session.status === 'running'

  // Fetch git status when dialog opens
  useEffect(() => {
    if (!open) return

    if (isSessionExecuting) {
      setDialogState('session-executing')
      return
    }

    fetchGitStatus()
  }, [open, session.id, isSessionExecuting])

  const fetchGitStatus = async () => {
    setDialogState('loading')
    setError(null)

    try {
      const status = await daemonClient.getGitStatus(session.id)
      setGitStatus(status)

      if (!status.hasChanges) {
        setDialogState('no-changes')
        return
      }

      // Auto-generate commit message
      await generateCommitMessage(status)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get git status')
      setDialogState('error')
    }
  }

  const generateCommitMessage = async (_status?: GitStatusResponse) => {
    setDialogState('generating')
    setError(null)

    try {
      const response = await daemonClient.generateCommitMessage(session.id, {
        conversationContext: context || undefined,
        includeUntracked: true,
      })

      setSuggestion(response.suggestion)
      setEditedCommits(response.suggestion.commits)

      // Set branch name if suggested
      if (response.suggestion.type === 'branch' && response.suggestion.branchName) {
        setCreateBranch(true)
        setBranchName(response.suggestion.branchName)
      }

      setDialogState('ready')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate commit message')
      setDialogState('error')
    }
  }

  const handleRegenerate = async () => {
    setIsRegenerating(true)
    try {
      await generateCommitMessage(gitStatus || undefined)
    } finally {
      setIsRegenerating(false)
    }
  }

  const handleCommit = async () => {
    if (editedCommits.length === 0) return

    // Validate commits
    const invalidCommit = editedCommits.find(c => !c.subject.trim())
    if (invalidCommit) {
      toast.error('Commit subject is required')
      return
    }

    setDialogState('committing')
    setError(null)

    try {
      const response = await daemonClient.commitChanges(session.id, {
        commits: editedCommits,
        createBranch: createBranch ? branchName : undefined,
        stageUntracked: true,
      })

      if (response.success) {
        const commitCount = response.commitHashes.length
        toast.success(
          `${commitCount} ${commitCount === 1 ? 'commit' : 'commits'} created successfully`,
          {
            description: response.branchCreated ? `On branch: ${response.branchCreated}` : undefined,
          },
        )

        // Archive session if preference is enabled
        if (autoArchive) {
          try {
            await archiveSession(session.id, true)
            toast.success('Session archived')
          } catch (archiveErr) {
            toast.error('Failed to archive session')
          }
        }

        onOpenChange(false)
      } else {
        throw new Error(response.error || 'Commit failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to commit changes')
      setDialogState('ready')
      toast.error('Commit failed', {
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  const handleAutoArchiveChange = (checked: boolean) => {
    setAutoArchive(checked)
    setCommitAutoArchivePreference(checked)
  }

  // Render content based on state
  const renderContent = () => {
    switch (dialogState) {
      case 'loading':
        return (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="mt-4 text-sm text-muted-foreground">Loading git status...</p>
          </div>
        )

      case 'session-executing':
        return (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="h-8 w-8 text-yellow-500" />
            <p className="mt-4 text-sm font-medium">Session is executing</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Cannot commit while the session is actively running.
              <br />
              Wait for the session to complete or interrupt it first.
            </p>
          </div>
        )

      case 'no-changes':
        return (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <GitCommit className="h-8 w-8 text-muted-foreground" />
            <p className="mt-4 text-sm font-medium">Nothing to commit</p>
            <p className="mt-1 text-xs text-muted-foreground">Working tree is clean</p>
          </div>
        )

      case 'generating':
        return (
          <div className="space-y-4">
            {gitStatus && <GitStatusPanel gitStatus={gitStatus} />}
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">Generating commit message...</p>
            </div>
          </div>
        )

      case 'error':
        return (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <p className="mt-4 text-sm font-medium text-red-500">Error</p>
            <p className="mt-1 text-xs text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchGitStatus} className="mt-4">
              Retry
            </Button>
          </div>
        )

      case 'ready':
      case 'committing':
        return (
          <div className="space-y-4">
            {gitStatus && <GitStatusPanel gitStatus={gitStatus} />}

            <CommitMessageEditor
              commits={editedCommits}
              onChange={setEditedCommits}
              suggestion={suggestion}
              onRegenerate={handleRegenerate}
              isRegenerating={isRegenerating}
            />

            {/* Branch creation option */}
            <div className="flex items-center gap-3 pt-2 border-t">
              <Checkbox
                id="create-branch"
                checked={createBranch}
                onCheckedChange={checked => setCreateBranch(checked === true)}
                disabled={isCommitting}
              />
              <div className="flex items-center gap-2 flex-1">
                <Label
                  htmlFor="create-branch"
                  className="text-sm cursor-pointer flex items-center gap-1"
                >
                  <GitBranch className="h-3 w-3" />
                  Create branch
                </Label>
                {createBranch && (
                  <Input
                    value={branchName}
                    onChange={e => setBranchName(e.target.value)}
                    placeholder="feature/my-changes"
                    className="h-7 text-xs flex-1"
                    disabled={isCommitting}
                  />
                )}
              </div>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  const isCommitting = dialogState === 'committing'
  const canCommit =
    !isCommitting &&
    dialogState === 'ready' &&
    editedCommits.length > 0 &&
    editedCommits.every(c => c.subject.trim()) &&
    (!createBranch || branchName.trim())

  return (
    <HotkeyScopeBoundary
      scope={HOTKEY_SCOPES.COMMIT_DIALOG}
      isActive={open}
      rootScopeDisabled={true}
      componentName="CommitDialog"
    >
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm font-medium">
              <GitCommit className="h-4 w-4" />
              Commit Changes
            </DialogTitle>
            {session.workingDir && (
              <p className="text-xs text-muted-foreground font-mono truncate">{session.workingDir}</p>
            )}
          </DialogHeader>

          <div className="py-2">{renderContent()}</div>

          {(dialogState === 'ready' || isCommitting) && (
            <DialogFooter className="flex-col sm:flex-row gap-3">
              <div className="flex items-center gap-2 flex-1">
                <Checkbox
                  id="auto-archive"
                  checked={autoArchive}
                  onCheckedChange={handleAutoArchiveChange}
                  disabled={isCommitting}
                />
                <Label htmlFor="auto-archive" className="text-xs text-muted-foreground cursor-pointer">
                  Archive conversation after commit
                </Label>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCommitting}>
                  Cancel
                </Button>
                <Button onClick={handleCommit} disabled={!canCommit || isCommitting}>
                  {isCommitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Committing...
                    </>
                  ) : (
                    <>
                      <GitCommit className="h-4 w-4 mr-2" />
                      Commit
                    </>
                  )}
                </Button>
              </div>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </HotkeyScopeBoundary>
  )
}

export default CommitDialog
