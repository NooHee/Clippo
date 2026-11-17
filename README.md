# Clippo

A minimal clipboard history manager for the macOS menu bar.

Press `Cmd+Shift+V` anywhere, pick an entry, and Clippo pastes it into the text field you were typing in. History is searchable, entries can be pinned, and everything is stored encrypted with the macOS Keychain.

## Install

1. Download the latest build from [Releases](https://github.com/NooHee/Clippo/releases): the `.zip` for Apple Silicon or the `.dmg` for Intel.
2. Move **Clippo** to **Applications**.
3. Clippo is not notarized by Apple, so macOS blocks it the first time. Either:
   - open it once, then go to **System Settings > Privacy & Security** and click **Open Anyway**, or
   - run `xattr -cr /Applications/Clippo.app` in Terminal.
4. Allow auto-paste in **System Settings > Privacy & Security > Accessibility**. Without it, entries are still copied and you paste with `Cmd+V` yourself. Clippo shows a warning until access is granted.

## Usage

| Action | How |
| --- | --- |
| Open or close Clippo | `Cmd+Shift+V` |
| Paste an entry | Click it |
| Search | Start typing |
| Settings, groups, quit | Popup or menu bar icon |

## Development

Requires Node.js 20 or later (CI uses 24).

```bash
npm install
npm start           # build and launch
npm run dev         # renderer hot reload
npm test            # unit tests
npm run typecheck
npm run dist        # build the macOS app into release/
```

## Docs

- [Faster opening and reliable auto-paste](docs/performance-and-auto-paste.md): design, measurements, tests and benchmarks
- [Accessibility permission warning](docs/accessibility-permission-safeguard.md)
- [Versioning and releases](docs/release-process.md)
- [Changelog](CHANGELOG.md)

## License

[CC BY 4.0](LICENSE), by Noé Serwy.
