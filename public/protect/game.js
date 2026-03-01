// ============================================================
// PROTECT – Defence & Fracture Game
// Features: Electric Dome charge weapon, Cluster Bomb enemies
// ============================================================

const W = 400, H = 600;
const GROUND_Y = H - 30;
const CANNON_X = W / 2;
const CHARGE_DURATION = 8000; // 8 seconds of no-hit to charge dome

const config = {
    type: Phaser.AUTO,
    width: W,
    height: H,
    backgroundColor: '#050510',
    parent: 'protect-container',
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: { create, update }
};

const game = new Phaser.Game(config);

// ── State ─────────────────────────────────────────────────────
let score = 0;
let cityHealth = 100;
let gameOver = false;
let cannonAngle = -Math.PI / 2;
let enemies = [];
let missiles = [];
let particles = [];
let buildings = [];
let scoreText, healthText, highText, chargeBar, chargeLabel, domeBtn;
let bestScore = parseInt(localStorage.getItem('protect_highscore') || '0');

// Charge / Electric Dome
let chargeMs = 0;          // ms accumulated without taking damage
let chargeReady = false;
let dome = null;            // active dome animation object
let lastHitMs = 0;

// ── Create ────────────────────────────────────────────────────
function create() {
    const scene = this;

    // Background
    const bg = scene.add.graphics();
    bg.fillGradientStyle(0x020208, 0x020208, 0x080820, 0x080820, 1);
    bg.fillRect(0, 0, W, H);
    for (let i = 0; i < 100; i++) {
        const s = scene.add.circle(Math.random() * W, Math.random() * H, Math.random() * 1.5 + 0.3, 0xffffff);
        s.setAlpha(Math.random() * 0.6 + 0.2);
    }

    // Ground
    scene.add.rectangle(W / 2, GROUND_Y + 15, W, 30, 0x07071a);
    scene.add.rectangle(W / 2, GROUND_Y, W, 2, 0x0044aa);

    // Skyscrapers
    const defs = [
        { x: 50,  w: 40,  h: 180, color: 0x112288 },
        { x: 130, w: 50,  h: 280, color: 0x1133aa },
        { x: 200, w: 45,  h: 140, color: 0x0d2266 },
        { x: 270, w: 55,  h: 310, color: 0x1144bb },
        { x: 350, w: 40,  h: 210, color: 0x0f2299 },
    ];
    defs.forEach(d => createBuilding(scene, d));

    // Shared graphics objects - MUST be created before createCannon()
    scene._particleG = scene.add.graphics().setDepth(9);
    scene._domeG     = scene.add.graphics().setDepth(15);
    scene._cannonG   = scene.add.graphics().setDepth(6);
    scene._enemyG    = scene.add.graphics().setDepth(7);
    scene._missileG  = scene.add.graphics().setDepth(8);

    // Cannon
    createCannon(scene);

    // UI Text
    scoreText  = scene.add.text(16, 12, 'SCORE: 0',              { font: 'bold 16px monospace', fill: '#00ffff' }).setDepth(10);
    highText   = scene.add.text(16, 32, 'BEST: ' + bestScore,    { font: 'bold 11px monospace', fill: '#ffffff', alpha: 0.6 }).setDepth(10);
    healthText = scene.add.text(16, 50, 'LIFE: 100%',            { font: 'bold 16px monospace', fill: '#00ff88' }).setDepth(10);
    scene.add.text(W / 2, H - 12, 'DOME: TAP BUTTON or E KEY',  { font: '10px monospace', fill: '#334466' }).setDepth(10).setOrigin(0.5);

    // Charge Bar UI
    chargeLabel = scene.add.text(W - 16, 12, 'DOME: CHARGING...', { font: 'bold 14px monospace', fill: '#556677' }).setDepth(10).setOrigin(1, 0);
    chargeBar   = scene.add.graphics().setDepth(10);

    // Dome Button
    domeBtn = scene.add.text(W - 16, 38, '⚡ UNLEASH DOME', { font: 'bold 14px monospace', fill: '#222233', backgroundColor: '#333344', padding: { x: 8, y: 4 } })
        .setDepth(10).setOrigin(1, 0).setInteractive()
        .on('pointerdown', () => activateElectricDome(scene))
        .on('pointerover', () => { if (chargeReady) domeBtn.setStyle({ fill: '#ffffff', backgroundColor: '#00aaff' }); })
        .on('pointerout',  () => updateDomeButton());

    // Input
    scene.input.on('pointermove', ptr => {
        if (!dome) cannonAngle = Phaser.Math.Angle.Between(CANNON_X, GROUND_Y - 10, ptr.x, ptr.y);
    });
    scene.input.on('pointerdown', (ptr) => {
        if (gameOver) { resetState(); scene.scene.restart(); return; }
        // Don't fire if clicking dome button area
        if (ptr.x > W - 160 && ptr.y < 70) return;
        fireMissile(scene, ptr.x, ptr.y);
    });

    // Keyboard E = Electric Dome
    scene.input.keyboard.on('keydown-E', () => activateElectricDome(scene));

    // Enemy spawn
    scene.time.addEvent({ delay: 3000, callback: () => spawnEnemy(scene), loop: true });
    scene.time.delayedCall(1000, () => spawnEnemy(scene));
}

