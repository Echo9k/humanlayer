# Commit Functionality Design

## Overview

Design for a Claude-powered commit feature in the HumanLayer WUI that generates intelligent commit messages and optionally separates changes into branches and/or multiple commits.

## User Experience Flow

```
User Action → Open Commit Dialog (Ctrl+K or button)
    ↓
System fetches git status for working directory
    ↓
Claude analyzes changes and suggests:
  - Single commit (simple changes)
  - Multiple commits (logically separable changes)
  - New branch (feature work, large refactors)
    ↓
User reviews/edits commit message(s)
    ↓
User toggles "Auto-archive conversation" checkbox
    ↓
User confirms → Changes committed
    ↓
If auto-archive enabled → Session archived
```

## Architecture

### 1. New Components

#### CommitDialog Component
**Location**: `humanlayer-wui/src/components/CommitDialog.tsx`

```typescript
interface CommitDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sessionId: string
  workingDir: string
}

interface CommitSuggestion {
  type: 'single' | 'multiple' | 'branch'
  branchName?: string
  commits: CommitMessage[]
  reasoning: string
}

interface CommitMessage {
  subject: string      // ~50 chars, imperative mood, capitalized
  body?: string        // Wrapped at 72 chars, explains what & why
  footer?: string      // Issue refs, breaking changes
  files: string[]      // Files included in this commit
}
```

**Features**:
- Shows current git status (staged/unstaged/untracked files)
- Claude-generated commit message suggestions
- Editable commit messages with live preview
- Multiple commit support with drag-to-reorder
- Branch creation option
- Auto-archive checkbox (persisted to preferences)
- Disabled state when session is executing

#### GitStatusPanel Component
**Location**: `humanlayer-wui/src/components/internal/CommitDialog/GitStatusPanel.tsx`

Shows:
- Staged changes (green)
- Unstaged modifications (yellow)
- Untracked files (red)
- File diff preview on hover

### 2. New Daemon Endpoints

#### GET /api/v1/sessions/{session_id}/git/status
Returns git status for the session's working directory.

```typescript
interface GitStatusResponse {
  staged: GitFile[]
  unstaged: GitFile[]
  untracked: GitFile[]
  branch: string
  hasChanges: boolean
}

interface GitFile {
  path: string
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  diff?: string  // Optional truncated diff
}
```

#### POST /api/v1/sessions/{session_id}/git/generate-commit-message
Uses Claude to analyze changes and generate commit message suggestions.

```typescript
interface GenerateCommitMessageRequest {
  includeUntracked?: boolean
  context?: string  // Optional context from conversation
}

interface GenerateCommitMessageResponse {
  suggestion: CommitSuggestion
  gitContext: {
    recentCommits: string[]  // Last 5 commit subjects for style matching
    changedFileCount: number
    additionsCount: number
    deletionsCount: number
  }
}
```

#### POST /api/v1/sessions/{session_id}/git/commit
Executes the commit(s).

```typescript
interface CommitRequest {
  commits: CommitMessage[]
  createBranch?: string
  stageUntracked?: boolean
}

interface CommitResponse {
  success: boolean
  commitHashes: string[]
  error?: string
}
```

### 3. Preferences

**New preference keys** in `lib/preferences.ts`:

```typescript
// Commit dialog preferences
export const COMMIT_AUTO_ARCHIVE_KEY = 'commit-auto-archive-session'

export const getCommitAutoArchivePreference = (): boolean => {
  const stored = localStorage.getItem(COMMIT_AUTO_ARCHIVE_KEY)
  return stored === 'true' // Default to false
}

export const setCommitAutoArchivePreference = (value: boolean): void => {
  localStorage.setItem(COMMIT_AUTO_ARCHIVE_KEY, String(value))
}
```

### 4. Daemon Client Methods

**New methods** in `lib/daemon/http-client.ts`:

```typescript
// Git operations
async getGitStatus(sessionId: string): Promise<GitStatusResponse> {
  await this.ensureConnected()
  return await this.client!.getGitStatus(sessionId)
}

async generateCommitMessage(
  sessionId: string,
  request: GenerateCommitMessageRequest
): Promise<GenerateCommitMessageResponse> {
  await this.ensureConnected()
  return await this.client!.generateCommitMessage(sessionId, request)
}

async commitChanges(
  sessionId: string,
  request: CommitRequest
): Promise<CommitResponse> {
  await this.ensureConnected()
  return await this.client!.commitChanges(sessionId, request)
}
```

