import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDatabase } from "../../packages/domain/src/db.ts";

const dir = mkdtempSync(path.join(tmpdir(), "curasphere-backup-"));
const original = path.join(dir, "chart.sqlite");
const backup = path.join(dir, "chart.sqlite.bak");
const database = createDatabase(original);
const version = database.prepare("SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1").get();
database.close();
copyFileSync(original, backup);
rmSync(original);
copyFileSync(backup, original);
const restored = createDatabase(original);
const again = restored.prepare("SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1").get();
restored.close();
if (!version || version.version !== 42 || !again || again.version !== 42) {
  console.error("restore failed", version, again);
  process.exit(1);
}
console.log(`backup-restore ok schema=${again.version} dir=${dir}`);
