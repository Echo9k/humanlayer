import { useState, useEffect } from 'react'
import { Key, ExternalLink, Eye, EyeOff } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { SensitiveInput } from '@/components/ui/sensitive-input'
import { getServerTemplate } from '@/lib/mcp/presets'
import { getMCPEnvValue, setMCPEnvValue, ENV_KEY_LABELS, ENV_KEY_PLACEHOLDERS } from '@/lib/mcp/keys'

interface MCPApiKeyDialogProps {
  /** Server ID to configure */
  serverId: string
  /** Whether the dialog is open */
  open: boolean
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void
  /** Callback when keys are saved */
  onSave: () => void
}

/**
 * Help links for obtaining API keys
 */
const API_KEY_HELP_LINKS: Record<string, string> = {
  BRAVE_API_KEY: 'https://brave.com/search/api/',
  PERPLEXITY_API_KEY: 'https://docs.perplexity.ai/',
  GITHUB_PERSONAL_ACCESS_TOKEN: 'https://github.com/settings/tokens',
  GITLAB_PERSONAL_ACCESS_TOKEN: 'https://docs.gitlab.com/ee/user/profile/personal_access_tokens.html',
  NOTION_API_TOKEN: 'https://www.notion.so/my-integrations',
  SLACK_BOT_TOKEN: 'https://api.slack.com/apps',
  CLOUDFLARE_API_TOKEN: 'https://dash.cloudflare.com/profile/api-tokens',
  FIRECRAWL_API_KEY: 'https://firecrawl.dev/',
}

export function MCPApiKeyDialog({ serverId, open, onOpenChange, onSave }: MCPApiKeyDialogProps) {
  const template = getServerTemplate(serverId)
  const [values, setValues] = useState<Record<string, string>>({})
  const [showValues, setShowValues] = useState<Record<string, boolean>>({})

  // Load existing values when dialog opens
  useEffect(() => {
    if (open && template?.envKeys) {
      const loaded: Record<string, string> = {}
      for (const key of template.envKeys) {
        loaded[key] = getMCPEnvValue(key) || ''
      }
      setValues(loaded)
    }
  }, [open, template])

  if (!template || !template.envKeys || template.envKeys.length === 0) {
    return null
  }

  const handleSave = () => {
    // Save all values
    for (const [key, value] of Object.entries(values)) {
      setMCPEnvValue(key, value.trim())
    }
    onSave()
  }

  const handleValueChange = (key: string, value: string) => {
    setValues(prev => ({ ...prev, [key]: value }))
  }

  const toggleShowValue = (key: string) => {
    setShowValues(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const allFilled = template.envKeys.every(key => values[key]?.trim())

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            Configure {template.name}
          </DialogTitle>
          <DialogDescription>
            {template.description}
            <br />
            <span className="text-xs text-muted-foreground">{template.package}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {template.envKeys.map(envKey => {
            const label = ENV_KEY_LABELS[envKey] || envKey
            const placeholder = ENV_KEY_PLACEHOLDERS[envKey] || ''
            const helpLink = API_KEY_HELP_LINKS[envKey]
            const isPassword =
              envKey.toLowerCase().includes('key') ||
              envKey.toLowerCase().includes('token') ||
              envKey.toLowerCase().includes('secret')

            return (
              <div key={envKey} className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor={envKey} className="text-sm">
                    {label}
                  </Label>
                  {helpLink && (
                    <a
                      href={helpLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                    >
                      Get key <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                <div className="relative">
                  <SensitiveInput
                    id={envKey}
                    type={isPassword && !showValues[envKey] ? 'password' : 'text'}
                    value={values[envKey] || ''}
                    onChange={e => handleValueChange(envKey, e.target.value)}
                    placeholder={placeholder}
                    className="pr-10"
                  />
                  {isPassword && (
                    <button
                      type="button"
                      onClick={() => toggleShowValue(envKey)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showValues[envKey] ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!allFilled}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
