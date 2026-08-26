// GV Notetaker — cloud recorder (one-shot, for a GitHub Action).
//
// This is the port of the local recorder (scripts/gv-notetaker/recorder.js) that
// used to run on Daniel's Mac via launchd. Here it runs in a GitHub Action: it
// joins the GV team voice channel, captures per-speaker audio, and — when the
// room empties (or a hard cap is hit) — hands the session to process_call.py,
// then exits. Nothing persistent; the Action's schedule (call time) or a
// /record slash command is what starts it. Never touches a laptop.
//
// Config is all env (set by the workflow):
//   DISCORD_BOT_TOKEN   the GV bot token           (required)
//   GUILD_ID            server id                  (required)
//   VOICE_CHANNEL_ID    the voice channel to sit in (required)
//   JOIN_WAIT_MINUTES   give up if nobody joins    (default 20)
//   EMPTY_GRACE_SECONDS wait after the room empties (default 90)
//   MAX_MINUTES         hard safety cap on a call  (default 120)
//   SESSIONS_DIR        where chunks are written   (default ./sessions)
const { Client, GatewayIntentBits, Events } = require("discord.js");
const {
  joinVoiceChannel,
  EndBehaviorType,
  VoiceConnectionStatus,
} = require("@discordjs/voice");
const prism = require("prism-media");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD = process.env.GUILD_ID;
const VOICE = process.env.VOICE_CHANNEL_ID;
const JOIN_WAIT_MS = (Number(process.env.JOIN_WAIT_MINUTES) || 20) * 60_000;
const EMPTY_GRACE_MS = (Number(process.env.EMPTY_GRACE_SECONDS) || 90) * 1000;
const MAX_MS = (Number(process.env.MAX_MINUTES) || 120) * 60_000;
const SESSIONS = process.env.SESSIONS_DIR || path.join(process.cwd(), "sessions");

const log = (...a) => console.log(new Date().toISOString(), ...a);

if (!TOKEN || !GUILD || !VOICE) {
  log("missing DISCORD_BOT_TOKEN / GUILD_ID / VOICE_CHANNEL_ID — exiting");
  process.exit(0); // exit clean: nothing to do, never fail the workflow
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

let session = null; // { dir, connection, manifest, active:Set }
let emptyTimer = null;
let ended = false;

function humanCount(channel) {
  return channel.members.filter((m) => !m.user.bot).size;
}

function startSession(channel) {
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
  const dir = path.join(SESSIONS, stamp);
  fs.mkdirSync(dir, { recursive: true });
  const connection = joinVoiceChannel({
    channelId: VOICE,
    guildId: GUILD,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: true,
  });
  session = { dir, connection, manifest: {}, active: new Set(), stamp };
  log("session started", dir);

  connection.on(VoiceConnectionStatus.Ready, () => {
    const receiver = connection.receiver;
    receiver.speaking.on("start", async (userId) => {
      if (!session || session.active.has(userId)) return;
      session.active.add(userId);
      if (!session.manifest[userId]) {
        try {
          const m = await channel.guild.members.fetch(userId);
          if (m.user.bot) {
            session.active.delete(userId);
            return;
          }
          session.manifest[userId] = m.displayName || m.user.username;
        } catch {
          session.manifest[userId] = "user-" + userId.slice(-4);
        }
        fs.writeFileSync(
          path.join(session.dir, "manifest.json"),
          JSON.stringify(session.manifest),
        );
      }
      const out = path.join(session.dir, `u_${userId}_${Date.now()}.pcm`);
      const opus = receiver.subscribe(userId, {
        end: { behavior: EndBehaviorType.AfterSilence, duration: 1200 },
      });
      const decoder = new prism.opus.Decoder({
        rate: 48000,
        channels: 2,
        frameSize: 960,
      });
      const file = fs.createWriteStream(out);
      opus.pipe(decoder).pipe(file);
      const done = () => session && session.active.delete(userId);
      opus.on("end", done);
      opus.on("error", (e) => {
        log("opus err", e.message);
        done();
      });
      decoder.on("error", (e) => {
        log("decoder err", e.message);
        done();
      });
    });
  });
  connection.on("error", (e) => log("conn err", e.message));
}

function endSession(reason) {
  if (ended) return;
  ended = true;
  if (!session) {
    log("ending with no session:", reason);
    return finish();
  }
  const { dir, connection, manifest } = session;
  try {
    connection.destroy();
  } catch {
    /* already gone */
  }
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
  log("session ended", reason, dir, "speakers:", Object.values(manifest).join(","));

  // Run the processor synchronously so the Action stays alive until it's done,
  // then exit. python3 is on PATH in the workflow.
  const py = spawnSync("python3", [path.join(__dirname, "process_call.py"), dir], {
    stdio: "inherit",
    env: process.env,
  });
  log("processor exit", py.status);
  finish();
}

function finish() {
  try {
    client.destroy();
  } catch {
    /* noop */
  }
  process.exit(0);
}

function scheduleEmptyCheck(channel) {
  if (emptyTimer) return;
  emptyTimer = setTimeout(() => {
    emptyTimer = null;
    if (session && humanCount(channel) === 0) endSession("room empty");
  }, EMPTY_GRACE_MS);
}

client.once(Events.ClientReady, async () => {
  log("recorder online as", client.user.tag);
  const guild = await client.guilds.fetch(GUILD);
  const channel = await guild.channels.fetch(VOICE);

  // If the call is already going, start immediately.
  if (humanCount(channel) > 0) startSession(channel);

  client.on(Events.VoiceStateUpdate, async () => {
    try {
      const ch = await (await client.guilds.fetch(GUILD)).channels.fetch(VOICE);
      const humans = humanCount(ch);
      if (humans > 0) {
        if (emptyTimer) {
          clearTimeout(emptyTimer);
          emptyTimer = null;
        }
        if (!session) startSession(ch);
      } else if (session) {
        scheduleEmptyCheck(ch);
      }
    } catch (e) {
      log("vsu err", e.message);
    }
  });

  // Nobody showed up within the join window → leave without a fuss.
  setTimeout(() => {
    if (!session) endSession("nobody joined");
  }, JOIN_WAIT_MS);

  // Hard cap so a call left open can never pin the runner.
  setTimeout(() => endSession("max duration"), MAX_MS);
});

client.on("error", (e) => log("client err", e.message));
process.on("SIGTERM", () => endSession("SIGTERM"));

client.login(TOKEN).catch((e) => {
  log("login failed:", e.message);
  process.exit(0);
});
