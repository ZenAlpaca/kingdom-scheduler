// /api/telegram.js
// Fires a single Telegram message to the club's staff channel/group.
// Called by the client's sendTelegram(message) helper.
//
// Env vars required:
//   TELEGRAM_BOT_TOKEN
//   TELEGRAM_CHAT_ID   (the group/channel id the bot posts into)

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { message } = req.body || {};
  if (!message) return res.status(400).json({ error: "message is required" });

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.error("Telegram env vars missing — message not sent:", message);
    return res.status(500).json({ error: "Telegram is not configured" });
  }

  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    const data = await resp.json();
    if (!data.ok) throw new Error(data.description || "Telegram API error");
    return res.status(200).json({ sent: true });
  } catch (err) {
    console.error("api/telegram error:", err);
    return res.status(500).json({ error: err.message || "Failed to send Telegram message" });
  }
}
