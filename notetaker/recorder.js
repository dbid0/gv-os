// GV Notetaker — cloud recorder (one-shot, for a GitHub Action).
//
// Triggered by the /join Discord command (via the app's interactions endpoint ->
// repository_dispatch). Joins whatever call people are in, captures per-speaker
// audio + a name manifest, and — when that channel empties (or a hard cap) —
// writes the session and exits. The workflow's next step transcribes + posts.
// Runs in GitHub's cloud, never a laptop.
//
// It does NOT process here: keeping whisper/claude out of this step means the
// bot joins the call in seconds instead of after a slow install.
//
// Config is all env (set by the workflow from the /join payload):
//   DISCORD_BOT_TOKEN   the GV bot token                         (required)
//   GUILD_ID            server id                                (required)
//   CALLER_ID           the user who ran /join — join THEIR call (preferred)
//   VOICE_CHANNEL_ID    explicit channel override                (optional)
//   JOIN_WAIT_MINUTES   give up if no call is found              (default 15)
//   EMPTY_GRACE_SECONDS wait after the room empties              (default 90)
//   MAX_MINUTES         hard safety cap on a call                (default 120)
//   SESSIONS_DIR        where chunks are written                 (default ./sessions)
const { Client, GatewayIntentBits, Events, ChannelType } = require("discord.js");
const {
  joinVoiceChannel,
  EndBehaviorType,
  VoiceConnectionStatus,
  entersState,
} = require("@discordjs/voice");
const prism = require("prism-media");
const fs = require("fs");
const path = require("path");

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD = process.env.GUILD_ID;
const CALLER = process.env.CALLER_ID || "";
const VOICE_OVERRIDE = process.env.VOICE_CHANNEL_ID || "";
const JOIN_WAIT_MS = (Number(process.env.JOIN_WAIT_MINUTES) || 15) * 60_000;
const EMPTY_GRACE_MS = (Number(process.env.EMPTY_GRACE_SECONDS) || 90) * 1000;
const MAX_MS = (Number(process.env.MAX_MINUTES) || 120) * 60_000;
const SESSIONS = process.env.SESSIONS_DIR || path.join(process.cwd(), "sessions");
// Where to speak up. Default: the voice channel's own text chat, so the message
// appears right in the call. Falls back to STATUS_CHANNEL_ID if that send fails.
const STATUS_CHANNEL = process.env.STATUS_CHANNEL_ID || "";

const log = (...a) => console.log(new Date().toISOString(), ...a);

/** Best-effort, time-bounded status message so people know what's happening. */
async function say(channel, text) {
  const bounded = (p) => Promise.race([p, new Promise((r) => setTimeout(r, 8000))]);
  try {
    await bounded(channel.send(text));
    return;
  } catch {
    /* fall through to the configured status channel */
  }
  if (STATUS_CHANNEL) {
    try {
      const ch = await channel.client.channels.fetch(STATUS_CHANNEL);
      await bounded(ch.send(text));
    } catch (e) {
      log("status post failed:", e.message);
    }
  }
}

if (!TOKEN || !GUILD) {
  log("missing DISCORD_BOT_TOKEN / GUILD_ID — exiting");
  process.exit(0); // never fail the workflow
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

let session = null; // { dir, connection, channelId, active:Set, manifest }
let emptyTimer = null;
let ended = false;

function humanCount(channel) {
  return channel ? channel.members.filter((m) => !m.user.bot).size : 0;
}

/** Which channel to record: the caller's, else the busiest, else an override. */
function resolveChannel(guild) {
  if (CALLER) {
    // Voice-state cache is the direct source; fall back to the member's cache.
    const chId =
      guild.voiceStates.cache.get(CALLER)?.channelId ??
      guild.members.cache.get(CALLER)?.voice?.channelId;
    if (chId) return guild.channels.cache.get(chId);
  }
  if (VOICE_OVERRIDE) {
    const ch = guild.channels.cache.get(VOICE_OVERRIDE);
    if (ch) return ch;
  }
  // Fallback: the voice channel with the most humans in it right now.
  const voice = guild.channels.cache.filter(
    (c) => c.type === ChannelType.GuildVoice && humanCount(c) > 0,
  );
  return [...voice.values()].sort((a, b) => humanCount(b) - humanCount(a))[0] ?? null;
}

function startSession(channel) {
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 16);
  const dir = path.join(SESSIONS, stamp);
  fs.mkdirSync(dir, { recursive: true });
  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: GUILD,
    adapterCreator: channel.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: true,
  });
  session = {
    dir,
    connection,
    channel,
    channelId: channel.id,
    active: new Set(),
    manifest: {},
  };
  log("session started", dir, "channel", channel.name);

  connection.on(VoiceConnectionStatus.Ready, () => {
    say(
      channel,
      "🎙️ **Notetaker is recording.** When you're done, just **leave the call** " +
        "(or drag me out) and I'll post the notes + action items to GV OS in a couple minutes.",
    );
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
        log("capturing", session.manifest[userId]);
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

  // Someone dragged the bot out of the call → finish now (after a short grace,
  // so a transient network blip that auto-reconnects doesn't end the session).
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5000),
      ]);
      // reconnecting on its own — leave the session running
    } catch {
      endSession("disconnected");
    }
  });
}

async function endSession(reason) {
  if (ended) return;
  ended = true;
  if (session) {
    const { channel, dir, manifest } = session;
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest));
    // Hand the workflow the session dir to process + the call's channel so the
    // finished notes get posted back into that same chat.
    if (process.env.GITHUB_OUTPUT) {
      fs.appendFileSync(
        process.env.GITHUB_OUTPUT,
        `session_dir=${dir}\nstatus_channel=${session.channelId}\n`,
      );
    }
    log("session ended", reason, dir, "speakers:", Object.values(manifest).join(","));
    // Only claim we're posting notes if someone actually spoke.
    if (Object.keys(manifest).length > 0) {
      await say(
        channel,
        "✅ **Call wrapped** — transcribing and posting the notes + tasks to GV OS " +
          "now. Back in ~2 minutes.",
      );
    }
    try {
      session.connection.destroy();
    } catch {
      /* already gone */
    }
  } else {
    log("ending with no session:", reason);
  }
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
  const guild = client.guilds.cache.get(GUILD) ?? (await client.guilds.fetch(GUILD));

  const target = resolveChannel(guild);
  if (target) startSession(target);
  else log("no active call found yet — waiting for someone to join");

  client.on(Events.VoiceStateUpdate, () => {
    try {
      const g = client.guilds.cache.get(GUILD);
      if (!g) return;
      if (!session) {
        const ch = resolveChannel(g);
        if (ch) startSession(ch);
        return;
      }
      const ch = g.channels.cache.get(session.channelId);
      if (humanCount(ch) > 0) {
        if (emptyTimer) {
          clearTimeout(emptyTimer);
          emptyTimer = null;
        }
      } else {
        scheduleEmptyCheck(ch);
      }
    } catch (e) {
      log("vsu err", e.message);
    }
  });

  // No call showed up within the window → leave quietly.
  setTimeout(() => {
    if (!session) endSession("no call found");
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
