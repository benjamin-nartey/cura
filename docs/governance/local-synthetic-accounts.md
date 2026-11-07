# Local synthetic Dex accounts

Dex 2.42 serves `http://127.0.0.1:15556/dex` from `infra/local/dex.yaml`. These accounts are development-only. The file marks the shared sample password as the word `password`. Do not use that password, or the local client secret recorded in the same file, in staging or production.

If a local Dex file no longer matches this list, restore `infra/local/dex.yaml` and recreate the container from `infra/local` with `docker compose up -d --force-recreate dex`. Do not invent a replacement password.

| Person | Email | Username | Linked subject | Persona |
| --- | --- | --- | --- | --- |
| Amira Solano | amira.solano@harborlight.invalid | amira | usr_amira | Harborlight directory account |
| Akosua Owusu | akosua.owusu@demo-gh.invalid | akosua | usr_gh_nurse | DEMO_GH nurse |
| Marta Keller | marta.keller@demo-eu.invalid | marta | usr_eu_admin | DEMO_EU organization administrator |
| Local engineer | engineer@adom.invalid | engineer | usr_local_engineer | Local engineering account |

Sign in through the local app at `http://localhost:3000` and choose the identity-provider login. Use the email and the development-only sample password from `infra/local/dex.yaml`. The issuer stays `http://127.0.0.1:15556/dex`, and the subject stays the linked user id above.
