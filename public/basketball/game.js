const config = {
    type: Phaser.AUTO,
    width: 400,
    height: 600,
    backgroundColor: '#0a0a12',
    parent: 'game-container',
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    physics: {
        default: 'matter',
        matter: {
            gravity: { y: 1.2 },
            debug: false,
            positionIterations: 15,
            velocityIterations: 15
        }
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

new Phaser.Game(config);

function preload() {
    let graphics = this.make.graphics({ x: 0, y: 0, add: false });
    
    // Trail particle
    graphics.fillStyle(0xffffff, 1);
    graphics.fillCircle(8, 8, 8);
    graphics.generateTexture('particle', 16, 16);
    graphics.clear();

    // Ball texture
    graphics.fillStyle(0xe67e22, 1);
    graphics.fillCircle(20, 20, 20);
    graphics.lineStyle(3, 0x000000, 0.4);
    graphics.strokeCircle(20, 20, 18);
    graphics.beginPath();
    graphics.moveTo(5, 20);
    graphics.lineTo(35, 20);
    graphics.moveTo(20, 5);
    graphics.lineTo(20, 35);
    graphics.strokePath();
    graphics.generateTexture('ball', 40, 40);
}

function create() {
    const scene = this;
    const { width, height } = scene.sys.game.config;

    // Background
    scene.add.rectangle(width/2, height/2, width, height, 0x1a1a2e);
    
    // UI Setup
    scene.score = 0;
    scene.lives = 5;
    scene.gameOver = false;

    scene.scoreText = scene.add.text(20, 20, 'SCORE: 0', { 
        fontSize: '20px', fontFamily: 'Arial Black', fill: '#f1c40f', stroke: '#000', strokeThickness: 4 
    }).setDepth(100);

    scene.highScore = parseInt(localStorage.getItem('basketball_highscore') || '0');
    scene.highScoreText = scene.add.text(20, 45, 'BEST: ' + scene.highScore, { 
        fontSize: '12px', fontFamily: 'Arial Black', fill: '#ffffff', stroke: '#000', strokeThickness: 2 
    }).setAlpha(0.7).setDepth(100);

    scene.livesText = scene.add.text(width - 20, 20, '❤️x5', { 
        fontSize: '20px', fontFamily: 'Arial Black', fill: '#e74c3c', stroke: '#000', strokeThickness: 4 
    }).setOrigin(1, 0).setDepth(100);

    // Physics Boundaries (Invisible Walls)
    // Left, Right, Top walls
    scene.matter.add.rectangle(-10, height/2, 20, height, { isStatic: true, restitution: 0.8, label: 'wall' });
    scene.matter.add.rectangle(width + 10, height/2, 20, height, { isStatic: true, restitution: 0.8, label: 'wall' });
    scene.matter.add.rectangle(width/2, -10, width, 20, { isStatic: true, restitution: 0.8, label: 'wall' });
    
    // Floor
    const floor = scene.add.rectangle(width/2, height - 10, width, 20, 0x0f3460);
    scene.matter.add.gameObject(floor, { isStatic: true, restitution: 0.8, label: 'floor' });

    // --- HOOP SETUP ---
    const hoopX = width - 80;
    const hoopY = 220;
    const rimWidth = 70;

    // Backboard
    const bb = scene.add.rectangle(hoopX + rimWidth / 2 + 20, hoopY - 80, 20, 180, 0xffffff).setOrigin(0.5);
    scene.matter.add.gameObject(bb, { isStatic: true, label: 'backboard', restitution: 0.8 });
    
    // Rim Visuals
    scene.add.rectangle(hoopX, hoopY, rimWidth, 10, 0xe74c3c).setOrigin(0.5);
    scene.add.circle(hoopX - rimWidth / 2, hoopY, 6, 0xe74c3c);
    scene.add.circle(hoopX + rimWidth / 2, hoopY, 6, 0xe74c3c);

    // Rim Physics
    scene.matter.add.circle(hoopX - rimWidth / 2, hoopY, 6, { isStatic: true, label: 'rim', restitution: 0.4 });
    scene.matter.add.circle(hoopX + rimWidth / 2, hoopY, 6, { isStatic: true, label: 'rim', restitution: 0.4 });

    // --- NET SETUP ---
    scene.netParticles = [];
    scene.netGraphics = scene.add.graphics();
    const cols = 6;
    const rows = 5;
    const spacingX = rimWidth / (cols - 1);
    const spacingY = 18;

    for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
            const px = (hoopX - rimWidth / 2) + i * spacingX;
            const py = hoopY + j * spacingY;
            const particle = scene.matter.add.circle(px, py, 2, {
                collisionFilter: { group: -1 }, friction: 0.1, restitution: 0.2, density: 0.005, label: 'net'
            });
            scene.netParticles.push(particle);
            if (i > 0) scene.matter.add.constraint(scene.netParticles[scene.netParticles.length - 2], particle, spacingX, 0.4);
            if (j > 0) scene.matter.add.constraint(scene.netParticles[(j - 1) * cols + i], particle, spacingY, 0.4);
            if (j === 0) scene.matter.add.worldConstraint(particle, 0, 1, { pointA: { x: px, y: py } });
        }
    }

    // --- SCORING ---
    scene.scoredInThisShot = false;
    scene.scoredTop = false;
    scene.topSensor = scene.matter.add.rectangle(hoopX, hoopY - 15, rimWidth - 20, 10, { isSensor: true, isStatic: true, label: 'topSensor' });
    scene.bottomSensor = scene.matter.add.rectangle(hoopX, hoopY + 30, rimWidth - 20, 10, { isSensor: true, isStatic: true, label: 'bottomSensor' });

    scene.matter.world.on('collisionstart', (event) => {
        event.pairs.forEach(pair => {
            const labels = [pair.bodyA.label, pair.bodyB.label];
            
            // Track bounces if ball is moving
            if (scene.isMoving && labels.includes('ball')) {
                if (labels.includes('wall') || labels.includes('floor') || labels.includes('backboard')) {
                    scene.bounceCount++;
                    // Optional: visual spark on bounce
                    console.log("Bounce! Count: " + scene.bounceCount);
                }
            }

            if (labels.includes('topSensor')) scene.scoredTop = true;
            if (scene.scoredTop && labels.includes('bottomSensor')) {
                if (!scene.scoredInThisShot) {
                    const points = 1 + scene.bounceCount;
                    scene.score += points;
                    scene.scoreText.setText('SCORE: ' + scene.score);
                    scene.scoredInThisShot = true;
                    
                    if (scene.bounceCount > 0) {
                        showFeedback(scene, `TRICK SHOT!\n+${points}`, hoopX, hoopY - 100);
                    } else {
                        showFeedback(scene, 'SWISH! +1', hoopX, hoopY - 100);
                    }
                }
                scene.scoredTop = false;
            }
        });
    });

    // --- BALL & TRAIL ---
    scene.trail = scene.add.particles(0, 0, 'particle', {
        scale: { start: 0.6, end: 0 }, alpha: { start: 0.4, end: 0 }, lifespan: 600, emitting: false
    });

    scene.dragGraphics = scene.add.graphics();
    scene.ball = null;
    scene.isDragging = false;
    scene.isMoving = false;

    scene.updateLivesDisplay = () => {
        scene.livesText.setText('❤️x' + scene.lives);
    };

    scene.spawnBall = () => {
        if (scene.gameOver) return;
        if (scene.ball) scene.ball.destroy();
        
        scene.ball = scene.add.image(80, 450, 'ball').setDepth(10);
        scene.matter.add.gameObject(scene.ball, {
            shape: 'circle', radius: 20, restitution: 0.8, friction: 0.05, label: 'ball', mass: 1
        });
        
        scene.ball.setIgnoreGravity(true);
        scene.ball.setVelocity(0, 0);
        
        scene.trail.stop();
        scene.trail.startFollow(scene.ball);
        scene.scoredTop = false;
        scene.scoredInThisShot = false;
        scene.isMoving = false;
        scene.bounceCount = 0;
    };
    scene.spawnBall();

    // --- INPUT ---
    scene.input.on('pointerdown', (p) => {
        if (scene.isMoving || scene.gameOver) return;
        const dist = Phaser.Math.Distance.Between(p.x, p.y, scene.ball.x, scene.ball.y);
        if (dist < 80) {
            scene.isDragging = true;
            scene.startP = { x: scene.ball.x, y: scene.ball.y };
        }
    });

    scene.input.on('pointermove', (p) => {
        if (scene.isDragging) {
            scene.dragGraphics.clear();
            const vx = (p.x - scene.startP.x) * 0.18;
            const vy = (p.y - scene.startP.y) * 0.18;
            scene.dragGraphics.lineStyle(4, 0xf1c40f, 0.7);
            scene.dragGraphics.lineBetween(scene.startP.x, scene.startP.y, p.x, p.y);
            for (let i = 0; i < 20; i++) {
                const t = i * 2.5;
                const x = scene.startP.x + vx * t;
                const y = scene.startP.y + vy * t + 0.5 * 1.2 * (t * t);
                scene.dragGraphics.fillStyle(0xffffff, 1 - (i/20)).fillCircle(x, y, 4);
            }
        }
    });

    scene.input.on('pointerup', (p) => {
        if (scene.isDragging) {
            scene.isDragging = false;
            scene.dragGraphics.clear();
            
            const vx = (p.x - scene.startP.x) * 0.18;
            const vy = (p.y - scene.startP.y) * 0.18;
            
            scene.isMoving = true;
            scene.ball.setIgnoreGravity(false);
            scene.ball.setVelocity(vx, vy);
            scene.trail.start();
            
            // Bounce logic: After 3 seconds, check if score was made or lost life
            scene.time.delayedCall(3000, () => {
                if (!scene.scoredInThisShot) {
                    scene.lives--;
                    scene.updateLivesDisplay();
                    if (scene.lives <= 0) {
                        scene.gameOver = true;
                        
                        // Check local high score
                        if (scene.score > scene.highScore) {
                            scene.highScore = scene.score;
                            localStorage.setItem('basketball_highscore', scene.score.toString());
                            scene.highScoreText.setText('BEST: ' + scene.highScore);
                        }

                        showFeedback(scene, 'GAME OVER', width/2, height/2, 5000);
                        scene.add.text(width/2, height/2 + 80, 'Final Score: ' + scene.score, { fontSize: '32px', fill: '#fff' }).setOrigin(0.5);
                        
                        // Report score to parent
                        if (window.parent) {
                            window.parent.postMessage({ type: 'GAME_OVER', gameId: 'basketball', score: scene.score }, '*');
                        }
                    }
                }
                
                if (!scene.gameOver) {
                    scene.spawnBall();
                }
            });
        }
    });

    // Reset Game (only if Game Over)
    scene.input.on('pointerdown', () => {
        if (scene.gameOver) {
            location.reload();
        }
    });
}

function showFeedback(scene, text, x, y, duration = 1500) {
    const t = scene.add.text(x, y, text, { fontSize: '72px', fill: '#f1c40f', fontStyle: 'bold' }).setOrigin(0.5);
    scene.tweens.add({ targets: t, y: y-150, alpha: 0, duration: duration, onComplete: () => t.destroy() });
}

function update() {
    this.netGraphics.clear().lineStyle(2, 0xaaaaaa, 0.4);
    const cols = 6;
    for (let i = 0; i < this.netParticles.length; i++) {
        const p = this.netParticles[i];
        if ((i + 1) % cols !== 0) this.netGraphics.lineBetween(p.position.x, p.position.y, this.netParticles[i+1].position.x, this.netParticles[i+1].position.y);
        if (i < this.netParticles.length - cols) this.netGraphics.lineBetween(p.position.x, p.position.y, this.netParticles[i+cols].position.x, this.netParticles[i+cols].position.y);
    }
}
