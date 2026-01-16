import { useState, useCallback, useEffect } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { ConversationEvent, ConversationEventType } from '@/lib/daemon/types'
import { HotkeyScope } from '@/hooks/hotkeys/scopes'

interface NavigableItem {
  id: number
  type: 'event' | 'taskgroup' | 'subevent'
}

interface UseSessionNavigationProps {
  events: ConversationEvent[]
  hasSubTasks: boolean
  expandedTasks: Set<string>
  toggleTaskGroup: (taskId: string) => void
  expandedToolResult?: ConversationEvent | null
  setExpandedToolResult?: (event: ConversationEvent | null) => void
  setExpandedToolCall?: (event: ConversationEvent | null) => void
  disabled?: boolean
  startKeyboardNavigation?: () => void
  scope: HotkeyScope
}

export function useSessionNavigation({
  events,
  hasSubTasks,
  expandedTasks,
  toggleTaskGroup,
  expandedToolResult,
  setExpandedToolResult,
  setExpandedToolCall,
  disabled = false,
  startKeyboardNavigation,
  scope,
}: UseSessionNavigationProps) {
  const [focusedEventId, setFocusedEventId] = useState<number | null>(null)
  const [focusSource, setFocusSource] = useState<'mouse' | 'keyboard' | null>(null)

  // Helper to check if element is in viewport
  const isElementInView = useCallback((element: Element, container: Element) => {
    const elementRect = element.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    return elementRect.top >= containerRect.top && elementRect.bottom <= containerRect.bottom
  }, [])

  // Helper to check if an event is a "thinking" message
  const isThinkingEvent = useCallback((event: ConversationEvent): boolean => {
    return Boolean(
      event.eventType === ConversationEventType.Thinking ||
        (event.role === 'assistant' && event.content?.startsWith('<thinking>')),
    )
  }, [])

  // Helper to check if an event is a main conversation exchange
  // Main exchanges are: user messages, assistant messages (excluding thinking)
  const isMainExchange = useCallback(
    (event: ConversationEvent): boolean => {
      if (event.eventType !== ConversationEventType.Message) {
        return false
      }
      if (event.role === 'user') {
        return true
      }
      if (event.role === 'assistant' && !isThinkingEvent(event)) {
        return true
      }
      return false
    },
    [isThinkingEvent],
  )

  // Build navigable items list based on current state
  const buildNavigableItems = useCallback((): NavigableItem[] => {
    const items: NavigableItem[] = []

    if (!hasSubTasks) {
      // Simple case: just regular events
      events
        .filter(event => event.eventType !== ConversationEventType.ToolResult && event.id !== undefined)
        .forEach(event => items.push({ id: event.id!, type: 'event' }))
    } else {
      // Complex case: handle task groups
      const rootEvents = events.filter(e => !e.parentToolUseId)
      const subEventsByParent = new Map<string, ConversationEvent[]>()

      events.forEach(event => {
        if (event.parentToolUseId) {
          const siblings = subEventsByParent.get(event.parentToolUseId) || []
          siblings.push(event)
          subEventsByParent.set(event.parentToolUseId, siblings)
        }
      })

      rootEvents
        .filter(event => event.eventType !== ConversationEventType.ToolResult && event.id !== undefined)
        .forEach(event => {
          // Check if this is a task group
          const isTaskGroup =
            event.toolName === 'Task' && event.toolId && subEventsByParent.has(event.toolId)

          if (isTaskGroup) {
            items.push({ id: event.id!, type: 'taskgroup' })

            // If expanded, add sub-events
            if (expandedTasks.has(event.toolId!)) {
              const subEvents = subEventsByParent.get(event.toolId!) || []
              subEvents
                .filter(e => e.eventType !== ConversationEventType.ToolResult && e.id !== undefined)
                .forEach(subEvent => {
                  items.push({ id: subEvent.id!, type: 'subevent' })
                })
            }
          } else {
            items.push({ id: event.id!, type: 'event' })
          }
        })
    }

    return items
  }, [events, hasSubTasks, expandedTasks])

  // Build filtered navigable items (main exchanges only: user + non-thinking assistant messages)
  const buildMainExchangeItems = useCallback((): NavigableItem[] => {
    return events
      .filter(event => event.id !== undefined && isMainExchange(event))
      .map(event => ({ id: event.id!, type: 'event' as const }))
  }, [events, isMainExchange])

  const navigableItems = buildNavigableItems()
  const mainExchangeItems = buildMainExchangeItems()

  // Navigation functions
  const focusNextEvent = useCallback(() => {
    if (navigableItems.length === 0) return

    const currentIndex = focusedEventId
      ? navigableItems.findIndex(item => item.id === focusedEventId)
      : -1

    if (currentIndex === -1) {
      // When no event is focused, j should select the first event
      startKeyboardNavigation?.()
      setFocusedEventId(navigableItems[0].id)
      setFocusSource('keyboard')
    } else if (currentIndex < navigableItems.length - 1) {
      startKeyboardNavigation?.()
      setFocusedEventId(navigableItems[currentIndex + 1].id)
      setFocusSource('keyboard')
    }
  }, [focusedEventId, navigableItems, startKeyboardNavigation])

  const focusPreviousEvent = useCallback(() => {
    if (navigableItems.length === 0) return

    const currentIndex = focusedEventId
      ? navigableItems.findIndex(item => item.id === focusedEventId)
      : -1

    if (currentIndex === -1) {
      // When no event is focused, k should select the last event
      startKeyboardNavigation?.()
      setFocusedEventId(navigableItems[navigableItems.length - 1].id)
      setFocusSource('keyboard')
    } else if (currentIndex > 0) {
      startKeyboardNavigation?.()
      setFocusedEventId(navigableItems[currentIndex - 1].id)
      setFocusSource('keyboard')
    }
  }, [focusedEventId, navigableItems, startKeyboardNavigation])

  // Filtered navigation functions (main exchanges only: user + non-thinking assistant messages)
  const focusNextMainExchange = useCallback(() => {
    if (mainExchangeItems.length === 0) return

    const currentIndex = focusedEventId
      ? mainExchangeItems.findIndex(item => item.id === focusedEventId)
      : -1

    if (currentIndex === -1) {
      // No event focused, or current focus is not a main exchange
      // Find the next main exchange after the current focused event
      if (focusedEventId) {
        const currentEvent = events.find(e => e.id === focusedEventId)
        if (currentEvent) {
          // Find the first main exchange that comes after the current event
          const currentEventIndex = events.findIndex(e => e.id === focusedEventId)
          for (let i = currentEventIndex + 1; i < events.length; i++) {
            const mainExchangeItem = mainExchangeItems.find(item => item.id === events[i].id)
            if (mainExchangeItem) {
              startKeyboardNavigation?.()
              setFocusedEventId(mainExchangeItem.id)
              setFocusSource('keyboard')
              return
            }
          }
        }
      }
      // Fall back to first main exchange
      startKeyboardNavigation?.()
      setFocusedEventId(mainExchangeItems[0].id)
      setFocusSource('keyboard')
    } else if (currentIndex < mainExchangeItems.length - 1) {
      startKeyboardNavigation?.()
      setFocusedEventId(mainExchangeItems[currentIndex + 1].id)
      setFocusSource('keyboard')
    }
  }, [focusedEventId, mainExchangeItems, events, startKeyboardNavigation])

  const focusPreviousMainExchange = useCallback(() => {
    if (mainExchangeItems.length === 0) return

    const currentIndex = focusedEventId
      ? mainExchangeItems.findIndex(item => item.id === focusedEventId)
      : -1

    if (currentIndex === -1) {
      // No event focused, or current focus is not a main exchange
      // Find the previous main exchange before the current focused event
      if (focusedEventId) {
        const currentEventIndex = events.findIndex(e => e.id === focusedEventId)
        if (currentEventIndex > 0) {
          // Find the last main exchange that comes before the current event
          for (let i = currentEventIndex - 1; i >= 0; i--) {
            const mainExchangeItem = mainExchangeItems.find(item => item.id === events[i].id)
            if (mainExchangeItem) {
              startKeyboardNavigation?.()
              setFocusedEventId(mainExchangeItem.id)
              setFocusSource('keyboard')
              return
            }
          }
        }
      }
      // Fall back to last main exchange
      startKeyboardNavigation?.()
      setFocusedEventId(mainExchangeItems[mainExchangeItems.length - 1].id)
      setFocusSource('keyboard')
    } else if (currentIndex > 0) {
      startKeyboardNavigation?.()
      setFocusedEventId(mainExchangeItems[currentIndex - 1].id)
      setFocusSource('keyboard')
    }
  }, [focusedEventId, mainExchangeItems, events, startKeyboardNavigation])

  // Keyboard navigation
  // j/k: Navigate all items (including tool calls, thinking, etc.)
  useHotkeys('j', focusNextEvent, {
    enabled: !expandedToolResult && !disabled,
    scopes: [scope],
  })
  useHotkeys('k', focusPreviousEvent, {
    enabled: !expandedToolResult && !disabled,
    scopes: [scope],
  })
  // ArrowDown/ArrowUp: Navigate main exchanges only (user + non-thinking assistant messages)
  useHotkeys('ArrowDown', focusNextMainExchange, {
    enabled: !expandedToolResult && !disabled,
    scopes: [scope],
  })
  useHotkeys('ArrowUp', focusPreviousMainExchange, {
    enabled: !expandedToolResult && !disabled,
    scopes: [scope],
  })

  // I key to expand task groups or inspect tool results
  useHotkeys(
    'i',
    () => {
      if (!focusedEventId) return

      startKeyboardNavigation?.()

      const focusedEvent = events.find(e => e.id === focusedEventId)
      if (!focusedEvent || focusedEvent.eventType !== ConversationEventType.ToolCall) return

      // Handle sub-agent info display for Task events
      if (focusedEvent.toolName === 'Task' && focusedEvent.toolInputJson && setExpandedToolCall) {
        try {
          const taskInput = JSON.parse(focusedEvent.toolInputJson)
          // Show modal for sub-agents to display prompt and parameters
          if (taskInput.subagent_type && taskInput.subagent_type !== 'Task') {
            // Use the existing modal infrastructure to show sub-agent details
            setExpandedToolCall(focusedEvent)
            return
          }
        } catch (e) {
          console.error('Failed to parse task input:', e)
        }
      }

      // Handle task group expansion for Task events with sub-events
      if (focusedEvent.toolName === 'Task' && focusedEvent.toolId && hasSubTasks) {
        const subEventsByParent = new Map<string, ConversationEvent[]>()
        events.forEach(event => {
          if (event.parentToolUseId) {
            const siblings = subEventsByParent.get(event.parentToolUseId) || []
            siblings.push(event)
            subEventsByParent.set(event.parentToolUseId, siblings)
          }
        })

        const hasSubEvents = subEventsByParent.has(focusedEvent.toolId)
        if (hasSubEvents) {
          toggleTaskGroup(focusedEvent.toolId)
          return
        }
      }

      // Handle tool result inspection (existing behavior)
      if (setExpandedToolResult && setExpandedToolCall) {
        const toolResult = focusedEvent.toolId
          ? events.find(
              e =>
                e.eventType === ConversationEventType.ToolResult &&
                e.toolResultForId === focusedEvent.toolId,
            )
          : null

        // Don't clear focus - the modal will preserve and restore it
        setExpandedToolResult(toolResult || null)
        setExpandedToolCall(focusedEvent)
      }
    },
    { enabled: !expandedToolResult && !disabled, scopes: [scope] },
  )

  // H key to toggle task group expand/collapse
  useHotkeys(
    'h',
    () => {
      if (!focusedEventId) return

      startKeyboardNavigation?.()

      const focusedEvent = events.find(e => e.id === focusedEventId)
      if (!focusedEvent) return

      // Build map of sub-events by parent
      const subEventsByParent = new Map<string, ConversationEvent[]>()
      events.forEach(event => {
        if (event.parentToolUseId) {
          const siblings = subEventsByParent.get(event.parentToolUseId) || []
          siblings.push(event)
          subEventsByParent.set(event.parentToolUseId, siblings)
        }
      })

      // Case 1: Focused on a sub-event within a task group
      if (focusedEvent.parentToolUseId) {
        // Find the parent task event
        const parentTask = events.find(
          e =>
            e.toolId === focusedEvent.parentToolUseId &&
            e.toolName === 'Task' &&
            e.eventType === ConversationEventType.ToolCall,
        )

        if (parentTask && expandedTasks.has(focusedEvent.parentToolUseId)) {
          // Collapse the parent group
          toggleTaskGroup(focusedEvent.parentToolUseId)
          // Set focus to the parent task
          setFocusedEventId(parentTask.id)
          setFocusSource('keyboard')
        }
        return
      }

      // Case 2: Focused on a parent Task event - toggle expand/collapse
      if (
        focusedEvent.eventType === ConversationEventType.ToolCall &&
        focusedEvent.toolName === 'Task' &&
        focusedEvent.toolId &&
        hasSubTasks
      ) {
        const hasSubEvents = subEventsByParent.has(focusedEvent.toolId)
        if (hasSubEvents) {
          toggleTaskGroup(focusedEvent.toolId)
        }
      }
    },
    { enabled: !expandedToolResult && !disabled, scopes: [scope] },
  )

  // L key to expand task group
  useHotkeys(
    'l',
    () => {
      if (!focusedEventId) return

      startKeyboardNavigation?.()

      const focusedEvent = events.find(e => e.id === focusedEventId)
      if (!focusedEvent) return

      // Build map of sub-events by parent
      const subEventsByParent = new Map<string, ConversationEvent[]>()
      events.forEach(event => {
        if (event.parentToolUseId) {
          const siblings = subEventsByParent.get(event.parentToolUseId) || []
          siblings.push(event)
          subEventsByParent.set(event.parentToolUseId, siblings)
        }
      })

      // Case 1: Focused on a sub-event within a task group - find and expand parent if collapsed
      if (focusedEvent.parentToolUseId) {
        // If we're already in an expanded task, the parent is expanded, so do nothing
        // This maintains consistency - l expands, h collapses
        return
      }

      // Case 2: Focused on a parent Task event - expand if collapsed
      if (
        focusedEvent.eventType === ConversationEventType.ToolCall &&
        focusedEvent.toolName === 'Task' &&
        focusedEvent.toolId &&
        hasSubTasks
      ) {
        const hasSubEvents = subEventsByParent.has(focusedEvent.toolId)
        // Expand if collapsed (inverse of h key behavior)
        if (hasSubEvents && !expandedTasks.has(focusedEvent.toolId)) {
          toggleTaskGroup(focusedEvent.toolId)
        }
      }
    },
    { enabled: !expandedToolResult && !disabled, scopes: [scope] },
  )

  // U key to jump to most recent user message
  useHotkeys(
    'u',
    () => {
      startKeyboardNavigation?.()

      // Find the most recent user message (search from end)
      for (let i = events.length - 1; i >= 0; i--) {
        const event = events[i]
        if (event.eventType === ConversationEventType.Message && event.role === 'user') {
          setFocusedEventId(event.id)
          setFocusSource('keyboard')

          // Scroll to the message
          setTimeout(() => {
            const element = document.querySelector(`[data-event-id="${event.id}"]`)
            if (element) {
              element.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }
          }, 0)
          break
        }
      }
    },
    { enabled: !disabled, scopes: [scope] },
  )

  // Scroll focused element into view (only for keyboard navigation)
  useEffect(() => {
    if (focusedEventId && focusSource === 'keyboard') {
      const container = document.querySelector('[data-conversation-container]')
      const focusedElement = container?.querySelector(`[data-event-id="${focusedEventId}"]`)

      if (container && focusedElement && !isElementInView(focusedElement, container)) {
        focusedElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  }, [focusedEventId, focusSource, isElementInView])

  return {
    focusedEventId,
    setFocusedEventId,
    focusSource,
    setFocusSource,
    navigableItems,
  }
}
