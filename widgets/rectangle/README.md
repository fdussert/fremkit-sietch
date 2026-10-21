# Rectangle

This widget uses macOS's built-in window management; Apple documents the same window-tiling tools in its [Tile windows on Mac guide](https://support.apple.com/guide/mac-help/tile-app-windows-mchlef287e5d/mac).

This widget uses macOS's built-in Accessibility APIs to place a positively identified window. It
does not use or require the Rectangle app. The available actions are `left-half`, `right-half`,
`fill`, and `next-display`.

The widget captures the currently active app window and displays the app name as its target. Use
Refresh to choose the active window again. A command is refused if that exact app process or window
title is no longer active, if the target is Fremkit itself, or if macOS cannot verify the resulting
geometry. `next-display` is unavailable when only one display is connected.

The first use may require Fremkit to have macOS Accessibility access. This widget does not execute
shell commands, invoke third-party URL schemes, or change user window-management settings.
