#!/usr/bin/env python3
"""GV Notetaker post-processor (cloud port).

Session dir of per-speaker PCM chunks -> faster-whisper transcript ->
Claude Code distill -> POST into GV OS (/api/notetaker/ingest), which creates
the meeting recap and fans its action items onto the Work board. Optional:
mirror the action plan to Discord and archive a Google Doc.

Everything runs in a GitHub Action. Summarization goes through the Claude Code
CLI (`claude -p`), authenticated by CLAUDE_CODE_OAUTH_TOKEN — Daniel's plan,
no separate API key — exactly like the local version did.

Env:
  GV_OS_URL             default https://os.globalventures.app
  SYNC_SECRET           bearer for the ingest endpoint          (required to post)
  MEETING_SOURCE        agency_call | client_call | manual      (default agency_call)
  MEETING_TITLE         default "Agency call"
  CLIENT_SLUG           scope the whole call to one client       (optional)
  DISCORD_BOT_TOKEN     to mirror the plan to Discord            (optional)
  TASKS_CHANNEL_ID      Discord channel for the action plan      (optional)
  WHISPER_MODEL         faster-whisper model (default small.en)
"""
import sys, os, re, glob, json, subprocess, shutil, datetime
import urllib.request

GV_OS_URL = os.environ.get("GV_OS_URL", "https://os.globalventures.app").rstrip("/")
SYNC_SECRET = os.environ.get("SYNC_SECRET", "")
SOURCE = os.environ.get("MEETING_SOURCE", "agency_call")
TITLE = os.environ.get("MEETING_TITLE", "Team call")
CLIENT_SLUG = os.environ.get("CLIENT_SLUG", "").strip()
BOT_TOKEN = os.environ.get("DISCORD_BOT_TOKEN", "")
TASKS_CHANNEL = os.environ.get("TASKS_CHANNEL_ID", "").strip()
# small.en, not medium.en: medium is ~4-6x slower on the free 2-CPU runner and a
# long call (an ~87-min recording) blew past the job timeout mid-transcription,
# so nothing posted. small.en + greedy decoding transcribes a 90-min call in
# ~15-20 min instead of 60+ — accuracy stays fine for meeting speech.
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "small.en")
FFMPEG = shutil.which("ffmpeg") or "ffmpeg"
CLAUDE = shutil.which("claude") or os.path.expanduser("~/.local/bin/claude")

# Discord userId -> clean team name (extend as the team grows).
NAME_MAP = {
    "473209133890535445": "Daniel",
    "693609852877930527": "Gus",
    "398584628904067082": "Gerard",
    "1532495609066426375": "Cosmo",
    "702292406225207398": "Aymen",
}
VOCAB = (
    "Kaden, Yel, Hakim, Saif, Gerard, Cosmo, Aymen, Gus, Brady, Aiden, Lorenzo, Hamza, "
    "The Grid, The Vault, Racks, Snoozer, Becoming Her, Main Character, Fanbasis, Lovable, "
    "Kit, Zapier, Close CRM, PandaDoc, Typeform, iClosed, Whop, Skool, Stripe, Calendly, webinar, EOD, BOD"
)

_MODEL = None


def whisper_model():
    global _MODEL
    if _MODEL is None:
        from faster_whisper import WhisperModel

        # int8 keeps CPU decoding fast; the accuracy comes from the model size.
        _MODEL = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
    return _MODEL


def transcribe(wav):
    # beam_size 1 (greedy) — the single biggest speed lever; beam 5 was ~4x
    # slower and timed the job out on long calls. vad_filter drops silence so
    # whisper doesn't hallucinate filler; no cross-segment conditioning curbs
    # drift on the short per-speaker clips. initial_prompt biases names + tools.
    segments, _info = whisper_model().transcribe(
        wav,
        initial_prompt=VOCAB,
        beam_size=1,
        vad_filter=True,
        condition_on_previous_text=False,
    )
    text = " ".join(s.text for s in segments)
    text = re.sub(r"\[.*?\]", "", " ".join(text.split())).strip()  # strip [BLANK_AUDIO]
    return text


