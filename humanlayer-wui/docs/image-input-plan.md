# Image Input Support for HumanLayer WUI - Revised Plan

## Overview

Add support for attaching images to approval responses (feedback) and passing images to Claude for analysis. Images are stored as local files with paths passed through the API.

## Architecture

### Image Flow
```
User Input (paste/drop/picker)
    │
    ▼
ImageStorageService.saveImage()
    │ Returns: { filePath, thumbnailDataUrl }
    ▼
TipTap editor with image-node (inline thumbnail preview)
    │
    ▼
On Submit: extractImagesFromEditor()
    │ Returns: ImageAttachment[]
    ▼
http-client.sendDecision(id, decision, comment, images)
    │
    ▼
Daemon validates paths, reads files, encodes base64
    │
    ▼
Daemon stores image metadata in SQLite
    │
    ▼
Daemon includes images in Claude response (MCP protocol)
```

### Storage Strategy
- **Location**: `~/.humanlayer/images/{session_id}/`
- **Naming**: `{timestamp_ms}-{uuid_short}.{ext}`
- **Cleanup**: Images deleted when session is hard-deleted
- **Limits**:
  - Max 10MB per image
  - Max 5 images per response
  - Formats: PNG, JPEG, GIF, WebP

---

## Phase 1: Image Storage Service (Foundation)

### New file: `humanlayer-wui/src/services/ImageStorageService.ts`

```typescript
interface SavedImage {
  filePath: string
  fileName: string
  mimeType: string
  thumbnailDataUrl: string  // base64 data URL for preview
  sizeBytes: number
}

interface ImageStorageService {
  // Save image blob to session directory, generate thumbnail
  saveImage(sessionId: string, blob: Blob, mimeType: string): Promise<SavedImage>

  // Validate image before saving
  validateImage(blob: Blob): { valid: boolean; error?: string }

  // Get images directory for session
  getSessionImageDir(sessionId: string): string

  // Check if file exists
  imageExists(filePath: string): Promise<boolean>
}
```

**Implementation details:**
- Use Tauri FS plugin (`@tauri-apps/plugin-fs`) to write files
- Generate thumbnail client-side using canvas (max 128x128)
- Store in `~/.humanlayer/images/{session_id}/`
- Validate: file size ≤10MB, valid image MIME type

---

## Phase 2: TipTap Image Node Extension

### New file: `humanlayer-wui/src/components/internal/SessionDetail/components/ImageNode.tsx`

Custom TipTap Node component (NOT a Mention extension):

```typescript
// Node attributes
interface ImageNodeAttrs {
  filePath: string
  fileName: string
  mimeType: string
  thumbnailDataUrl: string
}
```

**Visual design:**
- Inline-block element with 64x64 thumbnail
- Hover: show full filename in tooltip, X button to remove
- Click: open in default viewer (optional)
- Border radius, subtle shadow to distinguish from text

### Modify: `humanlayer-wui/src/components/internal/SessionDetail/components/ResponseEditor.tsx`

Add custom Node extension (different from Mention pattern):

```typescript
import { Node } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'

const ImageNode = Node.create({
  name: 'imageAttachment',
  group: 'inline',
  inline: true,
  atom: true,  // Treated as single unit, not editable content

  addAttributes() {
    return {
      filePath: { default: null },
      fileName: { default: null },
      mimeType: { default: null },
      thumbnailDataUrl: { default: null },
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeComponent)
  },

  // ... parseHTML, renderHTML
})
```

### New file: `humanlayer-wui/src/components/internal/SessionDetail/utils/editorImageUtils.ts`

```typescript
// Insert image node into editor
function insertImageNode(editor: Editor, image: SavedImage): void

// Extract all image attachments from editor content
function extractImagesFromEditor(editor: Editor): ImageAttachment[]

// Extract text content without image nodes
function extractTextFromEditor(editor: Editor): string

// Remove image node by filePath
function removeImageNode(editor: Editor, filePath: string): void
```

---

## Phase 3: Image Input Handlers

### Modify: `humanlayer-wui/src/components/internal/SessionDetail/components/ActiveSessionInput.tsx`

**1. Clipboard paste handler** (add to ResponseEditor or ActiveSessionInput):

```typescript
// In editor setup or as separate effect
editor.view.dom.addEventListener('paste', async (e: ClipboardEvent) => {
  const items = e.clipboardData?.items || []
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault()
      const blob = item.getAsFile()
      if (!blob) continue

      const validation = imageStorageService.validateImage(blob)
      if (!validation.valid) {
        toast.error(validation.error)
        continue
      }

      const savedImage = await imageStorageService.saveImage(sessionId, blob, item.type)
      insertImageNode(editor, savedImage)
    }
  }
})
```

**2. Extend drag-drop handler** (modify existing ~line 240):

