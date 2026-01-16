import { useState, useCallback, useEffect } from 'react'
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

export function useEphemeralChat(session: Session, options: UseEphemeralChatOptions = {}) {
  const [messages, setMessages] = useState<EphemeralMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { includeRecentEvents = true, maxEvents = 20 } = options

  // Clear messages when session changes
  useEffect(() => {
    setMessages([])
    setError(null)
  }, [session.id])

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isLoading) return

      setError(null)

      // Add user message
      const userMessage: EphemeralMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content: content.trim(),
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, userMessage])

      // Add loading placeholder for assistant
      const loadingId = `assistant-${Date.now()}`
      const loadingMessage: EphemeralMessage = {
        id: loadingId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isLoading: true,
      }
      setMessages(prev => [...prev, loadingMessage])
      setIsLoading(true)

      try {
        const response = await daemonClient.sendEphemeralChat(session.id, {
          message: content.trim(),
          context: {
            includeRecentEvents,
            maxEvents,
          },
        })

        // Replace loading message with actual response
        setMessages(prev =>
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
        setMessages(prev => prev.filter(msg => msg.id !== loadingId))
        setError(err instanceof Error ? err.message : 'Failed to get response')
      } finally {
        setIsLoading(false)
      }
    },
    [session.id, isLoading, includeRecentEvents, maxEvents],
  )

  const clearMessages = useCallback(() => {
    setMessages([])
    setError(null)
  }, [])

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
