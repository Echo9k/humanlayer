import { useState, useCallback, useRef } from 'react'
import { Session } from '@/lib/daemon/types'
import { daemonClient } from '@/lib/daemon/client'

export interface EphemeralMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  isLoading?: boolean
}

interface UseEphemeralChatOptions {
  includeRecentEvents?: boolean
  maxEvents?: number
}

// Store messages per session ID so they persist across takeover toggles and session switches
const messagesBySession = new Map<string, EphemeralMessage[]>()

// Debug helper - set to true to enable console logging
const DEBUG_EPHEMERAL = true
const debugLog = (...args: any[]) => {
  if (DEBUG_EPHEMERAL) console.log('[EphemeralChat]', ...args)
}

export function useEphemeralChat(session: Session, options: UseEphemeralChatOptions = {}) {
  // Use a ref to track current session ID for the state update trigger
  const currentSessionRef = useRef(session.id)

  // Get messages for current session (or empty array if none)
  const getMessagesForSession = (sessionId: string) => messagesBySession.get(sessionId) || []

  // Force re-render when messages change
  const [, forceUpdate] = useState({})

  // Get current session's messages
  const messages = getMessagesForSession(session.id)

  debugLog('Hook render', { sessionId: session.id, messageCount: messages.length, mapSize: messagesBySession.size })

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Update ref when session changes
  if (currentSessionRef.current !== session.id) {
    currentSessionRef.current = session.id
    // Clear error when switching sessions
    setError(null)
  }

  const { includeRecentEvents = true, maxEvents = 20 } = options

  // Helper to update messages for a specific session
  const setMessagesForSession = useCallback((sessionId: string, updater: (prev: EphemeralMessage[]) => EphemeralMessage[]) => {
    const current = messagesBySession.get(sessionId) || []
    const updated = updater(current)
    messagesBySession.set(sessionId, updated)
    debugLog('Messages updated', { sessionId, prevCount: current.length, newCount: updated.length })
    forceUpdate({})
  }, [])

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return

      const sessionId = session.id
      setError(null)

      // Add user message
      const userMessage: EphemeralMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: content.trim(),
        timestamp: new Date(),
      }
      setMessagesForSession(sessionId, prev => [...prev, userMessage])

      // Add loading placeholder for assistant
      const loadingId = `assistant-${Date.now()}`
      const loadingMessage: EphemeralMessage = {
        id: loadingId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isLoading: true,
      }
      setMessagesForSession(sessionId, prev => [...prev, loadingMessage])
      setIsLoading(true)

      try {
        const response = await daemonClient.sendEphemeralChat(sessionId, {
          message: content.trim(),
          context: {
            includeRecentEvents,
            maxEvents,
          },
        })

        // Replace loading message with actual response
        setMessagesForSession(sessionId, prev =>
          prev.map(msg =>
            msg.id === loadingId
              ? {
                  ...msg,
                  content: response.content,
                  isLoading: false,
                }
              : msg,
          ),
        )
      } catch (err) {
        // Remove loading message on error
        setMessagesForSession(sessionId, prev => prev.filter(msg => msg.id !== loadingId))
        setError(err instanceof Error ? err.message : 'Failed to get response')
      } finally {
        setIsLoading(false)
      }
    },
    [session.id, isLoading, includeRecentEvents, maxEvents, setMessagesForSession],
  )

  const clearMessages = useCallback(() => {
    debugLog('Clearing messages', { sessionId: session.id })
    messagesBySession.delete(session.id)
    forceUpdate({})
    setError(null)
  }, [session.id])

  const dismissError = useCallback(() => {
    setError(null)
  }, [])

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearMessages,
    dismissError,
  }
}
