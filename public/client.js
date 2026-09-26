const socket = io();
const TEAMS = ['red', 'blue', 'green', 'yellow'];
let lastStatus = null;
let lastGuessCounts = { red: 0, blue: 0, green: 0, yellow: 0 };
let latestState = null;
let timerInterval = null;

// -----------------------------------------------------------------
// LOCAL DISPLAY SETTINGS (per-device, stored in localStorage so they
// don't get wiped by a page refresh and don't affect other viewers)
// -----------------------------------------------------------------
const LOCAL_DEFAULTS = {
  confetti: true,
  sfx: true,
  tts: true,
  reduceMotion: false,
  compact: false,
  ttsRate: 1,
  volume: 0.6
};
function loadLocal() {
  try {
    return Object.assign({}, LOCAL_DEFAULTS, JSON.parse(localStorage.getItem('rivaldle_local_settings') || '{}'));
  } catch (e) { return Object.assign({}, LOCAL_DEFAULTS); }
}
function saveLocal(s) {
  localStorage.setItem('rivaldle_local_settings', JSON.stringify(s));
}
let local = loadLocal();

function applyLocalToDom() {
  document.body.classList.toggle('reduce-motion', local.reduceMotion);
  document.body.classList.toggle('compact', local.compact);
}
applyLocalToDom();

// -----------------------------------------------------------------
// SOUND (self-contained WebAudio, no external files needed)
// -----------------------------------------------------------------
let audioCtx = null;
function ctx() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
  }
  return audioCtx;
}
function beep(freq, durationMs, type, delayMs) {
  if (!local.sfx) return;
  const c = ctx();
  if (!c) return;
  const t0 = c.currentTime + (delayMs || 0) / 1000;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type || 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(local.volume, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + durationMs / 1000);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + durationMs / 1000 + 0.02);
}
function sfxJoin() { beep(520, 120, 'triangle'); }
function sfxGuess() { beep(300, 80, 'square'); }
function sfxWin() { [523, 659, 784, 1046].forEach((f, i) => beep(f, 220, 'sine', i * 110)); }
function sfxTick() { beep(880, 60, 'square'); }

function speak(text) {
  if (!local.tts) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = Number(local.ttsRate) || 1;
    window.speechSynthesis.speak(utter);
  } catch (e) { /* speech synthesis not available */ }
}

