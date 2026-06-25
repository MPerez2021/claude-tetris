'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#64B5F6', // J - pale blue
  '#ffb74d', // L - orange
  '#90a4ae', // Tuerca - gris metálico
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // Tuerca (hueco central)
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const LS_SCORES_KEY  = 'tetris-highscores';
const LS_COMBO_KEY   = 'tetris-best-combo';
const LS_LINES_KEY   = 'tetris-best-lines';
const MAX_ENTRIES    = 5;

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const nameEntry = document.getElementById('name-entry');
const nameInput = document.getElementById('score-name-input');
const nameConfirmBtn = document.getElementById('score-name-confirm');
const resetRecordsBtn = document.getElementById('reset-records-btn');
const highscoresTableWrap = document.getElementById('highscores-table-wrap');
const highscoresBests = document.getElementById('highscores-bests');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let combo, maxCombo;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 8) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared > 0) {
    combo++;
    maxCombo = Math.max(maxCombo, combo);
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  } else {
    combo = 0;
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

// Dibuja el hueco circular de la pieza tuerca en la celda (cx, cy) del contexto dado.
// bgColor debe ser el color de fondo del canvas para que el círculo se "funda" con él.
function drawNutHole(context, cx, cy, size, bgColor, alpha) {
  const px = cx * size + size / 2;
  const py = cy * size + size / 2;
  const r = size * 0.28;
  context.globalAlpha = alpha ?? 1;
  // Borde oscuro sutil para dar profundidad
  context.fillStyle = 'rgba(0,0,0,0.45)';
  context.beginPath();
  context.arc(px, py, r + 2, 0, Math.PI * 2);
  context.fill();
  // Círculo interior con el color de fondo del tablero
  context.fillStyle = bgColor;
  context.beginPath();
  context.arc(px, py, r, 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;
}

// Devuelve true si la celda (r,c) del tablero es el hueco central de una tuerca fijada,
// es decir, está vacía y rodeada completamente por celdas con valor 8.
function isNutHole(r, c) {
  if (board[r][c] !== 0) return false;
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) return false;
      if (board[nr][nc] !== 8) return false;
    }
  }
  return true;
}

function drawGrid() {
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--grid-color').trim();
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  const boardBg = getComputedStyle(canvas).backgroundColor;

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // huecos circulares de tuercas fijadas en el tablero
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (isNutHole(r, c))
        drawNutHole(ctx, c, r, BLOCK, boardBg);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);
  if (current.type === 8)
    drawNutHole(ctx, current.x + 1, gy + 1, BLOCK, boardBg, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
  if (current.type === 8)
    drawNutHole(ctx, current.x + 1, current.y + 1, BLOCK, boardBg);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
  if (next.type === 8) {
    const nextBg = getComputedStyle(nextCanvas).backgroundColor;
    drawNutHole(nextCtx, offX + 1, offY + 1, NB, nextBg);
  }
}

// ---- High-score helpers ----

function loadScores() {
  try {
    return JSON.parse(localStorage.getItem(LS_SCORES_KEY)) || [];
  } catch (_) {
    return [];
  }
}

function saveScores(entries) {
  localStorage.setItem(LS_SCORES_KEY, JSON.stringify(entries));
}

function qualifiesForTop5(s) {
  const entries = loadScores();
  return entries.length < MAX_ENTRIES || s >= entries[entries.length - 1].score;
}

function insertScore(name, s, linesCount, comboCount) {
  const entries = loadScores();
  const entry = { name: name.trim() || '???', score: s, lines: linesCount, combo: comboCount };
  entries.push(entry);
  entries.sort((a, b) => b.score - a.score);
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
  saveScores(entries);
  const newIndex = entries.indexOf(entry);
  return newIndex;
}

function updateGlobalBests() {
  const prevCombo = parseInt(localStorage.getItem(LS_COMBO_KEY), 10) || 0;
  const prevLines = parseInt(localStorage.getItem(LS_LINES_KEY), 10) || 0;
  if (maxCombo > prevCombo) localStorage.setItem(LS_COMBO_KEY, maxCombo);
  if (lines > prevLines) localStorage.setItem(LS_LINES_KEY, lines);
}

function renderHighscores(newEntryIndex) {
  const entries = loadScores();
  const bestCombo = parseInt(localStorage.getItem(LS_COMBO_KEY), 10) || 0;
  const bestLines = parseInt(localStorage.getItem(LS_LINES_KEY), 10) || 0;

  if (entries.length === 0) {
    highscoresTableWrap.innerHTML = '<p class="highscores-empty">Sin récords aún.</p>';
  } else {
    const rows = entries.map((e, i) => {
      const isNew = i === newEntryIndex;
      return `<tr${isNew ? ' class="new-record"' : ''}>
        <td>${i + 1}</td>
        <td>${escapeHtml(e.name)}</td>
        <td>${e.score.toLocaleString()}</td>
        <td>${e.lines}</td>
      </tr>`;
    }).join('');
    highscoresTableWrap.innerHTML = `<table class="highscores-table">
      <thead><tr><th>#</th><th>Nombre</th><th>Puntos</th><th>Líneas</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  }

  highscoresBests.innerHTML =
    `<span>Mejor combo: <strong>${bestCombo}</strong></span>` +
    `<span>Líneas máximas: <strong>${bestLines}</strong></span>`;
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---- Game over / name entry ----

let nameSaved = false;

function endGame() {
  gameOver = true;
  nameSaved = false;
  cancelAnimationFrame(animId);
  updateGlobalBests();

  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');

  if (qualifiesForTop5(score)) {
    nameEntry.classList.remove('hidden');
    nameInput.value = '';
    setTimeout(() => nameInput.focus(), 50);
  } else {
    nameEntry.classList.add('hidden');
    renderHighscores();
  }
}

function confirmName() {
  if (nameSaved) return;
  nameSaved = true;
  const name = nameInput.value.trim() || '???';
  const newIndex = insertScore(name, score, lines, maxCombo);
  nameEntry.classList.add('hidden');
  renderHighscores(newIndex);
}

nameConfirmBtn.addEventListener('click', confirmName);

nameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') confirmName();
});

resetRecordsBtn.addEventListener('click', () => {
  localStorage.removeItem(LS_SCORES_KEY);
  localStorage.removeItem(LS_COMBO_KEY);
  localStorage.removeItem(LS_LINES_KEY);
  renderHighscores();
});

// ---- Pause ----

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  if (gameOver || paused) return;
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  combo = 0;
  maxCombo = 0;
  nameSaved = false;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  nameEntry.classList.add('hidden');
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

const themeToggle = document.getElementById('theme-toggle');
const switchText = document.getElementById('switch-text');

themeToggle.addEventListener('change', () => {
  const isLight = themeToggle.checked;
  document.body.classList.toggle('light-mode', isLight);
  switchText.textContent = isLight ? 'Light' : 'Dark';
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
});

if (localStorage.getItem('theme') === 'light') {
  themeToggle.checked = true;
  document.body.classList.add('light-mode');
  switchText.textContent = 'Light';
}

renderHighscores();
init();
