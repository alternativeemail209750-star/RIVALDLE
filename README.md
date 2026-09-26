# Rivaldle - Setup Guide (No Coding Needed)

This folder is a complete, ready-to-run app. You do not need to write or edit
any code. Just follow these steps in order.

## What's inside
- `server.js` - the game "brain" (reads TikTok chat, runs the game, stores settings)
- `public/` - the screen you will share on TikTok LIVE, including the full
  in-app **Host Settings** panel
- `data/` - where your settings and scoreboard are saved automatically
  between restarts (created for you; nothing to touch)
- `package.json` - tells the server what software it needs

---

## STEP 1: Put this folder on GitHub

1. Go to https://github.com and create a free account if you don't have one.
2. Click the **+** icon (top right) → **New repository**.
3. Name it `rivaldle`, keep it **Public** or **Private** (either is fine), then
   click **Create repository**.
4. On the new repository page, click **uploading an existing file**.
5. Drag in every file and folder from this download (including the `public`
   and `data` folders). Click **Commit changes**.

## STEP 2: Get your Euler Key (needed to read TikTok LIVE chat)

TikTok requires a "signing" service for apps that read live chat. This
project uses a service called **Eulerstream** for that.

1. Go to https://www.eulerstream.com and create a free account.
2. Find your **API Key** in your Eulerstream dashboard.
3. Copy it - you'll paste it into Render in Step 4.

(If Eulerstream has changed their sign-up process by the time you read this,
search "Eulerstream API key" - the concept stays the same: you need a key
from them to read TikTok LIVE chat reliably.)

## STEP 3: Deploy on Render.com

1. Go to https://render.com and sign up (you can sign up with your GitHub
   account, which makes this step faster).
2. Click **New +** → **Web Service**.
3. Connect your GitHub account if asked, then select the `rivaldle`
   repository you created in Step 1.
4. Fill in:
   - **Name:** rivaldle (or anything you like)
   - **Region:** whichever is closest to you
   - **Branch:** main
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free is fine to start
5. Click **Create Web Service**. Render will now build your app - this takes
   a couple of minutes the first time.

   > If Render ever shows a build error naming an npm package/version it
   > can't find, that specific version was probably removed or renamed
   > upstream. Check `package.json`'s `dependencies` and update just that
   > one version number to the current release.

## STEP 4: Add your Environment Variables

Still on Render, open your new service → click **Environment** in the left
menu → **Add Environment Variable**, and add these one at a time:

| Key | Value |
|---|---|
| `TIKTOK_USERNAME` | your TikTok username, no `@` (e.g. `johndoe123`) |
| `EULER_KEY` | the key you copied in Step 2 |

Click **Save Changes** - Render will automatically restart your app.

> **Tip:** on Render's free tier, the filesystem resets on every redeploy, so
> anything saved in `data/settings.json` (your custom settings, team names,
> and scoreboard) will reset to defaults when you redeploy. If you want your
> settings to survive redeploys, add a **Render Disk** mounted at `/data`
> in your service's Settings → Disks. This is optional - the game works
> fine without it.

## STEP 5: Open your game on your phone

1. Once Render shows **Live** with a green dot, copy the URL it gives you
   (something like `https://rivaldle.onrender.com`).
2. Open that URL in your Android phone's browser. This is the screen you
   will share.
3. Go live on TikTok, choose **Mobile Gaming / Screen Share** in TikTok's
   LIVE setup, and share your browser showing that page.

---

## Using the Host Settings Panel

- Tap the **⚙ gear icon** in the top-right of the header - a settings panel
  slides out from the right. No passcode is needed - anyone with the page
  open can tap the gear icon and use every control, so only share the URL
  with people you trust (e.g. don't post it publicly - it's just for you /
  your co-host to open on your own device).
- The **Mode** switch is right at the top of the panel - see below.
- The panel has four tabs:

### Mode: Test / Live / Offline

A colored badge under the title (TEST MODE / LIVE / OFFLINE) always shows
which mode you're in.

- **Test** (the default on a fresh deploy) - no TikTok connection is made
  at all. Use the **Chat Simulator** in the System tab to fake chat
  messages (`joinrivaldle`, a 5-letter guess, `!leave`, etc.) and rehearse
  the whole game, including right after you deploy an update, before
  trusting it on a real stream.
- **Live** - connects to your real TikTok LIVE chat (`TIKTOK_USERNAME` /
  `EULER_KEY`). This is what you switch to right before you go live. Only
  real TikTok chat controls the game in this mode.
- **Offline** - also makes no TikTok connection. Instead, an on-screen
  **Join / Guess bar** appears at the bottom of the game screen (no need to
  open Host Settings) - type a name, tap **Join** to grab an open team slot,
  then type 5-letter guesses into the **Guess** box and tap **Guess** (or
  press Enter). Perfect for playing by yourself, or practicing offline with
  friends passing one device around.

### Game Rules tab
- **Quick actions:** kick any team, force-skip the current round, pause /
  resume the whole game, reset the scoreboard to zero.