```typescript
// In onDragDropEvent handler
if (event.payload.type === 'drop') {
  const filePaths = event.payload.paths as string[]

  for (const filePath of filePaths) {
    const ext = filePath.split('.').pop()?.toLowerCase()
    const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'webp']

    if (imageExts.includes(ext || '')) {
      // Read file, save copy to session directory, insert as image node
      const savedImage = await imageStorageService.importExternalImage(sessionId, filePath)
      insertImageNode(editor, savedImage)
    } else {
      // Existing file mention logic
      insertFileMention(editor, filePath)
    }
  }
}
```

**3. File picker button** (add to action bar):

```typescript
// Using Tauri dialog plugin
import { open } from '@tauri-apps/plugin-dialog'

async function handleImagePicker() {
  const selected = await open({
    multiple: true,
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]
  })

  if (selected) {
    const paths = Array.isArray(selected) ? selected : [selected]
    for (const path of paths) {
      const savedImage = await imageStorageService.importExternalImage(sessionId, path)
      insertImageNode(editor, savedImage)
    }
  }
}
```

**4. Screenshot button** (optional, platform-aware):

For MVP, recommend relying on system screenshot → clipboard → paste.
If custom capture needed later:
- macOS: `screencapture -c` (to clipboard) → user pastes
- Linux: Check for `gnome-screenshot`, `spectacle`, `scrot` availability
- Fallback: Show instruction toast "Use system screenshot, then paste"

---

## Phase 4: API Updates

### Modify: `hld/api/openapi.yaml`

**Add image_paths to DecideApprovalRequest:**

```yaml
DecideApprovalRequest:
  type: object
  required:
    - decision
  properties:
    decision:
      type: string
      enum: [approve, deny]
    comment:
      type: string
    image_paths:
      type: array
      items:
        type: string
      maxItems: 5
      description: |
        Local file paths to images attached to this decision.
        Daemon will read, validate, and encode these for Claude.
```

**Add new endpoint for serving images (for future web UI):**

```yaml
/images/{session_id}/{filename}:
  get:
    operationId: getSessionImage
    summary: Serve a session image file
    tags:
      - Images
    parameters:
      - name: session_id
        in: path
        required: true
        schema:
          type: string
      - name: filename
        in: path
        required: true
        schema:
          type: string
    responses:
      '200':
        description: Image file
        content:
          image/*:
            schema:
              type: string
              format: binary
      '404':
        $ref: '#/components/responses/NotFound'
```

### Modify: `hld/api/handlers/approvals.go`

Update `DecideApproval` handler:

```go
type DecideApprovalRequest struct {
    Decision   string   `json:"decision"`
    Comment    string   `json:"comment,omitempty"`
    ImagePaths []string `json:"image_paths,omitempty"`
}

func (h *ApprovalHandler) DecideApproval(w http.ResponseWriter, r *http.Request) {
    // ... existing logic

    // Validate image paths
    var validatedImages []ImageAttachment
    for _, path := range req.ImagePaths {
        if len(validatedImages) >= 5 {
            break // Max 5 images
        }

        img, err := h.validateAndReadImage(path)
        if err != nil {
            // Log warning but continue
            continue
        }
        validatedImages = append(validatedImages, img)
    }

    // Pass to approval manager
    h.manager.DecideApproval(approvalID, req.Decision, req.Comment, validatedImages)
}

func (h *ApprovalHandler) validateAndReadImage(path string) (ImageAttachment, error) {
    // Check file exists
    // Check file size ≤ 10MB
    // Read file, detect MIME type
    // Encode as base64
    // Return ImageAttachment{Path, MimeType, Base64Data}
}
```

### Modify: `hld/store/sqlite.go`

**Add migration for image storage:**

```sql
-- Migration: Add approval_images table
CREATE TABLE IF NOT EXISTS approval_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    approval_id TEXT NOT NULL,
    file_path TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (approval_id) REFERENCES approvals(id) ON DELETE CASCADE
);

CREATE INDEX idx_approval_images_approval_id ON approval_images(approval_id);
```

### Modify: `hld/approval/manager.go`

Update approval decision to handle images:

```go
type ImageAttachment struct {
    Path       string
    MimeType   string
    Base64Data string
}

func (m *Manager) DecideApproval(
    approvalID string,
    decision string,
    comment string,
    images []ImageAttachment,
) error {
    // Store image metadata in DB
    // Include images in MCP response to Claude
    // Format depends on Claude's image input API
}
```

---

## Phase 5: WUI Client Integration

### Modify: `humanlayer-wui/src/lib/daemon/http-client.ts`