// -----------------------------------------------------------------
// CONFETTI (vanilla canvas, no dependencies)
// -----------------------------------------------------------------
const confettiCanvas = document.getElementById('confetti-canvas');
const cctx = confettiCanvas.getContext('2d');
let confettiParticles = [];
let confettiRunning = false;
function resizeCanvas() {
  confettiCanvas.width = window.innerWidth;
  confettiCanvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function launchConfetti() {
  if (!local.confetti) return;
  const colors = ['#e63946', '#3a86ff', '#2a9d55', '#e9b949', '#ffffff'];
  for (let i = 0; i < 120; i++) {
    confettiParticles.push({
      x: Math.random() * confettiCanvas.width,
      y: -20 - Math.random() * 200,
      vx: (Math.random() - 0.5) * 3,
      vy: 2 + Math.random() * 3,
      size: 4 + Math.random() * 5,
      color: colors[Math.floor(Math.random() * colors.length)],
      rot: Math.random() * 360,
      vrot: (Math.random() - 0.5) * 12,
      life: 0
    });
  }
  if (!confettiRunning) { confettiRunning = true; requestAnimationFrame(tickConfetti); }
}
function tickConfetti() {
  cctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  confettiParticles.forEach((p) => {
    p.x += p.vx; p.y += p.vy; p.vy += 0.03; p.rot += p.vrot; p.life++;
    cctx.save();
    cctx.translate(p.x, p.y);
    cctx.rotate((p.rot * Math.PI) / 180);
    cctx.fillStyle = p.color;
    cctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
    cctx.restore();
  });
  confettiParticles = confettiParticles.filter((p) => p.y < confettiCanvas.height + 40 && p.life < 400);
  if (confettiParticles.length > 0) {
    requestAnimationFrame(tickConfetti);
  } else {
    confettiRunning = false;
    cctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  }
}

// -----------------------------------------------------------------
// RENDER
// -----------------------------------------------------------------
function renderBoard(el, rows) {
  el.innerHTML = '';
  rows.forEach((row) => {
    const rowEl = document.createElement('div');
    rowEl.className = 'guess-row';
    row.forEach((cell) => {
      const tile = document.createElement('div');
      tile.className = `tile ${cell.state}`;
      tile.textContent = cell.letter;
      rowEl.appendChild(tile);
    });
    el.appendChild(rowEl);
  });
  el.scrollTop = el.scrollHeight;
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function render(state) {
  latestState = state;
  const settings = state.settings;
  const teamNames = settings.teamNames;

  // theme
  document.body.dataset.theme = settings.themeSkin || 'neon-city';

  const statusText = document.getElementById('status-text');
  const instructions = document.getElementById('instructions');
  const joined = TEAMS.filter((t) => state.players[t]).length;

  if (state.paused) {
    statusText.textContent = 'Game Paused';
    instructions.textContent = 'The host has paused the game.';
  } else if (state.status === 'lobby') {
    statusText.textContent = `Lobby: Waiting for Players (${joined}/4)`;
    instructions.textContent = `Type "${settings.joinCommand}" to play! (Limit: 4 Players)`;
  } else if (state.status === 'active') {
    statusText.textContent = settings.hardMode ? 'Target: Crack the Word! (Hard Mode)' : 'Target: Crack the 5-Letter Word!';
    instructions.textContent = settings.subbingEnabled
      ? `Type "${settings.leaveCommand}" to quit, or "${settings.subCommand}" to sub in!`
      : `Type "${settings.leaveCommand}" to quit. Substituting is disabled.`;
  } else if (state.status === 'roundover') {
    statusText.textContent = 'Round Over!';
    instructions.textContent = 'Get ready - a new round starts shortly...';
  } else if (state.status === 'matchover') {
    statusText.textContent = 'Match Complete!';
    instructions.textContent = 'Final standings below. A new match starts shortly...';
  }

  // scoreboard
  TEAMS.forEach((t) => {
    document.getElementById(`score-name-${t}`).textContent = teamNames[t];
    document.getElementById(`score-val-${t}`).textContent = state.scores[t] || 0;
  });

  // quadrants
  TEAMS.forEach((team) => {
    const player = state.players[team];
    document.getElementById(`username-${team}`).textContent = player ? `@${player.username}` : 'OPEN';

    const rig = document.getElementById(`rig-${team}`);
    rig.dataset.class = settings.teamClasses[team] || 'samurai';

    const head = document.getElementById(`avatar-${team}`);
    if (player && player.profilePic) {
      head.style.backgroundImage = `url("${player.profilePic}")`;
      head.classList.add('has-photo');
    } else {
      head.style.backgroundImage = '';
      head.classList.remove('has-photo');
    }

    const lockBadge = document.getElementById(`lock-${team}`);
    lockBadge.classList.toggle('hidden', !state.locked[team]);

    renderBoard(document.getElementById(`board-${team}`), state.boards[team] || []);

    // guess sound + pulse animation when a new row appears
    const count = (state.boards[team] || []).length;
    if (count > (lastGuessCounts[team] || 0) && lastStatus === state.status) {
      sfxGuess();
      rig.classList.remove('pulse');
      void rig.offsetWidth;
      rig.classList.add('pulse');
    }
    lastGuessCounts[team] = count;
  });

  // timer bar
  const timerWrap = document.getElementById('timer-bar-wrap');
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  if (state.status === 'active' && state.roundEndsAt) {
    timerWrap.classList.remove('hidden');
    const total = Math.max(1, (state.roundEndsAt - Date.now()));
    const totalStart = total;
    timerInterval = setInterval(() => {
      const remain = state.roundEndsAt - Date.now();
      const pct = Math.max(0, Math.min(100, (remain / (totalStart)) * 100));
      const bar = document.getElementById('timer-bar');
      bar.style.width = pct + '%';
      bar.classList.toggle('urgent', remain < 10000);
      if (remain > 0 && remain < 10500 && Math.floor(remain / 1000) !== Math.floor((remain + 500) / 1000)) {
        // roughly once per second near the end
      }
      if (remain <= 0) clearInterval(timerInterval);
    }, 200);
  } else {
    timerWrap.classList.add('hidden');
  }

  // winner / matchover overlay
  const overlay = document.getElementById('winner-overlay');
  const standingsEl = document.getElementById('matchover-standings');
  if (state.status === 'roundover') {
    overlay.classList.remove('hidden');
    standingsEl.classList.add('hidden');
    if (state.lastWinner) {
      document.getElementById('winner-text').textContent =
        `@${state.lastWinner.username} wins the round for ${teamNames[state.lastWinner.team]}!`;
      document.getElementById('winner-word').textContent = state.secretWord || '';
      if (lastStatus !== 'roundover') {
        speak(`${state.lastWinner.username} wins the round for ${teamNames[state.lastWinner.team]}!`);
        sfxWin();
        launchConfetti();
      }
    } else {
      document.getElementById('winner-text').textContent = "Time's up! No one guessed it.";
      document.getElementById('winner-word').textContent = state.secretWord || '';
      if (lastStatus !== 'roundover') speak("Time's up! No one guessed the word.");
    }
  } else if (state.status === 'matchover') {
    overlay.classList.remove('hidden');
    document.getElementById('winner-text').textContent = 'Match complete! Final standings:';
    document.getElementById('winner-word').textContent = '';
    standingsEl.classList.remove('hidden');
    const ranked = TEAMS.slice().sort((a, b) => (state.scores[b] || 0) - (state.scores[a] || 0));
    standingsEl.innerHTML = ranked.map((t, i) =>
      `<div><span>#${i + 1} ${teamNames[t]}</span><span>${state.scores[t] || 0} pts</span></div>`
    ).join('');
    if (lastStatus !== 'matchover') { sfxWin(); launchConfetti(); }
  } else {
    overlay.classList.add('hidden');
  }

  // mode banner + mode-dependent UI
  const mode = settings.gameMode || 'test';
  const banner = document.getElementById('mode-banner');
  banner.className = `mode-${mode}`;
  document.getElementById('mode-label').textContent =
    mode === 'live' ? 'LIVE' : mode === 'offline' ? 'OFFLINE / SOLO PLAY' : 'TEST MODE';

  document.getElementById('offline-bar').classList.toggle('hidden', mode !== 'offline');
  instructions.classList.toggle('hidden', mode === 'offline');

  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  const modeHint = document.getElementById('mode-hint');
  modeHint.textContent =
    mode === 'live' ? 'Connected to your real TikTok LIVE chat. Test/Offline controls are disabled.' :
    mode === 'offline' ? 'No TikTok needed. Use the Join/Guess bar at the bottom of the screen to play solo.' :
    'No TikTok connection is made. Use the Chat Simulator (System tab) to rehearse.';

  const testHint = document.getElementById('test-mode-hint');
  const testInputs = ['test-username', 'test-comment', 'test-send-btn'];
  if (mode === 'test') {
    testHint.classList.add('hidden');
    testInputs.forEach((id) => { document.getElementById(id).disabled = false; });
  } else {
    testHint.classList.remove('hidden');
    testInputs.forEach((id) => { document.getElementById(id).disabled = true; });
  }

  // host panel status readouts
  document.getElementById('conn-status').textContent =
    mode !== 'live' ? `Not used (${mode === 'offline' ? 'Offline' : 'Test'} mode)` :
    state.tiktokConnected ? 'Connected' : 'Disconnected (retrying)';
  document.getElementById('env-status').textContent = state.envKeyPresent ? 'Connected' : 'Missing';

  // event log
  const logEl = document.getElementById('event-log');
  logEl.innerHTML = (state.eventLog || []).map((e) => `<div>${new Date(e.t).toLocaleTimeString()} — ${escapeHtml(e.msg)}</div>`).join('');

  // populate host-panel form fields the first time settings arrive
  populateSettingsForm(state);

  lastStatus = state.status;
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

socket.on('state', render);

// -----------------------------------------------------------------
// HOST PANEL - open/close
// -----------------------------------------------------------------
const hostPanel = document.getElementById('host-panel');
document.getElementById('gear-btn').addEventListener('click', () => hostPanel.classList.remove('hidden'));
document.getElementById('close-panel-btn').addEventListener('click', () => hostPanel.classList.add('hidden'));

function passcode() { return document.getElementById('host-passcode').value; }

// tabs
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.remove('hidden');
  });
});

