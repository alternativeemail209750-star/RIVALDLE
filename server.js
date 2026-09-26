/**
 * RIVALDLE - server.js
 * -----------------------------------------------------------------------
 * This one file runs the whole game:
 *  - Connects to your TikTok LIVE chat
 *  - Runs the lobby / active-game / round-over state machine
 *  - Validates 5-letter Wordle guesses against a real dictionary
 *  - Pushes live updates to the browser page (public/index.html) over
 *    Socket.IO, which is the page you screen-share on your phone.
 *
 * You should NOT need to edit this file. Everything you configure lives
 * in Environment Variables (see README.md).
 * -----------------------------------------------------------------------
 */

const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { WebcastPushConnection } = require('tiktok-live-connector');

// ---------------------------------------------------------------------
// CONFIG (from Render environment variables)
// ---------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
const TIKTOK_USERNAME = (process.env.TIKTOK_USERNAME || '').replace(/^@/, '');
const EULER_KEY = process.env.EULER_KEY || '';
const HOST_PASSCODE = process.env.HOST_PASSCODE || '1234';

// ---------------------------------------------------------------------
// DICTIONARY: build a Set of valid 5-letter words from the "word-list"
// npm package (a big list of real English words), used to validate guesses.
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

// A curated pool of common, TV-friendly 5-letter words used as SECRET
// answers (kept separate from the big validation dictionary so the
// answers are always common, recognizable words).
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

function pickSecretWord() {
  return ANSWER_WORDS[Math.floor(Math.random() * ANSWER_WORDS.length)];
}

// ---------------------------------------------------------------------
// GAME STATE
// ---------------------------------------------------------------------
const TEAMS = ['red', 'blue', 'green', 'yellow'];
const CHARACTERS = { red: 'Samurai', blue: 'Sorcerer', green: 'Explorer', yellow: 'Cleric' };

function emptyPlayers() {
  return { red: null, blue: null, green: null, yellow: null };
}
function emptyBoards() {
  return { red: [], blue: [], green: [], yellow: [] };
}

const state = {
  status: 'lobby', // 'lobby' | 'active' | 'roundover'
  players: emptyPlayers(),
  boards: emptyBoards(),
  secretWord: pickSecretWord(),
  paused: false,
  subbingEnabled: true,
  tiktokConnected: false,
  envKeyPresent: !!EULER_KEY,
  lastWinner: null
};

function publicState() {
  // Never send the secret word to the client while the round is active.
  return {
    status: state.status,
    players: state.players,
    boards: state.boards,
    paused: state.paused,
    subbingEnabled: state.subbingEnabled,
    tiktokConnected: state.tiktokConnected,
    envKeyPresent: state.envKeyPresent,
    secretWord: state.status === 'roundover' ? state.secretWord : null,
    lastWinner: state.lastWinner,
    characters: CHARACTERS
  };
}

let io; // set once the server starts
function broadcastState() {
  if (io) io.emit('state', publicState());
}

function openTeams() {
  return TEAMS.filter((t) => !state.players[t]);
}

function resetToLobby() {
  state.status = 'lobby';
  state.players = emptyPlayers();
  state.boards = emptyBoards();
  state.secretWord = pickSecretWord();
  state.lastWinner = null;
  broadcastState();
}

function scoreGuess(guess, secret) {
  // Standard Wordle scoring, handles duplicate letters correctly.
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
    const idx = secretLetters.findIndex(
      (ch, j) => ch === guessLetters[i] && !used[j]
    );
    if (idx !== -1) {
      result[i] = 'yellow';
      used[idx] = true;
    }
  }
  return guessLetters.map((letter, i) => ({ letter, state: result[i] }));
}

function findPlayerTeam(username) {
  return TEAMS.find(
    (t) => state.players[t] && state.players[t].username.toLowerCase() === username.toLowerCase()
  );
}

function joinGame(username, profilePic) {
  if (state.status !== 'lobby' || state.paused) return;
  if (findPlayerTeam(username)) return; // already playing
  const open = openTeams();
  if (open.length === 0) return;
  const team = open[Math.floor(Math.random() * open.length)];
  state.players[team] = { username, profilePic: profilePic || '' };
  state.boards[team] = [];

  if (openTeams().length === 0) {
    state.status = 'active';
  }
  broadcastState();
}

function leaveGame(username) {
  const team = findPlayerTeam(username);
  if (!team) return;
  state.players[team] = null;
  state.boards[team] = [];
  if (state.status === 'active') {
    // A quadrant just opened up mid-game; game keeps running for the rest.
  }
  broadcastState();
}