// ── Reset ─────────────────────────────────────────────────────
function resetState() {
    score = 0; cityHealth = 100; gameOver = false;
    enemies = []; missiles = []; particles = []; buildings = [];
    chargeMs = 0; chargeReady = false; dome = null; lastHitMs = 0;
    cannonAngle = -Math.PI / 2;
}

// ── Dome Button Visual ─────────────────────────────────────────
function updateDomeButton() {
    if (!domeBtn || !chargeLabel) return;
    if (chargeReady) {
        chargeLabel.setText('DOME: READY!').setStyle({ fill: '#00ffff' });
        domeBtn.setStyle({ fill: '#000000', backgroundColor: '#00ccff' });
    } else {
        const pct = Math.floor((chargeMs / CHARGE_DURATION) * 100);
        chargeLabel.setText(`DOME: ${pct}%`).setStyle({ fill: '#445566' });
        domeBtn.setStyle({ fill: '#222233', backgroundColor: '#223344' });
    }
}

// ── Buildings ─────────────────────────────────────────────────
function createBuilding(scene, def) {
    const { x, w, h, color } = def;
    const drawY = GROUND_Y - h;
    const g = scene.add.graphics();
    const b = {
        g, x, w, h, drawY, color,
        health: 100, damage: 0,
        containsPoint(px, py, radius) {
            return px > this.x - this.w / 2 - radius && px < this.x + this.w / 2 + radius &&
                   py > this.drawY - radius && py < GROUND_Y + radius;
        },
        takeHit(points = 18) {
            this.damage = Math.min(100, this.damage + points);
            this.health = 100 - this.damage;
            this.redraw();
        },
        redraw() {
            const d = this.damage / 100;
            this.g.clear();
            this.g.fillStyle(this.color, 0.85 - d * 0.5);
            this.g.fillRect(this.x - this.w / 2, this.drawY, this.w, this.h);
            this.g.lineStyle(2, 0x2255bb, 0.4);
            this.g.strokeRect(this.x - this.w / 2, this.drawY, this.w, this.h);
            // Rooftop
            this.g.fillStyle(0x111133, 1);
            this.g.fillRect(this.x - 10, this.drawY - 14, 20, 16);
            // Windows
            const cols = Math.floor(this.w / 18);
            const rows = Math.floor(this.h / 22);
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const wx = this.x - this.w / 2 + 6 + c * 18;
                    const wy = this.drawY + 8 + r * 22;
                    const broken = d > 0.1 && Math.random() < d * 0.5;
                    const lit    = !broken && Math.random() > 0.35;
                    this.g.fillStyle(broken ? 0x220000 : (lit ? 0x88ccff : 0x112233), broken ? 0.9 : 0.5);
                    this.g.fillRect(wx, wy, 10, 14);
                    // Crack lines on damage
                    if (d > 0.3 && Math.random() < d * 0.15) {
                        this.g.lineStyle(1, 0xff4400, 0.5);
                        this.g.lineBetween(wx, wy, wx + Phaser.Math.Between(-8, 8), wy + Phaser.Math.Between(8, 20));
                    }
                }
            }
        }
    };
    b.redraw();
    buildings.push(b);
}