// quick actions
document.querySelectorAll('.kick-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    socket.emit('hostAction', { passcode: passcode(), action: 'kick', team: btn.dataset.team });
  });
});
document.getElementById('force-skip-btn').addEventListener('click', () => {
  socket.emit('hostAction', { passcode: passcode(), action: 'forceSkip' });
});
document.getElementById('pause-btn').addEventListener('click', () => {
  socket.emit('hostAction', { passcode: passcode(), action: 'togglePause' });
});
document.getElementById('reset-scores-btn').addEventListener('click', () => {
  if (confirm('Reset the scoreboard to 0 for all teams?')) {
    socket.emit('hostAction', { passcode: passcode(), action: 'resetScores' });
  }
});
document.getElementById('reconnect-btn').addEventListener('click', () => {
  socket.emit('hostAction', { passcode: passcode(), action: 'reconnectTikTok' });
});

socket.on('hostAuthFailed', () => alert('Wrong host passcode.'));

// -----------------------------------------------------------------
// MODE SWITCH (Test / Live / Offline)
// -----------------------------------------------------------------
document.querySelectorAll('.mode-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.mode;
    if (mode === 'live' && !confirm('Switch to LIVE mode? This connects to your real TikTok LIVE chat.')) return;
    socket.emit('hostAction', { passcode: passcode(), action: 'setGameMode', mode });
  });
});

