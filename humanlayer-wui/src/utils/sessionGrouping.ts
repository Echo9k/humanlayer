import { Session } from '@/lib/daemon/types'

export interface SessionGroup {
  folder: string
  displayName: string
  sessions: Session[]
}

/**
 * Groups sessions by their working directory.
 * Sessions without a working directory are grouped under "No Working Directory".
 */
export function groupSessionsByFolder(sessions: Session[]): SessionGroup[] {
  const groups = new Map<string, Session[]>()

  for (const session of sessions) {
    const folder = session.workingDir || ''
    if (!groups.has(folder)) {
      groups.set(folder, [])
    }
    groups.get(folder)!.push(session)
  }

  // Convert to array and sort by folder name
  const result: SessionGroup[] = []

  // Sort folders alphabetically, but put empty folder last
  const sortedFolders = Array.from(groups.keys()).sort((a, b) => {
    if (a === '' && b !== '') return 1
    if (b === '' && a !== '') return -1
    return a.localeCompare(b)
  })

  for (const folder of sortedFolders) {
    const sessions = groups.get(folder)!
    result.push({
      folder,
      displayName: folder || 'No Working Directory',
      sessions,
    })
  }

  return result
}

/**
 * Gets just the last part of a path for display (e.g., "my-project" from "/home/user/my-project")
 */
export function getShortFolderName(folder: string): string {
  if (!folder) return 'No Working Directory'
  const parts = folder.split('/')
  return parts[parts.length - 1] || folder
}
