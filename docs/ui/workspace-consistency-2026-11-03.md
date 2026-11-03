# Shared typography, tables, menus and sidebar

The shared workspace stylesheet defines the interface scale: 14px body text, 13px secondary text, 12px captions, 18px tertiary headings, 22px section headings and 28px page headings. Numeric metrics retain a distinct 36px scale. The same sans-serif family is used across landing, login and application pages. Inline section-heading sizes were removed so the shared scale controls them.

The staff and patient-portal sidebars now use one component. On desktop the sidebar occupies a fixed 264px column; only its navigation list scrolls. Branding, search and account actions remain in place while the document content scrolls independently. On smaller screens navigation collapses behind an accessible toggle and its open list scrolls within the available height.

Patient and charge lists use semantic tables with row/column headers, named scroll regions, explicit record links and right-aligned numeric values. Existing dashboard and occupancy tables use the same treatment. Wide tables scroll inside their region rather than widening the page. No sort, filter, pagination or data action was fabricated.

The account menu includes a profile summary, consistent 44px menu targets, icons, focus styling, outside-click dismissal, arrow-key/Home/End navigation and Escape focus restoration. The trigger has a content-based accessible label for desktop and phone layouts.

Permissions, data queries, workflow commands, clinical safeguards and formal governance state are unchanged. Changes remain local and uncommitted. Build, lint, browser reports and screenshots are retained under ignored artifacts/governance-v2/workspace-polish and premium-ui build logs.

Final verification: production build/TypeScript and lint passed. Seven browser tests passed, including fixed-sidebar geometry during document scrolling, independent navigation scroll, keyboard menu behavior, visible skip link, shared heading/cell sizes, contained mobile tables, patient portal navigation, and the existing clinical/billing and landing/login workflows. Axe reported zero violations on the scanned workspace, table, menu, chart, billing and public pages. Screenshots and the actual JSON report are in artifacts/governance-v2/workspace-polish/.