// -----------------------------------------------------------------
// OFFLINE (SOLO) PLAY BAR
// -----------------------------------------------------------------
function offlineUsername() {
  return document.getElementById('offline-username').value || 'Player1';
}
document.getElementById('offline-join-btn').addEventListener('click', () => {
  socket.emit('offlineAction', { action: 'join', username: offlineUsername() });
});
document.getElementById('offline-leave-btn').addEventListener('click', () => {
  socket.emit('offlineAction', { action: 'leave', username: offlineUsername() });
});
function sendOfflineGuess() {
  const guessEl = document.getElementById('offline-guess');
  socket.emit('offlineAction', { action: 'guess', username: offlineUsername(), guess: guessEl.value });
  guessEl.value = '';
}
document.getElementById('offline-guess-btn').addEventListener('click', sendOfflineGuess);
document.getElementById('offline-guess').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendOfflineGuess();
});

// custom next word
document.getElementById('next-word-btn').addEventListener('click', () => {
  const word = document.getElementById('next-word-input').value;
  socket.emit('hostAction', { passcode: passcode(), action: 'setNextWord', word });
});
socket.on('hostActionResult', (res) => {
  const msg = document.getElementById('next-word-msg');
  msg.textContent = res.ok ? 'Saved! It will be used for the next round.' : res.error;
  msg.style.color = res.ok ? '#8de08d' : '#ff9a9a';
});

// change passcode
document.getElementById('change-passcode-btn').addEventListener('click', () => {
  const val = document.getElementById('new-passcode').value;
  if (!val || val.length < 4) { alert('New passcode must be at least 4 characters.'); return; }
  socket.emit('hostAction', { passcode: passcode(), action: 'updateSettings', patch: { newHostPasscode: val } });
  document.getElementById('new-passcode').value = '';
  alert('Passcode changed. Use the new passcode from now on.');
});

// test mode
document.getElementById('test-send-btn').addEventListener('click', () => {
  const username = document.getElementById('test-username').value || 'tester';
  const comment = document.getElementById('test-comment').value || '';
  socket.emit('testChat', { passcode: passcode(), username, comment });
  document.getElementById('test-comment').value = '';
});

