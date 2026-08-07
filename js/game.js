/* ==========================================================
   DOODLE JUMP DELUXE
   Vanilla JavaScript - no library required.
   ========================================================== */

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const W = canvas.width;
const H = canvas.height;

const ui = {
  score: document.getElementById("score"),
  gems: document.getElementById("gems"),
  level: document.getElementById("level"),
  menu: document.getElementById("menuOverlay"),
  pause: document.getElementById("pauseOverlay"),
  gameOver: document.getElementById("gameOverOverlay"),
  levelOverlay: document.getElementById("levelOverlay"),
  levelAnnouncement: document.getElementById("levelAnnouncement"),
  finalScore: document.getElementById("finalScore"),
  bestScore: document.getElementById("bestScore"),
  gameOverText: document.getElementById("gameOverText"),
  powerupLabel: document.getElementById("powerupLabel"),
};

const LEVELS = Array.from({ length: 20 }, (_, i) => ({
  id: i + 1,
  name: [
    "Prairie Pixel", "Ciel Bubble", "Forêt Fluo", "Montagne Neon",
    "Lave Rush", "Glace Galaxy", "Jungle Bounce", "Ville Turbo",
    "Nuages Chaos", "Désert Comète", "Arcade Sky", "Labo Gravity",
    "Volcan X", "Océan Lunaire", "Dimension Candy", "Cyber Space",
    "Storm Zone", "Void Factory", "Galaxy Core", "Infinity Peak"
  ][i],
  gravity: 0.38 + i * 0.008,
  jump: 11.3 + Math.min(i * .07, 1.3),
  speed: 1 + i * .035,
  gap: Math.max(94 - i * 1.7, 61),
  moving: i >= 2,
  enemies: i >= 4,
  portals: i >= 6,
  springs: i >= 1,
  ice: i >= 9,
  breakable: i >= 5,
  wind: i >= 11,
  maxPlatforms: 12,
}));

const game = {
  running: false,
  paused: false,
  score: 0,
  gems: 0,
  level: 1,
  best: Number(localStorage.getItem("doodleBest") || 0),
  cameraY: 0,
  worldHeight: 0,
  lastTime: 0,
  shake: 0,
  particles: [],
  platforms: [],
  enemies: [],
  collectibles: [],
  powerups: [],
  portals: [],
  keys: { left: false, right: false },
  activePower: null,
  powerTimer: 0,
};

const player = {
  x: W / 2 - 16,
  y: H - 120,
  w: 32,
  h: 38,
  vx: 0,
  vy: 0,
  face: 1,
  jumps: 0,
  trail: [],
};

let audioCtx = null;

function sound(freq = 440, duration = .06, type = "sine") {
  if (localStorage.getItem("doodleMute") === "1") return;
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = .035;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(.001, audioCtx.currentTime + duration);
    osc.stop(audioCtx.currentTime + duration);
  } catch {}
}

