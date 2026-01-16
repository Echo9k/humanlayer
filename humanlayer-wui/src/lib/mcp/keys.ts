import { MCP_SERVER_TEMPLATES, MCPServerTemplate } from './presets'

/**
 * Storage key prefix for MCP API keys
 */
const MCP_KEY_PREFIX = 'humanlayer-mcp-'

/**
 * Storage key for selected MCP servers
 */
const MCP_SELECTED_SERVERS_KEY = 'humanlayer-mcp-selected-servers'

/**
 * Storage key for selected MCP presets
 */
const MCP_SELECTED_PRESETS_KEY = 'humanlayer-mcp-selected-presets'

/**
 * Human-readable labels for environment variable keys
 */
export const ENV_KEY_LABELS: Record<string, string> = {
  BRAVE_API_KEY: 'Brave Search API Key',
  PERPLEXITY_API_KEY: 'Perplexity API Key',
  GITHUB_PERSONAL_ACCESS_TOKEN: 'GitHub Personal Access Token',
  GITLAB_PERSONAL_ACCESS_TOKEN: 'GitLab Personal Access Token',
  GITLAB_API_URL: 'GitLab API URL',
  POSTGRES_CONNECTION_STRING: 'PostgreSQL Connection String',
  AWS_ACCESS_KEY_ID: 'AWS Access Key ID',
  AWS_SECRET_ACCESS_KEY: 'AWS Secret Access Key',
  AWS_REGION: 'AWS Region',
  CLOUDFLARE_API_TOKEN: 'Cloudflare API Token',
  NOTION_API_TOKEN: 'Notion API Token',
  SLACK_BOT_TOKEN: 'Slack Bot Token',
  FIRECRAWL_API_KEY: 'Firecrawl API Key',
}

/**
 * Placeholder text for environment variable inputs
 */
export const ENV_KEY_PLACEHOLDERS: Record<string, string> = {
  BRAVE_API_KEY: 'BSA...',
  PERPLEXITY_API_KEY: 'pplx-...',
  GITHUB_PERSONAL_ACCESS_TOKEN: 'ghp_...',
  GITLAB_PERSONAL_ACCESS_TOKEN: 'glpat-...',
  GITLAB_API_URL: 'https://gitlab.com/api/v4',
  POSTGRES_CONNECTION_STRING: 'postgresql://user:pass@host:5432/db',
  AWS_ACCESS_KEY_ID: 'AKIA...',
  AWS_SECRET_ACCESS_KEY: '...',
  AWS_REGION: 'us-east-1',
  CLOUDFLARE_API_TOKEN: '...',
  NOTION_API_TOKEN: 'secret_...',
  SLACK_BOT_TOKEN: 'xoxb-...',
  FIRECRAWL_API_KEY: 'fc-...',
}

/**
 * Get the storage key for an MCP environment variable
 */
function getStorageKey(envKey: string): string {
  return `${MCP_KEY_PREFIX}${envKey.toLowerCase().replace(/_/g, '-')}`
}

/**
 * Get an MCP API key from localStorage
 */
export function getMCPEnvValue(envKey: string): string | null {
  try {
    return localStorage.getItem(getStorageKey(envKey))
  } catch {
    return null
  }
}

/**
 * Set an MCP API key in localStorage
 */
export function setMCPEnvValue(envKey: string, value: string): void {
  try {
    if (value) {
      localStorage.setItem(getStorageKey(envKey), value)
    } else {
      localStorage.removeItem(getStorageKey(envKey))
    }
  } catch (e) {
    console.error('Failed to save MCP env value:', e)
  }
}

/**
 * Remove an MCP API key from localStorage
 */
export function removeMCPEnvValue(envKey: string): void {
  try {
    localStorage.removeItem(getStorageKey(envKey))
  } catch (e) {
    console.error('Failed to remove MCP env value:', e)
  }
}

/**
 * Get all stored environment values for a server template
 */
export function getServerEnvValues(template: MCPServerTemplate): Record<string, string> {
  const values: Record<string, string> = {}
  if (template.envKeys) {
    for (const key of template.envKeys) {
      const value = getMCPEnvValue(key)
      if (value) {
        values[key] = value
      }
    }
  }
  return values
}

/**
 * Check if a server has all required environment values configured
 */
export function hasRequiredEnvValues(template: MCPServerTemplate): boolean {
  if (!template.envKeys || template.envKeys.length === 0) {
    return true
  }
  return template.envKeys.every(key => {
    const value = getMCPEnvValue(key)
    return value !== null && value.trim() !== ''
  })
}

/**
 * Get missing environment keys for a server
 */
export function getMissingEnvKeys(template: MCPServerTemplate): string[] {
  if (!template.envKeys || template.envKeys.length === 0) {
    return []
  }
  return template.envKeys.filter(key => {
    const value = getMCPEnvValue(key)
    return value === null || value.trim() === ''
  })
}

/**
 * Save selected server IDs to localStorage
 */
export function saveSelectedServers(serverIds: string[]): void {
  try {
    localStorage.setItem(MCP_SELECTED_SERVERS_KEY, JSON.stringify(serverIds))
  } catch (e) {
    console.error('Failed to save selected servers:', e)
  }
}

/**
 * Load selected server IDs from localStorage
 */
export function loadSelectedServers(): string[] {
  try {
    const stored = localStorage.getItem(MCP_SELECTED_SERVERS_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) {
        // Validate that all IDs exist in templates
        return parsed.filter(id => MCP_SERVER_TEMPLATES.some(t => t.id === id))
      }
    }
  } catch (e) {
    console.error('Failed to load selected servers:', e)
  }
  return []
}

/**
 * Save selected preset IDs to localStorage
 */
export function saveSelectedPresets(presetIds: string[]): void {
  try {
    localStorage.setItem(MCP_SELECTED_PRESETS_KEY, JSON.stringify(presetIds))
  } catch (e) {
    console.error('Failed to save selected presets:', e)
  }
}

/**
 * Load selected preset IDs from localStorage
 */
export function loadSelectedPresets(): string[] {
  try {
    const stored = localStorage.getItem(MCP_SELECTED_PRESETS_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed)) {
        return parsed
      }
    }
  } catch (e) {
    console.error('Failed to load selected presets:', e)
  }
  return []
}

/**
 * Get all unique env keys that need values for a set of servers
 */
export function getAllRequiredEnvKeys(serverIds: string[]): string[] {
  const keys = new Set<string>()
  for (const id of serverIds) {
    const template = MCP_SERVER_TEMPLATES.find(t => t.id === id)
    if (template?.envKeys) {
      for (const key of template.envKeys) {
        keys.add(key)
      }
    }
  }
  return Array.from(keys)
}

/**
 * Get all missing env keys for a set of servers
 */
export function getAllMissingEnvKeys(serverIds: string[]): string[] {
  const missing = new Set<string>()
  for (const id of serverIds) {
    const template = MCP_SERVER_TEMPLATES.find(t => t.id === id)
    if (template) {
      for (const key of getMissingEnvKeys(template)) {
        missing.add(key)
      }
    }
  }
  return Array.from(missing)
}
