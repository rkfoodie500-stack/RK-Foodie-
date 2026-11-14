import express from "express";
import makeWASocket, { DisconnectReason, useMultiFileAuthState } from "@whiskeysockets/baileys";
import qrcode from "qrcode-terminal";
import pino from "pino";
import path from "node:path";
import fs from "node:fs";

const app = express();
app.use(express.json({ limit: "12kb" }));

const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.WA_GATEWAY_API_KEY || "";
const AUTH_DIR = process.env.WA_AUTH_DIR || path.join(process.cwd(), "auth_info_baileys");

if (API_KEY.length < 32) {
  console.error("Set WA_GATEWAY_API_KEY to a random secret of at least 32 characters.");
  process.exit(1);
}

let sock = null;
let connecting = false;
let reconnectTimer = null;
let connectionReady = false;

async function connectWhatsApp() {
  if (connecting) return;
  connecting = true;
  try {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    sock = makeWASocket({
      auth: state,
      logger: pino({ level: "silent" }),
      markOnlineOnConnect: false,
      browser: ["RK Foodie OTP Gateway", "Chrome", "1.0.0"],
    });

    sock.ev.on("creds.update", saveCreds);
    sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    // আপনার হোয়াটসঅ্যাপ নম্বর এখানে দিন (যেমন: +919907406500 - দেশের কোড সহ)
    const phoneNumber = "+919907406500";

    if (qr && !sock.authState.creds.registered) {
        try {
            // পেয়ারিং কোড নেওয়ার আগে ৩ সেকেন্ড অপেক্ষা করা
            await new Promise(resolve => setTimeout(resolve, 3000));
            const code = await sock.requestPairingCode(phoneNumber);
            console.log(`========================================`);
            console.log(`আপনার হোয়াটসঅ্যাপ পেয়ারিং কোডটি হলো: ${code}`);
            console.log(`========================================`);
        } catch (err) {
            console.error("পেয়ারিং কোড নিতে সমস্যা হয়েছে:", err);
        }
    }


      if (connection === "open") {
        connectionReady = true;
        console.log("WhatsApp gateway connected.");
      }
      if (connection === "close") {
        connectionReady = false;
        const status = lastDisconnect?.error?.output?.statusCode;
        console.log("WhatsApp connection closed. Status:", status ?? "unknown");
        if (status !== DisconnectReason.loggedOut) {
          clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => {
            connecting = false;
            connectWhatsApp().catch(err => console.error("Reconnect failed:", err.message));
          }, 5000);
        } else {
          console.error("WhatsApp logged out. Remove the auth folder and restart to pair again.");
        }
      }
    });
  } catch (err) {
    console.error("WhatsApp startup error:", err);
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      connecting = false;
      connectWhatsApp().catch(e => console.error(e));
    }, 10000);
  } finally {
    // Connection lifecycle owns subsequent reconnect attempts.
    connecting = false;
  }
}

function requireApiKey(req, res, next) {
  const supplied = req.get("x-api-key") || "";
  if (supplied.length !== API_KEY.length || supplied !== API_KEY) {
    return res.status(401).json({ success: false, error: "Unauthorized." });
  }
  next();
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, whatsapp_connected: connectionReady });
});

// This endpoint deliberately accepts only OTP payloads, not arbitrary message text.
app.post("/send-otp", requireApiKey, async (req, res) => {
  try {
    const phone = String(req.body?.phone || "").replace(/\D/g, "");
    const otp = String(req.body?.otp || "");
    const expiresInMinutes = Number(req.body?.expiresInMinutes || 5);
    if (phone.length < 8 || phone.length > 15 || !/^\d{4}$/.test(otp)) {
      return res.status(400).json({ success: false, error: "Invalid phone or OTP." });
    }
    if (!sock || !connectionReady) {
      return res.status(503).json({ success: false, error: "WhatsApp is not connected yet." });
    }
    const jid = `${phone}@s.whatsapp.net`;
    const text = `Your RK Foodie login code is: ${otp}\n\nThis code expires in ${expiresInMinutes} minutes. Do not share it with anyone.`;
    await sock.sendMessage(jid, { text });
    return res.json({ success: true });
  } catch (error) {
    console.error("OTP send failed:", error?.message || error);
    return res.status(502).json({ success: false, error: "WhatsApp message could not be sent." });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`RK Foodie WhatsApp gateway listening on port ${PORT}`);
  connectWhatsApp().catch(err => console.error("Initial WhatsApp connection failed:", err));
});