### 5. Zustand Store Extensions

```typescript
// In AppStore.ts
interface CommitState {
  commitDialogOpen: boolean
  commitSuggestion: CommitSuggestion | null
  isGeneratingCommitMessage: boolean
  isCommitting: boolean
  setCommitDialogOpen: (open: boolean) => void
  generateCommitMessage: (sessionId: string, context?: string) => Promise<void>
  executeCommit: (sessionId: string, request: CommitRequest, autoArchive: boolean) => Promise<boolean>
}
```

## UI Design

### Commit Dialog Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Commit Changes                                         [X] │
│─────────────────────────────────────────────────────────────│
│  Working Directory: /path/to/project                        │
│  Branch: main                                               │
│─────────────────────────────────────────────────────────────│
│                                                             │
│  Changes to commit:                                         │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ ● src/components/Feature.tsx  (modified)     [diff]  │ │
│  │ ● src/utils/helper.ts         (added)        [diff]  │ │
│  │ ○ .env.example                (untracked)    [add]   │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  Claude's suggestion:                                       │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ ◉ Single commit (recommended)                         │ │
│  │ ○ Multiple commits (2 logical groups detected)        │ │
│  │ ○ Create feature branch                               │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  Commit Message:                                            │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ feat(components): Add user profile feature            │ │
│  │                                                       │ │
│  │ Implement profile page with avatar upload and         │ │
│  │ settings management. Adds helper utilities for        │ │
│  │ image processing.                                     │ │
│  │                                                       │ │
│  │ Closes #123                                           │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  [Regenerate]  Character count: 48/50 (subject)            │
│                                                             │
│─────────────────────────────────────────────────────────────│
│  ☑ Auto-archive conversation after commit                   │
│                                                             │
│  [Cancel]                                    [Commit] (⌘⏎)  │
└─────────────────────────────────────────────────────────────┘
```

### States

1. **Loading**: Spinner while fetching git status
2. **No Changes**: "No changes to commit" message
3. **Generating**: Skeleton loader while Claude generates message
4. **Ready**: Full UI with editable commit message
5. **Committing**: Progress indicator, buttons disabled
6. **Error**: Error toast with retry option
7. **Session Executing**: Dialog disabled with message "Cannot commit while session is executing"

## Leveraging Conversation Context

The key differentiator of this feature is using the AI's session context to generate commit messages that understand *what was done and why*, not just *what files changed*.

### Available Context Sources

The session stores rich context that can inform commit messages:

| Source | What It Contains | Value for Commits |
|--------|------------------|-------------------|
| **Session Query** | Original user request | Intent & purpose |
| **Session Summary** | AI-generated summary | High-level overview |
| **User Messages** | User feedback, corrections | Refinements & decisions |
| **Assistant Messages** | Explanations of actions | Reasoning & approach |
| **Tool Calls** | Files read/written/edited, bash commands | Concrete changes |
| **Thinking Blocks** | Claude's reasoning process | Deep context |

### Context Extraction Strategy

```typescript
interface ConversationContext {
  // Primary intent from session
  originalQuery: string           // "Add dark mode toggle"
  sessionSummary?: string         // AI-generated summary if available

  // Extracted from conversation events
  userIntents: string[]           // User messages summarized
  keyDecisions: string[]          // Extracted from assistant explanations
  filesModified: FileAction[]     // From Edit/Write tool calls
  issueReferences: string[]       // Extracted issue/ticket mentions (#123, PROJ-456)

  // Inferred metadata
  changeType: 'feature' | 'fix' | 'refactor' | 'docs' | 'chore'
  scope?: string                  // Inferred from file paths
}

interface FileAction {
  path: string
  action: 'created' | 'modified' | 'deleted'
  purpose?: string  // From assistant explanation near the tool call
}
```

### Context Extraction Implementation

```typescript
// In humanlayer-wui/src/hooks/useCommitContext.ts

