# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

This is a monorepo containing two distinct but interconnected project groups:

**Project 1: HumanLayer SDK & Platform** - The core product providing human-in-the-loop capabilities for AI agents
**Project 2: Local Tools Suite** - Tools that leverage HumanLayer SDK to provide rich approval experiences

## Project 1: HumanLayer SDK & Platform

### Components
- `humanlayer-ts/` - TypeScript SDK for Node.js and browser environments
- `humanlayer-go/` - Minimal Go client for building tools
- `humanlayer-ts-vercel-ai-sdk/` - Specialized integration for Vercel AI SDK
- `docs/` - Mintlify documentation site

### Core Concepts
- **Contact Channels**: Slack, Email, CLI, and web interfaces for human interaction
- **Multi-language Support**: Feature parity across TypeScript and Go SDKs

## Project 2: Local Tools Suite

### Components
- `hld/` - Go daemon that coordinates approvals and manages Claude Code sessions
- `hlyr/` - TypeScript CLI with MCP (Model Context Protocol) server for Claude integration
- `humanlayer-wui/` - CodeLayer - Desktop/Web UI (Tauri + React) for graphical approval management
- `claudecode-go/` - Go SDK for programmatically launching Claude Code sessions

### Architecture Flow
```
Claude Code → MCP Protocol → hlyr → JSON-RPC → hld → HumanLayer Cloud API
                                         ↑         ↑
                                    TUI ─┘         └─ WUI
```

## Development Commands

### Quick Actions
- `make setup` - Resolve dependencies and installation issues across the monorepo
- `make check-test` - Run all checks and tests
- `make check` - Run linting and type checking
- `make test` - Run all test suites

### GitHub Workflows
- **Trigger macOS nightly build**: `gh workflow run "Build macOS Release Artifacts" --repo humanlayer/humanlayer`
- Workflow definitions are located in `.github/workflows/`


### TypeScript Development
- Package managers vary - check `package.json` for npm or bun
- Build/test commands differ - check `package.json` scripts section
- Some use Jest, others Vitest, check `package.json` devDependencies

### Go Development
- Check `go.mod` for Go version (varies between 1.21 and 1.24)
- Check if directory has a `Makefile` for available commands
- Integration tests only in some projects (look for `-tags=integration`)

## Technical Guidelines

### TypeScript
- Modern ES6+ features
- Strict TypeScript configuration
- Maintain CommonJS/ESM compatibility

### Go
- Standard Go idioms
- Context-first API design
- Generate mocks with `make mocks` when needed

## Development Conventions

### TODO Annotations

We use a priority-based TODO annotation system throughout the codebase:

- `TODO(0)`: Critical - never merge
- `TODO(1)`: High - architectural flaws, major bugs
- `TODO(2)`: Medium - minor bugs, missing features
- `TODO(3)`: Low - polish, tests, documentation
- `TODO(4)`: Questions/investigations needed
- `PERF`: Performance optimization opportunities

## CodeLayer (WUI) Development

### Architecture Understanding

CodeLayer has three main components that need to stay in sync:

| Component | Location | Language | What It Does |
|-----------|----------|----------|--------------|
| **Frontend** | `humanlayer-wui/src/` | React/TypeScript | UI components, hotkeys, state |
| **Backend Daemon** | `hld/` | Go | API handlers, SQLite storage, session management |
| **Tauri Shell** | `humanlayer-wui/src-tauri/` | Rust | Desktop app wrapper, daemon lifecycle |

**Key insight**: The production CodeLayer app (`/usr/lib/CodeLayer/`) bundles the frontend INTO the binary. Updating just hld doesn't update the UI.

### Development Workflows

#### Fast Iteration (Recommended)
```bash
cd humanlayer-wui

# Uses separate dev database (daemon-main.db) - safe for experiments
bun run tauri dev

# OR use production database to see real sessions
HUMANLAYER_DATABASE_PATH=~/.humanlayer/daemon.db bun run tauri dev
```

#### Backend-Only Changes (Go)
When changing only `hld/` code (no UI changes):
```bash
cd hld && go build -o hld ./cmd/hld
sudo cp hld /usr/lib/CodeLayer/bin/hld
# Restart CodeLayer app
```

#### Full Production Build
```bash
cd humanlayer-wui

# Fix any version mismatches first
cd src-tauri && cargo update && cd ..

# Build production packages
bun run tauri build

# Install
sudo dpkg -i src-tauri/target/release/bundle/deb/CodeLayer_0.1.0_amd64.deb
```

### Common Pitfalls

#### 1. Version Mismatches
**Symptom**: `Found version mismatched Tauri packages` error
**Fix**: Run `cd src-tauri && cargo update` before building

#### 2. Sessions Disappear
**Symptom**: Session list is empty after code changes
**Cause**: SQL SELECT columns don't match Scan() parameters in `hld/store/sqlite.go`
**Fix**: Ensure every SELECT statement has columns in exact order matching the Scan() call

#### 3. Changes Not Taking Effect
**Symptom**: Code changes don't appear in production CodeLayer
**Cause**: Frontend is bundled in the app binary, not loaded from hld
**Fix**: Run full `bun run tauri build` and reinstall .deb

#### 4. Dev Environment Uses Wrong Database
**Symptom**: Different sessions in dev vs production
**Explanation**: By design - dev uses `daemon-main.db`, prod uses `daemon.db`
**Fix**: Use `HUMANLAYER_DATABASE_PATH=~/.humanlayer/daemon.db` env var

### Database Locations

| Environment | Database Path | Socket Path |
|-------------|--------------|-------------|
| Production | `~/.humanlayer/daemon.db` | `~/.humanlayer/daemon.sock` |
| Dev (main branch) | `~/.humanlayer/daemon-main.db` | `~/.humanlayer/daemon-main.sock` |
| Nightly | `~/.humanlayer/daemon-nightly.db` | `~/.humanlayer/daemon-nightly.sock` |

### Pre-Deployment Checklist

- [ ] Test with `bun run tauri dev` first
- [ ] Run `cd src-tauri && cargo update` to fix version mismatches
- [ ] For SQL changes: verify SELECT columns match Scan() order
- [ ] For hotkey changes: update `HotkeyPanel.tsx` documentation

## Additional Resources
- Consult `docs/` for user-facing documentation
