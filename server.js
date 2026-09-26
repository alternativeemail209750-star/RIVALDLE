/**
 * RIVALDLE - server.js
 * -----------------------------------------------------------------------
 * Runs the whole game:
 *  - Connects to your TikTok LIVE chat
 *  - Runs the lobby / active-game / round-over / match-over state machine
 *  - Validates 5-letter Wordle guesses against a real dictionary
 *  - Fully configurable via the in-app Host Settings panel (gear icon).
 *    Every setting is saved to disk in /data/settings.json so it survives
 *    server restarts.
 *  - Pushes live updates to the browser page (public/index.html) over
 *    Socket.IO, which is the page you screen-share / add as an OBS
 *    Browser Source.
 * -----------------------------------------------------------------------
 */

const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { WebcastPushConnection } = require('tiktok-live-connector');

// ---------------------------------------------------------------------
// CONFIG (from Render / hosting environment variables — these are just
// the STARTUP DEFAULTS. Almost everything below can be changed live
// from the Host Settings panel without redeploying.)
// ---------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
const TIKTOK_USERNAME = (process.env.TIKTOK_USERNAME || '').replace(/^@/, '');
const EULER_KEY = process.env.EULER_KEY || '';
const DEFAULT_HOST_PASSCODE = process.env.HOST_PASSCODE || '1234';

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'settings.json');

// ---------------------------------------------------------------------
// DICTIONARY
// ---------------------------------------------------------------------
const VALID_WORDS = new Set();
try {
  const listPath = require('word-list');
  const raw = fs.readFileSync(listPath, 'utf8');
  raw.split('\n').forEach((w) => {
    const word = w.trim().toLowerCase();
    if (word.length === 5 && /^[a-z]+$/.test(word)) {
      VALID_WORDS.add(word);
    }
  });
  console.log(`Dictionary loaded: ${VALID_WORDS.size} valid 5-letter words.`);
} catch (err) {
  console.error('Could not load word-list dictionary:', err.message);
}

const ANSWER_WORDS = [
  'about','above','abuse','actor','acute','admit','adopt','adult','after','again',
  'agent','agree','ahead','alarm','album','alert','alike','alive','allow','alone',
  'along','alter','among','anger','angle','angry','apart','apple','apply','arena',
  'argue','arise','array','aside','asset','avoid','award','aware','badly','baker',
  'bases','basic','beach','began','begin','being','below','bench','billy','birth',
  'black','blame','blind','block','blood','board','boost','booth','bound','brain',
  'brand','bread','break','breed','brief','bring','broad','broke','brown','build',
  'built','buyer','cable','calm','carry','catch','cause','chain','chair','chart',
  'chase','cheap','check','chest','chief','child','china','chose','civil','claim',
  'class','clean','clear','click','climb','clock','close','cloud','coach','coast',
  'could','count','court','cover','craft','crash','cream','crime','cross','crowd',
  'crown','curve','cycle','daily','dance','dealt','death','debut','delay','depth',
  'doubt','dozen','draft','drama','drawn','dream','dress','drill','drink','drive',
  'drove','dying','eager','early','earth','eight','elite','empty','enemy','enjoy',
  'enter','entry','equal','error','event','every','exact','exist','extra','faith',
  'false','fault','field','fifth','fifty','fight','final','first','fixed','flash',
  'fleet','floor','fluid','focus','force','forth','forty','forum','found','frame',
  'frank','fraud','fresh','front','fruit','fully','funny','giant','given','glass',
  'globe','going','grace','grade','grand','grant','grass','great','green','gross',
  'group','grown','guard','guess','guest','guide','happy','harsh','heart','heavy',
  'hence','horse','hotel','house','human','ideal','image','index','inner','input',
  'issue','japan','joint','jones','judge','known','label','large','laser','later',
  'laugh','layer','learn','lease','least','leave','legal','level','light','limit',
  'links','lives','local','logic','loose','lower','lucky','lunch','lying','magic',
  'major','maker','march','match','maybe','mayor','meant','media','metal','might',
  'minor','minus','mixed','model','money','month','moral','motor','mount','mouse',
  'mouth','moved','movie','music','needs','never','newly','night','noise','north',
  'noted','novel','nurse','occur','ocean','offer','often','order','other','ought',
  'outer','owner','paint','panel','paper','party','peace','phase','phone','photo',
  'piece','pilot','pitch','place','plain','plane','plant','plate','point','pound',
  'power','press','price','pride','prime','print','prior','prize','proof','proud',
  'prove','queen','quick','quiet','quite','radio','raise','range','rapid','ratio',
  'reach','ready','realm','rebel','refer','relax','reply','right','rival','river',
  'robin','roger','roman','rough','round','route','royal','rural','scale','scene',
  'scope','score','sense','serve','seven','shall','shape','share','sharp','sheet',
  'shelf','shell','shift','shine','shirt','shock','shoot','short','shown','sight',
  'simon','since','sixth','sixty','sized','skill','sleep','slide','small','smart',
  'smile','smith','smoke','snake','solid','solve','sorry','sound','south','space',
  'spare','speak','speed','spend','spent','split','spoke','sport','staff','stage',
  'stake','stand','start','state','steam','steel','steep','stick','stiff','still',
  'stock','stone','stood','store','storm','story','strip','stuck','study','stuff',
  'style','sugar','suite','super','sweet','table','taken','taste','taxes','teach',
  'terry','texas','thank','theft','their','theme','there','these','thick','thing',
  'think','third','those','three','threw','throw','tight','times','tired','title',
  'today','topic','total','touch','tough','tower','track','trade','train','treat',
  'trend','trial','tribe','trick','tried','tries','truck','truly','trust','truth',
  'twice','under','undue','union','unity','until','upper','upset','urban','usage',
  'usual','valid','value','video','virus','visit','vital','voice','waste','watch',
  'water','wheel','where','which','while','white','whole','whose','woman','women',
  'world','worry','worse','worst','worth','would','wound','write','wrong','wrote',
  'yield','young','youth'
];