export function extractCommitContext(
  session: Session,
  conversation: ConversationEvent[]
): ConversationContext {

  // 1. Get primary intent
  const originalQuery = session.query || ''
  const sessionSummary = session.summary

  // 2. Extract user intents (filter to key decision points)
  const userMessages = conversation
    .filter(e => e.eventType === 'message' && e.role === 'user')
    .map(e => e.content)
    .filter(Boolean)

  // 3. Extract file modifications from tool calls
  const fileActions = conversation
    .filter(e => e.eventType === 'tool_call' &&
      ['Edit', 'Write', 'MultiEdit'].includes(e.toolName || ''))
    .map(e => {
      const input = JSON.parse(e.toolInputJson || '{}')
      return {
        path: input.file_path || input.filePath,
        action: e.toolName === 'Write' ? 'created' : 'modified',
        purpose: findNearestAssistantExplanation(conversation, e.sequence)
      }
    })

  // 4. Extract issue references from all text
  const allText = [originalQuery, ...userMessages].join(' ')
  const issueReferences = extractIssueReferences(allText)

  // 5. Infer change type from query and actions
  const changeType = inferChangeType(originalQuery, fileActions)

  // 6. Infer scope from file paths
  const scope = inferScope(fileActions.map(f => f.path))

  return {
    originalQuery,
    sessionSummary,
    userIntents: summarizeUserIntents(userMessages),
    keyDecisions: extractKeyDecisions(conversation),
    filesModified: fileActions,
    issueReferences,
    changeType,
    scope
  }
}

function extractIssueReferences(text: string): string[] {
  // Match GitHub issues (#123), Jira (PROJ-456), Linear (ENG-789)
  const patterns = [
    /#(\d+)/g,                           // GitHub: #123
    /\b([A-Z]+-\d+)\b/g,                 // Jira/Linear: PROJ-123
    /(?:closes?|fixes?|resolves?)\s+#?(\d+)/gi  // "Closes #123"
  ]
  const refs = new Set<string>()
  for (const pattern of patterns) {
    const matches = text.matchAll(pattern)
    for (const match of matches) {
      refs.add(match[0])
    }
  }
  return [...refs]
}

function inferChangeType(
  query: string,
  files: FileAction[]
): 'feature' | 'fix' | 'refactor' | 'docs' | 'chore' {
  const lowerQuery = query.toLowerCase()

  if (/\b(fix|bug|issue|error|crash|broken)\b/.test(lowerQuery)) return 'fix'
  if (/\b(refactor|cleanup|reorganize|restructure)\b/.test(lowerQuery)) return 'refactor'
  if (/\b(doc|readme|comment|explain)\b/.test(lowerQuery)) return 'docs'
  if (/\b(add|implement|create|new|feature)\b/.test(lowerQuery)) return 'feature'

  // Check file types
  const hasOnlyDocs = files.every(f =>
    f.path.endsWith('.md') || f.path.includes('/docs/'))
  if (hasOnlyDocs) return 'docs'

  return 'feature' // Default
}

function inferScope(filePaths: string[]): string | undefined {
  if (filePaths.length === 0) return undefined

  // Find common directory prefix
  const dirs = filePaths.map(p => p.split('/').slice(0, -1))
  if (dirs.length === 1) {
    return dirs[0][dirs[0].length - 1] // Last directory component
  }

  // Find common ancestor
  const commonParts: string[] = []
  for (let i = 0; i < dirs[0].length; i++) {
    const part = dirs[0][i]
    if (dirs.every(d => d[i] === part)) {
      commonParts.push(part)
    } else break
  }

  // Return last meaningful component
  const meaningfulParts = commonParts.filter(p =>
    !['src', 'lib', 'app', 'internal'].includes(p))
  return meaningfulParts[meaningfulParts.length - 1]
}
```

### Example: Context-Aware vs Context-Blind

**Scenario**: User asked Claude to "fix the auth bug where users get logged out after refresh"

**Without Context** (traditional git diff analysis):
```
fix: Update auth.ts and session.ts

Modified authentication logic and session handling.
```

**With Conversation Context**:
```
fix(auth): Persist session token across page refresh

Store JWT in localStorage instead of memory-only state.
Session was being lost on refresh because tokens weren't
persisted to durable storage.

Fixes #847
```

The difference is stark - with context, we capture:
- **What**: Persist session token
- **Why**: Fix logout-on-refresh bug
- **How** (briefly): localStorage instead of memory
- **Reference**: Issue #847 (extracted from conversation)

## Commit Message Generation Logic

### Claude Prompt Template

```
Generate a commit message for the following changes. You have access to the full
conversation context from the AI coding session that produced these changes.

## Session Intent
Original Request: {originalQuery}
Session Summary: {sessionSummary}