function rand(min, max) { return Math.random() * (max - min) + min; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function chance(p) { return Math.random() < p; }

function resetGame() {
  game.running = true;
  game.paused = false;
  game.score = 0;
  game.gems = 0;
  game.level = 1;
  game.cameraY = 0;
  game.worldHeight = 0;
  game.shake = 0;
  game.particles = [];
  game.platforms = [];
  game.enemies = [];
  game.collectibles = [];
  game.powerups = [];
  game.portals = [];
  game.activePower = null;
  game.powerTimer = 0;

  player.x = W / 2 - player.w / 2;
  player.y = H - 150;
  player.vx = 0;
  player.vy = 0;
  player.jumps = 0;
  player.trail = [];

  buildInitialWorld();
  ui.menu.classList.add("hidden");
  ui.pause.classList.add("hidden");
  ui.gameOver.classList.add("hidden");
  showLevel(1);
  updateHUD();
  sound(523, .12);
}

function buildInitialWorld() {
  game.platforms.push({
    x: W / 2 - 60, y: H - 55, w: 120, h: 14,
    type: "normal", vx: 0, startX: W / 2 - 60
  });

  let y = H - 120;
  for (let i = 0; i < 45; i++) {
    y -= rand(62, 88);
    addPlatform(y, i);
  }
}

function addPlatform(y, index = 0) {
  const level = LEVELS[game.level - 1];
  const margin = 12;
  const width = clamp(rand(72, 120) - game.level * 1.2, 58, 120);
  const x = rand(margin, W - width - margin);

  let type = "normal";
  if (level.breakable && chance(.11)) type = "break";
  if (level.ice && chance(.13)) type = "ice";
  if (level.moving && chance(.22)) type = "moving";
  if (level.springs && chance(.10)) type = "spring";

  game.platforms.push({
    x, y, w: width, h: 13, type,
    vx: type === "moving" ? rand(.55, 1.1) * (chance(.5) ? 1 : -1) : 0,
    startX: x,
    broken: false,
    alpha: 1,
  });

  if (index > 0 && chance(.25 + game.level * .006)) {
    game.collectibles.push({
      x: x + width / 2,
      y: y - 22,
      r: 7,
      kind: "gem",
      collected: false,
      spin: rand(0, Math.PI * 2)
    });
  }

  if (level.enemies && index > 5 && chance(.075 + game.level * .003)) {
    game.enemies.push({
      x: rand(20, W - 50),
      y: y - rand(65, 120),
      w: 30,
      h: 30,
      vx: chance(.5) ? rand(.7, 1.4) : -rand(.7, 1.4),
      phase: rand(0, 9),
    });
  }

  if (level.portals && chance(.035)) {
    game.portals.push({
      x: rand(35, W - 35),
      y: y - rand(50, 100),
      r: 15,
      pair: null
    });
  }

  if (chance(.045 + game.level * .002)) {
    const kinds = ["jetpack", "shield", "magnet", "double"];
    game.powerups.push({
      x: x + width * .5,
      y: y - 45,
      r: 11,
      kind: kinds[Math.floor(Math.random() * kinds.length)],
      taken: false,
      bob: rand(0, 6)
    });
  }
}

function ensureWorld() {
  const highest = Math.min(...game.platforms.map(p => p.y), player.y);
  while (highest - game.cameraY > -900) {
    const minY = Math.min(...game.platforms.map(p => p.y));
    addPlatform(minY - LEVELS[game.level - 1].gap - rand(5, 30), game.platforms.length);
    if (game.platforms.length > 70) break;
  }

  game.platforms = game.platforms.filter(p => p.y - game.cameraY < H + 150);
  game.enemies = game.enemies.filter(e => e.y - game.cameraY < H + 180);
  game.collectibles = game.collectibles.filter(c => !c.collected && c.y - game.cameraY < H + 160);
  game.powerups = game.powerups.filter(p => !p.taken && p.y - game.cameraY < H + 160);
  game.portals = game.portals.filter(p => p.y - game.cameraY < H + 160);
}

function update(dt) {
  if (!game.running || game.paused) return;

  const level = LEVELS[game.level - 1];
  const step = Math.min(dt / 16.67, 2);

  // Controls / horizontal inertia
  const accel = 0.42 * step;
  if (game.keys.left) {
    player.vx -= accel;
    player.face = -1;
  }
  if (game.keys.right) {
    player.vx += accel;
    player.face = 1;
  }
  if (!game.keys.left && !game.keys.right) player.vx *= Math.pow(.88, step);

  const maxSpeed = 5.4 + game.level * .05;
  player.vx = clamp(player.vx, -maxSpeed, maxSpeed);

  if (game.activePower === "ice") player.vx *= .985;

  player.x += player.vx * step;
  if (player.x < -player.w * .55) player.x = W - player.w * .45;
  if (player.x > W - player.w * .45) player.x = -player.w * .55;

  const gravity = game.activePower === "double" ? level.gravity * .75 : level.gravity;
  player.vy += gravity * step;
  player.y += player.vy * step;

  // Wind becomes stronger in later levels
  if (level.wind) player.vx += Math.sin((player.y + game.cameraY) * .008) * .012 * game.level;

  // Moving platforms
  for (const p of game.platforms) {
    if (p.type === "moving") {
      p.x += p.vx * step;
      if (p.x < 8 || p.x + p.w > W - 8) p.vx *= -1;
    }
    if (p.type === "break" && p.alpha < 1) p.alpha = Math.max(0, p.alpha - .025 * step);
  }

  // Landing on platforms
  if (player.vy > 0) {
    for (const p of game.platforms) {
      const screenY = p.y - game.cameraY;
      const prevBottom = player.y - player.vy * step + player.h;
      const bottom = player.y + player.h;
      const overlap = player.x + player.w > p.x && player.x < p.x + p.w;

      if (!p.broken && overlap && prevBottom <= screenY + 3 && bottom >= screenY) {
        player.y = p.y - game.cameraY - player.h;
        bounce(p);
        break;
      }
    }
  }

  // Camera follows upward
  const target = H * .42;
  if (player.y < target) {
    const diff = target - player.y;
    player.y = target;
    game.cameraY += diff;
    game.score += diff * .08;
  }

  // Score based on height
  game.score = Math.max(game.score, Math.floor(game.cameraY * .75));

  // Collect gems
  for (const c of game.collectibles) {
    if (c.collected) continue;
    c.spin += .08 * step;
    if (distance(player.x + player.w/2, player.y + player.h/2, c.x, c.y - game.cameraY) < 25) {
      c.collected = true;
      game.gems++;
      game.score += 50;
      burst(c.x, c.y - game.cameraY, 8, "gem");
      sound(880, .07);
    }
  }

  // Powerups
  for (const p of game.powerups) {
    if (p.taken) continue;
    p.bob += .07 * step;
    if (distance(player.x + player.w/2, player.y + player.h/2, p.x, p.y - game.cameraY) < 28) {
      activatePower(p.kind);
      p.taken = true;
      sound(660, .12, "square");
    }
  }

  // Portals: pair nearest different portal
  for (let i = 0; i < game.portals.length; i++) {
    const a = game.portals[i];
    if (distance(player.x + player.w/2, player.y + player.h/2, a.x, a.y - game.cameraY) < 25) {
      let b = game.portals.find((q, j) => j !== i);
      if (b) {
        player.x = b.x - player.w/2;
        player.y = b.y - game.cameraY - player.h - 5;
        burst(a.x, a.y - game.cameraY, 15, "portal");
        sound(330, .16, "sawtooth");
      }
    }
  }

  // Enemies
  for (const e of game.enemies) {
    e.phase += .06 * step;
    e.x += e.vx * step;
    e.y += Math.sin(e.phase) * .45;
    if (e.x < 5 || e.x + e.w > W - 5) e.vx *= -1;

    const ex = e.x, ey = e.y - game.cameraY;
    if (rectsOverlap(player.x + 5, player.y + 5, player.w - 10, player.h - 8, ex, ey, e.w, e.h)) {
      if (game.activePower === "shield") {
        game.activePower = null;
        game.powerTimer = 0;
        burst(ex + e.w/2, ey + e.h/2, 20, "shield");
        e.y = 999999;
        game.score += 100;
        sound(180, .16, "square");
      } else if (player.vy > 1) {
        gameOver();
        return;
      }
    }
  }

  if (game.activePower) {
    game.powerTimer -= dt;
    if (game.powerTimer <= 0) {
      game.activePower = null;
      ui.powerupLabel.classList.add("hidden");
    }
  }

  // Falling below the world
  if (player.y - game.cameraY > H + 80) {
    gameOver();
    return;
  }

  // Level progression
  const nextLevel = Math.min(20, 1 + Math.floor(game.cameraY / 750));
  if (nextLevel > game.level) {
    game.level = nextLevel;
    showLevel(game.level);
    burst(W/2, H/2, 30, "level");
    sound(1046, .15);
  }

  ensureWorld();
  updateHUD();
  updateParticles(step);
}

function bounce(platform) {
  let jump = LEVELS[game.level - 1].jump;

  if (platform.type === "spring") jump *= 1.65;
  if (platform.type === "ice") player.vx *= 1.45;

  if (game.activePower === "jetpack") jump *= 1.25;
  if (game.activePower === "double" && player.jumps > 0) jump *= 1.2;

  player.vy = -jump;
  player.jumps++;

  game.score += platform.type === "spring" ? 35 : 10;
  burst(player.x + player.w/2, player.y + player.h, platform.type === "spring" ? 14 : 7, "jump");
  sound(platform.type === "spring" ? 720 : 520, .07);

  if (platform.type === "break") {
    platform.broken = true;
    platform.alpha = .7;
  }
}

function activatePower(kind) {
  const names = {
    jetpack: "🚀 JETPACK : super saut !",
    shield: "🛡️ BOUCLIER : un coup gratuit !",
    magnet: "🧲 AIMANT : les gemmes viennent à toi !",
    double: "🌙 GRAVITÉ LUNAIRE : saut amélioré !"
  };
  game.activePower = kind;
  game.powerTimer = kind === "shield" ? 10000 : 7000;
  ui.powerupLabel.textContent = names[kind];
  ui.powerupLabel.classList.remove("hidden");
}

function distance(x1, y1, x2, y2) {
  return Math.hypot(x1 - x2, y1 - y2);
}

function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function burst(x, y, amount, kind) {
  for (let i = 0; i < amount; i++) {
    game.particles.push({
      x, y,
      vx: rand(-2.4, 2.4),
      vy: rand(-3.2, 1),
      life: rand(350, 700),
      maxLife: 700,
      size: rand(2, 5),
      kind
    });
  }
}

function updateParticles(step) {
  for (const p of game.particles) {
    p.x += p.vx * step;
    p.y += p.vy * step;
    p.vy += .08 * step;
    p.life -= 16.67 * step;
  }
  game.particles = game.particles.filter(p => p.life > 0);
}

function showLevel(n) {
  ui.levelAnnouncement.textContent = n;
  ui.levelOverlay.classList.remove("hidden");
  setTimeout(() => ui.levelOverlay.classList.add("hidden"), 1500);
}

function updateHUD() {
  ui.score.textContent = Math.floor(game.score);
  ui.gems.textContent = game.gems;
  ui.level.textContent = game.level;
}

function gameOver() {
  game.running = false;
  game.paused = false;
  const score = Math.floor(game.score);
  if (score > game.best) {
    game.best = score;
    localStorage.setItem("doodleBest", String(score));
  }
  ui.finalScore.textContent = score;
  ui.bestScore.textContent = game.best;
  ui.gameOverText.textContent = `Tu as atteint le niveau ${game.level} — ${LEVELS[game.level - 1].name}.`;
  ui.gameOver.classList.remove("hidden");
  sound(120, .35, "sawtooth");
}

function togglePause() {
  if (!game.running) return;
  game.paused = !game.paused;
  ui.pause.classList.toggle("hidden", !game.paused);
  sound(game.paused ? 260 : 520, .05);
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  drawBackground();

  ctx.save();
  if (game.shake > 0) {
    ctx.translate(rand(-game.shake, game.shake), rand(-game.shake, game.shake));
    game.shake *= .9;
  }

  drawWorldObjects();
  drawPlayer();
  drawParticles();

  ctx.restore();
}

function drawBackground() {
  const level = LEVELS[game.level - 1];
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  const themes = [
    ["#0a1f2b","#081321"], ["#172447","#0a142d"], ["#092e2a","#07171c"],
    ["#321e49","#10112d"], ["#481b16","#170d18"], ["#102d4e","#080e22"],
    ["#12351f","#091712"], ["#27203f","#101322"], ["#29365b","#11152d"],
    ["#443018","#17120c"], ["#351d51","#101020"], ["#102c42","#07111f"],
    ["#481717","#170b10"], ["#173e4a","#09141e"], ["#4a2349","#170e25"],
    ["#102d50","#07101f"], ["#182e3d","#08141c"], ["#1d1b31","#080811"],
    ["#2b1752","#0d0a1b"], ["#143d59","#07101a"]
  ];
  const pair = themes[level.id - 1];
  grad.addColorStop(0, pair[0]);
  grad.addColorStop(1, pair[1]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Stars / dots / clouds
  ctx.globalAlpha = .35;
  for (let i = 0; i < 65; i++) {
    const x = (i * 83) % W;
    const y = ((i * 47 + game.cameraY * .08) % H + H) % H;
    const s = i % 5 === 0 ? 2 : 1;
    ctx.fillStyle = "#dff7ff";
    ctx.fillRect(x, y, s, s);
  }
  ctx.globalAlpha = 1;

  // Decorative horizon
  ctx.fillStyle = "rgba(255,255,255,.025)";
  for (let x = 0; x < W; x += 36) {
    ctx.fillRect(x, H - 70, 18, 2);
  }
}

function drawWorldObjects() {
  for (const p of game.platforms) {
    const y = p.y - game.cameraY;
    if (y < -30 || y > H + 30) continue;

    ctx.globalAlpha = p.alpha;
    let color = "#69f59b";
    if (p.type === "moving") color = "#4de8ff";
    if (p.type === "spring") color = "#ffd85a";
    if (p.type === "break") color = "#ff7c6d";
    if (p.type === "ice") color = "#bceeff";

    ctx.fillStyle = "rgba(0,0,0,.25)";
    roundRect(p.x + 2, y + 4, p.w, p.h, 7, true);
    ctx.fillStyle = color;
    roundRect(p.x, y, p.w, p.h, 7, true);

    ctx.fillStyle = "rgba(255,255,255,.35)";
    roundRect(p.x + 5, y + 2, p.w - 10, 3, 2, true);
    ctx.globalAlpha = 1;
  }

  for (const c of game.collectibles) {
    if (c.collected) continue;
    const y = c.y - game.cameraY;
    if (y < -30 || y > H + 30) continue;
    drawGem(c.x, y, c.spin);
  }

  for (const p of game.powerups) {
    if (p.taken) continue;
    const y = p.y - game.cameraY + Math.sin(p.bob) * 4;
    if (y < -40 || y > H + 40) continue;
    drawPowerup(p.x, y, p.kind);
  }

  for (const portal of game.portals) {
    const y = portal.y - game.cameraY;
    if (y < -50 || y > H + 50) continue;
    drawPortal(portal.x, y);
  }

  for (const e of game.enemies) {
    const y = e.y - game.cameraY;
    if (y < -50 || y > H + 50) continue;
    drawEnemy(e.x, y, e.phase);
  }
}

function roundRect(x, y, w, h, r, fill = false) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  if (fill) ctx.fill();
  else ctx.stroke();
}

function drawPlayer() {
  const x = player.x, y = player.y;

  // Shadow
  ctx.globalAlpha = .18;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.ellipse(x + 16, y + 40, 17, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Jetpack flame
  if (game.activePower === "jetpack") {
    ctx.fillStyle = "#ffd85a";
    ctx.beginPath();
    ctx.moveTo(x + 8, y + 33);
    ctx.lineTo(x + 13, y + 52 + Math.random() * 7);
    ctx.lineTo(x + 17, y + 34);
    ctx.fill();
    ctx.fillStyle = "#ff6a55";
    ctx.beginPath();
    ctx.moveTo(x + 15, y + 33);
    ctx.lineTo(x + 20, y + 48 + Math.random() * 5);
    ctx.lineTo(x + 24, y + 33);
    ctx.fill();
  }

  // Body
  ctx.fillStyle = "#69f59b";
  ctx.strokeStyle = "#b7ffce";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x + 16, y + 18, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Eyes
  ctx.fillStyle = "#092019";
  ctx.beginPath();
  ctx.arc(x + 10 + player.face * 2, y + 16, 2.2, 0, Math.PI * 2);
  ctx.arc(x + 21 + player.face * 2, y + 16, 2.2, 0, Math.PI * 2);
  ctx.fill();

  // Smile
  ctx.beginPath();
  ctx.arc(x + 16, y + 19, 6, 0.15, Math.PI - .15);
  ctx.strokeStyle = "#092019";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Feet
  ctx.strokeStyle = "#b7ffce";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + 5, y + 32); ctx.lineTo(x - 1, y + 37);
  ctx.moveTo(x + 27, y + 32); ctx.lineTo(x + 33, y + 37);
  ctx.stroke();

  if (game.activePower === "shield") {
    ctx.strokeStyle = "rgba(77,232,255,.85)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x + 16, y + 19, 24 + Math.sin(performance.now()/100)*2, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (game.activePower === "magnet") {
    ctx.strokeStyle = "#ff5bc8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + 16, y + 19, 25, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawGem(x, y, rot) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.fillStyle = "#70e8ff";
  ctx.strokeStyle = "#d4fbff";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -9); ctx.lineTo(7, 0); ctx.lineTo(0, 9); ctx.lineTo(-7, 0); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,.7)";
  ctx.fillRect(-2, -5, 2, 5);
  ctx.restore();
}

