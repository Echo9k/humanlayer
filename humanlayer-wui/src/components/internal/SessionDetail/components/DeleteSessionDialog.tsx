import React from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useHotkeys } from 'react-hotkeys-hook'
import { HotkeyScopeBoundary } from '@/components/HotkeyScopeBoundary'
import { HOTKEY_SCOPES } from '@/hooks/hotkeys/scopes'

interface DeleteSessionDialogProps {
  open: boolean
  sessionCount?: number
  onConfirm: () => void
  onCancel: () => void
}

export const DeleteSessionDialog: React.FC<DeleteSessionDialogProps> = ({
  open,
  onConfirm,
  onCancel,
  sessionCount = 1,
}) => {
  const isMac = navigator.platform.includes('Mac')

  useHotkeys(
    'mod+enter',
    () => {
      if (open) {
        onConfirm()
      }
    },
    { enabled: open, enableOnFormTags: true },
  )

  useHotkeys(
    'escape',
    ev => {
      ev.preventDefault()
      ev.stopPropagation()
      onCancel()
    },
    { enabled: open, enableOnFormTags: true, preventDefault: true },
  )

  const headerText = sessionCount > 1 ? `Delete ${sessionCount} Sessions?` : 'Delete Session?'

  const descriptionText =
    sessionCount > 1
      ? `Are you sure you want to permanently delete ${sessionCount} archived sessions? This action cannot be undone.`
      : 'Are you sure you want to permanently delete this archived session? This action cannot be undone.'

  return (
    <HotkeyScopeBoundary
      scope={HOTKEY_SCOPES.DELETE_CONFIRMATION_DIALOG}
      isActive={open}
      rootScopeDisabled={true}
      componentName="DeleteSessionDialog"
    >
      <Dialog open={open} onOpenChange={onCancel}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{headerText}</DialogTitle>
            <DialogDescription>{descriptionText}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={onCancel}>
              Cancel
              <kbd className="ml-1 px-1 py-0.5 text-xs bg-muted/50 rounded">Esc</kbd>
            </Button>
            <Button variant="destructive" onClick={onConfirm}>
              Delete Permanently
              <kbd className="ml-1 px-1 py-0.5 text-xs bg-muted/50 rounded">
                {isMac ? '⌘+Enter' : 'Ctrl+Enter'}
              </kbd>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </HotkeyScopeBoundary>
  )
}
