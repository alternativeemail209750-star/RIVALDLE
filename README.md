# Rivaldle - Setup Guide (No Coding Needed)

This folder is a complete, ready-to-run app. You do not need to write or edit
any code. Just follow these steps in order.

## What's inside
- `server.js` - the game "brain" (reads TikTok chat, runs the game)
- `public/` - the screen you will share on TikTok LIVE
- `package.json` - tells the server what software it needs

---

## STEP 1: Put this folder on GitHub

1. Go to https://github.com and create a free account if you don't have one.
2. Click the **+** icon (top right) → **New repository**.
3. Name it `rivaldle`, keep it **Public** or **Private** (either is fine), then
   click **Create repository**.
4. On the new repository page, click **uploading an existing file**.
5. Drag in every file and folder from this download (including the `public`
   folder). Click **Commit changes**.

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

## STEP 4: Add your Environment Variables

Still on Render, open your new service → click **Environment** in the left
menu → **Add Environment Variable**, and add these one at a time:

| Key | Value |
|---|---|
| `TIKTOK_USERNAME` | your TikTok username, no `@` (e.g. `johndoe123`) |
| `EULER_KEY` | the key you copied in Step 2 |
| `HOST_PASSCODE` | any password you'll remember, used to unlock the settings panel |

Click **Save Changes** - Render will automatically restart your app.

## STEP 5: Open your game on your phone

1. Once Render shows **Live** with a green dot, copy the URL it gives you
   (something like `https://rivaldle.onrender.com`).
2. Open that URL in your Android phone's browser. This is the screen you
   will share.
3. Go live on TikTok, choose **Mobile Gaming / Screen Share** in TikTok's
   LIVE setup, and share your browser showing that page.

## Using the Host Settings Panel

- **Press and hold the "RIVALDLE" title for about 1 second** - a settings
  panel will slide out from the right.
- Type the passcode you set in Step 4 into the box at the top before using
  any button (kick, force skip, pause, toggle subbing).
- There's also a **Test Mode** box at the bottom of the panel, so you can
  try out "joinrivaldle", guesses, and "!leave" yourself before ever going
  live - no TikTok connection needed for that.
- Tap **Close** to hide the panel again before you go live.

## How the game works (quick recap)

- Viewers type `joinrivaldle` in chat to join - first 4 people get randomly
  placed into Red/Blue/Green/Yellow.
- Once all 4 spots are filled, the round starts automatically.
- Each player just types 5-letter word guesses in chat - their own board
  updates live.
- First to guess the secret word wins the round; the app announces it out
  loud, shows the word, and resets to the lobby after 10 seconds.
- `!leave` frees up a player's spot any time; `!substitute` lets any other
  viewer grab an open spot (you can turn this off from the settings panel).
- If someone goes AFK or is trolling, use the **Kick** buttons in the
  settings panel - there is no automatic kicking.

## If something doesn't connect

- **"TikTok connection: Disconnected"** in the settings panel usually means
  you are not currently live on TikTok, your `TIKTOK_USERNAME` is misspelled,
  or your Eulerstream key needs attention. The app automatically keeps
  retrying every 15 seconds.
- **"Euler key on server: Missing"** means the `EULER_KEY` environment
  variable wasn't saved correctly on Render - double check Step 4.
- Render's free tier can take ~30-60 seconds to "wake up" if it's been idle;
  open the URL once, wait a bit, then start your TikTok LIVE.

## Changing the secret words or team names

Everything is designed to just work as-is, but if you ever want to tweak the
list of secret words, they're in `server.js` near the top, in a section
labeled `ANSWER_WORDS`. You (or anyone helping you) can add or remove words
from that list - no other changes needed.