function drawPowerup(x, y, kind) {
  const colors = { jetpack:"#ff7b57", shield:"#4de8ff", magnet:"#ff5bc8", double:"#b88cff" };
  const icons = { jetpack:"R", shield:"S", magnet:"M", double:"2" };
  ctx.fillStyle = colors[kind];
  ctx.beginPath();
  ctx.arc(x, y, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#07111f";
  ctx.font = "bold 12px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(icons[kind], x, y + 1);
}

function drawPortal(x, y) {
  ctx.strokeStyle = "#c76dff";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(x, y, 14, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "#4de8ff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 8, performance.now()/500, performance.now()/500 + Math.PI * 1.4);
  ctx.stroke();
}

function drawEnemy(x, y, phase) {
  ctx.save();
  ctx.translate(x + 15, y + 15);
  ctx.rotate(Math.sin(phase) * .08);
  ctx.fillStyle = "#ff5b78";
  ctx.beginPath();
  ctx.arc(0, 0, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(-5, -2, 4, 0, Math.PI * 2);
  ctx.arc(5, -2, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1b1020";
  ctx.beginPath();
  ctx.arc(-5, -1, 2, 0, Math.PI * 2);
  ctx.arc(5, -1, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawParticles() {
  for (const p of game.particles) {
    ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
    const colors = {
      gem: "#70e8ff",
      jump: "#69f59b",
      portal: "#c76dff",
      shield: "#4de8ff",
      level: "#ffd85a"
    };
    ctx.fillStyle = colors[p.kind] || "#fff";
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function loop(time) {
  const dt = Math.min(time - game.lastTime || 16.67, 40);
  game.lastTime = time;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

function bindControls() {
  window.addEventListener("keydown", e => {
    if (["ArrowLeft","ArrowRight","a","d","A","D"," ","Escape"].includes(e.key)) e.preventDefault();

    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") game.keys.left = true;
    if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") game.keys.right = true;

    if ((e.key === " " || e.key === "Escape") && game.running) togglePause();
  });

  window.addEventListener("keyup", e => {
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") game.keys.left = false;
    if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") game.keys.right = false;
  });

  const hold = (el, key) => {
    const down = e => { e.preventDefault(); game.keys[key] = true; };
    const up = e => { e.preventDefault(); game.keys[key] = false; };
    ["pointerdown","touchstart"].forEach(ev => el.addEventListener(ev, down, {passive:false}));
    ["pointerup","pointercancel","pointerleave","touchend"].forEach(ev => el.addEventListener(ev, up, {passive:false}));
  };

  hold(document.getElementById("leftBtn"), "left");
  hold(document.getElementById("rightBtn"), "right");

  document.getElementById("startBtn").onclick = resetGame;
  document.getElementById("retryBtn").onclick = resetGame;
  document.getElementById("restartBtn").onclick = resetGame;
  document.getElementById("resumeBtn").onclick = togglePause;
  document.getElementById("pauseBtn").onclick = togglePause;
  document.getElementById("mobilePause").onclick = togglePause;

  document.getElementById("soundBtn").onclick = () => {
    const muted = localStorage.getItem("doodleMute") === "1";
    localStorage.setItem("doodleMute", muted ? "0" : "1");
    document.getElementById("soundBtn").textContent = muted ? "🔊" : "🔇";
  };
}

bindControls();
requestAnimationFrame(loop);
