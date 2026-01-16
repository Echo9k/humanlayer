import type {
  GitStatusResponse,
  CommitSuggestion,
  CommitMessage,
  ConversationContext,
} from '@/lib/daemon/types'

export type CommitDialogState =
  | 'loading' // Fetching git status
  | 'no-changes' // No changes to commit
  | 'generating' // Claude is generating message
  | 'ready' // Ready to edit and commit
  | 'committing' // Commit in progress
  | 'error' // Error occurred
  | 'session-executing' // Session is actively executing

export interface CommitDialogData {
  state: CommitDialogState
  gitStatus: GitStatusResponse | null
  suggestion: CommitSuggestion | null
  editedCommits: CommitMessage[]
  error: string | null
  context: ConversationContext | null
}

export interface GitStatusPanelProps {
  gitStatus: GitStatusResponse
  onToggleFile?: (path: string) => void
  selectedFiles?: Set<string>
}

export interface CommitMessageEditorProps {
  commits: CommitMessage[]
  onChange: (commits: CommitMessage[]) => void
  suggestion: CommitSuggestion | null
  onRegenerate?: () => void
  isRegenerating?: boolean
}

export interface CommitSuggestionPickerProps {
  suggestion: CommitSuggestion
  selectedType: CommitSuggestion['type']
  onTypeChange: (type: CommitSuggestion['type']) => void
  branchName: string
  onBranchNameChange: (name: string) => void
}