// -----------------------------------------------------------------
// SETTINGS FORM: Game Rules
// -----------------------------------------------------------------
let formPopulated = false;
function populateSettingsForm(state) {
  if (formPopulated) return; // only pre-fill once so the host's in-progress edits aren't clobbered by every broadcast
  formPopulated = true;
  const s = state.settings;

  document.getElementById('setting-subbing').checked = !!s.subbingEnabled;
  document.getElementById('setting-hardmode').checked = !!s.hardMode;
  document.getElementById('setting-maxguesses').value = s.maxGuessesPerRound;
  document.getElementById('setting-roundtimer').value = s.roundTimeLimitSeconds;
  document.getElementById('setting-resetdelay').value = s.autoResetDelaySeconds;
  document.getElementById('setting-winpoints').value = s.winPoints;
  document.getElementById('setting-maxrounds').value = s.maxRoundsPerMatch;
  document.getElementById('setting-joincmd').value = s.joinCommand;
  document.getElementById('setting-leavecmd').value = s.leaveCommand;
  document.getElementById('setting-subcmd').value = s.subCommand;

  TEAMS.forEach((t) => {
    document.getElementById(`teamname-${t}`).value = s.teamNames[t];
    const sel = document.getElementById(`teamclass-${t}`);
    sel.innerHTML = '';
    Object.keys(state.characterClasses).forEach((key) => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = state.characterClasses[key].label;
      if (key === s.teamClasses[t]) opt.selected = true;
      sel.appendChild(opt);
    });
  });

  const themeSel = document.getElementById('setting-theme');
  themeSel.innerHTML = '';
  state.themeSkins.forEach((key) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = key.replace('-', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    if (key === s.themeSkin) opt.selected = true;
    themeSel.appendChild(opt);
  });

  // local/display settings
  document.getElementById('local-confetti').checked = local.confetti;
  document.getElementById('local-sfx').checked = local.sfx;
  document.getElementById('local-tts').checked = local.tts;
  document.getElementById('local-reducemotion').checked = local.reduceMotion;
  document.getElementById('local-compact').checked = local.compact;
  document.getElementById('local-ttsrate').value = local.ttsRate;
  document.getElementById('local-volume').value = local.volume;
}

document.getElementById('save-game-settings-btn').addEventListener('click', () => {
  const patch = {
    subbingEnabled: document.getElementById('setting-subbing').checked,
    hardMode: document.getElementById('setting-hardmode').checked,
    maxGuessesPerRound: Number(document.getElementById('setting-maxguesses').value),
    roundTimeLimitSeconds: Number(document.getElementById('setting-roundtimer').value),
    autoResetDelaySeconds: Number(document.getElementById('setting-resetdelay').value),
    winPoints: Number(document.getElementById('setting-winpoints').value),
    maxRoundsPerMatch: Number(document.getElementById('setting-maxrounds').value),
    joinCommand: document.getElementById('setting-joincmd').value,
    leaveCommand: document.getElementById('setting-leavecmd').value,
    subCommand: document.getElementById('setting-subcmd').value
  };
  socket.emit('hostAction', { passcode: passcode(), action: 'updateSettings', patch });
});

document.getElementById('save-team-settings-btn').addEventListener('click', () => {
  const teamNames = {}, teamClasses = {};
  TEAMS.forEach((t) => {
    teamNames[t] = document.getElementById(`teamname-${t}`).value;
    teamClasses[t] = document.getElementById(`teamclass-${t}`).value;
  });
  socket.emit('hostAction', { passcode: passcode(), action: 'updateSettings', patch: { teamNames, teamClasses } });
});

document.getElementById('save-display-settings-btn').addEventListener('click', () => {
  local = {
    confetti: document.getElementById('local-confetti').checked,
    sfx: document.getElementById('local-sfx').checked,
    tts: document.getElementById('local-tts').checked,
    reduceMotion: document.getElementById('local-reducemotion').checked,
    compact: document.getElementById('local-compact').checked,
    ttsRate: Number(document.getElementById('local-ttsrate').value),
    volume: Number(document.getElementById('local-volume').value)
  };
  saveLocal(local);
  applyLocalToDom();

  const themeSkin = document.getElementById('setting-theme').value;
  socket.emit('hostAction', { passcode: passcode(), action: 'updateSettings', patch: { themeSkin } });
});