// ── Cannon ────────────────────────────────────────────────────
let cannonBarrel;
function createCannon(scene) {
    // Static base drawn once
    const base = scene.add.graphics().setDepth(5);
    base.fillStyle(0x252535, 1);
    base.fillRoundedRect ? base.fillRoundedRect(CANNON_X - 40, GROUND_Y - 20, 80, 24, 6) : base.fillRect(CANNON_X - 40, GROUND_Y - 20, 80, 24);
    base.lineStyle(2, 0x0066aa, 0.8);
    base.strokeRect(CANNON_X - 40, GROUND_Y - 20, 80, 24);
    // Metallic sheen
    base.fillStyle(0x3a3a50, 1);
    base.fillRect(CANNON_X - 36, GROUND_Y - 18, 24, 8);
    cannonBarrel = scene._cannonG;
}

function drawCannon() {
    const g = cannonBarrel;
    g.clear();
    const bx = CANNON_X, by = GROUND_Y - 10;
    const len = 52, wid = 14;

    g.save();
    g.translateCanvas(bx, by);
    g.rotateCanvas(cannonAngle + Math.PI / 2);

    // Shadow/depth
    g.fillStyle(0x111122, 0.7);
    g.fillRect(-wid / 2 + 2, -len + 2, wid, len);
    // Main tube
    g.fillStyle(0x444460, 1);
    g.fillRect(-wid / 2, -len, wid, len);
    // Metallic highlight
    g.fillStyle(0x8899bb, 0.6);
    g.fillRect(-wid / 2 + 2, -len + 4, 4, len - 8);
    // Muzzle sleeve
    g.fillStyle(0x222233, 1);
    g.fillRect(-wid / 2 - 3, -len - 2, wid + 6, 12);
    g.lineStyle(2, 0x00bbff, 0.7);
    g.strokeRect(-wid / 2 - 3, -len - 2, wid + 6, 12);

    g.restore();

    // Pivot
    g.fillStyle(0x667888, 1);
    g.fillCircle(bx, by, 11);
    g.lineStyle(2, 0x00aadd, 0.8);
    g.strokeCircle(bx, by, 11);
    g.fillStyle(0x9aabcc, 1);
    g.fillCircle(bx, by, 5);
}

// ── Charge Bar Draw ───────────────────────────────────────────
function drawChargeBar() {
    chargeBar.clear();
    const pct = Math.min(chargeMs / CHARGE_DURATION, 1);
    const bw = 160, bh = 10, bx = W - 16 - bw, by = 62;

    // Background
    chargeBar.fillStyle(0x111122, 1);
    chargeBar.fillRect(bx, by, bw, bh);

    // Fill
    if (chargeReady) {
        // Pulsing cyan when ready
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 300);
        chargeBar.fillStyle(Phaser.Display.Color.GetColor(0, 200 + Math.floor(pulse * 55), 255), 1);
        chargeBar.fillRect(bx, by, bw, bh);
        // Glow
        chargeBar.lineStyle(2, 0x00ffff, 0.6 + pulse * 0.4);
        chargeBar.strokeRect(bx - 1, by - 1, bw + 2, bh + 2);
    } else {
        chargeBar.fillStyle(0x0055aa, 1);
        chargeBar.fillRect(bx, by, bw * pct, bh);
        chargeBar.lineStyle(1, 0x0088cc, 0.5);
        chargeBar.strokeRect(bx, by, bw, bh);
    }

    updateDomeButton();
}

