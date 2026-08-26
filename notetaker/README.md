# GV Notetaker — cloud

The GV team notetaker, running in GitHub's cloud instead of on a laptop. It
joins the Discord team call, records per speaker, transcribes with
`faster-whisper`, distills the notes with **Claude Code** (your plan — no API
key), and POSTs the recap + action items into GV OS. The recap shows up under
**Team → Meetings**; the action items land on the **Work board**.

Nothing runs on your Mac. Ever.

## How it runs

- **The 9:00 AM agency call** — automatic, on a schedule (`notetaker.yml`). The
  Action joins the call room at call time, records until the room empties, and
  posts the notes. No one has to press anything.
- **Ad-hoc client calls** — type **`/record`** in Discord. That hits the app's
  `/api/discord/interactions` endpoint, which starts the same Action for
  whatever call you're on.

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
to the Vercel project so the `/record` endpoint can verify signatures and
dispatch. `SYNC_SECRET` is already there.

## Test it

1. Add `DISCORD_BOT_TOKEN` + `CLAUDE_CODE_OAUTH_TOKEN` as repo secrets.
2. Hop into the team voice channel.
3. GitHub → **Actions → notetaker → Run workflow** (manual dispatch).
4. Talk for ~30 seconds, then leave the channel.
5. Watch it in **Team → Meetings** — the recap and tasks appear within a few
   minutes of the room emptying.

The recording pipeline can only be validated with a live call + the bot token,
so this first run is the real test. Everything downstream of it — the ingest,
the Meetings surface, the Work-board fan-out — is already verified end to end.
