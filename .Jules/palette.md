## 2024-05-16 - Add Focus Visible Styles
**Learning:** This app is missing focus-visible styles on buttons and inputs, which makes keyboard navigation inaccessible.
**Action:** Adding global focus-visible styles in styles.css to ensure keyboard navigability.
## 2024-05-17 - Icon-only buttons accessibility
**Learning:** Icon-only buttons (like alphabet magnets, emojis, tray toggles, and drawing tools) often use titles or textContent with emojis but lack explicit `aria-label` attributes, leading to poor screen reader experiences.
**Action:** Always ensure that icon-only buttons have an `aria-label` attribute that matches their visual `title` or intent so that their function is correctly announced by screen readers.

## 2026-05-21 - Async loading states
**Learning:** The self-host application had async submit buttons (like the Create board button) that did not provide a loading state or become disabled during processing. This allows duplicate submissions and provides no user feedback.
**Action:** Add a loading state (e.g., text 'Creating...' and disabled=true) immediately before fetching, and restore the original state if the fetch fails.