// ── Electric Dome ─────────────────────────────────────────────
function activateElectricDome(scene) {
    if (!chargeReady || dome || gameOver) return;
    chargeReady = false;
    chargeMs = 0;

    dome = { radius: 0, maxRadius: Math.max(W, H) * 0.85, phase: 'expand', lightning: [] };

    // Destroy all enemies
    enemies.forEach(e => {
        spawnExplosion(e.x, e.y, true);
        score += e.isCluster ? 300 : 100;
    });
    enemies = [];
    scoreText.setText('SCORE: ' + score);

    // Screen flash
    const flash = scene.add.rectangle(W / 2, H / 2, W, H, 0x00ffff, 0).setDepth(16);
    scene.tweens.add({ targets: flash, alpha: 0.35, duration: 120, yoyo: true, repeat: 2, onComplete: () => flash.destroy() });
}

function drawDome(g) {
    if (!dome) return;
    g.clear();
    const cx = CANNON_X, cy = GROUND_Y - 10;
    const { radius, maxRadius } = dome;
    const alpha = 1 - (radius / maxRadius) * 0.7;

    // Outer ring
    g.lineStyle(4, 0x00ffff, alpha);
    g.strokeCircle(cx, cy, radius);
    g.lineStyle(2, 0xffffff, alpha * 0.5);
    g.strokeCircle(cx, cy, radius - 8);

    // Random lightning arcs along the dome edge
    if (dome.lightning.length < 12) {
        const ang = Math.random() * Math.PI * 2;
        const ex = cx + Math.cos(ang) * radius;
        const ey = cy + Math.sin(ang) * radius;
        dome.lightning.push({ x: ex, y: ey, life: 8 });
    }
    dome.lightning = dome.lightning.filter(l => {
        l.life--;
        g.lineStyle(2, 0xaaffff, l.life / 8);
        const jx = l.x + (Math.random() - 0.5) * 30;
        const jy = l.y + (Math.random() - 0.5) * 30;
        g.lineBetween(cx, cy, jx, jy);
        return l.life > 0;
    });

    // Fill glow
    g.fillStyle(0x00aaff, alpha * 0.04);
    g.fillCircle(cx, cy, radius);
}

// ── Enemy Spawning ────────────────────────────────────────────
function spawnEnemy(scene) {
    if (gameOver) return;
    const roll = Math.random();
    const isCluster  = roll < 0.20;           // 20% cluster bomb
    const isMissile  = !isCluster && roll > 0.45;  // 35% regular missile

    const startX = Math.random() < 0.5 ? Phaser.Math.Between(-100, -30) : Phaser.Math.Between(W + 30, W + 100);
    const startY = Phaser.Math.Between(10, 160);
    const targetB = buildings[Phaser.Math.Between(0, buildings.length - 1)];
    const endX = targetB ? targetB.x + Phaser.Math.Between(-30, 30) : Phaser.Math.Between(80, W - 80);
    const endY = GROUND_Y - 10;

    const totalDist = Phaser.Math.Distance.Between(startX, startY, endX, endY);
    const speed = isCluster ? Phaser.Math.Between(110, 170) :
                  isMissile  ? Phaser.Math.Between(250, 380) :
                               Phaser.Math.Between(100, 200);
    const duration = (totalDist / speed) * 1000;

    const e = {
        x: startX, y: startY,
        startX, startY, endX, endY,
        cp1x: Phaser.Math.Between(50, W - 50), cp1y: Phaser.Math.Between(60, 300),
        cp2x: Phaser.Math.Between(50, W - 50), cp2y: Phaser.Math.Between(250, 450),
        isMissile, isCluster,
        speed, duration, elapsed: 0,
        rotorAngle: 0, done: false,
        // Cluster fuse — explodes at 60% travel if not shot
        fuseT: isCluster ? 0.58 + Math.random() * 0.15 : 1.1,
        fused: false,
        warningPulse: 0,
        g: scene.add.graphics().setDepth(7)
    };
    enemies.push(e);
}

