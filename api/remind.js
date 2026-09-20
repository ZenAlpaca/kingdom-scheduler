// /api/remind.js
// Hit weekly (Sunday 1pm) by a cron job — see vercel.json in the project root
// for the schedule. Looks at upcoming show days and nudges anyone who hasn't
// submitted availability yet.
//
// Env vars required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//                     TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function sendTelegram(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.error("Telegram env vars missing — reminder not sent");
    return;
  }
  const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "HTML" }),
  });
  const data = await resp.json();
  if (!data.ok) throw new Error(data.description || "Telegram API error");
}

function nextTwoWeeksOfShowDays(allShowDays) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() + 14);
  return allShowDays.filter((d) => {
    const date = new Date(d + "T00:00:00");
    return date >= today && date <= cutoff;
  });
}

export default async function handler(req, res) {
  // Vercel Cron sends GET requests; allow POST too for manual triggering.
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { data: stateRows, error: stateErr } = await supabase
      .from("app_state")
      .select("value")
      .eq("key", "show_days")
      .single();
    if (stateErr) throw stateErr;
    const showDays = nextTwoWeeksOfShowDays(stateRows?.value || []);

    if (showDays.length === 0) {
      return res.status(200).json({ skipped: true, reason: "No upcoming show days" });
    }

    const { data: users, error: usersErr } = await supabase
      .from("users")
      .select("id, name")
      .eq("is_owner", false); // owners don't submit availability against themselves
    if (usersErr) throw usersErr;

    const { data: submitted, error: availErr } = await supabase
      .from("availability")
      .select("user_id, date")
      .in("date", showDays);
    if (availErr) throw availErr;

    const submittedSet = new Set(submitted.map((a) => `${a.user_id}_${a.date}`));
    const missing = users.filter((u) =>
      showDays.some((d) => !submittedSet.has(`${u.id}_${d}`))
    );

    if (missing.length === 0) {
      return res.status(200).json({ skipped: true, reason: "Everyone has submitted" });
    }

    const dateList = showDays
      .map((d) => new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }))
      .join(", ");
    const nameList = missing.map((u) => u.name).join(", ");

    await sendTelegram(
      `⏰ <b>Availability reminder</b>\nShow days coming up: ${dateList}\nStill need availability from: ${nameList}`
    );

    return res.status(200).json({ sent: true, reminded: missing.map((u) => u.name) });
  } catch (err) {
    console.error("api/remind error:", err);
    return res.status(500).json({ error: err.message || "Reminder job failed" });
  }
}