function pickSecretWord(exclude) {
  let word;
  do {
    word = ANSWER_WORDS[Math.floor(Math.random() * ANSWER_WORDS.length)];
  } while (ANSWER_WORDS.length > 1 && word === exclude);
  return word;
}

// ---------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------
const TEAMS = ['red', 'blue', 'green', 'yellow'];

// Costume roster. Each class only controls how the character is drawn
// client-side (robe color pattern + headwear silhouette) — your real
// TikTok circular profile photo is always used as the character's head.
const CHARACTER_CLASSES = {
  samurai:  { label: 'Samurai' },
  sorcerer: { label: 'Sorcerer' },
  explorer: { label: 'Explorer' },
  cleric:   { label: 'Cleric' },
  ninja:    { label: 'Ninja' },
  robot:    { label: 'Robot' },
  pirate:   { label: 'Pirate' },
  astronaut:{ label: 'Astronaut' }
};

const THEME_SKINS = ['neon-city', 'midnight', 'sunset', 'forest', 'minimal-light'];

function defaultSettings() {
  return {
    hostPasscode: DEFAULT_HOST_PASSCODE,

    // Chat command triggers
    joinCommand: 'joinrivaldle',
    leaveCommand: '!leave',
    subCommand: '!substitute',

    // Core rules
    subbingEnabled: true,
    maxGuessesPerRound: 6,       // 0 = unlimited
    roundTimeLimitSeconds: 0,    // 0 = no timer
    hardMode: false,
    autoResetDelaySeconds: 10,
    maxRoundsPerMatch: 0,        // 0 = unlimited, match never ends automatically
    winPoints: 10,

    // Team identity
    teamNames: { red: 'Team Red', blue: 'Team Blue', green: 'Team Green', yellow: 'Team Yellow' },
    teamClasses: { red: 'samurai', blue: 'sorcerer', green: 'explorer', yellow: 'cleric' },

    // Presentation defaults (suggested to viewers; each viewer can still
    // override sound/theme locally on their own device/OBS source)
    themeSkin: 'neon-city',
    confettiEnabled: true,
    ttsEnabled: true,
    soundEffectsEnabled: true
  };
}

function loadPersisted() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      return {
        settings: Object.assign(defaultSettings(), raw.settings || {}, {
          teamNames: Object.assign(defaultSettings().teamNames, (raw.settings || {}).teamNames || {}),
          teamClasses: Object.assign(defaultSettings().teamClasses, (raw.settings || {}).teamClasses || {})
        }),
        scores: Object.assign({ red: 0, blue: 0, green: 0, yellow: 0 }, raw.scores || {}),
        roundsPlayed: raw.roundsPlayed || 0
      };
    }
  } catch (err) {
    console.error('Could not read data/settings.json, using defaults:', err.message);
  }
  return { settings: defaultSettings(), scores: { red: 0, blue: 0, green: 0, yellow: 0 }, roundsPlayed: 0 };
}