// Explode cluster bomb into sub-missiles
function clusterDetonate(scene, cx, cy, parentEnemy) {
    parentEnemy.done = true;
    spawnExplosion(cx, cy, true, 0xff6600);
    // Spawn 4–6 sub-bomblets aimed at different buildings
    const count = Phaser.Math.Between(4, 6);
    for (let i = 0; i < count; i++) {
        const targetB = buildings[i % buildings.length];
        const tx = targetB.x + Phaser.Math.Between(-targetB.w / 3, targetB.w / 3);
        const ty = GROUND_Y - Phaser.Math.Between(0, targetB.h * 0.4);
        const dist = Phaser.Math.Distance.Between(cx, cy, tx, ty);
        const subE = {
            x: cx, y: cy,
            startX: cx, startY: cy, endX: tx, endY: ty,
            cp1x: cx + Phaser.Math.Between(-100, 100), cp1y: cy - Phaser.Math.Between(20, 80),
            cp2x: tx + Phaser.Math.Between(-60, 60),   cp2y: ty - Phaser.Math.Between(20, 60),
            isMissile: true, isCluster: false, isSubmissile: true,
            speed: 300, duration: (dist / 300) * 1000, elapsed: 0,
            rotorAngle: 0, done: false, fuseT: 1.1, fused: false, warningPulse: 0,
            g: game.scene.scenes[0].add.graphics().setDepth(7)
        };
        enemies.push(subE);
    }
}

// ── Hero Missile ──────────────────────────────────────────────
function fireMissile(scene, tx, ty) {
    const ang = Phaser.Math.Angle.Between(CANNON_X, GROUND_Y - 10, tx, ty);
    cannonAngle = ang;
    const dist = Phaser.Math.Distance.Between(CANNON_X, GROUND_Y - 10, tx, ty);
    const duration = (dist / 480) * 1000;

    const m = {
        x: CANNON_X, y: GROUND_Y - 10,
        startX: CANNON_X, startY: GROUND_Y - 10,
        targetX: tx, targetY: ty,
        angle: ang,
        elapsed: 0, duration,
        done: false,
        g: scene.add.graphics().setDepth(8)
    };
    missiles.push(m);
}

// ── Explosion / Particles ─────────────────────────────────────
function spawnExplosion(x, y, big, color = 0xffaa00) {
    const cnt = big ? 50 : 25;
    for (let i = 0; i < cnt; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = Math.random() * (big ? 200 : 100) + 40;
        particles.push({
            x, y,
            vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - Math.random() * 60,
            life: 1, decay: Math.random() * 0.025 + 0.012,
            size: Math.random() * (big ? 7 : 4) + 2,
            color, type: 'spark'
        });
    }
    for (let i = 0; i < (big ? 14 : 7); i++) {
        const ang = Math.random() * Math.PI * 2;
        particles.push({
            x: x + (Math.random() - 0.5) * 20, y,
            vx: Math.cos(ang) * 25, vy: Math.sin(ang) * 25 - 15,
            life: 1, decay: 0.006, size: Math.random() * 22 + 14,
            color: 0x555555, type: 'smoke'
        });
    }
}

function spawnTrail(x, y, color = 0xaaccff) {
    particles.push({
        x, y,
        vx: (Math.random() - 0.5) * 15, vy: Math.random() * 15,
        life: 1, decay: 0.07, size: Math.random() * 4 + 2,
        color, type: 'trail'
    });
}

