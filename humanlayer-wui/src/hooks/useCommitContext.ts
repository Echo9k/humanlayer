import { useMemo } from 'react'
import type { ConversationEvent } from '@humanlayer/hld-sdk'
import type { Session, ConversationContext, FileAction, CommitChangeType } from '@/lib/daemon/types'
import { ConversationEventType } from '@/lib/daemon/types'

/**
 * Extracts commit context from a session and its conversation events.
 * This context is used to generate intelligent, context-aware commit messages.
 */
export function extractCommitContext(
  session: Session,
  conversation: ConversationEvent[],
): ConversationContext {
  // 1. Get primary intent
  const originalQuery = session.query || ''
  const sessionSummary = session.summary

  // 2. Extract user messages
  const userMessages = conversation
    .filter(e => e.eventType === ConversationEventType.Message && e.role === 'user')
    .map(e => e.content)
    .filter((content): content is string => Boolean(content))

  // 3. Extract file modifications from tool calls
  const fileActions = extractFileActions(conversation)

  // 4. Extract issue references from all text
  const allText = [originalQuery, sessionSummary, ...userMessages].filter(Boolean).join(' ')
  const issueReferences = extractIssueReferences(allText)

  // 5. Infer change type from query and actions
  const changeType = inferChangeType(originalQuery, fileActions)

  // 6. Infer scope from file paths
  const scope = inferScope(fileActions.map(f => f.path))

  // 7. Extract user intents (summarized user messages)
  const userIntents = summarizeUserIntents(userMessages)

  // 8. Extract key decisions from assistant explanations
  const keyDecisions = extractKeyDecisions(conversation)

  return {
    originalQuery,
    sessionSummary,
    userIntents,
    keyDecisions,
    filesModified: fileActions,
    issueReferences,
    changeType,
    scope,
  }
}

/**
 * Hook to extract commit context from the current active session.
 */
export function useCommitContext(
  session: Session | null,
  conversation: ConversationEvent[],
): ConversationContext | null {
  return useMemo(() => {
    if (!session) return null
    return extractCommitContext(session, conversation)
  }, [session, conversation])
}

/**
 * Extract file actions from Edit, Write, and MultiEdit tool calls.
 */
function extractFileActions(conversation: ConversationEvent[]): FileAction[] {
  const fileActions: FileAction[] = []
  const seenPaths = new Set<string>()

  // Get all tool calls that modify files
  const modifyingTools = conversation.filter(
    e =>
      e.eventType === ConversationEventType.ToolCall &&
      ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(e.toolName || ''),
  )

  for (const event of modifyingTools) {
    try {
      const input = JSON.parse(event.toolInputJson || '{}')
      const path = input.file_path || input.filePath || input.notebook_path || input.notebookPath

      if (path && !seenPaths.has(path)) {
        seenPaths.add(path)

        // Determine action type
        let action: 'created' | 'modified' | 'deleted' = 'modified'
        if (event.toolName === 'Write') {
          action = 'created'
        }

        // Find nearest assistant explanation for purpose
        const purpose = findNearestAssistantExplanation(conversation, event.sequence || 0)

        fileActions.push({ path, action, purpose })
      }
    } catch {
      // Skip malformed tool input
    }
  }

  return fileActions
}

/**
 * Find the nearest assistant message before a given sequence number
 * to understand the purpose of an action.
 */
function findNearestAssistantExplanation(
  conversation: ConversationEvent[],
  sequence: number,
): string | undefined {
  // Look backwards from the sequence to find the most recent assistant message
  const priorMessages = conversation
    .filter(
      e =>
        e.eventType === ConversationEventType.Message &&
        e.role === 'assistant' &&
        (e.sequence || 0) < sequence,
    )
    .sort((a, b) => (b.sequence || 0) - (a.sequence || 0))

  if (priorMessages.length === 0) return undefined

  const content = priorMessages[0].content
  if (!content) return undefined

  // Extract first meaningful sentence (truncate at 150 chars)
  const firstSentence = content.split(/[.!?]\s/)[0]
  if (firstSentence.length > 150) {
    return firstSentence.slice(0, 147) + '...'
  }
  return firstSentence
}

/**
 * Extract issue references from text (GitHub, Jira, Linear, etc.)
 */