```typescript
interface ImageAttachment {
  filePath: string
  mimeType: string
}

async sendDecision(
  approvalId: string,
  decision: 'approve' | 'deny',
  comment?: string,
  images?: ImageAttachment[],
): Promise<{ success: boolean; error?: string }> {
  await this.ensureConnected()
  try {
    await this.client!.decideApproval(approvalId, decision, comment, {
      imagePaths: images?.map(i => i.filePath)
    })
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

// Update convenience wrappers
async approveFunctionCall(approvalId: string, comment?: string, images?: ImageAttachment[])
async denyFunctionCall(approvalId: string, comment?: string, images?: ImageAttachment[])
```

### Modify: `humanlayer-wui/src/components/internal/SessionDetail/hooks/useSessionApprovals.ts`

```typescript
const handleDeny = useCallback(
  async (approvalId: string, reason: string, sessionId: string) => {
    try {
      // Extract images from editor
      const images = extractImagesFromEditor(responseEditor)

      const res = await daemonClient.denyFunctionCall(approvalId, reason, images)

      if (res.success) {
        responseEditor?.commands.setContent('')
        localStorage.removeItem(`${ResponseInputLocalStorageKey}.${sessionId}`)
      }

      setDenyingApprovalId(null)
    } catch (error) {
      notificationService.notifyError(error, 'Failed to deny')
    }
  },
  [responseEditor],
)

// Similar update for handleApprove if we want images on approve
```

---

## Phase 6: Tauri Configuration

### Modify: `humanlayer-wui/src-tauri/Cargo.toml`

```toml
[dependencies]
# ... existing deps
tauri-plugin-dialog = "2"  # For native file picker
```

### Modify: `humanlayer-wui/src-tauri/capabilities/default.json`

```json
{
  "permissions": [
    // ... existing permissions
    "dialog:default",
    "dialog:allow-open",
    "fs:allow-read",
    "fs:allow-write"
  ]
}
```

### Package.json - Add dialog plugin

```bash
bun add @tauri-apps/plugin-dialog
```

---

## Phase 7: Cleanup & Error Handling

### Image Cleanup Strategy

**Option A: Cleanup on session hard-delete**
- When `hardDeleteEmptyDraftSession` or session deletion occurs
- Daemon removes `~/.humanlayer/images/{session_id}/` directory

**Option B: Periodic cleanup (future enhancement)**
- Background job removes orphaned images
- Images older than 30 days with no associated approval

### Error Handling

| Scenario | Handling |
|----------|----------|
| Image too large (>10MB) | Toast error, don't save |
| Invalid image format | Toast error, skip file |
| Disk full | Toast error, suggest cleanup |
| Image file missing on submit | Log warning, submit without missing image |
| Daemon can't read image | Log error, continue with other images |

---

## Implementation Order

1. **Phase 1**: ImageStorageService (foundation, no UI yet)
2. **Phase 6**: Tauri configuration (enable dialog plugin)
3. **Phase 2**: TipTap ImageNode extension (UI component)
4. **Phase 3**: Input handlers (paste, drop, picker)
5. **Phase 4**: API updates (OpenAPI, handlers, store)
6. **Phase 5**: WUI client integration (wire it all together)
7. **Phase 7**: Cleanup & polish

---

## Testing Checklist

- [ ] Paste image from clipboard
- [ ] Drag & drop image file
- [ ] Drag & drop mixed files (images + regular files)
- [ ] File picker selects multiple images
- [ ] Reject image >10MB with clear error
- [ ] Reject non-image file with clear error
- [ ] Remove image from editor via X button
- [ ] Submit deny with images attached
- [ ] Submit approve with images attached
- [ ] Image paths persist in localStorage (draft recovery)
- [ ] Images cleaned up when session deleted

---

## Files Changed Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `humanlayer-wui/src/services/ImageStorageService.ts` | **New** | Image save, validate, thumbnail generation |
| `humanlayer-wui/src/components/.../ImageNode.tsx` | **New** | TipTap node component for image preview |
| `humanlayer-wui/src/components/.../editorImageUtils.ts` | **New** | Editor image manipulation utilities |
| `humanlayer-wui/src/components/.../ResponseEditor.tsx` | Modify | Add ImageNode extension |
| `humanlayer-wui/src/components/.../ActiveSessionInput.tsx` | Modify | Add paste, extend drop handlers |
| `humanlayer-wui/src/lib/daemon/http-client.ts` | Modify | Add images param to decision methods |
| `humanlayer-wui/src/components/.../useSessionApprovals.ts` | Modify | Extract & pass images on submit |
| `hld/api/openapi.yaml` | Modify | Add image_paths, image serving endpoint |
| `hld/api/handlers/approvals.go` | Modify | Handle image_paths, validate, encode |
| `hld/store/sqlite.go` | Modify | Add approval_images table migration |
| `hld/approval/manager.go` | Modify | Process images in decision flow |
| `humanlayer-wui/src-tauri/Cargo.toml` | Modify | Add tauri-plugin-dialog |
| `humanlayer-wui/src-tauri/capabilities/default.json` | Modify | Add dialog permissions |
