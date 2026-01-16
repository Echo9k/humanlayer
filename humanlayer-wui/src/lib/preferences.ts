// Storage keys
export const ARCHIVE_ON_FORK_KEY = 'archive-source-on-fork'
export const ARCHIVE_GROUP_BY_FOLDER_KEY = 'archive-group-by-folder'
export const ARCHIVE_HIDE_REVIEWED_KEY = 'archive-hide-reviewed'
export const SESSION_SORT_COLUMN_KEY = 'session-sort-column'
export const SESSION_SORT_DIRECTION_KEY = 'session-sort-direction'

// Sort column types
export type SessionSortColumn =
  | 'status'
  | 'workingDir'
  | 'title'
  | 'model'
  | 'createdAt'
  | 'lastActivityAt'
export type SortDirection = 'asc' | 'desc'

// Draft Launcher preference keys
export const DRAFT_LAUNCHER_PREFS = {
  BYPASS_PERMISSIONS: 'draft-launcher-bypass-permissions',
  AUTO_ACCEPT: 'draft-launcher-auto-accept',
} as const

// Commit dialog preference keys
export const COMMIT_PREFS = {
  AUTO_ARCHIVE: 'commit-auto-archive-session',
  INCLUDE_UNTRACKED: 'commit-include-untracked',
} as const

// Helper functions
export const getArchiveOnForkPreference = (): boolean => {
  const stored = localStorage.getItem(ARCHIVE_ON_FORK_KEY)
  return stored !== 'false' // Default to true
}

export const setArchiveOnForkPreference = (value: boolean): void => {
  localStorage.setItem(ARCHIVE_ON_FORK_KEY, String(value))
}

export const getArchiveGroupByFolderPreference = (): boolean => {
  const stored = localStorage.getItem(ARCHIVE_GROUP_BY_FOLDER_KEY)
  return stored === 'true' // Default to false
}

export const setArchiveGroupByFolderPreference = (value: boolean): void => {
  localStorage.setItem(ARCHIVE_GROUP_BY_FOLDER_KEY, String(value))
}

export const getArchiveHideReviewedPreference = (): boolean => {
  const stored = localStorage.getItem(ARCHIVE_HIDE_REVIEWED_KEY)
  return stored === 'true' // Default to false
}

export const setArchiveHideReviewedPreference = (value: boolean): void => {
  localStorage.setItem(ARCHIVE_HIDE_REVIEWED_KEY, String(value))
}

// Draft Launcher helper functions
export function getDraftLauncherDefaults() {
  return {
    bypassPermissions: false,
    autoAccept: false,
  }
}

// Commit dialog helper functions
export const getCommitAutoArchivePreference = (): boolean => {
  const stored = localStorage.getItem(COMMIT_PREFS.AUTO_ARCHIVE)
  return stored === 'true' // Default to false
}

export const setCommitAutoArchivePreference = (value: boolean): void => {
  localStorage.setItem(COMMIT_PREFS.AUTO_ARCHIVE, String(value))
}

export const getCommitIncludeUntrackedPreference = (): boolean => {
  const stored = localStorage.getItem(COMMIT_PREFS.INCLUDE_UNTRACKED)
  return stored !== 'false' // Default to true
}

export const setCommitIncludeUntrackedPreference = (value: boolean): void => {
  localStorage.setItem(COMMIT_PREFS.INCLUDE_UNTRACKED, String(value))
}

// Session sort helper functions
export const getSessionSortColumn = (): SessionSortColumn => {
  const stored = localStorage.getItem(SESSION_SORT_COLUMN_KEY)
  const validColumns: SessionSortColumn[] = [
    'status',
    'workingDir',
    'title',
    'model',
    'createdAt',
    'lastActivityAt',
  ]
  if (stored && validColumns.includes(stored as SessionSortColumn)) {
    return stored as SessionSortColumn
  }
  return 'lastActivityAt' // Default sort by last activity
}

export const setSessionSortColumn = (value: SessionSortColumn): void => {
  localStorage.setItem(SESSION_SORT_COLUMN_KEY, value)
}

export const getSessionSortDirection = (): SortDirection => {
  const stored = localStorage.getItem(SESSION_SORT_DIRECTION_KEY)
  if (stored === 'asc' || stored === 'desc') {
    return stored
  }
  return 'desc' // Default to descending (newest first)
}

export const setSessionSortDirection = (value: SortDirection): void => {
  localStorage.setItem(SESSION_SORT_DIRECTION_KEY, value)
}
