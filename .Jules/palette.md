## 2024-05-16 - Add Focus Visible Styles
**Learning:** This app is missing focus-visible styles on buttons and inputs, which makes keyboard navigation inaccessible.
**Action:** Adding global focus-visible styles in styles.css to ensure keyboard navigability.
## 2024-05-17 - Icon-only buttons accessibility
**Learning:** Icon-only buttons (like alphabet magnets, emojis, tray toggles, and drawing tools) often use titles or textContent with emojis but lack explicit `aria-label` attributes, leading to poor screen reader experiences.
**Action:** Always ensure that icon-only buttons have an `aria-label` attribute that matches their visual `title` or intent so that their function is correctly announced by screen readers.
## 2024-05-18 - Tooltips and ARIA labels for dynamic icon-only tabs
**Learning:** Tabs in the kit tray become visually icon-only buttons via CSS `font-size: 0` depending on the selected tray style (e.g. corner-chip). Without explicit `aria-label` and `title` attributes, their meaning is lost to both screen readers and sighted users who rely on tooltips.
**Action:** Always ensure that any text elements that can become visually hidden dynamically via CSS have an explicit `aria-label` and `title` attribute so they remain accessible and understandable in all visual styles.
