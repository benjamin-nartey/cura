# Activity-led landing walkthrough — 6 November 2026

The landing tour now demonstrates tasks rather than swapping page summaries. Each of five chapters opens an action, types two fields, shows a save/confirmation click, and displays a new result row. The visible cursor follows measured targets across responsive web layouts and native layout coordinates. The examples demonstrate appointment booking, patient registration, task assignment, draft billing and workspace context selection.

Chapter duration changed from 6,500 ms to 5,600 ms. The result remains visible for 1,700 ms. Pause freezes the current stage and typed value; resume continues the same sequence. Manual chapter selection restarts that story. Hidden/offscreen web views and backgrounded native views suspend the clock. Reduced-motion/screen-reader handling preserves static completed examples and explicit effect-free timed playback; the decorative cursor is hidden. The synthetic preview disclosure remains visible. No patient, appointment, billing or clinical API is invoked by the animation.

## Implementation
- Web: product-walkthrough.tsx, workflow-scene.tsx, landing-motion.css and lib/walkthrough-clock.ts.
- Mobile: LandingFilm.tsx, WorkflowScene.tsx, useTourClock.ts and walkthrough-model.ts.
- The pure story model lives inside Metro's project boundary and is imported by web. React hooks remain local to each app's separate React runtime. No Metro/global resolver configuration or dependency was changed.
- No database, backend authorization, formal governance or production clinical controls changed.

## Verification
Root web/domain/contracts/FHIR type checks, root lint, mobile type checks, mobile lint and the optimized Next build passed. Three new real-browser activity tests passed in 41.6 seconds: typed patient registration and appointment booking, cursor alignment on desktop/phone, pause/resume freeze, reduced motion, actual Expo cursor playback, saved results and zero demonstration write requests. Initial Expo bundling failure from an out-of-project import was fixed and its failed evidence retained; the corrected native-only check also passed.

Artifacts live under artifacts/landing-workflows. The previous landing-autoplay evidence was backed up before regression screenshots were generated. Final existing-tour regression results and restoration checks are recorded after execution. Native verification used the actual Expo web renderer on port 8082; no physical iOS/Android device was available in this run.

## Final regression and closeout
All seven existing tour tests passed in 3.6 minutes (`regression-first.json`): five chapters at 1440/768/390/320px with accessibility scans and identical frame heights; pointer-hover autoplay/wrap; pointer and keyboard Play/Pause; reduced-motion static/manual playback; offscreen suspension; actual Expo accessibility/entry/return and native autoplay/wrap/pause. Together with the three activity tests, all 10 selected browser tests passed. No physical-device claim is made.

Prior landing proof files checked: 155; changed original files archived and restored by hash: 15. Fresh regression screenshots are under artifacts/landing-workflows/regression-evidence. New task screenshots are retained directly under artifacts/landing-workflows. Original generated Next config bytes were restored. Web port 3000 serves .next-workflow-tour; Metro remains on 8082. The bounded local Twin watcher is restored with fresh owner/patient authority. No commit, push, publication or deployment was performed.
