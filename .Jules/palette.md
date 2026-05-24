## 2024-05-16 - Add Focus Visible Styles
**Learning:** This app is missing focus-visible styles on buttons and inputs, which makes keyboard navigation inaccessible.
**Action:** Adding global focus-visible styles in styles.css to ensure keyboard navigability.
## 2024-05-17 - Icon-only buttons accessibility
**Learning:** Icon-only buttons (like alphabet magnets, emojis, tray toggles, and drawing tools) often use titles or textContent with emojis but lack explicit `aria-label` attributes, leading to poor screen reader experiences.
**Action:** Always ensure that icon-only buttons have an `aria-label` attribute that matches their visual `title` or intent so that their function is correctly announced by screen readers.
## 2024-05-18 - Dynamically Generated UI Swatches Accessibility
**Learning:** Dynamically generated UI swatches (like color pickers, theme selectors, or size presets) that lack explicit text labels are inaccessible to screen readers and miss hover tooltips for sighted users.
**Action:** Always add descriptive `aria-label` and `title` attributes to dynamically generated swatch buttons, especially when their visual meaning is conveyed entirely through CSS properties or when they visually collapse to icon-only sizes.