function extractIssueReferences(text: string): string[] {
  const refs = new Set<string>()

  // GitHub issues: #123
  const githubMatches = text.matchAll(/#(\d+)/g)
  for (const match of githubMatches) {
    refs.add(`#${match[1]}`)
  }

  // Jira/Linear style: PROJ-123, ENG-456
  const jiraMatches = text.matchAll(/\b([A-Z]{2,10}-\d+)\b/g)
  for (const match of jiraMatches) {
    refs.add(match[1])
  }

  // Explicit closes/fixes/resolves
  const closesMatches = text.matchAll(/(?:closes?|fixes?|resolves?)\s+#?(\d+)/gi)
  for (const match of closesMatches) {
    refs.add(`#${match[1]}`)
  }

  return [...refs]
}

/**
 * Infer commit change type from query text and file actions.
 */
function inferChangeType(query: string, files: FileAction[]): CommitChangeType {
  const lowerQuery = query.toLowerCase()

  // Check for explicit type keywords
  if (/\b(fix|bug|issue|error|crash|broken|problem)\b/.test(lowerQuery)) return 'fix'
  if (/\b(refactor|cleanup|clean up|reorganize|restructure|simplify)\b/.test(lowerQuery))
    return 'refactor'
  if (/\b(doc|docs|readme|comment|explain|documentation)\b/.test(lowerQuery)) return 'docs'
  if (/\b(test|spec|testing|coverage)\b/.test(lowerQuery)) return 'test'
  if (/\b(style|format|lint|prettier|eslint)\b/.test(lowerQuery)) return 'style'
  if (/\b(chore|update|upgrade|deps|dependencies|version)\b/.test(lowerQuery)) return 'chore'
  if (/\b(add|implement|create|new|feature|build)\b/.test(lowerQuery)) return 'feature'

  // Check file types for hints
  const allPaths = files.map(f => f.path)

  const hasOnlyDocs = allPaths.every(
    p => p.endsWith('.md') || p.endsWith('.mdx') || p.includes('/docs/'),
  )
  if (hasOnlyDocs && allPaths.length > 0) return 'docs'

  const hasOnlyTests = allPaths.every(
    p =>
      p.includes('.test.') || p.includes('.spec.') || p.includes('__tests__') || p.includes('/test/'),
  )
  if (hasOnlyTests && allPaths.length > 0) return 'test'

  return 'feature' // Default
}

/**
 * Infer scope from file paths by finding common directory.
 */
function inferScope(filePaths: string[]): string | undefined {
  if (filePaths.length === 0) return undefined

  // Get directory parts for each file
  const dirs = filePaths.map(p => p.split('/').slice(0, -1))
  if (dirs.length === 0) return undefined

  if (dirs.length === 1) {
    // Single file - use last meaningful directory
    const meaningfulParts = dirs[0].filter(p => !['src', 'lib', 'app', 'internal'].includes(p))
    return meaningfulParts[meaningfulParts.length - 1]
  }

  // Find common ancestor directory
  const firstDir = dirs[0]
  const commonParts: string[] = []

  for (let i = 0; i < firstDir.length; i++) {
    const part = firstDir[i]
    if (dirs.every(d => d[i] === part)) {
      commonParts.push(part)
    } else {
      break
    }
  }

  // Return last meaningful component
  const meaningfulParts = commonParts.filter(p => !['src', 'lib', 'app', 'internal'].includes(p))
  return meaningfulParts[meaningfulParts.length - 1]
}

/**
 * Summarize user messages into key intents.
 */
function summarizeUserIntents(userMessages: string[]): string[] {
  // Filter out very short messages and duplicates
  const meaningful = userMessages
    .filter(m => m.length > 10)
    .map(m => {
      // Truncate long messages
      if (m.length > 200) {
        return m.slice(0, 197) + '...'
      }
      return m
    })

  // Take the first few meaningful messages (avoid overwhelming context)
  return meaningful.slice(0, 5)
}

/**
 * Extract key decisions from assistant messages.
 * Looks for explanatory patterns in assistant responses.
 */
function extractKeyDecisions(conversation: ConversationEvent[]): string[] {
  const decisions: string[] = []

  const assistantMessages = conversation
    .filter(e => e.eventType === ConversationEventType.Message && e.role === 'assistant')
    .map(e => e.content)
    .filter((content): content is string => Boolean(content))

  for (const content of assistantMessages) {
    // Look for decision patterns
    const patterns = [
      /I(?:'ll| will) (.*?)(?:\.|$)/gi,
      /(?:decided|choosing|using) (.*?)(?:\.|$)/gi,
      /(?:instead of|rather than) (.*?)(?:,|\.)/gi,
      /(?:this approach|this solution) (.*?)(?:\.|$)/gi,
    ]

    for (const pattern of patterns) {
      const matches = content.matchAll(pattern)
      for (const match of matches) {
        const decision = match[1]?.trim()
        if (decision && decision.length > 10 && decision.length < 150) {
          decisions.push(decision)
        }
      }
    }
  }

  // Deduplicate and limit
  return [...new Set(decisions)].slice(0, 5)
}

export default useCommitContext