let savePending = false;
function persist() {
  if (savePending) return;
  savePending = true;
  setTimeout(() => {
    savePending = false;
    try {
      if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify({
        settings: state.settings,
        scores: state.scores,
        roundsPlayed: state.roundsPlayed
      }, null, 2));
    } catch (err) {
      console.error('Could not save data/settings.json:', err.message);
    }
  }, 250); // debounce rapid-fire changes
}

// ---------------------------------------------------------------------
// GAME STATE
// ---------------------------------------------------------------------
const persisted = loadPersisted();

function emptyPlayers() {
  return { red: null, blue: null, green: null, yellow: null };
}
function emptyBoards() {
  return { red: [], blue: [], green: [], yellow: [] };
}
function emptyLocked() {
  return { red: false, blue: false, green: false, yellow: false };
}

const state = {
  status: 'lobby', // 'lobby' | 'active' | 'roundover' | 'matchover'
  players: emptyPlayers(),
  boards: emptyBoards(),
  locked: emptyLocked(),
  secretWord: null,
  forcedNextWord: null,
  paused: false,
  tiktokConnected: false,
  envKeyPresent: !!EULER_KEY,
  lastWinner: null,
  scores: persisted.scores,
  roundsPlayed: persisted.roundsPlayed,
  settings: persisted.settings,
  roundEndsAt: null,
  eventLog: [] // small rolling log shown in host panel ("X joined", "Y guessed...")
};
state.secretWord = pickSecretWord();

let roundTimer = null;
let resetTimer = null;

function log(msg) {
  state.eventLog.unshift({ t: Date.now(), msg });
  state.eventLog = state.eventLog.slice(0, 30);
}

function publicState() {
  return {
    status: state.status,
    players: state.players,
    boards: state.boards,
    locked: state.locked,
    paused: state.paused,
    tiktokConnected: state.tiktokConnected,
    envKeyPresent: state.envKeyPresent,
    secretWord: (state.status === 'roundover' || state.status === 'matchover') ? state.secretWord : null,
    lastWinner: state.lastWinner,
    scores: state.scores,
    roundsPlayed: state.roundsPlayed,
    settings: state.settings,
    characterClasses: CHARACTER_CLASSES,
    themeSkins: THEME_SKINS,
    roundEndsAt: state.status === 'active' ? state.roundEndsAt : null,
    eventLog: state.eventLog
  };
}

let io;
function broadcastState() {
  if (io) io.emit('state', publicState());
}

function openTeams() {
  return TEAMS.filter((t) => !state.players[t]);
}

function clearTimers() {
  if (roundTimer) { clearTimeout(roundTimer); roundTimer = null; }
  if (resetTimer) { clearTimeout(resetTimer); resetTimer = null; }
}

function armRoundTimer() {
  const secs = Number(state.settings.roundTimeLimitSeconds) || 0;
  if (secs <= 0) { state.roundEndsAt = null; return; }
  state.roundEndsAt = Date.now() + secs * 1000;
  roundTimer = setTimeout(() => {
    if (state.status === 'active') {
      log('Time expired — round skipped.');
      endRound(null, null);
    }
  }, secs * 1000 + 50);
}

function resetToLobby() {
  clearTimers();
  state.status = 'lobby';
  state.players = emptyPlayers();
  state.boards = emptyBoards();
  state.locked = emptyLocked();
  state.roundEndsAt = null;
  state.lastWinner = null;
  const forced = state.forcedNextWord;
  state.secretWord = forced && VALID_WORDS.has(forced) ? forced : pickSecretWord(state.secretWord);
  state.forcedNextWord = null;
  broadcastState();
}

// Ends the current round, optionally with a winning team/username.
// Awards points, advances round counter, checks match-end, then either
// shows final standings (matchover) or schedules a return to lobby.
function endRound(team, username) {
  clearTimers();
  state.roundsPlayed += 1;
  if (team) {
    state.scores[team] = (state.scores[team] || 0) + (Number(state.settings.winPoints) || 0);
    state.lastWinner = { team, username };
    log(`@${username} won the round for ${state.settings.teamNames[team]}! (+${state.settings.winPoints} pts)`);
  } else {
    state.lastWinner = null;
    log('Round ended with no winner.');
  }
  state.status = 'roundover';
  persist();

  const matchLimit = Number(state.settings.maxRoundsPerMatch) || 0;
  const matchOver = matchLimit > 0 && state.roundsPlayed >= matchLimit;

  broadcastState();

  if (matchOver) {
    resetTimer = setTimeout(() => {
      state.status = 'matchover';
      broadcastState();
      resetTimer = setTimeout(() => {
        state.scores = { red: 0, blue: 0, green: 0, yellow: 0 };
        state.roundsPlayed = 0;
        persist();
        resetToLobby();
      }, Math.max(5, Number(state.settings.autoResetDelaySeconds) || 10) * 1000);
    }, 3000);
  } else {
    resetTimer = setTimeout(resetToLobby, (Number(state.settings.autoResetDelaySeconds) || 10) * 1000);
  }
}

