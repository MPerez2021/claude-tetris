'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS_RETRO  = [null, '#4dd0e1', '#ffd54f', '#ba68c8', '#81c784', '#e57373', '#64B5F6', '#ffb74d', '#90a4ae'];
const COLORS_NEON   = [null, '#00eeff', '#ffee00', '#cc44ff', '#44ff88', '#ff3355', '#44aaff', '#ff8800', '#aabbcc'];
const COLORS_PASTEL = [null, '#a8d8ea', '#ffeaa7', '#d7aefb', '#b5ead7', '#ffb7b2', '#b5c9f7', '#ffd6a5', '#c9d6df'];
const COLORS_PIXEL  = [null, '#4dd0e1', '#ffd54f', '#ba68c8', '#81c784', '#e57373', '#64B5F6', '#ffb74d', '#90a4ae'];

let activeSkin = localStorage.getItem('tetris-skin') || 'retro';

function getColors() {
  if (activeSkin === 'neon') return COLORS_NEON;
  if (activeSkin === 'pastel') return COLORS_PASTEL;
  if (activeSkin === 'pixel') return COLORS_PIXEL;
  return COLORS_RETRO;
}

function applyNeonBackground() {
  canvas.style.background = activeSkin === 'neon' ? '#000' : '';
}

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

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

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
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
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

function drawBlock(context, x, y, colorIndex, size, alpha, bgColor) {
  if (!colorIndex) return;
  const color = getColors()[colorIndex];
  const px = x * size + 1;
  const py = y * size + 1;
  const w = size - 2;
  const h = size - 2;
  context.globalAlpha = alpha ?? 1;

  if (activeSkin === 'neon') {
    context.shadowBlur = 14;
    context.shadowColor = color;
    context.fillStyle = color;
    context.fillRect(px, py, w, h);
    context.shadowBlur = 0;
    context.shadowColor = 'transparent';
  } else if (activeSkin === 'pastel') {
    context.fillStyle = color;
    context.fillRect(px, py, w, h);
    const cornerSize = 3;
    const bg = bgColor || getComputedStyle(context.canvas).backgroundColor;
    context.globalAlpha = 1;
    context.fillStyle = bg;
    context.fillRect(px, py, cornerSize, cornerSize);
    context.fillRect(px + w - cornerSize, py, cornerSize, cornerSize);
    context.fillRect(px, py + h - cornerSize, cornerSize, cornerSize);
    context.fillRect(px + w - cornerSize, py + h - cornerSize, cornerSize, cornerSize);
  } else if (activeSkin === 'pixel') {
    context.fillStyle = color;
    context.fillRect(px, py, w, h);
    context.fillStyle = 'rgba(0,0,0,0.15)';
    const cell = 4;
    const cols = Math.floor(w / cell);
    const rows = Math.floor(h / cell);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if ((row + col) % 2 === 0) {
          context.fillRect(px + col * cell, py + row * cell, cell, cell);
        }
      }
    }
  } else {
    context.fillStyle = color;
    context.fillRect(px, py, w, h);
    context.fillStyle = 'rgba(255,255,255,0.12)';
    context.fillRect(px, py, w, 4);
  }

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
      drawBlock(ctx, c, r, board[r][c], BLOCK, 1, boardBg);

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
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2, boardBg);
  if (current.type === 8)
    drawNutHole(ctx, current.x + 1, gy + 1, BLOCK, boardBg, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK, 1, boardBg);
  if (current.type === 8)
    drawNutHole(ctx, current.x + 1, current.y + 1, BLOCK, boardBg);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  const nextBg = getComputedStyle(nextCanvas).backgroundColor;
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB, 1, nextBg);
  if (next.type === 8) {
    drawNutHole(nextCtx, offX + 1, offY + 1, NB, nextBg);
  }
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

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
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
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

const skinSelect = document.getElementById('skin-select');
skinSelect.value = activeSkin;
applyNeonBackground();

skinSelect.addEventListener('change', () => {
  activeSkin = skinSelect.value;
  localStorage.setItem('tetris-skin', activeSkin);
  applyNeonBackground();
  draw();
  drawNext();
});

init();
