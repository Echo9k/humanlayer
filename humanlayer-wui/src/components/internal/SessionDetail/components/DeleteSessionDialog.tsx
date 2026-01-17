import React, { useState, useEffect } from 'react'
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
  useTimer?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export const DeleteSessionDialog: React.FC<DeleteSessionDialogProps> = ({
  open,
  onConfirm,
  onCancel,
  sessionCount = 1,
  useTimer = false,
}) => {
  const isMac = navigator.platform.includes('Mac')
  const [countdown, setCountdown] = useState(3)
  const canConfirm = !useTimer || countdown === 0

  // Countdown timer effect
  useEffect(() => {
    if (open && useTimer) {
      setCountdown(3)
      const interval = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(interval)
            return 0
          }
          return prev - 1
        })
      }, 1000)
      return () => clearInterval(interval)
    }
  }, [open, useTimer])

  useHotkeys(
    'mod+enter',
    () => {
      if (open && canConfirm) {
        onConfirm()
      }
    },
    { enabled: open && canConfirm, enableOnFormTags: true },
    [open, canConfirm, onConfirm],
  )

  useHotkeys(
    'escape',
    ev => {
      ev.preventDefault()
      ev.stopPropagation()
      onCancel()
    },
    { enabled: open, enableOnFormTags: true, preventDefault: true },
    [open, onCancel],
  )

  const headerText = sessionCount > 1 ? `Delete ${sessionCount} Sessions?` : 'Delete Session?'

  const descriptionText =
    sessionCount > 1
      ? `Are you sure you want to permanently delete ${sessionCount} sessions? This action cannot be undone.`
      : 'Are you sure you want to permanently delete this session? This action cannot be undone.'

  const buttonText =
    useTimer && countdown > 0 ? `Delete Permanently (${countdown}s)` : 'Delete Permanently'

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
            <Button variant="destructive" onClick={onConfirm} disabled={!canConfirm}>
              {buttonText}
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
