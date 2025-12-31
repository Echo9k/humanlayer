import { useStore } from '@/AppStore'
import { SentryErrorBoundary } from '@/components/ErrorBoundary'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { HOTKEY_SCOPES } from '@/hooks/hotkeys/scopes'
import { daemonClient } from '@/lib/daemon'
import { type Session, SessionStatus } from '@/lib/daemon/types'
import { logger } from '@/lib/logging'
import type { UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { open } from '@tauri-apps/plugin-dialog'
import type { Content } from '@tiptap/react'
import { ImagePlus } from 'lucide-react'
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { toast } from 'sonner'
import { imageStorageService } from '@/services/ImageStorageService'
import {
  insertImageNode,
  countImagesInEditor,
  isImageExtension,
  getExtensionFromPath,
} from '@/components/internal/SessionDetail/utils/editorImageUtils'
import { DraftActionButtons } from './DraftActionButtons'
import { ResponseEditor } from './ResponseEditor'
import { StatusBar, type StatusBarRef } from './StatusBar'

interface LaunchSettings {
  autoAcceptEdits: boolean
  dangerouslySkipPermissions: boolean
}

interface DraftLauncherInputProps {
  session: Session
  workingDirectoryRef?: React.MutableRefObject<string>
  onLaunchDraft: (settings: LaunchSettings) => void
  onDiscardDraft: () => void
  isLaunchingDraft: boolean
  onModelChange?: (config: {
    model?: string
    proxyEnabled: boolean
    proxyBaseUrl?: string
    proxyModelOverride?: string
    provider: 'anthropic' | 'openrouter' | 'baseten'
  }) => void
  onToggleAutoAccept: () => void
  onToggleBypass: () => void
  autoAcceptEditsEnabled: boolean
  dangerouslyBypassPermissionsEnabled: boolean
  onContentChange?: () => void
}

export const DraftLauncherInput = forwardRef<
  { focus: () => void; blur?: () => void },
  DraftLauncherInputProps
>(
  (
    {
      session,
      workingDirectoryRef,
      onLaunchDraft,
      onDiscardDraft,
      isLaunchingDraft,
      onModelChange,
      onToggleAutoAccept: onToggleAutoAcceptProp,
      onToggleBypass: onToggleBypassProp,
      autoAcceptEditsEnabled,
      dangerouslyBypassPermissionsEnabled,
      onContentChange,
    },
    ref,
  ) => {
    const [isFocused, setIsFocused] = useState(false)
    const [isDragHover, setIsDragHover] = useState(false)
    const responseEditor = useStore(state => state.responseEditor)
    const isResponseEditorEmpty = useStore(state => state.isResponseEditorEmpty)

    // Use prop handlers if provided, otherwise use internal handlers
    const handleToggleAutoAccept = onToggleAutoAcceptProp
    const handleToggleBypass = onToggleBypassProp
    const tiptapRef = useRef<{ focus: () => void; blur?: () => void }>(null)
    const statusBarRef = useRef<StatusBarRef>(null)

    // Load initial editor state from database for drafts
    const hasValidSessionData = (session.status as any) !== 'unknown' && !(session as any).fromStore
    let initialValue = null

    if (hasValidSessionData && session.editorState) {
      try {
        initialValue = JSON.parse(session.editorState)
      } catch (e) {
        logger.error('DraftLauncherInput - error parsing editorState from database', e)
      }
    }

    // Handle editor changes - notify parent and save to database
    const handleChange = useCallback(
      async (value: Content) => {
        const valueStr = JSON.stringify(value)

        const textContent = responseEditor?.getText() ?? ''

        // Only notify parent if there's actual text content (not just empty editor structure)
        if (onContentChange && textContent.trim().length > 0) {
          onContentChange()
        }

        // Only save directly if draft already exists
        if (session.status === SessionStatus.Draft && session.id) {
          try {
            await daemonClient.updateSession(session.id, {
              editorState: valueStr,
            })
          } catch (error) {
            // Log but don't show toast to avoid disrupting typing
            logger.error('Failed to save editor state to database:', error)
          }
        }
      },
      [session.id, session.status, onContentChange, responseEditor],
    )

    // Handle importing an image file (from drop or picker)
    const handleImportImageFile = useCallback(
      async (filePath: string) => {
        if (!responseEditor || responseEditor.isDestroyed) {
          return false
        }

        // Check image count limit
        const currentCount = countImagesInEditor(responseEditor)
        if (!imageStorageService.canAddMoreImages(currentCount)) {
          toast.error(`Maximum ${imageStorageService.getMaxImagesPerResponse()} images allowed`)
          return false
        }

        try {
          const savedImage = await imageStorageService.importExternalImage(session.id, filePath)
          insertImageNode(responseEditor, savedImage)
          return true
        } catch (error: any) {
          toast.error(error.message || 'Failed to import image')
          logger.error('[DraftLauncherInput] Failed to import image:', error)
          return false
        }
      },
      [responseEditor, session.id],
    )

    // Handle form submission
    const handleSubmit = () => {
      logger.log('DraftLauncherInput.handleSubmit()')

      // Early return if no text in editor
      if (isResponseEditorEmpty) {
        return
      }

      // Launch the draft with current settings
      onLaunchDraft({
        autoAcceptEdits: autoAcceptEditsEnabled,
        dangerouslySkipPermissions: dangerouslyBypassPermissionsEnabled,
      })
    }

    // Forward ref handling for TipTap editor
    useImperativeHandle(ref, () => {
      return tiptapRef.current!
    }, [])

    // Set up drag and drop handling
    useEffect(() => {
      let unlisten: UnlistenFn | undefined
      let mounted = true
      let isSettingUp = true

      ;(async () => {
        try {
          const unlistenFn = await getCurrentWebview().onDragDropEvent(async event => {
            if (!mounted) {
              return
            }

            if (event.payload.type === 'over') {
              setIsDragHover(true)
            } else if (event.payload.type === 'drop') {
              const filePaths = event.payload.paths as string[]
              if (responseEditor && filePaths.length > 0) {
                // Check editor health before proceeding
                if (responseEditor.isDestroyed) {
                  return
                }

                if (!(responseEditor as any).editorView) {
                  return
                }

                // Separate image files from other files
                const imageFiles: string[] = []
                const otherFiles: string[] = []

                for (const filePath of filePaths) {
                  const ext = getExtensionFromPath(filePath)
                  if (isImageExtension(ext)) {
                    imageFiles.push(filePath)
                  } else {
                    otherFiles.push(filePath)
                  }
                }

                // Handle image files - import them to session directory
                for (const imagePath of imageFiles) {
                  await handleImportImageFile(imagePath)
                }

                // Handle other files as mentions (existing behavior)
                if (otherFiles.length > 0) {
                  const content: any[] = []

                  otherFiles.forEach((filePath, index) => {
                    const fileName = filePath.split('/').pop() || filePath

                    // Add space before mention if not first file
                    if (index > 0) {
                      content.push({ type: 'text', text: ' ' })
                    }

                    // Add the mention
                    content.push({
                      type: 'mention',
                      attrs: {
                        id: filePath, // Full path for functionality
                        label: fileName, // Display name for UI
                      },
                    })
                  })

                  // Add a space after all mentions
                  content.push({ type: 'text', text: ' ' })

                  // Insert all mentions at once
                  responseEditor.chain().focus().insertContent(content).run()
                }
              }

              setIsDragHover(false)
            } else {
              setIsDragHover(false)
            }
          })

          // Store the unlisten function if component is still mounted
          if (mounted && isSettingUp) {
            unlisten = unlistenFn
          } else {
            // Component unmounted during async setup, clean up immediately
            unlistenFn()
          }
        } finally {
          isSettingUp = false
        }
      })()

      return () => {
        mounted = false
        isSettingUp = false
        if (unlisten) {
          // Defensive try-catch for Tauri v2 race condition
          try {
            unlisten()
          } catch {
            // Intentionally empty - silently ignore unlisten errors
          }
        }
      }
    }, [responseEditor, handleImportImageFile])

    // Handle clipboard paste for images
    useEffect(() => {
      if (!responseEditor || responseEditor.isDestroyed) {
        return
      }

      const handlePaste = async (e: ClipboardEvent) => {
        const items = e.clipboardData?.items
        if (!items) return

        for (const item of items) {
          if (item.type.startsWith('image/')) {
            e.preventDefault()

            const blob = item.getAsFile()
            if (!blob) continue

            // Check image count limit
            const currentCount = countImagesInEditor(responseEditor)
            if (!imageStorageService.canAddMoreImages(currentCount)) {
              toast.error(`Maximum ${imageStorageService.getMaxImagesPerResponse()} images allowed`)
              return
            }

            // Validate image
            const validation = imageStorageService.validateImage(blob)
            if (!validation.valid) {
              toast.error(validation.error || 'Invalid image')
              return
            }

            try {
              const savedImage = await imageStorageService.saveImage(session.id, blob, item.type)
              insertImageNode(responseEditor, savedImage)
            } catch (error: any) {
              toast.error(error.message || 'Failed to save image')
              logger.error('[DraftLauncherInput] Failed to save pasted image:', error)
            }
          }
        }
      }

      // Add paste listener to the editor's DOM element
      const editorElement = responseEditor.view.dom
      editorElement.addEventListener('paste', handlePaste)

      return () => {
        editorElement.removeEventListener('paste', handlePaste)
      }
    }, [responseEditor, session.id])

    // Handle image picker button click
    const handleImagePicker = useCallback(async () => {
      if (!responseEditor || responseEditor.isDestroyed) {
        return
      }

      // Check image count limit
      const currentCount = countImagesInEditor(responseEditor)
      if (!imageStorageService.canAddMoreImages(currentCount)) {
        toast.error(`Maximum ${imageStorageService.getMaxImagesPerResponse()} images allowed`)
        return
      }

      try {
        const selected = await open({
          multiple: true,
          filters: [
            {
              name: 'Images',
              extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
            },
          ],
        })

        if (selected) {
          const paths = Array.isArray(selected) ? selected : [selected]
          for (const path of paths) {
            // Check limit for each image
            const count = countImagesInEditor(responseEditor)
            if (!imageStorageService.canAddMoreImages(count)) {
              toast.error(`Maximum ${imageStorageService.getMaxImagesPerResponse()} images reached`)
              break
            }
            await handleImportImageFile(path)
          }
        }
      } catch (error: any) {
        // User cancelled the dialog - this is not an error
        if (error.message?.includes('cancel')) {
          return
        }
        toast.error('Failed to open file picker')
        logger.error('[DraftLauncherInput] Image picker error:', error)
      }
    }, [responseEditor, handleImportImageFile])

    // Track previous session ID for defensive saving
    const prevSessionIdRef = useRef(session.id)

    // Reset editor content when session changes
    useEffect(() => {
      if (!responseEditor) {
        logger.log('DraftLauncherInput - No editor instance yet, skipping session change handling')
        return
      }

      logger.log('DraftLauncherInput - Session change detected', {
        sessionId: session.id,
        previousSessionId: prevSessionIdRef.current,
        hasEditorState: !!session.editorState,
        editorIsEmpty: responseEditor.isEmpty,
      })

      // Check if we're actually switching sessions
      if (prevSessionIdRef.current !== session.id) {
        // Save current content before switching (defensive, should already be saved)
        const currentContent = responseEditor.getJSON()
        if (currentContent && !responseEditor.isEmpty) {
          // Save to the PREVIOUS session's storage
          const prevSessionId = prevSessionIdRef.current
          if (prevSessionId) {
            // For draft sessions, we should save to database but we don't have the previous
            // session object. The handleChange callback should have already saved correctly.
            // As a fallback, we can log this for debugging.
            logger.log('DraftLauncherInput - Content would be saved for previous session', {
              prevSessionId,
              contentLength: JSON.stringify(currentContent).length,
            })
          }
        }

        // Update the ref for next time
        prevSessionIdRef.current = session.id
      }

      // Load content for the new session
      let newContent = null
      let contentSource = 'none'

      const hasValidSessionData = (session.status as any) !== 'unknown' && !(session as any).fromStore

      if (hasValidSessionData) {
        // For draft sessions, load from database
        if (session.editorState) {
          try {
            newContent = JSON.parse(session.editorState)
            contentSource = 'database'
            logger.log('DraftLauncherInput - Loaded draft from database', {
              sessionId: session.id,
              contentLength: JSON.stringify(newContent).length,
            })
          } catch (e) {
            logger.error('DraftLauncherInput - Failed to parse editorState', {
              sessionId: session.id,
              error: e,
              editorState: session.editorState,
            })
          }
        }
      } else {
        logger.log('DraftLauncherInput - Skipping content load, session data not ready', {
          sessionId: session.id,
          status: session.status,
          fromStore: (session as any).fromStore,
        })
      }

      // Update editor content with error handling
      try {
        if (newContent) {
          responseEditor.commands.setContent(newContent)
          logger.log('DraftLauncherInput - Set editor content from', contentSource, {
            sessionId: session.id,
          })
        } else {
          responseEditor.commands.clearContent()
          logger.log('DraftLauncherInput - Cleared editor content', {
            sessionId: session.id,
          })
        }
      } catch (e) {
        logger.error('DraftLauncherInput - Failed to update editor content', {
          sessionId: session.id,
          error: e,
          newContent,
        })
      }
    }, [session.id, session.editorState, responseEditor])

    // Shift+M to open model selector
    useHotkeys(
      'shift+m',
      e => {
        e.preventDefault()
        statusBarRef.current?.openModelSelector()
      },
      { enableOnFormTags: false },
    )

    // Note: Alt+A and Alt+Y hotkeys are now handled in the parent DraftLauncherForm component
    // to ensure proper modal handling for bypass permissions

    // Cmd+Enter / Ctrl+Enter to launch the draft
    useHotkeys(
      'meta+enter, ctrl+enter',
      e => {
        e.preventDefault()
        e.stopPropagation()
        handleSubmit()
      },
      {
        enableOnFormTags: ['INPUT', 'TEXTAREA', 'SELECT'],
        enableOnContentEditable: true,
        scopes: [HOTKEY_SCOPES.DRAFT_LAUNCHER],
      },
    )

    // Button states
    const hasText = !isResponseEditorEmpty
    const isDisabled = !hasText || isLaunchingDraft
    const isMac = navigator.platform.includes('Mac')

    // Placeholder and border styling
    let placeholder = 'Enter your prompt to launch a session...'
    let borderColorClass = isFocused ? 'border-[var(--terminal-accent)]' : 'border-transparent'
    let outerBorderColorClass = ''

    if (!responseEditor?.isFocused) {
      placeholder = 'ENTER to start typing…'
    }

    if (isDragHover) {
      borderColorClass = 'border-[var(--terminal-accent)]'
      outerBorderColorClass = 'border-[var(--terminal-accent)]'
      placeholder = 'Drop files to include them in your prompt...'
    }

    // Status override for drag hover
    const getStatusOverride = () => {
      if (isDragHover) {
        return {
          text: 'DRAGGING FILE, RELEASE TO INCLUDE',
          className: 'text-primary',
        }
      }
      return undefined
    }

    return (
      <Card className={`py-2 ${outerBorderColorClass}`}>
        <CardContent className="px-2">
          <div className={`transition-colors border-l-2 pl-2 pr-2 ${borderColorClass}`}>
            <div className="space-y-2 flex flex-col">
              {/* Status Bar */}
              <div className="flex items-center justify-between gap-2">
                <StatusBar
                  ref={statusBarRef}
                  session={session}
                  effectiveContextTokens={session.effectiveContextTokens}
                  contextLimit={session.contextLimit}
                  model={session.model}
                  onModelChange={onModelChange}
                  statusOverride={getStatusOverride()}
                />
              </div>

              {/* Editor */}
              <div className="flex gap-2">
                <SentryErrorBoundary
                  variant="response-editor"
                  componentName="ResponseEditor"
                  handleRefresh={() => {
                    window.location.href = `/#/sessions/${session.id}`
                  }}
                  refreshButtonText="Reload Session"
                >
                  {hasValidSessionData ? (
                    <ResponseEditor
                      ref={tiptapRef}
                      initialValue={initialValue}
                      onChange={handleChange}
                      onSubmit={handleSubmit}
                      disabled={isLaunchingDraft}
                      placeholder={placeholder}
                      workingDirRef={workingDirectoryRef}
                      workingDir={session.workingDir}
                      className={`flex-1 min-h-[2.5rem] max-h-[50vh] overflow-y-auto ${
                        isLaunchingDraft ? 'opacity-50' : ''
                      } ${isFocused ? 'caret-accent' : ''}`}
                      onFocus={() => setIsFocused(true)}
                      onBlur={() => setIsFocused(false)}
                    />
                  ) : (
                    <div className="flex-1 min-h-[2.5rem] flex items-center justify-center text-muted-foreground">
                      Loading editor...
                    </div>
                  )}
                </SentryErrorBoundary>
              </div>

              {/* Action buttons and controls */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <DraftActionButtons
                    bypassEnabled={dangerouslyBypassPermissionsEnabled}
                    autoAcceptEnabled={autoAcceptEditsEnabled}
                    onToggleBypass={handleToggleBypass}
                    onToggleAutoAccept={handleToggleAutoAccept}
                  />
                  {/* Image picker button */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={handleImagePicker}
                        disabled={isLaunchingDraft}
                      >
                        <ImagePlus className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p>Attach image (or paste/drag-drop)</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Button
                    onClick={onDiscardDraft}
                    disabled={isLaunchingDraft}
                    variant="secondary"
                    className="h-auto py-0.5 px-2 text-xs transition-all duration-200"
                  >
                    Discard
                    <kbd className="ml-1 px-1 py-0.5 text-xs bg-muted/50 rounded border border-border">
                      E
                    </kbd>
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={isDisabled}
                    variant="default"
                    className="h-auto py-0.5 px-2 text-xs transition-all duration-200"
                  >
                    {isLaunchingDraft ? 'Launching...' : 'Launch'}
                    <kbd className="ml-1 px-1 py-0.5 text-xs bg-muted/50 rounded">
                      {isMac ? '⌘+Enter' : 'Ctrl+Enter'}
                    </kbd>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  },
)

DraftLauncherInput.displayName = 'DraftLauncherInput'
