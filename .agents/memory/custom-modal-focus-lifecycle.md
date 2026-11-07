---
name: Custom modal focus lifecycle
description: Focus management for React overlays that are conditionally mounted by their parent.
---

For a modal rendered only while its parent state is open, save the previously focused element when the modal mounts, move focus into the dialog, and restore focus from the effect cleanup when the dialog unmounts.

**Why:** An effect waiting for `isOpen` to become false never runs when the parent removes the modal component with a conditional render.

**How to apply:** Use this lifecycle for custom dialogs and drawers mounted with conditional JSX; verify Escape dismissal and that focus returns to the trigger.