// ── Building Damage ───────────────────────────────────────────
function damageBuildings(hx, hy, radius, points) {
    let hit = false;
    buildings.forEach(b => {
        if (b.containsPoint(hx, hy, radius)) {
            b.takeHit(points);
            hit = true;
        }
    });
    if (hit) {
        const totalH = buildings.reduce((s, b) => s + b.health, 0) / buildings.length;
        cityHealth = Math.max(0, Math.floor(totalH));
        healthText.setText('CITY INTEGRITY: ' + cityHealth + '%');
        // City hit resets charge
        cityHit();
    }
}

function cityHit() {
    lastHitMs = Date.now();
    chargeMs = 0;
    chargeReady = false;
}

// ── Game Over ─────────────────────────────────────────────────
function triggerGameOver(scene) {
    if (gameOver) return;
    gameOver = true;
    scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.85).setDepth(20);
    scene.add.text(W / 2, H / 2 - 55, '⚠  CITY DESTROYED  ⚠', { font: 'bold 38px monospace', fill: '#ff2222' }).setOrigin(0.5).setDepth(21);
    scene.add.text(W / 2, H / 2 + 10,  'FINAL SCORE: ' + score,   { font: 'bold 28px monospace', fill: '#00ffff' }).setOrigin(0.5).setDepth(21);
    scene.add.text(W / 2, H / 2 + 65, 'Click to restart',          { font: '18px monospace',     fill: '#aaaaaa' }).setOrigin(0.5).setDepth(21);
    
    if (score > bestScore) {
        bestScore = score;
        localStorage.setItem('protect_highscore', score.toString());
        if (highText) highText.setText('BEST: ' + bestScore);
    }

    // Report score to parent
    if (window.parent) {
        window.parent.postMessage({ type: 'GAME_OVER', gameId: 'protect', score: score }, '*');
    }
}

