import { useState, useRef, useEffect, useCallback } from 'react'
import { X, Send, Loader2, AlertCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Session } from '@/lib/daemon/types'
import { useEphemeralChat, EphemeralMessage } from '@/hooks'
import { cn } from '@/lib/utils'

interface EphemeralChatPanelProps {
  session: Session
  onClose: () => void
}

function MessageBubble({ message }: { message: EphemeralMessage }) {
  const isUser = message.role === 'user'

  return (
    <div
      className={cn(
        'flex flex-col gap-1 max-w-[85%]',
        isUser ? 'ml-auto items-end' : 'mr-auto items-start',
      )}
    >
      <div
        className={cn(
          'px-3 py-2 rounded-lg text-sm whitespace-pre-wrap',
          isUser
            ? 'bg-accent/20 text-accent border border-accent/30'
            : 'bg-secondary text-secondary-foreground border border-border',
        )}
      >
        {message.isLoading ? (
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-muted-foreground">Thinking...</span>
          </div>
        ) : (
          message.content
        )}
      </div>
      <span className="text-xs text-muted-foreground">
        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </span>
    </div>
  )
}

export function EphemeralChatPanel({ session, onClose }: EphemeralChatPanelProps) {
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const { messages, isLoading, error, sendMessage, clearMessages, dismissError } =
    useEphemeralChat(session)

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSend = useCallback(() => {
    if (inputValue.trim() && !isLoading) {
      sendMessage(inputValue)
      setInputValue('')
    }
  }, [inputValue, isLoading, sendMessage])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
      // Allow Escape to close the panel
      if (e.key === 'Escape') {
        onClose()
      }
    },
    [handleSend, onClose],
  )

  const handleClose = useCallback(() => {
    clearMessages()
    onClose()
  }, [clearMessages, onClose])

  return (
    <Card className="h-full flex flex-col border-l-2 border-accent/30">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/30">
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-sm uppercase tracking-wider text-accent">Ephemeral Chat</span>
          <span className="text-xs text-muted-foreground">Questions here won't be saved</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClose}
          className="h-8 w-8"
          title="Close ephemeral chat (Esc)"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Messages */}
      <CardContent className="flex-1 p-0 min-h-0">
        <ScrollArea className="h-full">
          <div ref={scrollRef} className="p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-center text-muted-foreground">
                <p className="text-sm">Ask a clarifying question about this session.</p>
                <p className="text-xs mt-1">Your questions and answers won't be saved.</p>
              </div>
            ) : (
              messages.map(message => <MessageBubble key={message.id} message={message} />)
            )}
          </div>
        </ScrollArea>
      </CardContent>

      {/* Error */}
      {error && (
        <div className="px-4 py-2 bg-destructive/10 border-t border-destructive/30 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-destructive" />
          <span className="text-sm text-destructive flex-1">{error}</span>
          <Button variant="ghost" size="sm" onClick={dismissError} className="h-6 px-2 text-xs">
            Dismiss
          </Button>
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-border bg-background">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a clarifying question..."
            className="flex-1 min-h-[60px] max-h-[120px] px-3 py-2 text-sm bg-secondary border border-border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
            disabled={isLoading}
          />
          <Button
            onClick={handleSend}
            disabled={!inputValue.trim() || isLoading}
            className="self-end"
            size="sm"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          Press Enter to send, Shift+Enter for new line
        </div>
      </div>
    </Card>
  )
}