def build_transcript(sdir):
    manifest = {}
    mf = os.path.join(sdir, "manifest.json")
    if os.path.exists(mf):
        manifest = json.load(open(mf))
    chunks = []
    for pcm in glob.glob(os.path.join(sdir, "u_*.pcm")):
        m = re.match(r"u_(\d+)_(\d+)\.pcm", os.path.basename(pcm))
        if not m or os.path.getsize(pcm) < 48000:  # < 0.25s of audio, skip blips
            continue
        uid = m.group(1)
        chunks.append((int(m.group(2)), uid, NAME_MAP.get(uid, manifest.get(uid, "?")), pcm))
    chunks.sort()
    lines, speakers = [], []
    for ts, uid, name, pcm in chunks:
        wav = pcm[:-4] + ".wav"
        # Input is 48kHz stereo PCM; downmix to 16kHz mono — whisper's native
        # format — for cleaner, more accurate transcription.
        subprocess.run(
            [FFMPEG, "-y", "-v", "quiet", "-f", "s16le", "-ar", "48000", "-ac", "2",
             "-i", pcm, "-ar", "16000", "-ac", "1", wav],
            check=False,
        )
        text = transcribe(wav) if os.path.exists(wav) else ""
        if os.path.exists(wav):
            os.remove(wav)
        if text:
            # No absolute clock time: it was the runner's UTC (wrong tz) and added
            # noise. Speaker-labeled lines in spoken order are what matter.
            lines.append(f"{name}: {text}")
            if name not in speakers and name != "?":
                speakers.append(name)
    return "\n".join(lines), speakers


def distill(transcript):
    prompt = f"""You are the notetaker for the Global Ventures agency call. Below is the transcript (speaker-labeled). Team: Daniel + Gus (operators), Gerard (sales manager), Cosmo (content director), Aymen (copywriter).

Return STRICT JSON only, no markdown fences: {{"summary": "3-5 sentence recap of decisions and state", "action_items": [{{"person": "Name", "tasks": ["specific task", ...]}}]}}

ATTRIBUTION RULES (critical):
- The person who SAYS a task is often NOT its owner. Assign each task to the person it was directed AT or who accepted it ("Cosmo, can you..." = Cosmo's task even if Daniel said it).
- Only assign a task to the speaker when they clearly claimed it ("I'll handle X").
- If ownership is genuinely unclear ("we need to...", "someone should..."), put it under "Team (unassigned)".
- Normalize name transcription drift (Caden=Kaden, Yell=Yel, Hakeem=Hakim) to the team/client names you know.

Only include action items actually said or clearly implied. Specific over vague.

TRANSCRIPT:
{transcript[:60000]}"""
    try:
        r = subprocess.run(
            [CLAUDE, "-p", "--output-format", "text"],
            input=prompt,
            capture_output=True,
            text=True,
            timeout=400,
        )
        raw = re.sub(r"^```(json)?|```$", "", r.stdout.strip(), flags=re.M).strip()
        j = json.loads(raw[raw.find("{") : raw.rfind("}") + 1])
        return j.get("summary", ""), j.get("action_items", [])
    except Exception as e:
        print("notetaker: distill unavailable:", str(e)[:200])
        return "", []


