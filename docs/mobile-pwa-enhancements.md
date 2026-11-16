# Mobile and installed-app improvements

Installation and connection controls are now mounted in Settings. Previously PwaControls existed but had no caller. iOS Safari and Android installation instructions are available even when a browser does not offer a native install prompt.

A connection/update notice appears in workspace flow, without covering bottom navigation. Offline messaging describes cache limits; updates remain explicit and retain the existing unfinished-review protection.

Keyboard handling accounts for Android resizing both layout and visual viewports, plus Safari visual-viewport resizing. Navigation hides only when an editable field is focused and more than 150 pixels are obscured. Pinch zoom is respected. Focus changes restore navigation; width changes reset the baseline for rotation.

Phone agency profiles have centered 44-pixel contact targets, wrapping contact headers, full-width next-action fields and save controls, and 16-pixel form text to avoid iOS focus zoom. Long agency names can wrap.

Validation: 200 unit tests, workspace type checks, production build, built-module reference checks, and eight service-worker tests. The browser audit was attempted but Chromium could not start its debugging endpoint in this environment. Actual rendering, iPhone installation, keyboard transitions, and offline reopening on physical devices remain unverified. After pulling main, publish the new build before checking installed-app updates.
