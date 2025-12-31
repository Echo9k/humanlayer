import * as DialogPrimitive from '@radix-ui/react-dialog'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { X, BookOpen } from 'lucide-react'
import { HotkeyScopeBoundary } from './HotkeyScopeBoundary'
import { HOTKEY_SCOPES } from '@/hooks/hotkeys/scopes'
import { useHotkeys } from 'react-hotkeys-hook'
import { useState, useEffect, useCallback } from 'react'
import { daemonClient } from '@/lib/daemon/client'
import { logger } from '@/lib/logging'
import { useStore } from '@/AppStore'
import { usePostHogTracking } from '@/hooks/usePostHogTracking'
import { POSTHOG_EVENTS } from '@/lib/telemetry/events'
import { useRecentPaths } from '@/hooks/useRecentPaths'

interface CommandsHelperModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface SlashCommand {
  name: string
  source: 'local' | 'global'
  description?: string
  model?: string
}

export function CommandsHelperModal({ open, onOpenChange }: CommandsHelperModalProps) {
  const [commands, setCommands] = useState<SlashCommand[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentWorkingDir, setCurrentWorkingDir] = useState<string | null>(null)
  const activeSessionDetail = useStore(state => state.activeSessionDetail)
  const responseEditor = useStore(state => state.responseEditor)
  const { trackEvent } = usePostHogTracking()
  const { paths: recentPaths } = useRecentPaths(1)

  // Fetch commands when modal opens
  useEffect(() => {
    if (!open) return

    // Try active session first, then fall back to most recent path
    const workingDir = activeSessionDetail?.session?.workingDir || recentPaths[0]?.path

    if (!workingDir) {
      setCommands([])
      setCurrentWorkingDir(null)
      setError('No working directory available. Open a session or use a recent project.')
      return
    }

    setCurrentWorkingDir(workingDir)
    const fetchCommands = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const response = await daemonClient.getSlashCommands({
          workingDir,
          query: '/',
        })
        setCommands(response.data || [])
      } catch (err) {
        logger.error('Failed to fetch commands for helper:', err)
        setError('Failed to load commands')
        setCommands([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchCommands()
  }, [open, activeSessionDetail?.session?.workingDir, recentPaths])

  // Handle command selection - insert into editor
  const handleCommandSelect = useCallback(
    (cmd: SlashCommand) => {
      if (!responseEditor) {
        logger.warn('No response editor available to insert command')
        return
      }

      // Track usage
      trackEvent(POSTHOG_EVENTS.COMMANDS_HELPER_USED, {
        command_name: cmd.name,
      })

      // Insert command into editor at current position
      const { state } = responseEditor
      const pos = state.selection.from

      // Insert command text with trailing space
      responseEditor.chain().focus().insertContentAt(pos, cmd.name + ' ').run()

      // Close modal
      onOpenChange(false)
    },
    [responseEditor, trackEvent, onOpenChange],
  )

  // Keyboard navigation
  useHotkeys(
    'j',
    () => {
      const commandList = document.querySelector('[cmdk-list]')
      if (commandList) {
        commandList.scrollTop += 40
      }
    },
    {
      enabled: open,
      scopes: [HOTKEY_SCOPES.COMMANDS_HELPER],
    },
  )

  useHotkeys(
    'k',
    () => {
      const commandList = document.querySelector('[cmdk-list]')
      if (commandList) {
        commandList.scrollTop -= 40
      }
    },
    {
      enabled: open,
      scopes: [HOTKEY_SCOPES.COMMANDS_HELPER],
    },
  )

  useHotkeys(
    'escape',
    () => {
      onOpenChange(false)
    },
    {
      enabled: open,
      scopes: [HOTKEY_SCOPES.COMMANDS_HELPER],
    },
  )

  // Group commands by source
  const groupedCommands = commands.reduce(
    (acc, cmd) => {
      const source = cmd.source || 'unknown'
      if (!acc[source]) acc[source] = []
      acc[source].push(cmd)
      return acc
    },
    {} as Record<string, SlashCommand[]>,
  )

  // Format source name for display
  const formatSourceName = (source: string) => {
    return source.charAt(0).toUpperCase() + source.slice(1)
  }

  return (
    <HotkeyScopeBoundary
      scope={HOTKEY_SCOPES.COMMANDS_HELPER}
      isActive={open}
      rootScopeDisabled={true}
      componentName="CommandsHelperModal"
    >
      <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            className={cn(
              'fixed inset-0 z-50 bg-black/50',
              'data-[state=open]:animate-in data-[state=closed]:animate-out',
              'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
            )}
          />
          <DialogPrimitive.Content
            className={cn(
              'fixed top-[50%] left-[50%] z-50',
              'translate-x-[-50%] translate-y-[-50%]',
              'w-full max-w-[600px] max-h-[80vh]',
              'bg-background shadow-xl rounded-lg border',
              'data-[state=open]:animate-in data-[state=closed]:animate-out',
              'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
              'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
              'duration-200',
            )}
          >
            <div className="flex h-full flex-col">
              {/* Header */}
              <div className="flex items-center justify-between border-b px-6 py-4">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5" />
                    <DialogPrimitive.Title className="text-lg font-semibold">
                      Available Commands
                    </DialogPrimitive.Title>
                  </div>
                  {currentWorkingDir && (
                    <p className="text-xs text-muted-foreground truncate max-w-[400px]">
                      {currentWorkingDir}
                    </p>
                  )}
                </div>
                <DialogPrimitive.Close className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
                  <X className="h-4 w-4" />
                  <span className="sr-only">Close</span>
                </DialogPrimitive.Close>
              </div>

              {/* Command list */}
              <Command className="flex-1 overflow-hidden">
                <CommandInput placeholder="Search commands..." className="h-11 border-b" autoFocus />
                <CommandList className="max-h-[calc(80vh-120px)] p-2">
                  {isLoading && (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                      Loading commands...
                    </div>
                  )}
                  {error && (
                    <div className="py-6 text-center text-sm text-muted-foreground">{error}</div>
                  )}
                  {!isLoading && !error && commands.length === 0 && (
                    <CommandEmpty>No commands found in this project.</CommandEmpty>
                  )}
                  {!isLoading &&
                    !error &&
                    Object.entries(groupedCommands).map(([source, cmds]) => (
                      <CommandGroup
                        key={source}
                        heading={formatSourceName(source)}
                        className="py-2"
                      >
                        {cmds.map(cmd => (
                          <CommandItem
                            key={cmd.name}
                            value={`${cmd.name} ${cmd.description || ''}`}
                            onSelect={() => handleCommandSelect(cmd)}
                            className="flex flex-col items-start gap-1 px-3 py-3 cursor-pointer"
                          >
                            <div className="flex items-center gap-2 w-full">
                              <span className="font-mono font-medium">{cmd.name}</span>
                              {cmd.model && (
                                <span className="ml-auto text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                                  {cmd.model}
                                </span>
                              )}
                            </div>
                            {cmd.description && (
                              <span className="text-sm text-muted-foreground">{cmd.description}</span>
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    ))}
                </CommandList>
              </Command>

              {/* Footer hint */}
              <div className="flex items-center justify-between text-xs text-muted-foreground p-3 border-t">
                <div className="flex items-center gap-3">
                  <span>j/k Navigate</span>
                  <span>Enter Select</span>
                </div>
                <span>Esc Close</span>
              </div>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </HotkeyScopeBoundary>
  )
}
