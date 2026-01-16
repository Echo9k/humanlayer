import { useState, useEffect, useCallback } from 'react'
import {
  Search,
  Code,
  Database,
  Cloud,
  FileText,
  Bot,
  Plus,
  X,
  AlertCircle,
  Settings,
  ChevronDown,
  ChevronUp,
  Plug,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  MCP_PRESETS,
  MCP_SERVER_TEMPLATES,
  MCPPreset,
  MCPServerTemplate,
  getServerTemplate,
  getPresetServers,
  buildServerConfig,
} from '@/lib/mcp/presets'
import {
  loadSelectedServers,
  saveSelectedServers,
  hasRequiredEnvValues,
  getMissingEnvKeys,
  getServerEnvValues,
} from '@/lib/mcp/keys'
import { MCPConfig, MCPServer } from '@/lib/daemon/types'
import { MCPApiKeyDialog } from './MCPApiKeyDialog'

/**
 * Icon mapping for presets
 */
const PRESET_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Search,
  Code,
  Database,
  Cloud,
  FileText,
  Bot,
}

interface MCPServerSelectorProps {
  /** Callback when MCP config changes */
  onConfigChange: (config: MCPConfig | undefined) => void
  /** Initial selected server IDs */
  initialServerIds?: string[]
  /** Whether the selector is expanded by default */
  defaultExpanded?: boolean
}

