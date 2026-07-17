## Goal
Get the preview iframe reconnected after Vite restarted from `.env` changes.

## Steps
1. Call `code--restart_dev_server` to cycle Vite cleanly inside the sandbox.
2. Poll `http://localhost:8080/` until it returns 200 with the app HTML.
3. Verify with a headless browser hit that `/` renders and redirects to `/login` with no console errors and no 4xx/5xx.
4. Report back — user hard-refreshes the preview iframe.

## Notes
- No code changes.
- If the preview stays blank after the restart, next step is to capture the console error text from the user's browser and debug from there.