function scoreGuess(guess, secret) {
  const result = new Array(5).fill('gray');
  const secretLetters = secret.split('');
  const guessLetters = guess.split('');
  const used = new Array(5).fill(false);

  for (let i = 0; i < 5; i++) {
    if (guessLetters[i] === secretLetters[i]) {
      result[i] = 'green';
      used[i] = true;
    }
  }
  for (let i = 0; i < 5; i++) {
    if (result[i] === 'green') continue;
    const idx = secretLetters.findIndex((ch, j) => ch === guessLetters[i] && !used[j]);
    if (idx !== -1) {
      result[i] = 'yellow';
      used[idx] = true;
    }
  }
  return guessLetters.map((letter, i) => ({ letter, state: result[i] }));
}

// Hard mode: a team's next guess must re-use every letter already
// revealed as green (in the same slot) and yellow (anywhere) from that
// team's own prior guesses this round.
function violatesHardMode(team, guess) {
  if (!state.settings.hardMode) return null;
  const rows = state.boards[team] || [];
  const requiredGreen = {}; // index -> letter
  const requiredYellow = new Set();
  rows.forEach((row) => {
    row.forEach((cell, i) => {
      if (cell.state === 'green') requiredGreen[i] = cell.letter;
      if (cell.state === 'yellow') requiredYellow.add(cell.letter);
    });
  });
  for (const idxStr of Object.keys(requiredGreen)) {
    const i = Number(idxStr);
    if (guess[i] !== requiredGreen[i]) {
      return `Position ${i + 1} must be "${requiredGreen[i].toUpperCase()}" (hard mode).`;
    }
  }
  for (const letter of requiredYellow) {
    if (!guess.includes(letter)) {
      return `Guess must contain "${letter.toUpperCase()}" (hard mode).`;
    }
  }
  return null;
}

function findPlayerTeam(username) {
  return TEAMS.find(
    (t) => state.players[t] && state.players[t].username.toLowerCase() === username.toLowerCase()
  );
}

function joinGame(username, profilePic) {
  if (state.status !== 'lobby' || state.paused) return;
  if (findPlayerTeam(username)) return;
  const open = openTeams();
  if (open.length === 0) return;
  const team = open[Math.floor(Math.random() * open.length)];
  state.players[team] = { username, profilePic: profilePic || '' };
  state.boards[team] = [];
  state.locked[team] = false;
  log(`@${username} joined ${state.settings.teamNames[team]}.`);

  if (openTeams().length === 0) {
    state.status = 'active';
    armRoundTimer();
  }
  broadcastState();
}

function leaveGame(username) {
  const team = findPlayerTeam(username);
  if (!team) return;
  state.players[team] = null;
  state.boards[team] = [];
  state.locked[team] = false;
  log(`@${username} left ${state.settings.teamNames[team]}.`);
  broadcastState();
}

function substitute(username, profilePic) {
  if (!state.settings.subbingEnabled || state.paused) return;
  if (state.status !== 'active') return;
  if (findPlayerTeam(username)) return;
  const open = openTeams();
  if (open.length === 0) return;
  const team = open[0];
  state.players[team] = { username, profilePic: profilePic || '' };
  state.boards[team] = [];
  state.locked[team] = false;
  log(`@${username} subbed into ${state.settings.teamNames[team]}.`);
  broadcastState();
}