## Key Decisions Made
{keyDecisions}

## User Feedback During Session
{userIntents}

## Files Changed
{filesModified}
- Each file includes the purpose extracted from the assistant's explanation

## Issue References Found
{issueReferences}

## Git Diff Summary
Branch: {branch}
Changed files: {fileCount}
Additions: {additions} lines
Deletions: {deletions} lines

{truncatedDiff}

## Recent Commit Style (for consistency)
{recentCommits}

## Instructions
Using the conversation context above, generate a commit message that captures
not just WHAT changed, but WHY it changed and WHAT PROBLEM it solves.

1. The subject line should:
   - Use type prefix: {suggestedType}
   - Use scope: {suggestedScope} (if appropriate)
   - Be ~50 chars, imperative mood, capitalized, no period
   - Reflect the user's original intent

2. The body should:
   - Explain the problem that was solved (from user's request)
   - Briefly describe the approach (from assistant's explanation)
   - Be wrapped at 72 chars

3. The footer should:
   - Include issue references: {issueReferences}
   - Note breaking changes if applicable

4. Determine if changes should be:
   - Single commit: Related changes with single intent
   - Multiple commits: Multiple distinct tasks in conversation
   - New branch: Major feature or breaking changes

Respond with JSON:
{
  "type": "single" | "multiple" | "branch",
  "branchName": "optional-branch-name",
  "reasoning": "Brief explanation of your choice",
  "commits": [
    {
      "subject": "type(scope): description",
      "body": "Problem solved and approach taken...",
      "footer": "Closes #123",
      "files": ["path/to/file1.ts"]
    }
  ]
}
```

### Context-Aware Commit Examples

**Example 1: Bug Fix**
```
Session Query: "The login button doesn't work on mobile"
Session Summary: "Fixed mobile touch event handling for login button"
Files Modified: src/components/LoginButton.tsx
Issue Found: #234

Generated Commit:
───────────────────────────────────────────────────────────
fix(auth): Enable login button touch events on mobile

The login button was unresponsive on mobile devices because
onClick events weren't firing on touch screens. Added proper
touch event handlers alongside click events.

Fixes #234
───────────────────────────────────────────────────────────
```

**Example 2: Feature with Multiple Changes**
```
Session Query: "Add user settings page with theme toggle"
Session Summary: "Implemented settings page with dark mode toggle and profile editing"
User Messages: ["can you also add profile picture upload?", "make the theme persist"]
Files Modified:
  - src/pages/Settings.tsx (created)
  - src/components/ThemeToggle.tsx (created)
  - src/components/AvatarUpload.tsx (created)
  - src/contexts/ThemeContext.tsx (modified)
  - src/lib/storage.ts (modified)

Generated Suggestion: Multiple commits
───────────────────────────────────────────────────────────
Commit 1:
feat(settings): Add settings page with theme toggle

Create user settings page with dark/light theme switching.
Theme preference persists to localStorage.

Commit 2:
feat(settings): Add profile picture upload

Allow users to upload and crop profile pictures.
Images are resized to 256x256 before storage.
───────────────────────────────────────────────────────────
```

**Example 3: Refactoring**
```
Session Query: "The API calls are duplicated everywhere, can you clean this up?"
Session Summary: "Consolidated API calls into centralized service layer"
Files Modified:
  - src/services/api.ts (created)
  - src/pages/Dashboard.tsx (modified)
  - src/pages/Profile.tsx (modified)
  - src/pages/Orders.tsx (modified)
  - src/utils/fetch.ts (deleted)

Generated Commit:
───────────────────────────────────────────────────────────
refactor(api): Consolidate API calls into service layer

Extracted duplicated fetch logic from page components into
a centralized ApiService. Provides consistent error handling
and request/response interceptors.

- Created src/services/api.ts with typed methods
- Removed inline fetch calls from Dashboard, Profile, Orders
- Deleted unused src/utils/fetch.ts
───────────────────────────────────────────────────────────
```

### Intelligent Splitting Heuristics

Claude should consider splitting commits when:
- Changes span multiple subsystems (e.g., frontend + backend)
- Mix of refactoring and new features
- Unrelated bug fixes bundled with features
- Test changes could be separate from implementation

Branch creation suggested when:
- Large feature additions (>10 files)
- Breaking changes detected
- Experimental or draft work
- Working on main/master branch with significant changes

## Hotkeys

| Key | Action |
|-----|--------|
| `Ctrl+K` or `Cmd+K` | Open commit dialog from active session |
| `Escape` | Close dialog |
| `Ctrl+Enter` or `Cmd+Enter` | Confirm commit |
| `Ctrl+R` or `Cmd+R` | Regenerate commit message |

## Error Handling

1. **No git repository**: Show error "Not a git repository"
2. **Nothing to commit**: Show info "Working tree clean"
3. **Merge conflicts**: Block commit, show "Resolve conflicts first"
4. **Generation failure**: Show error with retry button
5. **Commit failure**: Show git error message, allow retry
6. **Session executing**: Disable entire dialog

## Integration Points

### With Active Session
- Button in session detail header (visible when session has workingDir)
- Keyboard shortcut `Ctrl+K` when session is focused
- Uses session's workingDir for git operations

### With Session Archive
- After successful commit, if auto-archive enabled:
  ```typescript
  if (autoArchive) {
    await daemonClient.archiveSession({ session_id: sessionId, archived: true })
    toast.success('Session archived')
  }
  ```

### With Conversation Context
The conversation is already loaded in the WUI's Zustand store (`activeSessionDetail.conversation`).

**Context extraction options**:

| Option | Pros | Cons |
|--------|------|------|
| **WUI-side extraction** | Fast, no extra API call, immediate | Limited AI processing |
| **Daemon-side extraction** | Can use Claude for summarization | Extra latency |
| **Hybrid** | WUI extracts, daemon enhances | Best of both |

**Recommended: Hybrid Approach**

1. **WUI extracts structured data** (fast, synchronous):
   - Original query from session
   - Session summary (already available)
   - File paths from tool calls
   - Issue references (regex)
   - Inferred type/scope

2. **Daemon uses context for generation** (async with Claude):
   - Receives extracted context from WUI
   - Combines with git diff analysis
   - Generates commit message using Claude
   - Returns structured response

```typescript
// WUI prepares context
const context = extractCommitContext(session, conversation)

// Daemon generates message using context + git info
const response = await daemonClient.generateCommitMessage(sessionId, {
  conversationContext: context,
  includeUntracked: true
})
```

## Implementation Phases

### Phase 1: Basic Commit
- Git status display
- Single commit message generation
- Manual message editing
- Basic commit execution

### Phase 2: Smart Suggestions
- Multiple commit detection
- Branch creation option
- Auto-archive integration
- Conversation context extraction

### Phase 3: Polish
- Diff preview
- Drag-to-reorder commits
- Commit history preview
- Keyboard shortcuts

## Files to Create/Modify

### New Files
```
humanlayer-wui/src/components/CommitDialog.tsx
humanlayer-wui/src/components/internal/CommitDialog/
  ├── GitStatusPanel.tsx
  ├── CommitMessageEditor.tsx
  ├── CommitSuggestionPicker.tsx
  └── types.ts
humanlayer-wui/src/hooks/useCommit.ts
```

### Modified Files
```
humanlayer-wui/src/lib/preferences.ts           # Add commit preferences
humanlayer-wui/src/lib/daemon/http-client.ts    # Add git methods
humanlayer-wui/src/lib/daemon/types.ts          # Add git types
humanlayer-wui/src/AppStore.ts                  # Add commit state
humanlayer-wui/src/hooks/hotkeys/scopes.ts      # Add COMMIT_DIALOG scope
humanlayer-wui/src/components/internal/SessionDetail/components/ActiveSession.tsx
                                                # Add commit button
```

### Daemon Changes (hld)
```
hld/internal/api/git_handlers.go                # New git endpoints
hld/internal/service/git_service.go             # Git operations
hld/internal/service/commit_message_generator.go # Claude integration
```

## Security Considerations

1. **Path validation**: Ensure git operations only within session's workingDir
2. **File access**: Don't expose sensitive files in diffs (.env, credentials)
3. **Command injection**: Sanitize all git command arguments
4. **API key exposure**: Never include API keys in commit messages

## Telemetry Events

```typescript
POSTHOG_EVENTS = {
  // ... existing events
  COMMIT_DIALOG_OPENED: 'commit_dialog_opened',
  COMMIT_MESSAGE_GENERATED: 'commit_message_generated',
  COMMIT_MESSAGE_REGENERATED: 'commit_message_regenerated',
  COMMIT_EXECUTED: 'commit_executed',
  COMMIT_WITH_AUTO_ARCHIVE: 'commit_with_auto_archive',
}
```

## Testing Strategy

### Unit Tests
- Commit message parsing and validation
- Preference persistence
- Store state transitions

### Integration Tests
- Git status fetching
- Commit execution
- Archive after commit flow

### E2E Tests
- Full commit flow from UI
- Multiple commits scenario
- Branch creation scenario

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              WUI (React)                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────┐     ┌──────────────────────────────────────────────┐  │
│  │ Zustand Store   │     │ useCommitContext Hook                        │  │
│  │                 │────▶│                                              │  │
│  │ activeSession   │     │  extractCommitContext(session, conversation) │  │
│  │ .session        │     │    ├── originalQuery                         │  │
│  │ .conversation[] │     │    ├── sessionSummary                        │  │
│  │                 │     │    ├── userIntents[]                         │  │
│  └─────────────────┘     │    ├── keyDecisions[]                        │  │
│                          │    ├── filesModified[]                       │  │
│                          │    ├── issueReferences[]                     │  │
│                          │    ├── changeType                            │  │
│                          │    └── scope                                 │  │
│                          └──────────────────────────────────────────────┘  │
│                                        │                                    │
│                                        ▼                                    │
│                          ┌──────────────────────────────────────────────┐  │
│                          │ CommitDialog Component                       │  │
│                          │                                              │  │
│                          │  1. Fetch git status                         │  │
│                          │  2. Extract context from store               │  │
│                          │  3. Request commit message generation        │  │
│                          │  4. Display/edit message                     │  │
│                          │  5. Execute commit                           │  │
│                          │  6. Optionally archive session               │  │
│                          └──────────────────────────────────────────────┘  │
│                                        │                                    │
└────────────────────────────────────────┼────────────────────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Daemon (hld)                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ POST /api/v1/sessions/{id}/git/generate-commit-message               │  │
│  │                                                                      │  │
│  │  Input:                                                              │  │
│  │  {                                                                   │  │
│  │    conversationContext: {                                            │  │
│  │      originalQuery: "Fix auth bug #847",                             │  │
│  │      sessionSummary: "Fixed session persistence...",                 │  │
│  │      filesModified: [{path: "auth.ts", purpose: "Store JWT..."}],    │  │
│  │      issueReferences: ["#847"],                                      │  │
│  │      changeType: "fix",                                              │  │
│  │      scope: "auth"                                                   │  │
│  │    },                                                                │  │
│  │    includeUntracked: false                                           │  │
│  │  }                                                                   │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                        │                                    │
│                                        ▼                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Commit Message Generator Service                                     │  │
│  │                                                                      │  │
│  │  1. Run `git status` and `git diff` in workingDir                    │  │
│  │  2. Get recent commits for style matching                            │  │
│  │  3. Build prompt with context + git info                             │  │
│  │  4. Call Claude API                                                  │  │
│  │  5. Parse response into CommitSuggestion                             │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                        │                                    │
│                                        ▼                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Output:                                                              │  │
│  │ {                                                                    │  │
│  │   suggestion: {                                                      │  │
│  │     type: "single",                                                  │  │
│  │     commits: [{                                                      │  │
│  │       subject: "fix(auth): Persist session token across refresh",   │  │
│  │       body: "Store JWT in localStorage instead of...",              │  │
│  │       footer: "Fixes #847",                                          │  │
│  │       files: ["src/auth.ts", "src/session.ts"]                       │  │
│  │     }],                                                              │  │
│  │     reasoning: "Single cohesive fix for session persistence"        │  │
│  │   },                                                                 │  │
│  │   gitContext: { changedFileCount: 2, additions: 15, deletions: 8 }   │  │
│  │ }                                                                    │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Summary

This design leverages the unique advantage of having full conversation context:

1. **WUI has the context**: Session query, summary, and full conversation events are already in Zustand
2. **Extract structured data**: Parse events to find intents, decisions, file actions, issue refs
3. **Send to daemon**: Context travels with the generate request
4. **Claude uses context**: Prompt includes both git diff AND conversation understanding
5. **Result**: Commit messages that capture *why*, not just *what*

The key insight is that traditional commit message generators only see the diff. We see the entire conversation - the user's intent, Claude's reasoning, the decisions made along the way. This produces dramatically better commit messages.
