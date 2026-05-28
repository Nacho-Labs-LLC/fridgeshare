## 2024-05-16 - Add Focus Visible Styles
**Learning:** This app is missing focus-visible styles on buttons and inputs, which makes keyboard navigation inaccessible.
**Action:** Adding global focus-visible styles in styles.css to ensure keyboard navigability.
## 2024-05-17 - Icon-only buttons accessibility
**Learning:** Icon-only buttons (like alphabet magnets, emojis, tray toggles, and drawing tools) often use titles or textContent with emojis but lack explicit `aria-label` attributes, leading to poor screen reader experiences.
**Action:** Always ensure that icon-only buttons have an `aria-label` attribute that matches their visual `title` or intent so that their function is correctly announced by screen readers.
## 2024-05-18 - Dynamically Generated UI Swatches Accessibility
**Learning:** Dynamically generated UI swatches (like color pickers, theme selectors, or size presets) that lack explicit text labels are inaccessible to screen readers and miss hover tooltips for sighted users.
**Action:** Always add descriptive `aria-label` and `title` attributes to dynamically generated swatch buttons, especially when their visual meaning is conveyed entirely through CSS properties or when they visually collapse to icon-only sizes.
## 2024-05-19 - Tooltips and ARIA labels for dynamic icon-only tabs
**Learning:** Tabs in the kit tray become visually icon-only buttons via CSS `font-size: 0` depending on the selected tray style (e.g. corner-chip). Without explicit `aria-label` and `title` attributes, their meaning is lost to both screen readers and sighted users who rely on tooltips.
**Action:** Always ensure that any text elements that can become visually hidden dynamically via CSS have an explicit `aria-label` and `title` attribute so they remain accessible and understandable in all visual styles.
## 2026-05-21 - Async loading states
**Learning:** The self-host application had async submit buttons (like the Create board button) that did not provide a loading state or become disabled during processing. This allows duplicate submissions and provides no user feedback.
**Action:** Add a loading state (e.g., text 'Creating...' and disabled=true) immediately before fetching, and restore the original state if the fetch fails.
## 2026-05-25 - Permission-gated controls missing context
**Learning:** Permission-gated controls that are disabled (like Edit and Copy Edit links without an admin token) can cause confusion if they lack context explaining why they are disabled.
**Action:** Always add tooltips (`title`) to disabled controls that rely on permissions, clearly explaining the requirement to the user.
