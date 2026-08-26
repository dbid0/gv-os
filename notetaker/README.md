# GV Notetaker — cloud

The GV team notetaker, running in GitHub's cloud instead of on a laptop. It
joins the Discord team call, records per speaker, transcribes with
`faster-whisper`, distills the notes with **Claude Code** (your plan — no API
key), and POSTs the recap + action items into GV OS. The recap shows up under
**Team → Meetings**; the action items land on the **Work board**.

Nothing runs on your Mac. Ever.

## How it runs

Type **`/join`** in Discord. The bot joins whatever call **you** are in, records
until the room empties, and posts the notes + tasks. No schedule — it only ever
records when you ask it to.

`/join` → the app's `/api/discord/interactions` endpoint (Vercel) verifies the
signature and fires a GitHub `repository_dispatch` → the Action boots, joins your
call, records, then transcribes + posts. Expect ~1–2 min from `/join` to the bot
appearing (the cloud has to spin up — the price of not paying for an always-on
host). To stop it, just end the call; when the room empties it processes and
posts.

## Pipeline

```
Discord voice call
  └─ recorder.js  (GitHub Action: joins VC, captures per-speaker PCM)
       └─ process_call.py
            ├─ ffmpeg  PCM → WAV
            ├─ faster-whisper  → speaker-labeled transcript
            ├─ claude -p  → { summary, action_items }   (Claude Code, your plan)
            └─ POST /api/notetaker/ingest  → meeting recap + Work-board tasks
```

## One-time setup (the last mile)

### 1. GitHub repo secrets

`Settings → Secrets and variables → Actions → New repository secret`

| Secret                    | Value                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `DISCORD_BOT_TOKEN`       | The GV bot token (it's in `~/gv-notetaker/.env` and `discord-builder/.env.gv`)                                           |
| `CLAUDE_CODE_OAUTH_TOKEN` | Run `claude setup-token` locally, paste the token it prints. This is what lets the Action summarize on your Claude plan. |
| `SYNC_SECRET`             | Already set (same one `integration-sync` uses).                                                                          |
| `DISCORD_PUBLIC_KEY`      | Discord Developer Portal → your app → **General Information → Public Key**. Needed for `/record`.                        |
| `GH_DISPATCH_TOKEN`       | A fine-grained PAT with **Actions: Read and write** on `dbid0/gv-os`. Lets `/record` start the Action.                   |

Optional repo **Variables** (defaults are the team call, so usually skip):
`GV_GUILD_ID`, `GV_VOICE_CHANNEL_ID`, `GV_TASKS_CHANNEL_ID` (set the last one if
you also want the plan mirrored to a Discord channel).

Until `DISCORD_BOT_TOKEN` is set, the workflow **skips cleanly** — it never
turns the Actions tab red.

### 2. Discord — enable the bot to hear the call

Developer Portal → your app → **Bot** → enable the **Server Members** and
**Voice** gateway intents. The bot needs **Connect** on the team voice channel.

### 3. Discord — wire up `/record` (only if you want the slash command)

- Developer Portal → your app → **General Information → Interactions Endpoint
  URL** → `https://os.globalventures.app/api/discord/interactions` → Save.
  Discord sends a signed PING; the endpoint answers it, so Save succeeds only
  once `DISCORD_PUBLIC_KEY` is set as a Vercel env var too.
- Register the command once (replace `APP_ID` and `BOT_TOKEN`):

  ```bash
  curl -X POST "https://discord.com/api/v10/applications/APP_ID/commands" \
    -H "Authorization: Bot BOT_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "name": "record",
      "description": "Record this call — GV notetaker posts the notes to GV OS",
      "options": [
        {"name":"title","description":"Meeting title","type":3,"required":false},
        {"name":"client","description":"Client slug to scope to","type":3,"required":false}
      ]
    }'
  ```

### 4. Vercel env

Add `DISCORD_PUBLIC_KEY`, `GH_DISPATCH_TOKEN`, and (optional) `GH_DISPATCH_REPO`
to the Vercel project so the `/join` endpoint can verify signatures and
dispatch. `SYNC_SECRET` is already there.

## Test it

1. Join any voice channel in the GV server.
2. Type **`/join`**.
3. Wait ~1–2 min for the bot to appear, talk for ~30 seconds, then leave.
4. Watch it in **Team → Meetings** — the recap and tasks appear a couple minutes
   after the room empties.

No secrets to type — they're wired. This first live call is the real test of the
voice capture; everything downstream (ingest → Meetings → Work board) is already
verified end to end.
