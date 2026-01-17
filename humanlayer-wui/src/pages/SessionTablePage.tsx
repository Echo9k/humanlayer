import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '@/AppStore'
import { Session, SessionStatus, ViewMode } from '@/lib/daemon/types'
import SessionTable from '@/components/internal/SessionTable'
import { useHotkeys } from 'react-hotkeys-hook'
import { useKeyboardNavigationProtection } from '@/hooks'
import { useSessionLauncher } from '@/hooks/useSessionLauncher'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { HOTKEY_SCOPES } from '@/hooks/hotkeys/scopes'
import { DangerouslySkipPermissionsDialog } from '@/components/internal/SessionDetail/DangerouslySkipPermissionsDialog'
import { HotkeyScopeBoundary } from '@/components/HotkeyScopeBoundary'
import { toast } from 'sonner'
import { FolderTree, List, Eye, EyeOff } from 'lucide-react'
import {
  getArchiveGroupByFolderPreference,
  setArchiveGroupByFolderPreference,
  getArchiveHideReviewedPreference,
  setArchiveHideReviewedPreference,
  getNormalGroupByFolderPreference,
  setNormalGroupByFolderPreference,
  getDraftsGroupByFolderPreference,
  setDraftsGroupByFolderPreference,
  getSessionSortColumn,
  setSessionSortColumn,
  getSessionSortDirection,
  setSessionSortDirection,
  SessionSortColumn,
  SortDirection,
} from '@/lib/preferences'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export function SessionTablePage() {
  const isSessionLauncherOpen = useSessionLauncher(state => state.isOpen)
  const navigate = useNavigate()
  const tableRef = useRef<HTMLDivElement>(null)

  // Focus source tracking
  const [, setFocusSource] = useState<'mouse' | 'keyboard' | null>(null)

  // Group by folder preferences for each view
  const [normalGroupByFolder, setNormalGroupByFolder] = useState(() =>
    getNormalGroupByFolderPreference(),
  )
  const [draftsGroupByFolder, setDraftsGroupByFolder] = useState(() =>
    getDraftsGroupByFolderPreference(),
  )
  const [archiveGroupByFolder, setArchiveGroupByFolder] = useState(() =>
    getArchiveGroupByFolderPreference(),
  )

  const toggleGroupByFolder = useCallback(() => {
    const viewMode = useStore.getState().getViewMode()
    if (viewMode === ViewMode.Normal) {
      setNormalGroupByFolder(prev => {
        const newValue = !prev
        setNormalGroupByFolderPreference(newValue)
        return newValue
      })
    } else if (viewMode === ViewMode.Drafts) {
      setDraftsGroupByFolder(prev => {
        const newValue = !prev
        setDraftsGroupByFolderPreference(newValue)
        return newValue
      })
    } else {
      setArchiveGroupByFolder(prev => {
        const newValue = !prev
        setArchiveGroupByFolderPreference(newValue)
        return newValue
      })
    }
  }, [])

  // Hide reviewed preference for archived view
  const [hideReviewed, setHideReviewed] = useState(() => getArchiveHideReviewedPreference())

  const toggleHideReviewed = useCallback(() => {
    setHideReviewed(prev => {
      const newValue = !prev
      setArchiveHideReviewedPreference(newValue)
      return newValue
    })
  }, [])

  // Sort preferences
  const [sortColumn, setSortColumnState] = useState<SessionSortColumn>(() => getSessionSortColumn())
  const [sortDirection, setSortDirectionState] = useState<SortDirection>(() =>
    getSessionSortDirection(),
  )

  const handleSortChange = useCallback((column: SessionSortColumn) => {
    setSortColumnState(prevColumn => {
      if (prevColumn === column) {
        // Toggle direction if same column
        setSortDirectionState(prevDirection => {
          const newDirection = prevDirection === 'asc' ? 'desc' : 'asc'
          setSessionSortDirection(newDirection)
          return newDirection
        })
        return column
      } else {
        // New column, default to descending for dates, ascending for text
        const defaultDirection =
          column === 'createdAt' || column === 'lastActivityAt' ? 'desc' : 'asc'
        setSortDirectionState(defaultDirection)
        setSessionSortDirection(defaultDirection)
        setSessionSortColumn(column)
        return column
      }
    })
  }, [])

  // Sort sessions based on current sort column and direction
  const sortSessions = useCallback(
    (sessionsToSort: Session[]): Session[] => {
      if (!sortColumn) return sessionsToSort

      return [...sessionsToSort].sort((a, b) => {
        let comparison = 0

        switch (sortColumn) {
          case 'status': {
            // Define status order for sorting (active states first)
            const statusOrder: Record<string, number> = {
              [SessionStatus.Running]: 0,
              [SessionStatus.WaitingInput]: 1,
              [SessionStatus.Starting]: 2,
              [SessionStatus.Interrupting]: 3,
              [SessionStatus.Interrupted]: 4,
              [SessionStatus.Completed]: 5,
              [SessionStatus.Failed]: 6,
              [SessionStatus.Draft]: 7,
              [SessionStatus.Discarded]: 8,
            }
            const aOrder = statusOrder[a.status] ?? 99
            const bOrder = statusOrder[b.status] ?? 99
            comparison = aOrder - bOrder
            break
          }
          case 'workingDir': {
            const aDir = a.workingDir || ''
            const bDir = b.workingDir || ''
            comparison = aDir.localeCompare(bDir)
            break
          }
          case 'title': {
            const aTitle = a.title || a.summary || a.query || ''
            const bTitle = b.title || b.summary || b.query || ''
            comparison = aTitle.localeCompare(bTitle)
            break
          }
          case 'model': {
            const aModel = a.model || ''
            const bModel = b.model || ''
            comparison = aModel.localeCompare(bModel)
            break
          }
          case 'createdAt': {
            const aTime = new Date(a.createdAt).getTime()
            const bTime = new Date(b.createdAt).getTime()
            comparison = aTime - bTime
            break
          }
          case 'lastActivityAt': {
            const aTime = new Date(a.lastActivityAt).getTime()
            const bTime = new Date(b.lastActivityAt).getTime()
            comparison = aTime - bTime
            break
          }
        }

        return sortDirection === 'asc' ? comparison : -comparison
      })
    },
    [sortColumn, sortDirection],
  )

  // Keyboard navigation protection
  const { shouldIgnoreMouseEvent, startKeyboardNavigation } = useKeyboardNavigationProtection()

  const sessions = useStore(state => state.sessions)
  const viewModeState = useStore(state => state.getViewMode)
  const sortedSessions = useMemo(() => {
    // Filter out reviewed sessions in Archive view when hideReviewed is true
    const filteredSessions =
      viewModeState() === ViewMode.Archived && hideReviewed
        ? sessions.filter(s => !s.reviewed)
        : sessions
    return sortSessions(filteredSessions)
  }, [sessions, sortSessions, viewModeState, hideReviewed])
  const sessionCounts = useStore(state => state.sessionCounts)
  const selectedSessions = useStore(state => state.selectedSessions)
  const clearSelection = useStore(state => state.clearSelection)
  const focusedSession = useStore(state => state.focusedSession)
  const setFocusedSession = useStore(state => state.setFocusedSession)
  const setNextViewMode = useStore(state => state.setNextViewMode)
  const setPreviousViewMode = useStore(state => state.setPreviousViewMode)
  const getViewMode = useStore(state => state.getViewMode)
  const setViewMode = useStore(state => state.setViewMode)

  const viewMode = getViewMode()
  const refreshSessions = useStore(state => state.refreshSessions)

  // Refresh sessions when view mode changes to drafts
  useEffect(() => {
    if (viewMode === ViewMode.Drafts) {
      refreshSessions()
    }
  }, [viewMode, refreshSessions])

  // Bypass permissions modal state
  const [bypassPermissionsOpen, setBypassPermissionsOpen] = useState(false)
  const [bypassSessionIds, setBypassSessionIds] = useState<string[]>([])

  // Handler for direct disable (no modal)
  const handleDirectDisable = useCallback(async (sessionIds: string[]) => {
    try {
      await useStore.getState().bulkSetBypassPermissions(sessionIds, false, null)
      // No toast - silent like SessionDetail
    } catch (error) {
      console.error('Failed to disable bypass permissions', error)
      toast.error('Failed to disable bypass permissions')
    }
  }, [])

  // Handler for hotkey trigger with intelligent toggle logic
  const handleBypassPermissions = useCallback(
    (sessionIds: string[]) => {
      // Get the actual session objects
      const selectedSessionObjects = sessionIds
        .map(id => sessions.find(s => s.id === id))
        .filter(Boolean) as typeof sessions

      if (selectedSessionObjects.length === 0) return

      // Check bypass status of all selected sessions
      const bypassStatuses = selectedSessionObjects.map(s => s.dangerouslySkipPermissions)
      const allBypassing = bypassStatuses.every(status => status === true)

      if (selectedSessionObjects.length === 1) {
        // Single session behavior - matches SessionDetail
        const session = selectedSessionObjects[0]

        if (session.dangerouslySkipPermissions) {
          // Directly disable without modal (like SessionDetail.tsx:729-739)
          handleDirectDisable([session.id])
        } else {
          // Show modal to enable
          setBypassSessionIds([session.id])
          setBypassPermissionsOpen(true)
        }
      } else {
        // Multiple sessions behavior
        if (allBypassing) {
          // All are bypassing - disable all without modal
          handleDirectDisable(sessionIds)
        } else {
          // Mixed state or none bypassing - show modal to enable/refresh all
          setBypassSessionIds(sessionIds)
          setBypassPermissionsOpen(true)
        }
      }
    },
    [sessions, handleDirectDisable],
  )

  // Handler for modal confirmation
  const handleBypassPermissionsConfirm = useCallback(
    async (timeoutMinutes: number | null) => {
      try {
        const expiresAt = timeoutMinutes ? new Date(Date.now() + timeoutMinutes * 60 * 1000) : null

        await useStore.getState().bulkSetBypassPermissions(bypassSessionIds, true, expiresAt)

        toast.success(`Bypass permissions enabled for ${bypassSessionIds.length} session(s)`)
        setBypassPermissionsOpen(false)
        setBypassSessionIds([])
      } catch {
        toast.error('Failed to enable bypass permissions')
      }
    },
    [bypassSessionIds],
  )

  const handleActivateSession = (session: any) => {
    // Route draft sessions to the dedicated draft route
    if (session.status === 'draft') {
      navigate(`/sessions/draft?id=${session.id}`)
    } else {
      navigate(`/sessions/${session.id}`)
    }
  }

  // Custom navigation functions that work with sorted sessions
  const focusNextSession = () => {
    if (sortedSessions.length === 0) return

    startKeyboardNavigation()

    const currentIndex = focusedSession
      ? sortedSessions.findIndex(s => s.id === focusedSession.id)
      : -1

    // If no session is focused or we're at the last session, focus the first session
    if (currentIndex === -1 || currentIndex === sortedSessions.length - 1) {
      setFocusedSession(sortedSessions[0])
    } else {
      // Focus the next session
      setFocusedSession(sortedSessions[currentIndex + 1])
    }
    setFocusSource('keyboard')
  }

  const focusPreviousSession = () => {
    if (sortedSessions.length === 0) return

    startKeyboardNavigation()

    const currentIndex = focusedSession
      ? sortedSessions.findIndex(s => s.id === focusedSession.id)
      : -1

    // If no session is focused or we're at the first session, focus the last session
    if (currentIndex === -1 || currentIndex === 0) {
      setFocusedSession(sortedSessions[sortedSessions.length - 1])
    } else {
      // Focus the previous session
      setFocusedSession(sortedSessions[currentIndex - 1])
    }
    setFocusSource('keyboard')
  }

  // Handle Tab key to toggle between normal and archived views
  useHotkeys(
    'tab',
    e => {
      e.preventDefault()
      setNextViewMode()
    },
    {
      enableOnFormTags: false,
      scopes: [HOTKEY_SCOPES.SESSIONS, HOTKEY_SCOPES.SESSIONS_ARCHIVED],
      enabled: !isSessionLauncherOpen,
    },
  )

  useHotkeys('shift+tab', e => {
    e.preventDefault()
    setPreviousViewMode()
  })

  // Handle Option+A to trigger auto-accept for selected sessions
  useHotkeys(
    'alt+a',
    async e => {
      e.preventDefault()

      // Find sessions to apply auto-accept to
      let sessionsToUpdate: string[] = []

      if (selectedSessions.size > 0) {
        // If sessions are selected, use those
        sessionsToUpdate = Array.from(selectedSessions)
      } else if (focusedSession) {
        // Otherwise, use the focused session
        sessionsToUpdate = [focusedSession.id]
      }

      if (sessionsToUpdate.length === 0) return

      try {
        // Get the sessions to check their status
        const sessionsData = sessionsToUpdate
          .map(id => sessions.find(s => s.id === id))
          .filter(Boolean) as any[]

        // Check if all selected sessions have the same auto-accept status
        const autoAcceptStatuses = sessionsData.map(s => s.autoAcceptEdits)
        const allSameStatus = autoAcceptStatuses.every(status => status === autoAcceptStatuses[0])

        // Toggle the auto-accept status (if all true, turn off; otherwise turn on)
        const newAutoAcceptStatus = allSameStatus ? !autoAcceptStatuses[0] : true

        // Call the bulk update method
        await useStore.getState().bulkSetAutoAcceptEdits(sessionsToUpdate, newAutoAcceptStatus)

        // Show success notification
        const action = newAutoAcceptStatus ? 'enabled' : 'disabled'
        const sessionText =
          sessionsToUpdate.length === 1 ? 'session' : `${sessionsToUpdate.length} sessions`

        toast.success(`Auto-accept edits ${action} for ${sessionText}`, {
          duration: 3000,
        })
      } catch (error) {
        toast.error('Failed to update auto-accept settings', {
          description: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    },
    {
      enableOnFormTags: false,
      scopes: [HOTKEY_SCOPES.SESSIONS, HOTKEY_SCOPES.SESSIONS_ARCHIVED],
      enabled: !isSessionLauncherOpen,
    },
    [selectedSessions, focusedSession, sessions],
  )

  // Handle 'gg' to jump to top of list (vim-style)
  useHotkeys(
    'g>g',
    () => {
      startKeyboardNavigation()
      setFocusSource('keyboard')

      // Find the main scrollable container (from Layout)
      const container = document.querySelector('[data-main-scroll-container]')
      if (container) {
        container.scrollTop = 0
      }
      // Also focus the first session
      if (sortedSessions.length > 0) {
        setFocusedSession(sortedSessions[0])
      }
    },
    {
      enableOnFormTags: false,
      scopes: [HOTKEY_SCOPES.SESSIONS, HOTKEY_SCOPES.SESSIONS_ARCHIVED],
      enabled: !isSessionLauncherOpen,
      preventDefault: true,
    },
  )

  // Handle 'shift+g' to jump to bottom of list (vim-style)
  useHotkeys(
    'shift+g',
    () => {
      startKeyboardNavigation()
      setFocusSource('keyboard')

      // Find the main scrollable container (from Layout)
      const container = document.querySelector('[data-main-scroll-container]')
      if (container) {
        container.scrollTop = container.scrollHeight
      }
      // Also focus the last session
      if (sortedSessions.length > 0) {
        setFocusedSession(sortedSessions[sortedSessions.length - 1])
      }
    },
    {
      enableOnFormTags: false,
      scopes: [HOTKEY_SCOPES.SESSIONS, HOTKEY_SCOPES.SESSIONS_ARCHIVED],
      enabled: !isSessionLauncherOpen,
      preventDefault: true,
    },
  )

  // Handle ESC to go back to normal view from archived
  useHotkeys(
    'escape',
    () => {
      if (selectedSessions.size > 0) {
        clearSelection()
        return
      }

      if (viewMode === ViewMode.Archived) {
        setViewMode(ViewMode.Normal)
      }
    },
    {
      enableOnFormTags: false,
      scopes: [HOTKEY_SCOPES.SESSIONS_ARCHIVED],
      enabled: !isSessionLauncherOpen && viewMode === ViewMode.Archived,
      preventDefault: true,
    },
    [selectedSessions, viewMode],
  )

  // Handle ESC to clear selection in normal sessions view
  useHotkeys(
    'escape',
    () => {
      if (selectedSessions.size > 0) {
        clearSelection()
      }
    },
    {
      enableOnFormTags: false,
      scopes: [HOTKEY_SCOPES.SESSIONS],
      enabled: !isSessionLauncherOpen && viewMode === ViewMode.Normal && selectedSessions.size > 0,
      preventDefault: true,
    },
    [selectedSessions, viewMode],
  )

  return (
    <div className="flex flex-col gap-4">
      <nav className="sticky top-0 z-10 flex items-center justify-between gap-4">
        <Tabs
          className="w-[400px]"
          value={viewMode}
          onValueChange={value => setViewMode(value as ViewMode)}
        >
          <TabsList>
            <TabsTrigger value={ViewMode.Normal}>
              Sessions
              {sessionCounts?.normal !== undefined && sessionCounts.normal > 0
                ? ` (${sessionCounts.normal})`
                : ''}
            </TabsTrigger>
            <TabsTrigger value={ViewMode.Drafts}>
              Drafts
              {sessionCounts?.draft !== undefined && sessionCounts.draft > 0
                ? ` (${sessionCounts.draft})`
                : ''}
            </TabsTrigger>
            <TabsTrigger value={ViewMode.Archived}>Archived</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          {/* Hide reviewed toggle - only shown in archived view */}
          {viewMode === ViewMode.Archived && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={toggleHideReviewed}
                  size="sm"
                  variant={hideReviewed ? 'default' : 'outline'}
                  className="gap-1.5"
                >
                  {hideReviewed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  {hideReviewed ? 'Hiding reviewed' : 'Showing all'}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {hideReviewed ? 'Show reviewed sessions' : 'Hide reviewed sessions'}
              </TooltipContent>
            </Tooltip>
          )}

          {/* Group by folder toggle - available for all views */}
          {(() => {
            const currentGroupByFolder =
              viewMode === ViewMode.Normal
                ? normalGroupByFolder
                : viewMode === ViewMode.Drafts
                  ? draftsGroupByFolder
                  : archiveGroupByFolder
            return (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={toggleGroupByFolder}
                    size="sm"
                    variant={currentGroupByFolder ? 'default' : 'outline'}
                    className="gap-1.5"
                  >
                    {currentGroupByFolder ? (
                      <FolderTree className="h-4 w-4" />
                    ) : (
                      <List className="h-4 w-4" />
                    )}
                    {currentGroupByFolder ? 'Grouped' : 'Flat'}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {currentGroupByFolder ? 'Switch to flat list view' : 'Group sessions by folder'}
                </TooltipContent>
              </Tooltip>
            )
          })()}

          {/* Only show Create button when not in empty state for normal/drafts view */}
          {(viewMode === ViewMode.Archived || sessions.length > 0) && (
            <Button
              onClick={() => {
                navigate('/sessions/draft')
              }}
              size="sm"
              variant="outline"
            >
              Create <kbd className="ml-1 px-1 py-0.5 text-xs bg-muted/50 rounded">c</kbd>
            </Button>
          )}
        </div>
      </nav>
      <div ref={tableRef} tabIndex={-1} className="focus:outline-none">
        <SessionTable
          sessions={sortedSessions}
          handleFocusSession={session => {
            if (!shouldIgnoreMouseEvent()) {
              setFocusedSession(session)
              setFocusSource('mouse')
            }
          }}
          handleBlurSession={() => {
            if (!shouldIgnoreMouseEvent()) {
              setFocusedSession(null)
              setFocusSource(null)
            }
          }}
          handleActivateSession={handleActivateSession}
          focusedSession={focusedSession}
          handleFocusNextSession={focusNextSession}
          handleFocusPreviousSession={focusPreviousSession}
          searchText={undefined}
          matchedSessions={undefined}
          isArchivedView={viewMode === ViewMode.Archived}
          isDraftsView={viewMode === ViewMode.Drafts}
          onNavigateToSessions={() => setViewMode(ViewMode.Normal)}
          onBypassPermissions={handleBypassPermissions}
          groupByFolder={
            viewMode === ViewMode.Normal
              ? normalGroupByFolder
              : viewMode === ViewMode.Drafts
                ? draftsGroupByFolder
                : archiveGroupByFolder
          }
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSortChange={handleSortChange}
        />
      </div>
      <HotkeyScopeBoundary
        scope={HOTKEY_SCOPES.SESSIONS_BYPASS_PERMISSIONS_MODAL}
        isActive={bypassPermissionsOpen}
        rootScopeDisabled={true}
        componentName="SessionListBypassPermissionsDialog"
      >
        <DangerouslySkipPermissionsDialog
          open={bypassPermissionsOpen}
          onOpenChange={setBypassPermissionsOpen}
          onConfirm={handleBypassPermissionsConfirm}
          sessionCount={bypassSessionIds.length}
        />
      </HotkeyScopeBoundary>
    </div>
  )
}