export function MCPServerSelector({
  onConfigChange,
  initialServerIds,
  defaultExpanded = false,
}: MCPServerSelectorProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  const [selectedServerIds, setSelectedServerIds] = useState<Set<string>>(() => {
    const initial = initialServerIds ?? loadSelectedServers()
    return new Set(initial)
  })
  const [showServerList, setShowServerList] = useState(false)
  const [configureServerId, setConfigureServerId] = useState<string | null>(null)

  // Build and emit MCP config whenever selection changes
  const buildMCPConfig = useCallback((): MCPConfig | undefined => {
    if (selectedServerIds.size === 0) {
      return undefined
    }

    const mcpServers: Record<string, MCPServer> = {}

    for (const serverId of selectedServerIds) {
      const template = getServerTemplate(serverId)
      if (template) {
        const envValues = getServerEnvValues(template)
        mcpServers[serverId] = buildServerConfig(template, envValues)
      }
    }

    return { mcpServers }
  }, [selectedServerIds])

  // Emit config changes
  useEffect(() => {
    const config = buildMCPConfig()
    onConfigChange(config)
  }, [buildMCPConfig, onConfigChange])

  // Save selection to localStorage
  useEffect(() => {
    saveSelectedServers(Array.from(selectedServerIds))
  }, [selectedServerIds])

  // Toggle a server
  const toggleServer = useCallback((serverId: string) => {
    setSelectedServerIds(prev => {
      const next = new Set(prev)
      if (next.has(serverId)) {
        next.delete(serverId)
      } else {
        next.add(serverId)
      }
      return next
    })
  }, [])

  // Toggle a preset (add all servers in preset)
  const togglePreset = useCallback((preset: MCPPreset) => {
    setSelectedServerIds(prev => {
      const next = new Set(prev)
      const allSelected = preset.serverIds.every(id => next.has(id))

      if (allSelected) {
        // Remove all preset servers
        for (const id of preset.serverIds) {
          next.delete(id)
        }
      } else {
        // Add all preset servers
        for (const id of preset.serverIds) {
          next.add(id)
        }
      }
      return next
    })
  }, [])

  // Remove a server
  const removeServer = useCallback((serverId: string) => {
    setSelectedServerIds(prev => {
      const next = new Set(prev)
      next.delete(serverId)
      return next
    })
  }, [])

  // Check if a preset is fully selected
  const isPresetSelected = (preset: MCPPreset): boolean => {
    return preset.serverIds.every(id => selectedServerIds.has(id))
  }

  // Check if a preset is partially selected
  const isPresetPartiallySelected = (preset: MCPPreset): boolean => {
    const selected = preset.serverIds.filter(id => selectedServerIds.has(id))
    return selected.length > 0 && selected.length < preset.serverIds.length
  }

  // Get selected server templates
  const selectedServers = Array.from(selectedServerIds)
    .map(id => getServerTemplate(id))
    .filter((t): t is MCPServerTemplate => t !== undefined)

  // Count servers needing configuration
  const serversNeedingConfig = selectedServers.filter(s => !hasRequiredEnvValues(s))

  return (
    <div className="space-y-2">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger asChild>
          <button className="flex items-center justify-between w-full text-left">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1 cursor-pointer">
              <Plug className="h-3 w-3" /> MCP Servers
              {selectedServerIds.size > 0 && (
                <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0">
                  {selectedServerIds.size}
                </Badge>
              )}
              {serversNeedingConfig.length > 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <AlertCircle className="h-3 w-3 text-amber-500 ml-1" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{serversNeedingConfig.length} server(s) need API keys</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </Label>
            {isExpanded ? (
              <ChevronUp className="h-3 w-3 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            )}
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-2 space-y-3">
          {/* Preset buttons */}
          <div className="flex flex-wrap gap-1">
            {MCP_PRESETS.map(preset => {
              const IconComponent = PRESET_ICONS[preset.icon] || Plug
              const isSelected = isPresetSelected(preset)
              const isPartial = isPresetPartiallySelected(preset)

              return (
                <TooltipProvider key={preset.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant={isSelected ? 'default' : isPartial ? 'secondary' : 'outline'}
                        size="sm"
                        className="h-7 text-xs px-2"
                        onClick={() => togglePreset(preset)}
                      >
                        <IconComponent className="h-3 w-3 mr-1" />
                        {preset.name}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p className="font-medium">{preset.description}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Includes:{' '}
                        {getPresetServers(preset.id)
                          .map(s => s.name)
                          .join(', ')}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )
            })}
          </div>

          {/* Selected servers list */}
          {selectedServers.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Active:</div>
              <div className="flex flex-wrap gap-1">
                {selectedServers.map(server => {
                  const needsConfig = !hasRequiredEnvValues(server)
                  const missingKeys = getMissingEnvKeys(server)

                  return (
                    <TooltipProvider key={server.id}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge
                            variant={needsConfig ? 'outline' : 'secondary'}
                            className={`text-xs cursor-pointer group ${needsConfig ? 'border-amber-500/50' : ''}`}
                          >
                            {needsConfig && <AlertCircle className="h-3 w-3 mr-1 text-amber-500" />}
                            {server.name}
                            <button
                              className="ml-1 opacity-50 hover:opacity-100"
                              onClick={e => {
                                e.stopPropagation()
                                if (needsConfig) {
                                  setConfigureServerId(server.id)
                                } else {
                                  removeServer(server.id)
                                }
                              }}
                            >
                              {needsConfig ? (
                                <Settings className="h-3 w-3" />
                              ) : (
                                <X className="h-3 w-3" />
                              )}
                            </button>
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{server.description}</p>
                          {needsConfig && (
                            <p className="text-xs text-amber-500 mt-1">
                              Missing: {missingKeys.join(', ')}
                            </p>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )
                })}
              </div>
            </div>
          )}

          {/* Add more servers button */}
          <Collapsible open={showServerList} onOpenChange={setShowServerList}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-6 text-xs w-full justify-start">
                <Plus className="h-3 w-3 mr-1" />
                {showServerList ? 'Hide all servers' : 'Add individual servers'}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <div className="grid grid-cols-2 gap-1 max-h-48 overflow-y-auto p-1">
                {MCP_SERVER_TEMPLATES.map(template => {
                  const isSelected = selectedServerIds.has(template.id)
                  const needsConfig = template.envKeys && template.envKeys.length > 0

                  return (
                    <TooltipProvider key={template.id}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant={isSelected ? 'secondary' : 'ghost'}
                            size="sm"
                            className="h-7 text-xs justify-start"
                            onClick={() => toggleServer(template.id)}
                          >
                            <span className="truncate">{template.name}</span>
                            {needsConfig && !isSelected && (
                              <Settings className="h-3 w-3 ml-auto opacity-50" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="right">
                          <p className="font-medium">{template.name}</p>
                          <p className="text-xs">{template.description}</p>
                          <p className="text-xs text-muted-foreground mt-1">{template.package}</p>
                          {template.envKeys && (
                            <p className="text-xs text-amber-500 mt-1">
                              Requires: {template.envKeys.join(', ')}
                            </p>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CollapsibleContent>
      </Collapsible>

      {/* API Key Configuration Dialog */}
      {configureServerId && (
        <MCPApiKeyDialog
          serverId={configureServerId}
          open={!!configureServerId}
          onOpenChange={open => {
            if (!open) setConfigureServerId(null)
          }}
          onSave={() => {
            setConfigureServerId(null)
            // Trigger config rebuild
            const config = buildMCPConfig()
            onConfigChange(config)
          }}
        />
      )}
    </div>
  )
}