function handleGuess(username, guess) {
  if (state.status !== 'active' || state.paused) return;
  const team = findPlayerTeam(username);
  if (!team) return;
  if (state.locked[team]) return; // out of guesses for this round
  const clean = guess.toLowerCase();
  if (clean.length !== 5 || !/^[a-z]+$/.test(clean)) return;
  if (!VALID_WORDS.has(clean)) return;

  if (violatesHardMode(team, clean)) return; // silently reject invalid hard-mode guess

  const scored = scoreGuess(clean, state.secretWord);
  state.boards[team].push(scored);
  if (state.boards[team].length > 6) {
    state.boards[team] = state.boards[team].slice(-6);
  }

  const won = clean === state.secretWord;
  if (won) {
    endRound(team, username);
    return;
  }

  // Track true guess count separately from the visible (last-6) window
  state.players[team].guessCount = (state.players[team].guessCount || 0) + 1;
  const limit = Number(state.settings.maxGuessesPerRound) || 0;
  if (limit > 0 && state.players[team].guessCount >= limit) {
    state.locked[team] = true;
    log(`${state.settings.teamNames[team]} is out of guesses.`);
    // If every active team is now locked, end the round with no winner.
    const activeTeams = TEAMS.filter((t) => state.players[t]);
    if (activeTeams.every((t) => state.locked[t])) {
      endRound(null, null);
      return;
    }
  }

  broadcastState();
}

function hostKick(team) {
  if (!TEAMS.includes(team)) return;
  state.players[team] = null;
  state.boards[team] = [];
  state.locked[team] = false;
  broadcastState();
}

function hostForceSkip() {
  if (state.status !== 'active') return;
  endRound(null, null);
}

function hostTogglePause() {
  state.paused = !state.paused;
  log(state.paused ? 'Host paused the game.' : 'Host resumed the game.');
  broadcastState();
}

function hostResetScores() {
  state.scores = { red: 0, blue: 0, green: 0, yellow: 0 };
  state.roundsPlayed = 0;
  persist();
  log('Host reset the scoreboard.');
  broadcastState();
}

function hostSetNextWord(word) {
  const clean = (word || '').trim().toLowerCase();
  if (clean.length !== 5 || !/^[a-z]+$/.test(clean)) return { ok: false, error: 'Must be exactly 5 letters, A-Z only.' };
  state.forcedNextWord = clean;
  log('Host set a custom word for the next round.');
  return { ok: true };
}

// Generic, validated settings patch. Only known keys / valid types are
// applied; everything else is ignored so a bad client can't corrupt state.
function hostUpdateSettings(patch) {
  if (!patch || typeof patch !== 'object') return;
  const s = state.settings;

  if (typeof patch.subbingEnabled === 'boolean') s.subbingEnabled = patch.subbingEnabled;
  if (typeof patch.hardMode === 'boolean') s.hardMode = patch.hardMode;
  if (typeof patch.confettiEnabled === 'boolean') s.confettiEnabled = patch.confettiEnabled;
  if (typeof patch.ttsEnabled === 'boolean') s.ttsEnabled = patch.ttsEnabled;
  if (typeof patch.soundEffectsEnabled === 'boolean') s.soundEffectsEnabled = patch.soundEffectsEnabled;

  if (Number.isFinite(patch.maxGuessesPerRound)) s.maxGuessesPerRound = Math.max(0, Math.min(20, Math.round(patch.maxGuessesPerRound)));
  if (Number.isFinite(patch.roundTimeLimitSeconds)) s.roundTimeLimitSeconds = Math.max(0, Math.min(3600, Math.round(patch.roundTimeLimitSeconds)));
  if (Number.isFinite(patch.autoResetDelaySeconds)) s.autoResetDelaySeconds = Math.max(3, Math.min(120, Math.round(patch.autoResetDelaySeconds)));
  if (Number.isFinite(patch.maxRoundsPerMatch)) s.maxRoundsPerMatch = Math.max(0, Math.min(500, Math.round(patch.maxRoundsPerMatch)));
  if (Number.isFinite(patch.winPoints)) s.winPoints = Math.max(0, Math.min(1000, Math.round(patch.winPoints)));

  if (typeof patch.joinCommand === 'string' && patch.joinCommand.trim()) s.joinCommand = patch.joinCommand.trim().toLowerCase().slice(0, 30);
  if (typeof patch.leaveCommand === 'string' && patch.leaveCommand.trim()) s.leaveCommand = patch.leaveCommand.trim().toLowerCase().slice(0, 30);
  if (typeof patch.subCommand === 'string' && patch.subCommand.trim()) s.subCommand = patch.subCommand.trim().toLowerCase().slice(0, 30);

  if (THEME_SKINS.includes(patch.themeSkin)) s.themeSkin = patch.themeSkin;

  if (patch.teamNames && typeof patch.teamNames === 'object') {
    TEAMS.forEach((t) => {
      const v = patch.teamNames[t];
      if (typeof v === 'string' && v.trim()) s.teamNames[t] = v.trim().slice(0, 24);
    });
  }
  if (patch.teamClasses && typeof patch.teamClasses === 'object') {
    TEAMS.forEach((t) => {
      const v = patch.teamClasses[t];
      if (typeof v === 'string' && CHARACTER_CLASSES[v]) s.teamClasses[t] = v;
    });
  }
  if (typeof patch.newHostPasscode === 'string' && patch.newHostPasscode.trim().length >= 4) {
    s.hostPasscode = patch.newHostPasscode.trim().slice(0, 40);
  }

  persist();
  log('Host updated settings.');
  broadcastState();
}