- **Rules:** toggle chat substitutions on/off, toggle **Hard Mode** (players
  must reuse every green/yellow clue they've already found), set a **max
  guesses per round** (locks a team out once they run out, 0 = unlimited),
  a **round timer** in seconds (0 = no timer; the round auto-skips when time
  runs out), how many seconds pass before the next round auto-starts, how
  many **points** a round win is worth, and how many rounds make up a
  "match" (0 = the scoreboard just runs forever; if you set e.g. 5, a final
  standings screen appears after round 5 and the scoreboard then resets for
  a fresh match).
- **Chat Commands:** change the exact text viewers type to join / leave /
  substitute, in case `joinrivaldle` collides with something else in your
  chat.
- **Custom Next Word:** type any 5-letter word and it becomes the answer for
  the *next* round only (great for planned reveals or sponsor tie-ins).

### Teams & Avatars tab
- Rename each team (shown on the scoreboard and in on-screen text).
- Pick a **costume class** per team from: Samurai, Sorcerer, Explorer,
  Cleric, Ninja, Robot, Pirate, Astronaut. Whichever a player's real,
  circular TikTok profile photo becomes their character's head automatically
  the instant they join - the costume just changes the robe color and
  headwear around it.

### Display & Audio tab
- Pick a **theme skin** (Neon City, Midnight, Sunset, Forest, Minimal
  Light) - this is shared with everyone watching this browser page.
- Everything else here (confetti, sound effects, text-to-speech announcer,
  reduced motion, compact layout, TTS speaking rate, SFX volume) is saved
  **only on this device/browser**, so you can run different display
  preferences on your phone vs. a laptop OBS source without them fighting
  each other.

### System tab
- See your live TikTok connection status and force a reconnect.
- **Test Mode:** simulate chat messages (`joinrivaldle`, a 5-letter guess,
  `!leave`, etc.) without needing to be live on TikTok at all - perfect for
  rehearsing before you go live.
- A rolling **activity log** of joins, subs, wins, and host actions.

Tap the **✕** in the panel header to close it again before you go live.

---

## How the game works (quick recap)

- Viewers type your join command (default `joinrivaldle`) in chat to join -
  the first 4 people get randomly placed into Red/Blue/Green/Yellow, each
  shown as a costumed character wearing that player's own circular TikTok
  profile photo as the head.
- Once all 4 spots are filled, the round starts automatically (and the round
  timer, if you set one, starts counting down).
- Each player types 5-letter word guesses in chat - their own board updates
  live, with a little sound and pulse animation on every guess.
- First to guess the secret word wins the round: confetti falls, the
  announcer speaks it aloud (if TTS is on), the word is revealed, points are
  awarded, and it resets to the lobby after your configured delay.
- If nobody guesses it before the timer runs out (or everyone hits the max
  guess limit), the round ends with no winner and the word is revealed.
- `!leave` frees up a player's spot any time; `!substitute` lets any other
  viewer grab an open spot (toggle this off from the settings panel if you'd
  rather keep the same 4 players all match).
- If someone goes AFK or is trolling, use the **Kick** buttons in the
  settings panel - there is no automatic kicking.
- The scoreboard persists across rounds; set **rounds per match** if you want
  it to automatically show final standings and reset periodically.

## If something doesn't connect

- These only matter in **Live** mode - Test and Offline never touch TikTok,
  so there's nothing to connect there.
- **"TikTok connection: Disconnected"** in the settings panel usually means
  you are not currently live on TikTok, your `TIKTOK_USERNAME` is misspelled,
  or your Eulerstream key needs attention. The app automatically keeps
  retrying every 15 seconds - or tap **Force Reconnect** in the System tab.
- **"Sign key on server: Missing"** means the `EULER_KEY` environment
  variable wasn't saved correctly on Render - double check Step 4.
- Render's free tier can take ~30-60 seconds to "wake up" if it's been idle;
  open the URL once, wait a bit, then start your TikTok LIVE.

## About the dictionary

Guesses are checked against the `word-list` package - a comprehensive,
SCOWL-derived English dictionary of roughly **470,000 words covering every
word length**. The server filters that down to just its 5-letter entries
(since every guess here is exactly 5 letters), which covers essentially
every real 5-letter English word - there's no artificially narrow list
rejecting legitimate guesses. When the server starts, its logs print the
exact totals, e.g.:

```
Base dictionary loaded: 470,000+ English words total.
Of those, X,XXX are valid 5-letter guesses.
```

The **possible secret answers**, on the other hand, are deliberately a
smaller, hand-picked list of common, recognizable words (see below) - this
is standard Wordle practice, so the word people have to *guess* is always
fair and familiar, even though almost any real word is accepted as a
*guess* along the way.

## Changing the secret word pool

Everything is designed to just work as-is, but if you ever want to tweak the
list of possible secret words, they're in `server.js` near the top, in a
section labeled `ANSWER_WORDS`. You (or anyone helping you) can add or remove
words from that list - no other changes needed. For a one-off word, use the
**Custom Next Word** field in the Host Settings panel instead - no code
editing required.
