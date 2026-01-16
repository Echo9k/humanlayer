import { MCPServer } from '../daemon/types'

/**
 * MCP Server template with metadata for UI display
 */
export interface MCPServerTemplate {
  /** Unique identifier for this server */
  id: string
  /** Display name */
  name: string
  /** Short description */
  description: string
  /** Package/command info for display */
  package: string
  /** Environment variable keys required (for API key prompts) */
  envKeys?: string[]
  /** Default server configuration */
  config: MCPServer
}

/**
 * MCP Preset - a bundle of servers for a specific task type
 */
export interface MCPPreset {
  /** Unique identifier */
  id: string
  /** Display name */
  name: string
  /** Icon name (lucide-react) */
  icon: string
  /** Short description */
  description: string
  /** Server IDs included in this preset */
  serverIds: string[]
}

/**
 * Available MCP server templates
 * These define the servers that can be added to sessions
 */
export const MCP_SERVER_TEMPLATES: MCPServerTemplate[] = [
  // Web Research
  {
    id: 'brave-search',
    name: 'Brave Search',
    description: 'Web and local search via Brave Search API',
    package: '@modelcontextprotocol/server-brave-search',
    envKeys: ['BRAVE_API_KEY'],
    config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-brave-search'],
    },
  },
  {
    id: 'fetch',
    name: 'Fetch',
    description: 'Fetch and convert web content to markdown',
    package: '@modelcontextprotocol/server-fetch',
    config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-fetch'],
    },
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    description: 'AI-powered search with Perplexity',
    package: '@anthropic-ai/mcp-server-perplexity',
    envKeys: ['PERPLEXITY_API_KEY'],
    config: {
      command: 'npx',
      args: ['-y', '@anthropic-ai/mcp-server-perplexity'],
    },
  },

  // Development Tools
  {
    id: 'git',
    name: 'Git',
    description: 'Git repository operations',
    package: 'mcp-server-git (uvx)',
    config: {
      command: 'uvx',
      args: ['mcp-server-git'],
    },
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'GitHub API integration for repos, issues, PRs',
    package: '@modelcontextprotocol/server-github',
    envKeys: ['GITHUB_PERSONAL_ACCESS_TOKEN'],
    config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
    },
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    description: 'GitLab API integration',
    package: '@modelcontextprotocol/server-gitlab',
    envKeys: ['GITLAB_PERSONAL_ACCESS_TOKEN', 'GITLAB_API_URL'],
    config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-gitlab'],
    },
  },

  // Databases
  {
    id: 'postgres',
    name: 'PostgreSQL',
    description: 'Query PostgreSQL databases',
    package: '@modelcontextprotocol/server-postgres',
    envKeys: ['POSTGRES_CONNECTION_STRING'],
    config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-postgres'],
    },
  },
  {
    id: 'sqlite',
    name: 'SQLite',
    description: 'Query SQLite databases',
    package: '@modelcontextprotocol/server-sqlite',
    config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sqlite'],
    },
  },

  // Cloud & Infrastructure
  {
    id: 'aws',
    name: 'AWS',
    description: 'AWS services integration',
    package: 'aws-mcp-server',
    envKeys: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION'],
    config: {
      command: 'npx',
      args: ['-y', 'aws-mcp-server'],
    },
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    description: 'Cloudflare Workers, KV, R2, D1',
    package: '@cloudflare/mcp-server-cloudflare',
    envKeys: ['CLOUDFLARE_API_TOKEN'],
    config: {
      command: 'npx',
      args: ['-y', '@cloudflare/mcp-server-cloudflare'],
    },
  },

  // Productivity
  {
    id: 'notion',
    name: 'Notion',
    description: 'Notion workspace integration',
    package: '@notionhq/notion-mcp-server',
    envKeys: ['NOTION_API_TOKEN'],
    config: {
      command: 'npx',
      args: ['-y', '@notionhq/notion-mcp-server'],
    },
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Slack messaging and channels',
    package: '@modelcontextprotocol/server-slack',
    envKeys: ['SLACK_BOT_TOKEN'],
    config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-slack'],
    },
  },

  // Web Automation
  {
    id: 'puppeteer',
    name: 'Puppeteer',
    description: 'Browser automation and screenshots',
    package: '@modelcontextprotocol/server-puppeteer',
    config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-puppeteer'],
    },
  },
  {
    id: 'firecrawl',
    name: 'Firecrawl',
    description: 'Web scraping and crawling',
    package: 'firecrawl-mcp',
    envKeys: ['FIRECRAWL_API_KEY'],
    config: {
      command: 'npx',
      args: ['-y', 'firecrawl-mcp'],
    },
  },

  // Utilities
  {
    id: 'filesystem',
    name: 'Filesystem',
    description: 'Secure file system access',
    package: '@modelcontextprotocol/server-filesystem',
    config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem'],
    },
  },
  {
    id: 'memory',
    name: 'Memory',
    description: 'Persistent knowledge graph memory',
    package: '@modelcontextprotocol/server-memory',
    config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-memory'],
    },
  },
  {
    id: 'sequential-thinking',
    name: 'Sequential Thinking',
    description: 'Structured problem-solving through thought sequences',
    package: '@modelcontextprotocol/server-sequential-thinking',
    config: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-sequential-thinking'],
    },
  },
]