def post_ingest(source_ref, transcript, summary, items, speakers):
    if not SYNC_SECRET:
        print("notetaker: SYNC_SECRET unset — skipping GV OS ingest")
        return None
    payload = {
        "title": TITLE,
        "source": SOURCE,
        "sourceRef": source_ref,
        "meetingDate": datetime.datetime.now().strftime("%Y-%m-%d"),
        "summary": summary or None,
        "transcript": transcript or None,
        "attendees": speakers,
        "actionItems": items or [],
    }
    if CLIENT_SLUG:
        payload["clientSlug"] = CLIENT_SLUG
    payload = {k: v for k, v in payload.items() if v is not None}
    # Retry — a transient 5xx/network blip shouldn't drop the meeting. Ingest is
    # idempotent on sourceRef, so retries can't create duplicates.
    import time

    for attempt in range(3):
        try:
            req = urllib.request.Request(
                f"{GV_OS_URL}/api/notetaker/ingest",
                data=json.dumps(payload).encode(),
                method="POST",
                headers={
                    "Authorization": "Bearer " + SYNC_SECRET,
                    "Content-Type": "application/json",
                },
            )
            res = json.loads(urllib.request.urlopen(req, timeout=30).read())
            print("notetaker: ingested ->", res)
            return res
        except Exception as e:
            print(f"notetaker: ingest attempt {attempt + 1} failed:", str(e)[:300])
            time.sleep(3 * (attempt + 1))
    print("notetaker: ingest gave up (transcript saved in the run artifact)")
    return None


def post_discord(summary, items, link=None):
    """Best-effort mirror of the action plan to Discord (optional)."""
    if not (BOT_TOKEN and TASKS_CHANNEL and summary):
        return
    date = datetime.datetime.now().strftime("%A %b %d, %Y")
    plan = f"**Action Plan — {date}**\n\n_{summary}_"
    if link:
        plan += f"\n📋 Full recap + transcript: {link}"
    for it in items:
        plan += f"\n\n**{it.get('person', '?')}**"
        for t in it.get("tasks", []):
            plan += f"\n- {t}"
    # Retry a couple times — a transient 403/5xx from Discord shouldn't lose the plan.
    for attempt in range(3):
        try:
            req = urllib.request.Request(
                f"https://discord.com/api/v10/channels/{TASKS_CHANNEL}/messages",
                data=json.dumps({"content": plan[:1990]}).encode(),
                method="POST",
                headers={"Authorization": "Bot " + BOT_TOKEN, "Content-Type": "application/json"},
            )
            urllib.request.urlopen(req, timeout=15).read()
            print("notetaker: mirrored plan to Discord")
            return
        except Exception as e:
            print(f"notetaker: discord post attempt {attempt + 1} failed:", str(e)[:200])
            import time
            time.sleep(2 * (attempt + 1))
    print("notetaker: discord post gave up (non-fatal — recap is in GV OS)")


def main(sdir):
    source_ref = os.path.basename(os.path.normpath(sdir))
    transcript, speakers = build_transcript(sdir)

    # FAILSAFE: persist the transcript to the session dir the moment it exists,
    # BEFORE the distill/post steps that could fail. The workflow uploads the
    # session dir as an artifact, so a completed transcript is never lost even if
    # everything downstream dies — it can be re-posted by hand from the artifact.
    try:
        with open(os.path.join(sdir, "transcript.txt"), "w") as f:
            f.write(transcript or "")
    except Exception as e:
        print("notetaker: could not persist transcript.txt:", str(e)[:150])

    if not transcript or sum(len(line.split()) for line in transcript.split("\n")) < 12:
        print("notetaker: transcript too short — nothing to post")
        return
    summary, items = distill(transcript)

    # Persist the distilled result too, so notes survive a failed ingest.
    try:
        with open(os.path.join(sdir, "result.json"), "w") as f:
            json.dump({"summary": summary, "action_items": items, "speakers": speakers}, f)
    except Exception as e:
        print("notetaker: could not persist result.json:", str(e)[:150])

    res = post_ingest(source_ref, transcript, summary, items, speakers)
    meeting_id = (res or {}).get("meetingId")
    link = f"{GV_OS_URL}/team/meetings/{meeting_id}" if meeting_id else None
    post_discord(summary, items, link)
    print("notetaker: done")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("usage: process_call.py <session_dir>")
        sys.exit(0)
    main(sys.argv[1])
