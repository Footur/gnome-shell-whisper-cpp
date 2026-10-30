# GNOME whisper.cpp

A GNOME Shell extension for push-to-talk transcription with whisper.cpp. Hold the configured key to record; when released, the transcript is copied to the Wayland clipboard.

## Dependencies

- GNOME Shell 45 or newer (including 50)
- PipeWire with `pw-record`
- whisper.cpp with `whisper-cli` and a downloaded model file
- `wl-clipboard` with `wl-copy`

## Install

Copy `extension.js`, `prefs.js`, `metadata.json`, and `schemas/` into `~/.local/share/gnome-shell/extensions/gnome-whisper-cpp@local/`, then compile its settings schema and enable it:

```sh
glib-compile-schemas ~/.local/share/gnome-shell/extensions/gnome-whisper-cpp@local/schemas
gnome-extensions enable gnome-whisper-cpp@local
```

Open the extension preferences to set the whisper.cpp model path and language. The default recording key is `Fn`; use another key such as `F9` if your laptop does not expose Fn to GNOME. Release the key to transcribe, then paste the clipboard contents into the target application.