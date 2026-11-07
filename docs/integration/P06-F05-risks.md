# P06-F05 risk controls

| Risk | Control and evidence |
| --- | --- |
| Overstated interoperability | Separate legacy and source-read statements; explicit custom partner/preview catalog; actual method and scoped-read tests. No full SMART, Bulk Data, R5 or certification claim. |
| Private source metadata disclosure | Published artifacts are static, PHI-free and cloned; source bearer response strips private profiles/context. No database lookups in publication. |
| Host/header poisoning or stale bypass | Configured validated local origin; sandbox gate before ETag; no-store; unknown errors sanitized; version/media checks. |
| Profile/runtime drift | Generated bundle and fixtures share factories; CI drift check, exact download hashes, official validation and route assertions. |
| Silent R5 downgrade or clinical loss | Explicit incompatible versions rejected; future R5 adapter has resource-specific loss/identity/terminology/review gates. |
| Loss of prior clinical evidence | No migration or clinical write in this feature; original-row comparison and separate artifact directories. |

Qualified clinical, privacy, architecture and licensing reviews remain pending. Offline validator warnings and disabled terminology server remain visible; automated tests are not clinical acceptance. Production clinical functions stay disabled. Existing bounded import/delivery and session controls remain in force.
