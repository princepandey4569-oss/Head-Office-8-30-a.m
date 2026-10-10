# Navigation and loading behavior

- The Back and Next controls are available on the public page, login screen, and workspace header. They use the browser History API, so they also stay in sync with browser Back/Forward navigation.
- Workspace pages have URL state (`fbRoute` and `fbPage` query parameters), and the open tab stores its app-route history in session storage. Reloading a workspace URL restores that page when the demo session is active.
- API refreshes do not change the selected route or clear the current report while requests are pending. Failures show a retry banner without redirecting to another page.
- Data remains synthetic. The explicit Head Office refresh control generates a new demo snapshot; ordinary navigation does not regenerate data.
