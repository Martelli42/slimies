const { get } = require('./db');

/**
 * A cheap stamp that changes whenever anything in the shop changes.
 *
 * Serverless hosts can't hold the socket connection the app used to use for
 * live updates, so each screen polls this instead: same stamp, do nothing;
 * different stamp, refetch the current view. One query, four counters.
 */
async function stamp() {
  const row = await get(`SELECT
    (SELECT COALESCE(MAX(id),0) FROM activity_log)      AS activity,
    (SELECT COALESCE(MAX(id),0) FROM batch_events)      AS batches,
    (SELECT COUNT(*)            FROM task_completions)  AS tasks,
    (SELECT COUNT(*)            FROM announcement_reads) AS reads`);
  return `${row.activity}.${row.batches}.${row.tasks}.${row.reads}`;
}

module.exports = { stamp };
