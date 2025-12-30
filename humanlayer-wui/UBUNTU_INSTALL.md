# CodeLayer Distribution - Ubuntu Installation Guide

## About This Package

CodeLayer v0.1.0 is a desktop application built with Tauri 2.7, providing a web UI for the HumanLayer daemon (`hld`). This `.deb` package includes all necessary dependencies and auto-manages the daemon lifecycle.

## Installation

### From the .deb Package

```bash
sudo dpkg -i CodeLayer_0.1.0_amd64.deb
```

If you encounter dependency errors, run:

```bash
sudo apt-get install -f
```

### Verifying Installation

```bash
which codelayer
# Should output: /usr/bin/codelayer (or similar)
```

## Usage

### Launching CodeLayer

Simply run from your terminal or application launcher:

```bash
codelayer
```

Or search for "CodeLayer" in your system's application menu.

### First Run

On first launch, CodeLayer will:

1. Automatically start the HumanLayer daemon in the background
2. Create the configuration directory at `~/.humanlayer/`
3. Initialize a SQLite database at `~/.humanlayer/daemon.db`
4. Open the web UI in a native window

No manual daemon setup is required!

## Features

- **Auto-managed Daemon**: The daemon starts/stops automatically with the app
- **Native Desktop App**: Full system integration with tray icon support
- **Session Management**: Browse, create, and manage Claude Code sessions
- **Approval Workflows**: Handle human-in-the-loop approvals directly in the UI

## Technical Details

### System Requirements

- **OS**: Ubuntu 20.04 LTS or newer (also compatible with Debian-based distributions)
- **Architecture**: x86_64 (amd64)
- **Dependencies**: GTK3, WebKit2GTK (automatically installed via apt)

### Package Contents

This package bundles:

- **CodeLayer Desktop App**: Tauri 2.7-based application
- **HumanLayer Daemon (hld)**: Go-based daemon server
- **HumanLayer CLI (hlyr)**: Command-line interface
- **Desktop Integration**: `.desktop` file, icons, and system tray support

### Key Improvements in This Version

- Updated to Tauri 2.7 for improved stability
- Enhanced Linux D-Bus integration (zbus 5.12.0)
- Better tray icon rendering
- Improved webview engine performance

### File Locations

- **Executable**: `/usr/bin/codelayer`
- **Config**: `~/.humanlayer/`
- **Database**: `~/.humanlayer/daemon.db`
- **Logs**: `~/.humanlayer/logs/`

## Uninstallation

```bash
sudo apt-get remove codelayer
```

To also remove configuration files:

```bash
sudo apt-get purge codelayer
rm -rf ~/.humanlayer
```

## Troubleshooting

### App Won't Start

Check if required libraries are installed:

```bash
sudo apt-get install libgtk-3-0 libwebkit2gtk-4.0-37
```

### Daemon Connection Issues

If the UI shows "connection failed":

1. Check if the daemon process is running:
   ```bash
   ps aux | grep hld
   ```
2. Verify the socket exists:
   ```bash
   ls -la ~/.humanlayer/daemon.sock
   ```
3. Restart the application

### Viewing Logs

```bash
tail -f ~/.humanlayer/logs/codelayer.log
```

## Support

For issues or questions:

- GitHub Issues: https://github.com/humanlayer/humanlayer/issues
- Documentation: https://github.com/humanlayer/humanlayer

## License

Apache-2.0
