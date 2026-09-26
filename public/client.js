const socket = io();

const TEAMS = ['red', 'blue', 'green', 'yellow'];
let lastStatus = null;

function speak(text) {
  try {
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1;
    window.speechSynthesis.speak(utter);
  } catch (e) { /* speech synthesis not available, ignore */ }
}

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

function render(state) {
  // Status text + instructions
  const statusText = document.getElementById('status-text');
  const instructions = document.getElementById('instructions');
  const joined = TEAMS.filter((t) => state.players[t]).length;

  if (state.paused) {
    statusText.textContent = 'Game Paused';
    instructions.textContent = 'The host has paused the game.';
  } else if (state.status === 'lobby') {
    statusText.textContent = `Lobby: Waiting for Players (${joined}/4)`;
    instructions.textContent = 'Type "joinrivaldle" to play! (Limit: 4 Players)';
  } else if (state.status === 'active') {
    statusText.textContent = 'Target: Crack the 5-Letter Word!';
    instructions.textContent = state.subbingEnabled
      ? 'Type "!leave" to quit, or "!substitute" to take an open spot!'
      : 'Type "!leave" to quit. Substituting is currently disabled.';
  } else if (state.status === 'roundover') {
    statusText.textContent = 'Round Over!';
    instructions.textContent = 'Get ready - a new round starts shortly...';
  }

  // Quadrants
  TEAMS.forEach((team) => {
    const player = state.players[team];
    document.getElementById(`username-${team}`).textContent = player ? `@${player.username}` : 'OPEN';
    document.getElementById(`avatar-${team}`).src = player && player.profilePic ? player.profilePic : '';
    renderBoard(document.getElementById(`board-${team}`), state.boards[team] || []);
  });

  // Winner overlay + TTS (only fire once, when status just changed to roundover)
  const overlay = document.getElementById('winner-overlay');
  if (state.status === 'roundover' && state.lastWinner) {
    overlay.classList.remove('hidden');
    document.getElementById('winner-text').textContent =
      `@${state.lastWinner.username} wins the round for Team ${capitalize(state.lastWinner.team)}!`;
    document.getElementById('winner-word').textContent = state.secretWord || '';
    if (lastStatus !== 'roundover') {
      speak(`${state.lastWinner.username} wins the round for Team ${state.lastWinner.team}!`);
    }
  } else {
    overlay.classList.add('hidden');
  }

  // Host panel status readouts
  document.getElementById('conn-status').textContent = state.tiktokConnected ? 'Connected' : 'Disconnected';
  document.getElementById('env-status').textContent = state.envKeyPresent ? 'Connected' : 'Missing';

  lastStatus = state.status;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

socket.on('state', render);

// ---------------------------------------------------------------------
// HOST PANEL (long-press the title for 800ms to open)
// ---------------------------------------------------------------------
const hostPanel = document.getElementById('host-panel');
let pressTimer = null;

document.getElementById('title').addEventListener('touchstart', () => {
  pressTimer = setTimeout(() => hostPanel.classList.remove('hidden'), 800);
});
document.getElementById('title').addEventListener('touchend', () => clearTimeout(pressTimer));
document.getElementById('title').addEventListener('mousedown', () => {
  pressTimer = setTimeout(() => hostPanel.classList.remove('hidden'), 800);
});
document.getElementById('title').addEventListener('mouseup', () => clearTimeout(pressTimer));

document.getElementById('close-panel-btn').addEventListener('click', () => {
  hostPanel.classList.add('hidden');
});

function passcode() {
  return document.getElementById('host-passcode').value;
}

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
document.getElementById('toggle-subbing-btn').addEventListener('click', () => {
  socket.emit('hostAction', { passcode: passcode(), action: 'toggleSubbing' });
});

socket.on('hostAuthFailed', () => {
  alert('Wrong host passcode.');
});

// Test mode - simulate chat messages without needing to be live on TikTok
document.getElementById('test-send-btn').addEventListener('click', () => {
  const username = document.getElementById('test-username').value || 'tester';
  const comment = document.getElementById('test-comment').value || '';
  socket.emit('testChat', { passcode: passcode(), username, comment });
  document.getElementById('test-comment').value = '';
});
