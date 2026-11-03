# How to verify a signature

The amendment under review is `docs/constitution/amendments/DEV-GOV-2026-001.md`.

Compute its hash and compare it with every signature record:

```bash
python -c "import hashlib,pathlib; print(hashlib.sha256(pathlib.Path('docs/constitution/amendments/DEV-GOV-2026-001.md').read_bytes()).hexdigest())"
```

The hash recorded for this handoff is `b0cb7581996daf6f212991086e4cc58772cf76a80d5075c23dec60aa84ea27c8`.

A signature is valid only when all of the following are true:

- `amendmentSha256` equals the hash of the file above.
- `reviewerName` and `signedAt` were written by the named person.
- The architecture, security, and clinical names are different people.
- The product owner is not one of those three names.
- The clinical safety record decides the development-only architecture on its own. A deferral of the role matrix or of the five-minute and fifteen-minute defaults does not fill that record.
- No synthetic workforce name is used.

`npm run governance:review:dev` refuses to activate the exception until `docs/governance/development-exception-authorization.json` exists and passes those checks. Do not create that file by copying these templates.
