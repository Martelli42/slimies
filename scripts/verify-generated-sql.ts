/**
 * Fails if `supabase/migrations/0002_generated.sql` is out of date with the
 * TypeScript constants it is derived from. Run in CI (`npm run check`) so a
 * tweak to the XP curve or the activity rates can never silently diverge from
 * what the database enforces.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const TARGET = resolve(HERE, "../supabase/migrations/0002_generated.sql");

const before = readFileSync(TARGET, "utf8");
execFileSync(process.execPath, [resolve(HERE, "../node_modules/tsx/dist/cli.mjs"), resolve(HERE, "generate-sql.ts")], {
  stdio: "ignore",
});
const after = readFileSync(TARGET, "utf8");

if (before !== after) {
  console.error(
    "supabase/migrations/0002_generated.sql was stale and has been regenerated.\n" +
      "Commit the update (it is derived from src/lib/{leveling,ranks,activities}.ts\n" +
      "and src/lib/xp/limits.ts).",
  );
  process.exit(1);
}

console.log("generated SQL is up to date");
