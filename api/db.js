// /api/db.js
// Single serverless proxy in front of Supabase. The client never talks to
// Supabase directly — it always calls this endpoint, which holds the
// service-role key server-side and forwards the operation.
//
// Request contract:
//   GET  /api/db?table=shifts&filter=...        -> SELECT
//   POST /api/db   body: { table, rows }        header: x-operation: INSERT | UPSERT
//   POST /api/db   body: { table, match, patch } header: x-operation: PATCH
//   POST /api/db   body: { table, match }        header: x-operation: DELETE
//
// Env vars required (set these in your hosting provider, never commit them):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const ALLOWED_TABLES = new Set([
  "users",
  "departments",
  "shifts",
  "availability",
  "giveup_requests",
  "time_off_requests",
  "notifications",
  "app_state",
]);

// The client speaks camelCase (userId, onCall, ...); Postgres columns are
// snake_case (user_id, on_call, ...). A couple of fields also get renamed
// outright (shifts.start/end -> start_time/end_time) because "end" is a
// reserved-feeling word we'd rather not use as a bare column name.
// This proxy is the one place that knows about both, so neither the
// frontend nor schema.sql has to compromise on naming.
const FIELD_ALIASES = {
  shifts: { start: "start_time", end: "end_time" },
};

// Tables that have a real-world uniqueness rule *other than* their id
// column (see the `unique(...)` constraints in schema.sql). An upsert
// needs to know this so a resubmission — same person, same date — updates
// the existing row instead of colliding with it under a fresh id.
const CONFLICT_TARGETS = {
  availability: "user_id,date",
};

const camelToSnake = (s) => s.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
const snakeToCamel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

function toDbRow(table, row) {
  const aliases = FIELD_ALIASES[table] || {};
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    const column = aliases[key] || camelToSnake(key);
    out[column] = value;
  }
  return out;
}

function toDbMatch(table, match) {
  return toDbRow(table, match);
}

// Applies a {column: value} match object to a Supabase query builder,
// using .in() for array values (e.g. deleting a whole week's shifts by
// an array of dates) and .eq() otherwise.
function applyMatch(query, matchObj) {
  for (const [column, value] of Object.entries(matchObj)) {
    query = Array.isArray(value) ? query.in(column, value) : query.eq(column, value);
  }
  return query;
}

function fromDbRow(table, row) {
  const aliases = FIELD_ALIASES[table] || {};
  const reverseAliases = Object.fromEntries(Object.entries(aliases).map(([k, v]) => [v, k]));
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    const field = reverseAliases[key] || snakeToCamel(key);
    out[field] = value;
  }
  return out;
}

export default async function handler(req, res) {
  // Basic CORS so this can be called from the app's own origin during dev.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-operation, x-table");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    if (req.method === "GET") {
      const table = req.query.table;
      if (!ALLOWED_TABLES.has(table)) {
        return res.status(400).json({ error: `Unknown table "${table}"` });
      }
      let query = supabase.from(table).select("*");
      // Optional simple equality filters passed as query params, e.g. ?userId=abc
      for (const [key, value] of Object.entries(req.query)) {
        if (key === "table") continue;
        const [column] = Object.entries(toDbRow(table, { [key]: value }))[0];
        query = query.eq(column, value);
      }
      const { data, error } = await query;
      if (error) throw error;
      return res.status(200).json({ data: (data || []).map((row) => fromDbRow(table, row)) });
    }

    if (req.method === "POST") {
      const operation = (req.headers["x-operation"] || "").toUpperCase();
      const { table, rows, match, patch, key, value } = req.body || {};

      if (table !== "app_state" && !ALLOWED_TABLES.has(table)) {
        return res.status(400).json({ error: `Unknown table "${table}"` });
      }

      switch (operation) {
        case "INSERT": {
          const dbRows = (rows || []).map((r) => toDbRow(table, r));
          const { data, error } = await supabase.from(table).insert(dbRows).select();
          if (error) throw error;
          return res.status(200).json({ data: (data || []).map((row) => fromDbRow(table, row)) });
        }
        case "UPSERT": {
          if (table === "app_state") {
            const { data, error } = await supabase
              .from("app_state")
              .upsert({ key, value, updated_at: new Date().toISOString() })
              .select();
            if (error) throw error;
            return res.status(200).json({ data });
          }
          const dbRows = (rows || []).map((r) => toDbRow(table, r));
          const conflictTarget = CONFLICT_TARGETS[table];
          const query = conflictTarget
            ? supabase.from(table).upsert(dbRows, { onConflict: conflictTarget })
            : supabase.from(table).upsert(dbRows);
          const { data, error } = await query.select();
          if (error) throw error;
          return res.status(200).json({ data: (data || []).map((row) => fromDbRow(table, row)) });
        }
        case "PATCH": {
          let query = supabase.from(table).update(toDbRow(table, patch || {}));
          query = applyMatch(query, toDbMatch(table, match || {}));
          const { data, error } = await query.select();
          if (error) throw error;
          return res.status(200).json({ data: (data || []).map((row) => fromDbRow(table, row)) });
        }
        case "DELETE": {
          let query = supabase.from(table).delete();
          query = applyMatch(query, toDbMatch(table, match || {}));
          const { data, error } = await query.select();
          if (error) throw error;
          return res.status(200).json({ data: (data || []).map((row) => fromDbRow(table, row)) });
        }
        default:
          return res.status(400).json({ error: `Unsupported x-operation "${operation}"` });
      }
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("api/db error:", err);
    return res.status(500).json({ error: err.message || "Database error" });
  }
}