// ---------------------------------------------------------------------
// CHAT COMMAND ROUTER
// ---------------------------------------------------------------------
function handleChatMessage(username, comment, profilePic) {
  const text = (comment || '').trim();
  const lower = text.toLowerCase();
  const s = state.settings;

  if (lower === s.joinCommand) { joinGame(username, profilePic); return; }
  if (lower === s.leaveCommand) { leaveGame(username); return; }
  if (lower === s.subCommand) { substitute(username, profilePic); return; }
  if (/^[a-zA-Z]{5}$/.test(text)) { handleGuess(username, text); }
}

// ---------------------------------------------------------------------
// TIKTOK LIVE CONNECTION
// ---------------------------------------------------------------------
let tiktokConnection = null;
let tiktokRetryTimer = null;

function connectToTikTok() {
  if (!TIKTOK_USERNAME) {
    console.error('TIKTOK_USERNAME is not set - cannot connect to TikTok LIVE.');
    return;
  }
  if (tiktokRetryTimer) { clearTimeout(tiktokRetryTimer); tiktokRetryTimer = null; }

  const connection = new WebcastPushConnection(TIKTOK_USERNAME, {
    signConfig: EULER_KEY ? { apiKey: EULER_KEY } : undefined
  });
  tiktokConnection = connection;

  connection.connect()
    .then(() => {
      console.log(`Connected to @${TIKTOK_USERNAME}'s TikTok LIVE.`);
      state.tiktokConnected = true;
      log('Connected to TikTok LIVE.');
      broadcastState();
    })
    .catch((err) => {
      console.error('Failed to connect to TikTok LIVE:', err.message);
      state.tiktokConnected = false;
      broadcastState();
      tiktokRetryTimer = setTimeout(connectToTikTok, 15000);
    });

  connection.on('chat', (data) => {
    handleChatMessage(data.uniqueId, data.comment, data.profilePictureUrl);
  });

  connection.on('disconnected', () => {
    console.log('Disconnected from TikTok LIVE, retrying...');
    state.tiktokConnected = false;
    log('Disconnected from TikTok LIVE. Retrying...');
    broadcastState();
    tiktokRetryTimer = setTimeout(connectToTikTok, 15000);
  });
}

function hostReconnectTikTok() {
  try { if (tiktokConnection) tiktokConnection.disconnect(); } catch (e) { /* ignore */ }
  if (tiktokRetryTimer) { clearTimeout(tiktokRetryTimer); tiktokRetryTimer = null; }
  log('Host forced a TikTok reconnect.');
  connectToTikTok();
}

// ---------------------------------------------------------------------
// WEB SERVER
// ---------------------------------------------------------------------
const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
io = new Server(server);

function checkPasscode(msg) {
  return msg && msg.passcode === state.settings.hostPasscode;
}

io.on('connection', (socket) => {
  socket.emit('state', publicState());

  socket.on('hostAction', (msg) => {
    if (!checkPasscode(msg)) { socket.emit('hostAuthFailed'); return; }
    switch (msg.action) {
      case 'kick': hostKick(msg.team); break;
      case 'forceSkip': hostForceSkip(); break;
      case 'togglePause': hostTogglePause(); break;
      case 'toggleSubbing': hostUpdateSettings({ subbingEnabled: !state.settings.subbingEnabled }); break;
      case 'resetScores': hostResetScores(); break;
      case 'reconnectTikTok': hostReconnectTikTok(); break;
      case 'updateSettings': hostUpdateSettings(msg.patch); break;
      case 'setNextWord': {
        const res = hostSetNextWord(msg.word);
        socket.emit('hostActionResult', res);
        break;
      }
      default: break;
    }
  });

  // Lets you test the game from a browser without TikTok.
  socket.on('testChat', (msg) => {
    if (!checkPasscode(msg)) return;
    handleChatMessage(msg.username || 'tester', msg.comment || '', msg.profilePic || '');
  });
});

server.listen(PORT, () => {
  console.log(`Rivaldle server running on port ${PORT}`);
  connectToTikTok();
});
