## 1.1.0 — 2026-11-20

### Added
- Start, stop and restart a container. Tap its card: it unfolds with Stop and Restart for a running container, Start for a stopped one. Stop and Restart take a second tap to confirm; the card folds back after ten seconds. Nothing can be removed or killed from the widget. The update asks you to accept the new permission, sending commands to Docker. Needs a Fremkit newer than 0.5.2: on an older one the cards do not unfold and the widget stays read-only.

## 1.0.2 — 2026-10-18

### Added
- A picture of the widget at work, shown on its card in the library and on the Sietch before you install it.

## 1.0.1 — 2026-10-16

### Changed
- Credits its author, FlorianBruniaux, on its card.

## 1.0.0 — 2026-10-15

### Added
- Show local containers with Running, Stopped and All filters, observed counts, and compact CPU and memory icons. Filter controls wrap on narrow tiles and stay legible on light or accent-filled backgrounds. Unknown measurements use a question mark; this widget never changes a container. Requires a Fremkit release containing the `docker-local` channel from fremkit#17; older hosts show a compatibility message.
