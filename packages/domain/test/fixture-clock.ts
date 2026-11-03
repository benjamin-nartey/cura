// Only imported by fixed-date Phase 04 scenarios and their child race workers.
// Keep past-booking validation active in the application.
import { mock } from "node:test";

mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-19T08:00:00.000Z") });