/**
 * MCP Presets - bundles of servers for common task types
 */
export const MCP_PRESETS: MCPPreset[] = [
  {
    id: 'research',
    name: 'Web Research',
    icon: 'Search',
    description: 'Search the web and fetch content',
    serverIds: ['brave-search', 'fetch'],
  },
  {
    id: 'development',
    name: 'Code Dev',
    icon: 'Code',
    description: 'Git and GitHub integration',
    serverIds: ['git', 'github'],
  },
  {
    id: 'database',
    name: 'Database',
    icon: 'Database',
    description: 'Query databases',
    serverIds: ['postgres', 'sqlite'],
  },
  {
    id: 'cloud',
    name: 'Cloud',
    icon: 'Cloud',
    description: 'AWS and Cloudflare',
    serverIds: ['aws', 'cloudflare'],
  },
  {
    id: 'productivity',
    name: 'Productivity',
    icon: 'FileText',
    description: 'Notion and Slack',
    serverIds: ['notion', 'slack'],
  },
  {
    id: 'automation',
    name: 'Web Automation',
    icon: 'Bot',
    description: 'Browser automation and scraping',
    serverIds: ['puppeteer', 'firecrawl'],
  },
]

/**
 * Get a server template by ID
 */
export function getServerTemplate(id: string): MCPServerTemplate | undefined {
  return MCP_SERVER_TEMPLATES.find(t => t.id === id)
}

/**
 * Get all server templates for a preset
 */
export function getPresetServers(presetId: string): MCPServerTemplate[] {
  const preset = MCP_PRESETS.find(p => p.id === presetId)
  if (!preset) return []
  return preset.serverIds
    .map(id => getServerTemplate(id))
    .filter((t): t is MCPServerTemplate => t !== undefined)
}

/**
 * Build MCPServer config with environment variables
 */
export function buildServerConfig(
  template: MCPServerTemplate,
  envValues: Record<string, string>,
): MCPServer {
  const config = { ...template.config }

  // Add environment variables if the template has envKeys
  if (template.envKeys && template.envKeys.length > 0) {
    config.env = {}
    for (const key of template.envKeys) {
      if (envValues[key]) {
        config.env[key] = envValues[key]
      }
    }
  }

  return config
}

/**
 * Suggest presets based on query content
 */
export function suggestPresetsForQuery(query: string): string[] {
  const suggestions: string[] = []
  const queryLower = query.toLowerCase()

  // Research indicators
  if (
    queryLower.includes('search') ||
    queryLower.includes('find') ||
    queryLower.includes('look up') ||
    queryLower.includes('research') ||
    queryLower.includes('what is') ||
    queryLower.includes('how to')
  ) {
    suggestions.push('research')
  }

  // Development indicators
  if (
    queryLower.includes('github') ||
    queryLower.includes('git') ||
    queryLower.includes('commit') ||
    queryLower.includes('pull request') ||
    queryLower.includes('pr') ||
    queryLower.includes('branch') ||
    queryLower.includes('merge')
  ) {
    suggestions.push('development')
  }

  // Database indicators
  if (
    queryLower.includes('database') ||
    queryLower.includes('sql') ||
    queryLower.includes('query') ||
    queryLower.includes('postgres') ||
    queryLower.includes('sqlite') ||
    queryLower.includes('table')
  ) {
    suggestions.push('database')
  }

  // Cloud indicators
  if (
    queryLower.includes('aws') ||
    queryLower.includes('cloudflare') ||
    queryLower.includes('lambda') ||
    queryLower.includes('s3') ||
    queryLower.includes('deploy') ||
    queryLower.includes('infrastructure')
  ) {
    suggestions.push('cloud')
  }

  // Productivity indicators
  if (
    queryLower.includes('notion') ||
    queryLower.includes('slack') ||
    queryLower.includes('document') ||
    queryLower.includes('message') ||
    queryLower.includes('notes')
  ) {
    suggestions.push('productivity')
  }

  // Automation indicators
  if (
    queryLower.includes('scrape') ||
    queryLower.includes('crawl') ||
    queryLower.includes('screenshot') ||
    queryLower.includes('browser') ||
    queryLower.includes('automate')
  ) {
    suggestions.push('automation')
  }

  return suggestions
}
