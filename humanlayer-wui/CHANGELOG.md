# Changelog

All notable changes to the HumanLayer Web UI (humanlayer-wui) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Updated Tauri core from `2.0` to `2.7` for improved stability and performance
- Updated `tauri-plugin-opener` from `2.0` to `2.3` for better system integration
- Updated various internal dependencies including `tray-icon`, `wry`, and `zbus` for Linux compatibility improvements

### Technical Details

This update brings the Tauri framework to version 2.7, which includes:

- Enhanced tray icon support on all platforms
- Improved webview rendering engine (wry 0.53.5)
- Better Linux D-Bus integration (zbus 5.12.0)
- Updated TOML parsing for configuration files
- Various Windows API improvements for better compatibility

These changes improve the overall stability of the desktop application, particularly for Ubuntu and other Linux distributions.