// ── Update ────────────────────────────────────────────────────
function update(time, dt) {
    const scene = this;
    const dtS = dt / 1000;

    // ─── Charge accumulation ────────────────────────────
    if (!gameOver) {
        chargeMs = Math.min(chargeMs + dt, CHARGE_DURATION);
        if (chargeMs >= CHARGE_DURATION) chargeReady = true;
    }

    // ─── Cannon ────────────────────────────────────────
    drawCannon();
    drawChargeBar();

    // ─── Electric Dome animation ───────────────────────
    const domeG = scene._domeG;
    if (dome) {
        dome.radius += dtS * 700; // expand speed
        drawDome(domeG);
        if (dome.radius >= dome.maxRadius) dome = null;
    } else {
        domeG.clear();
    }

    // ─── Update enemies ────────────────────────────────
    const eG = scene._enemyG;
    eG.clear();
    enemies.forEach(e => {
        if (e.done) return;
        e.elapsed += dt;
        const t = Math.min(e.elapsed / e.duration, 1);

        // Cubic Bezier (drones/cluster) or Linear (missiles)
        if (e.isMissile || e.isSubmissile) {
            e.x = Phaser.Math.Linear(e.startX, e.endX, t);
            e.y = Phaser.Math.Linear(e.startY, e.endY, t);
        } else {
            const mt = 1 - t;
            e.x = mt*mt*mt*e.startX + 3*mt*mt*t*e.cp1x + 3*mt*t*t*e.cp2x + t*t*t*e.endX;
            e.y = mt*mt*mt*e.startY + 3*mt*mt*t*e.cp1y + 3*mt*t*t*e.cp2y + t*t*t*e.endY;
            e.rotorAngle += dtS * 14;
        }

        // Trail
        if ((e.isMissile || e.isSubmissile) && Math.random() < 0.7) {
            spawnTrail(e.x, e.y, e.isCluster ? 0xff8800 : (e.isSubmissile ? 0xff4400 : 0xaaddff));
        }

        // Cluster bomb fuse check
        if (e.isCluster && !e.fused && t >= e.fuseT) {
            e.fused = true;
            clusterDetonate(scene, e.x, e.y, e);
            return;
        }
        if (e.done) return;

        // ── Draw enemy ──
        if (e.isCluster) {
            // Large cluster bomb — pulsing warning glow
            e.warningPulse += dtS * 6;
            const pulse = 0.5 + 0.5 * Math.sin(e.warningPulse);
            const ang2 = Phaser.Math.Angle.Between(e.startX, e.startY, e.endX, e.endY);
            eG.save();
            eG.translateCanvas(e.x, e.y);
            eG.rotateCanvas(ang2 + Math.PI / 2);
            // Glow ring
            eG.lineStyle(3 + pulse * 3, 0xff6600, 0.5 + pulse * 0.4);
            eG.strokeCircle(0, 0, 22 + pulse * 6);
            // Nose (bigger)
            eG.fillStyle(0xdd2200, 1);
            eG.fillTriangle(0, -26, -14, 10, 14, 10);
            // Body
            eG.fillStyle(0xaa1100, 1);
            eG.fillRect(-12, 10, 24, 24);
            // Warning stripes
            eG.fillStyle(0xffaa00, 1);
            eG.fillRect(-12, 14, 24, 6);
            eG.fillRect(-12, 26, 24, 4);
            // Fins
            eG.fillStyle(0x880000, 1);
            eG.fillTriangle(-12, 32, -22, 46, -4, 32);
            eG.fillTriangle( 12, 32,  22, 46,  4, 32);
            // Sub-missile indicators
            eG.lineStyle(1, 0xffff00, 0.7);
            for (let k = 0; k < 4; k++) {
                const bx2 = -9 + k * 6;
                eG.strokeRect(bx2, 12, 4, 10);
            }
            eG.restore();
            // Fuse text
            const timeLeft = Math.max(0, (e.fuseT - t) * e.duration / 1000).toFixed(1);
            eG.fillStyle(0xffff00, 0.85);
            // (can't render text on graphics, texture text used separately — skip for perf)
        } else if (e.isMissile || e.isSubmissile) {
            const ang2 = Phaser.Math.Angle.Between(e.startX, e.startY, e.endX, e.endY);
            eG.save();
            eG.translateCanvas(e.x, e.y);
            eG.rotateCanvas(ang2 + Math.PI / 2);
            eG.fillStyle(e.isSubmissile ? 0xff3300 : 0xcc2222, 1);
            eG.fillTriangle(0, -18, -8, 8, 8, 8);
            eG.fillStyle(e.isSubmissile ? 0xcc2200 : 0xaa1111, 1);
            eG.fillRect(-7, 8, 14, 16);
            eG.fillStyle(0x666677, 1);
            eG.fillTriangle(-7, 22, -14, 32, -3, 22);
            eG.fillTriangle( 7, 22,  14, 32,  3, 22);
            eG.restore();
        } else {
            // Drone
            eG.fillStyle(0x222233, 1);
            eG.fillCircle(e.x, e.y, 9);
            eG.lineStyle(2, 0x888899, 0.9);
            eG.strokeCircle(e.x, e.y, 9);
            for (let i = 0; i < 4; i++) {
                const ra = (Math.PI / 2) * i + e.rotorAngle;
                const ax = e.x + Math.cos(ra) * 17, ay = e.y + Math.sin(ra) * 17;
                eG.lineStyle(2, 0x667788, 0.9);
                eG.lineBetween(e.x, e.y, ax, ay);
                eG.fillStyle(0x445566, 1);
                eG.fillCircle(ax, ay, 6);
            }
            eG.fillStyle(0xff1111, 1);
            eG.fillCircle(e.x, e.y, 4);
        }

        // Reached target
        if (t >= 1) {
            e.done = true;
            const dmg = e.isCluster ? 25 : (e.isSubmissile ? 14 : 10);
            spawnExplosion(e.x, e.y, e.isCluster || e.isSubmissile, e.isCluster ? 0xff5500 : 0xff8800);
            damageBuildings(e.x, e.y, e.isCluster ? 120 : 70, dmg);
            if (cityHealth <= 0) triggerGameOver(scene);
        }
    });

    // Cleanup done enemies
    enemies = enemies.filter(e => {
        if (e.done) { e.g.destroy(); return false; }
        return true;
    });

    // ─── Update hero missiles ──────────────────────────
    const mG = scene._missileG;
    mG.clear();
    missiles.forEach(m => {
        if (m.done) return;
        m.elapsed += dt;
        const t = Math.min(m.elapsed / m.duration, 1);
        m.x = Phaser.Math.Linear(m.startX, m.targetX, t);
        m.y = Phaser.Math.Linear(m.startY, m.targetY, t);

        if (Math.random() < 0.75) spawnTrail(m.x, m.y, 0xaaddff);

        // Draw hero missile
        mG.save();
        mG.translateCanvas(m.x, m.y);
        mG.rotateCanvas(m.angle + Math.PI / 2);
        mG.fillStyle(0x00ffdd, 1);
        mG.fillTriangle(0, -12, -5, 5, 5, 5);
        mG.fillStyle(0x006688, 1);
        mG.fillRect(-3, 5, 6, 8);
        mG.lineStyle(1, 0x00ffff, 0.8);
        mG.strokeRect(-3, 5, 6, 8);
        mG.restore();

        if (t >= 1) {
            m.done = true;
            spawnExplosion(m.x, m.y, false, 0x00ffff);
            checkBlast(scene, m.x, m.y);
        }
    });
    missiles = missiles.filter(m => {
        if (m.done) { m.g.destroy(); return false; }
        return true;
    });

    // ─── Missile vs Enemy collision ────────────────────
    enemies.forEach(e => {
        if (e.done) return;
        missiles.forEach(m => {
            if (m.done) return;
            if (Phaser.Math.Distance.Between(m.x, m.y, e.x, e.y) < 32) {
                m.done = true;
                spawnExplosion(e.x, e.y, true, e.isCluster ? 0xff6600 : 0xff8800);
                if (e.isCluster && !e.fused) {
                    // Shot early — just destroy, no cluster
                    score += 300;
                } else {
                    score += e.isCluster ? 300 : 100;
                }
                e.done = true;
                scoreText.setText('SCORE: ' + score);
            }
        });
    });

    // ─── Particles ─────────────────────────────────────
    const pg = scene._particleG;
    pg.clear();
    particles.forEach(p => {
        p.x += p.vx * dtS;
        p.y += p.vy * dtS;
        p.vy += 180 * dtS; // gravity
        p.vx *= 0.96; p.vy *= 0.98;
        p.life -= p.decay;

        if (p.type === 'smoke') {
            pg.fillStyle(p.color, p.life * 0.25);
            pg.fillCircle(p.x, p.y, p.size * (2 - p.life));
        } else if (p.type === 'trail') {
            pg.fillStyle(p.color, p.life * 0.45);
            pg.fillCircle(p.x, p.y, p.size);
        } else {
            pg.fillStyle(p.color, p.life);
            pg.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
    });
    particles = particles.filter(p => p.life > 0);
}

// ── Blast radius enemy check ───────────────────────────────────
function checkBlast(scene, mx, my) {
    const BLAST = 110;
    enemies.forEach(e => {
        if (e.done) return;
        if (Phaser.Math.Distance.Between(mx, my, e.x, e.y) < BLAST) {
            spawnExplosion(e.x, e.y, true, e.isCluster ? 0xff6600 : 0xff8800);
            score += e.isCluster ? 300 : 100;
            scoreText.setText('SCORE: ' + score);
            if (e.isCluster && !e.fused) {
                // Shot before fuse — full destroy, no cluster
                e.done = true;
            } else {
                e.done = true;
            }
        }
    });
}