function substitute(username, profilePic) {
  if (!state.subbingEnabled || state.paused) return;
  if (state.status !== 'active') return;
  if (findPlayerTeam(username)) return;
  const open = openTeams();
  if (open.length === 0) return;
  const team = open[0];
  state.players[team] = { username, profilePic: profilePic || '' };
  state.boards[team] = [];
  broadcastState();
}

function handleGuess(username, guess) {
  if (state.status !== 'active' || state.paused) return;
  const team = findPlayerTeam(username);
  if (!team) return;
  const clean = guess.toLowerCase();
  if (clean.length !== 5 || !/^[a-z]+$/.test(clean)) return;
  if (!VALID_WORDS.has(clean)) return; // not a real dictionary word, ignore

  const scored = scoreGuess(clean, state.secretWord);
  state.boards[team].push(scored);
  // Keep only the most recent 6 rows visible (older rows scroll off).
  if (state.boards[team].length > 6) {
    state.boards[team] = state.boards[team].slice(-6);
  }

  const won = clean === state.secretWord;
  if (won) {
    state.status = 'roundover';
    state.lastWinner = { team, username };
    broadcastState();
    setTimeout(resetToLobby, 10000);
  } else {
    broadcastState();
  }
}

function hostKick(team) {
  if (!TEAMS.includes(team)) return;
  state.players[team] = null;
  state.boards[team] = [];
  broadcastState();
}

function hostForceSkip() {
  if (state.status !== 'active') return;
  state.status = 'roundover';
  state.lastWinner = null;
  broadcastState();
  setTimeout(resetToLobby, 10000);
}

function hostTogglePause() {
  state.paused = !state.paused;
  broadcastState();
}

function hostToggleSubbing() {
  state.subbingEnabled = !state.subbingEnabled;
  broadcastState();
}

// ---------------------------------------------------------------------
// CHAT COMMAND ROUTER
// ---------------------------------------------------------------------
function handleChatMessage(username, comment, profilePic) {
  const text = (comment || '').trim();
  const lower = text.toLowerCase();

  if (lower === 'joinrivaldle') {
    joinGame(username, profilePic);
    return;
  }
  if (lower === '!leave') {
    leaveGame(username);
    return;
  }
  if (lower === '!substitute') {
    substitute(username, profilePic);
    return;
  }
  if (/^[a-zA-Z]{5}$/.test(text)) {
    handleGuess(username, text);
  }
}

// ---------------------------------------------------------------------
// TIKTOK LIVE CONNECTION
// ---------------------------------------------------------------------
function connectToTikTok() {
  if (!TIKTOK_USERNAME) {
    console.error('TIKTOK_USERNAME is not set - cannot connect to TikTok LIVE.');
    return;
  }

  const connection = new WebcastPushConnection(TIKTOK_USERNAME, {
    signConfig: EULER_KEY ? { apiKey: EULER_KEY } : undefined
  });

  connection.connect()
    .then(() => {
      console.log(`Connected to @${TIKTOK_USERNAME}'s TikTok LIVE.`);
      state.tiktokConnected = true;
      broadcastState();
    })
    .catch((err) => {
      console.error('Failed to connect to TikTok LIVE:', err.message);
      state.tiktokConnected = false;
      broadcastState();
      // Retry in 15 seconds if the stream isn't live yet.
      setTimeout(connectToTikTok, 15000);
    });

  connection.on('chat', (data) => {
    handleChatMessage(data.uniqueId, data.comment, data.profilePictureUrl);
  });

  connection.on('disconnected', () => {
    console.log('Disconnected from TikTok LIVE, retrying...');
    state.tiktokConnected = false;
    broadcastState();
    setTimeout(connectToTikTok, 15000);
  });
}

// ---------------------------------------------------------------------
// WEB SERVER
// ---------------------------------------------------------------------
const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
io = new Server(server);

io.on('connection', (socket) => {
  socket.emit('state', publicState());

  socket.on('hostAction', (msg) => {
    if (!msg || msg.passcode !== HOST_PASSCODE) {
      socket.emit('hostAuthFailed');
      return;
    }
    switch (msg.action) {
      case 'kick':
        hostKick(msg.team);
        break;
      case 'forceSkip':
        hostForceSkip();
        break;
      case 'togglePause':
        hostTogglePause();
        break;
      case 'toggleSubbing':
        hostToggleSubbing();
        break;
      default:
        break;
    }
  });

  // Lets you test the game from a browser without TikTok, useful while
  // setting things up. Type these into your own browser console, or
  // use the small "TEST MODE" box in the settings panel.
  socket.on('testChat', (msg) => {
    if (!msg || msg.passcode !== HOST_PASSCODE) return;
    handleChatMessage(msg.username || 'tester', msg.comment || '', '');
  });
});

server.listen(PORT, () => {
  console.log(`Rivaldle server running on port ${PORT}`);
  connectToTikTok();
});
