# Aurora Player

A music and video player for Windows that brings back the audio-reactive visualizations of the
classic Windows Media Player.

## Installation

1. Run **Aurora Player Setup 1.0.0.exe**.
   The installer is not digitally signed, so Windows SmartScreen may show a warning:
   choose **More info › Run anyway**.
2. On first launch, Aurora Player asks whether it should become your default player.
   Accept, and Windows opens **Settings › Default apps › Aurora Player**: click **Set default**.

Windows requires you to confirm this step yourself. You can do it later at any time:
right-click inside the player and choose **Set as default player…**.

## Playing media

- **Double-click** any supported file in File Explorer.
- **Drag and drop** files or whole folders onto the window. Hold **Ctrl** while dropping, or drop
  onto the playlist, to add them to the queue instead of replacing it.
- **Right-click a file** in File Explorer and choose *Add to Aurora Player playlist*.
- Use **Open** in the top bar, or **Ctrl+O**.

Title, artist and album art are read from the file's tags, or from a `cover.jpg`/`folder.jpg`
in the same folder.

## Visualizations

Visualizations play automatically with audio files. Switch between them with the arrows next to the
visualization name, the **V** key, or the right-click menu.

| Collection | Presets |
| --- | --- |
| Alchemy | Random: morphs into a new look every 10–20 seconds |
| Album Art | Album Cover |
| Ambience | Anon, Blizzard, Bubble, Falloff, Swirl, Warp, Water |
| Bars and Waves | Bars, Fire Storm, Ocean Mist, Scope |
| Battery | Dance of the Freaky Circles, Event Horizon, Kaleidovision |
| Spikes | Cosmic Rays, Fireworks |

To get a different visualization for every track, enable **Change visualization every track** in
the right-click menu.

These are faithful recreations of the original Windows Media Player effects, not the original
Microsoft plug-ins.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| Space / Ctrl+P | Play / pause |
| Ctrl+F / Ctrl+B | Next / previous track |
| Ctrl+S | Stop |
| Ctrl+O | Open files |
| ← / → | Seek 5 seconds (30 seconds with Ctrl) |
| ↑ / ↓ | Volume |
| M | Mute |
| V / Shift+V | Next / previous visualization |
| L | Show or hide the playlist |
| F11, Alt+Enter, double-click | Full screen |
| Esc | Exit full screen |
| Delete | Remove the selected track from the playlist |

## Supported formats

| Type | Formats |
| --- | --- |
| Audio | MP3, WAV, FLAC, OGG, Opus, M4A, AAC, WebA |
| Video | MP4, M4V, MKV, WebM, MOV, OGV |
| Playlists | M3U, M3U8 |

WMA, WMV and AVI files are not supported.

## Uninstalling

Uninstall from **Settings › Apps › Installed apps**. All file associations created by Aurora Player
are removed. To keep the app but stop it from handling your files, right-click inside the player and
choose **Remove file associations**.

## Building from source

Requires Node.js 20 or later.

```
npm install
npm start        # run in development mode
npm run dist     # build the installer into dist/
```
