const W = 480;
const H = 600;
const TERRAIN_W = 256;
const TERRAIN_H = 2900;
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }
function wrap(v, size) { return ((v % size) + size) % size; }

export class PlayScene extends Phaser.Scene {
    constructor() { super("Play"); }

    create() {
        this.rng = new Phaser.Math.RandomDataGenerator([Date.now().toString()]);
        this.cursors = this.input.keyboard.createCursorKeys();
        this.keys = this.input.keyboard.addKeys({
            shot: Phaser.Input.Keyboard.KeyCodes.Z,
            shotAlt: Phaser.Input.Keyboard.KeyCodes.SPACE,
            bomb: Phaser.Input.Keyboard.KeyCodes.X,
            radar: Phaser.Input.Keyboard.KeyCodes.C,
            pause: Phaser.Input.Keyboard.KeyCodes.P,
            restart: Phaser.Input.Keyboard.KeyCodes.R,
        });

        this.sfx = {
            credit: this.safeAddSound("s_credit", 0.4),
            zapper1: this.safeAddSound("s_zapper1", 0.42),
            zapper2: this.safeAddSound("s_zapper2", 0.42),
            blaster1: this.safeAddSound("s_blaster1", 0.5),
            blaster2: this.safeAddSound("s_blaster2", 0.5),
            airHit: this.safeAddSound("s_airHit", 0.5),
            groundHit: this.safeAddSound("s_groundHit", 0.55),
            bacuraHit: this.safeAddSound("s_bacuraHit", 0.52),
            andorAppear: this.safeAddSound("s_andorAppear", 0.62),
            solvalouExplosion: this.safeAddSound("s_solvalouExplosion", 0.62),
        };
        this.zapperSoundIndex = 0;
        this.blasterSoundIndex = 0;
        this.startMusic = this.safeAddSound("s_startMusic", 0.48);
        this.gameMusic = this.safeAddSound("s_gameMusic", 0.4, true);
        if (this.startMusic) {
            this.startMusic.once("complete", () => {
                if (this.sys.isActive() && this.gameMusic && !this.gameMusic.isPlaying) this.gameMusic.play();
            });
            this.startMusic.play();
        } else {
            this.gameMusic?.play();
        }
        this.events.once("shutdown", () => {
            this.startMusic?.stop();
            this.gameMusic?.stop();
            this.startMusic?.destroy();
            this.gameMusic?.destroy();
            Object.values(this.sfx).forEach((sound) => {
                sound?.stop();
                sound?.destroy();
            });
        });

        // progression
        this.scrollSpeed = 60;
        this.distance = 0;
        this.nextScriptIndex = 0;
        this.stageScript = makeStageScript();

        // stats
        this.score = 0;
        this.lives = 3;
        this.combo = 0;
        this.comboTimer = 0;
        this.weaponLevel = 1;
        this.bombRadius = 56;
        this.radarCharges = 2;
        this.waveNumber = 0;

        // cooldowns
        this.playerInvuln = 0;
        this.shotCooldown = 0;
        this.bombCooldown = 0;
        this.radarCooldown = 0;

        // backgrounds
        this.starsA = this.add.tileSprite(0, 0, W, H, "starsA").setOrigin(0, 0).setAlpha(0.60).setScale(2);
        this.starsB = this.add.tileSprite(0, 0, W, H, "starsB").setOrigin(0, 0).setAlpha(0.45).setScale(2);
        this.terrain = this.add.tileSprite(0, 0, W, H, "terrain").setOrigin(0, 0).setTileScale(2);
        // Begin over the mapped road/field section instead of the long forest border.
        this.terrain.tilePositionY = 900;

        // groups
        this.playerShots = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, maxSize: 160 });
        this.bombs = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, maxSize: 40 });
        this.airEnemies = this.physics.add.group({ classType: Phaser.Physics.Arcade.Sprite, maxSize: 100 });
        this.groundTargets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Sprite, maxSize: 120 });
        this.enemyBullets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, maxSize: 260 });
        this.powerups = this.physics.add.group({ classType: Phaser.Physics.Arcade.Sprite, maxSize: 30 });
        this.craters = this.add.group({ classType: Phaser.GameObjects.Image, maxSize: 120 });

        // player
        this.player = this.physics.add.sprite(W / 2, H * 0.78, "player", "player").setDepth(50).setScale(2);
        this.player.setDamping(true).setDrag(0.0008).setMaxVelocity(270, 270);
        this.player.setCollideWorldBounds(true);
        this.bombTarget = this.add.image(this.player.x, this.player.y - 200, "target")
            .setDepth(70).setAlpha(0.8).setScale(0.8);

        // radar sweep
        this.radarSweep = this.add.rectangle(W / 2, -H, W, H, 0x6fe8ff, 0.08).setDepth(1500);
        this.radarSweep.setVisible(false);

        // flash overlay
        this.flashRect = this.add.rectangle(W / 2, H / 2, W, H, 0xffffff, 0).setDepth(1999);

        // HUD
        this.hud = this.add.bitmapText(10, 10, "xeviousFont", "", 12)
            .setLetterSpacing(-3).setTint(0xcfe8ff).setDepth(3000);

        this.hud2 = this.add.bitmapText(10, 31, "xeviousFont", "", 10)
            .setLetterSpacing(-2).setTint(0x9fb5c9).setDepth(3000);

        // collisions
        this.physics.add.overlap(this.playerShots, this.airEnemies, this.onShotHitsAir, null, this);
        this.physics.add.overlap(this.bombs, this.groundTargets, this.onBombTouchesGround, null, this);

        this.physics.add.overlap(this.player, this.airEnemies, this.onPlayerHit, null, this);
        this.physics.add.overlap(this.player, this.enemyBullets, this.onPlayerHitByBullet, null, this);
        this.physics.add.overlap(this.player, this.powerups, this.onPickupPowerup, null, this);

        // boss
        this.boss = null;
        this.bossActive = false;
        this.bossWeakPoints = this.physics.add.group();
        this.physics.add.overlap(this.playerShots, this.bossWeakPoints, (shot, point) => {
            if (!shot.active || !point.active) return;
            shot.setActive(false).setVisible(false);
            shot.body.enable = false;
            this.damageBoss(1, point);
        });

        // pause
        this.isPaused = false;
        this.pauseText = this.add.bitmapText(W / 2, H / 2, "xeviousFont", "PAUSED", 30)
            .setLetterSpacing(-4).setTint(0xffffff).setOrigin(0.5).setDepth(4000).setAlpha(0);

        this.camera = this.cameras.main;
    }

    update(time, deltaMs) {
        const dt = deltaMs / 1000;

        if (Phaser.Input.Keyboard.JustDown(this.keys.pause)) {
            this.isPaused = !this.isPaused;
            this.pauseText.setAlpha(this.isPaused ? 1 : 0);
        }
        if (this.isPaused) {
            if (Phaser.Input.Keyboard.JustDown(this.keys.restart)) this.scene.restart();
            return;
        }
        // scroll + distance
        this.distance += (this.scrollSpeed * dt) * 0.06;

        // background scroll (correct direction)
        this.starsA.tilePositionY -= this.scrollSpeed * dt * 0.15;
        this.starsB.tilePositionY -= this.scrollSpeed * dt * 0.30;
        // Tile coordinates are source pixels. At 2x tile scale, half the
        // screen-space scroll keeps map objects locked to their terrain pixel.
        this.terrain.tilePositionY -= this.scrollSpeed * dt * 0.5;

        // difficulty ramp
        const targetSpeed = clamp(170 + this.distance * 0.10 + this.score / 1800, 170, 270);
        this.scrollSpeed = lerp(this.scrollSpeed, targetSpeed, dt * 0.4);

        // cooldowns
        this.shotCooldown = Math.max(0, this.shotCooldown - dt);
        this.bombCooldown = Math.max(0, this.bombCooldown - dt);
        this.radarCooldown = Math.max(0, this.radarCooldown - dt);
        this.playerInvuln = Math.max(0, this.playerInvuln - dt);

        this.comboTimer = Math.max(0, this.comboTimer - dt);
        if (this.comboTimer === 0) this.combo = 0;

        // movement
        const ax = 980, ay = 980;
        let vx = 0, vy = 0;
        if (this.cursors.left.isDown) vx -= ax;
        if (this.cursors.right.isDown) vx += ax;
        if (this.cursors.up.isDown) vy -= ay;
        if (this.cursors.down.isDown) vy += ay;
        this.player.setAcceleration(vx, vy);
        if (this.player.y < H * 0.52) {
            this.player.y = H * 0.52;
            if (this.player.body.velocity.y < 0) this.player.body.velocity.y = 0;
        }
        this.bombTarget.setPosition(this.player.x, this.player.y - 200);

        const tilt = clamp(this.player.body.velocity.x / 270, -1, 1);
        this.player.setRotation(tilt * 0.22);

        // shoot
        if (this.player.visible && (this.keys.shot.isDown || this.keys.shotAlt.isDown) && this.shotCooldown <= 0) {
            this.fireShot();
            this.shotCooldown = 0.10 - (this.weaponLevel - 1) * 0.01;
        }

        // bomb
        if (this.player.visible && Phaser.Input.Keyboard.JustDown(this.keys.bomb) && this.bombCooldown <= 0) {
            this.dropBomb();
            this.bombCooldown = 0.58;
        }

        // radar
        if (Phaser.Input.Keyboard.JustDown(this.keys.radar) && this.radarCooldown <= 0 && this.radarCharges > 0) {
            this.radarCharges--;
            this.radarCooldown = 1.2;
            this.doRadarSweep();
        }

        // scripted spawns + boss
        this.runStageScript();

        // update entities
        this.updateAirEnemies(dt);
        this.updateGroundTargets(dt);
        this.updateBoss(dt);

        // cleanup
        this.cleanupGroup(this.playerShots, -80, H + 80);
        this.cleanupGroup(this.enemyBullets, -120, H + 120);
        this.cleanupGroup(this.airEnemies, -160, H + 160);
        this.cleanupGroup(this.groundTargets, -160, H + 160);
        this.cleanupGroup(this.bombs, -120, H + 120);
        this.cleanupGroup(this.powerups, -160, H + 160);
        this.cleanupGroup(this.craters, -80, H + 80);

        // invuln blink
        if (this.playerInvuln > 0) {
            this.player.setAlpha((Math.floor(time / 80) % 2) ? 0.35 : 1.0);
        } else {
            this.player.setAlpha(1.0);
        }

        // HUD
        this.hud.setText(`SCORE ${this.score.toString().padStart(7, "0")}   LIVES ${this.lives}   WPN ${this.weaponLevel}   RADAR ${this.radarCharges}`);
        this.hud2.setText(`DIST ${Math.floor(this.distance)}m   WAVE ${this.waveNumber}   COMBO x${this.combo || 0}`);
    }

    // ---------- stage script ----------
    runStageScript() {
        if (!this.bossActive && this.distance >= 900) {
            this.spawnBoss();
            this.bossActive = true;
        }
        if (this.bossActive) return;

        while (this.nextScriptIndex < this.stageScript.length &&
            this.distance >= this.stageScript[this.nextScriptIndex].at) {
            const ev = this.stageScript[this.nextScriptIndex];
            if (ev.type === "airWave") {
                const bonus = Math.min(2, Math.floor(this.score / 12000));
                this.spawnAirWave(ev.pattern, clamp(ev.count + bonus, 2, 5));
                this.waveNumber++;
            }
            if (ev.type === "groundRow") this.spawnGroundRow(ev.count, ev.hiddenChance);
            if (ev.type === "powerup") this.spawnPowerup();
            if (ev.type === "radarCharge") this.radarCharges = Math.min(5, this.radarCharges + (ev.amount || 1));
            this.nextScriptIndex++;
        }
    }

    // ---------- weapons ----------
    fireShot() {
        const px = this.player.x, py = this.player.y - 18;
        const configs = [
            [{ dx: 0, dy: -590 }],
            [{ dx: -80, dy: -570 }, { dx: 80, dy: -570 }],
            [{ dx: 0, dy: -610 }, { dx: -120, dy: -560 }, { dx: 120, dy: -560 }]
        ];
        const arr = configs[this.weaponLevel - 1] || configs[0];

        for (const s of arr) {
            const b = this.playerShots.get(px, py, "shot");
            if (!b) continue;
            b.setActive(true).setVisible(true);
            b.body.enable = true;
            b.setDepth(120);
            b.setScale(1.35);
            b.setVelocity(s.dx, s.dy);
            b.setData("damage", 1);
        }
        this.zapperSoundIndex ^= 1;
        this.safePlay(this.zapperSoundIndex ? "zapper1" : "zapper2");
    }

    dropBomb() {
        const b = this.bombs.get(this.player.x, this.player.y - 10, "bomb");
        if (!b) return;

        b.setActive(true).setVisible(true);
        b.body.enable = true;
        b.setDepth(110);
        b.setVelocity(0, 0);
        b.setData("ttl", 0.42);
        b.setData("life", 0);
        b.setData("startX", this.player.x);
        b.setData("startY", this.player.y - 10);
        b.setData("targetX", this.bombTarget.x);
        b.setData("targetY", this.bombTarget.y);
        b.setScale(1.0);

        this.blasterSoundIndex ^= 1;
        this.safePlay(this.blasterSoundIndex ? "blaster1" : "blaster2");

        this.flash(0.06);
    }

    explodeBomb(x, y, radius) {
        const g = this.add.graphics().setDepth(800);
        g.lineStyle(3, 0xfff2a8, 1);
        g.strokeCircle(x, y, radius * 0.75);
        this.tweens.add({ targets: g, alpha: 0, duration: 240, onComplete: () => g.destroy() });

        this.camera.shake(120, 0.004);
        this.flash(0.12);

        const hit = [];
        this.groundTargets.children.iterate((t) => {
            if (!t || !t.active) return;
            const d = Phaser.Math.Distance.Between(x, y, t.x, t.y);
            if (d <= radius) hit.push(t);
        });
        hit.forEach(t => this.damageGround(t, 99));

    }

    doRadarSweep() {
        this.radarSweep.setVisible(true);
        this.radarSweep.setPosition(W / 2, H + H / 2);
        this.revealHiddenTargets();
        this.tweens.add({
            targets: this.radarSweep,
            y: -H / 2,
            duration: 420,
            onComplete: () => this.radarSweep.setVisible(false)
        });
        this.flash(0.08);
    }

    revealHiddenTargets() {
        this.groundTargets.children.iterate((g) => {
            if (!g || !g.active) return;
            if (g.getData("hidden")) {
                g.setData("hidden", false);
                g.setAlpha(1.0);
            }
        });
    }

    // ---------- spawning ----------
    spawnAirWave(pattern = "zig", count = 3) {
        const kindForPattern = {
            zig: "toroid",
            dive: "torkan",
            formation: "toroid",
            sweep: "zoshi",
            materialize: "zakato",
            blockade: "bacura",
            kapiStrike: "kapi",
            jaraStrike: "jara",
            terraziStrike: "terrazi"
        };
        const kind = kindForPattern[pattern] || "toroid";
        const center = 90 + this.rng.frac() * (W - 180);

        for (let i = 0; i < count; i++) {
            const formationX = center + (i - (count - 1) / 2) * 34;
            const x = pattern === "formation" ? formationX : 55 + this.rng.frac() * (W - 110);
            const spacing = kind === "bacura" ? 92 : 42;
            const y = kind === "zakato" ? 72 + i * 52 : -50 - i * spacing;
            this.spawnAirEnemy(kind, x, y, pattern);
        }
    }

    spawnAirEnemy(kind, x, y, pattern) {
        const texMap = {
            toroid: "toroid",
            torkan: "torkan",
            zoshi: "zoshi",
            zakato: "zakato",
            bacura: "bacura",
            kapi: "kapi",
            jara: "jara",
            terrazi: "terrazi",
        };

        const texture = texMap[kind] || "toroid";
        const e = this.airEnemies.get(x, y, texture);
        if (!e) return;

        e.anims.stop();
        e.setTexture(texture);
        e.setActive(true).setVisible(true);
        e.body.enable = true;
        e.body.setSize(e.width, e.height, true);
        e.setVelocity(0, 0);
        e.setDepth(200);
        e.clearTint().setAlpha(1);

        e.setData("kind", kind);
        e.setData("pattern", pattern);
        e.setData("t", 0);
        e.setData("fired", false);
        e.setData("sweepDir", x < W / 2 ? 1 : -1);
        e.setData("sweepTurns", 0);

        const hpMap = { toroid: 1, torkan: 1, zoshi: 2, zakato: 1, bacura: 9999, kapi: 2, jara: 2, terrazi: 3 };
        e.setData("hp", hpMap[kind] ?? 1);

        const fireBase = { toroid: 99, torkan: 0.7, zoshi: 1.0, zakato: 0.18, bacura: 99, kapi: 0.35, jara: 0.55, terrazi: 0.18 };
        e.setData("fireCD", (fireBase[kind] ?? 0.9) + this.rng.frac() * 0.8);

        const scaleMap = { toroid: 1.0, torkan: 1.08, zoshi: 1.12, zakato: 1.35, bacura: 1.0, kapi: 1.0, jara: 1.05, terrazi: 1.0 };
        e.setScale(scaleMap[kind] ?? 1.0);
        e.setRotation(0);
        const animMap = {
            toroid: "toroid_fly",
            torkan: "torkan_fly",
            zoshi: "zoshi_spin",
            bacura: "bacura_fly",
            kapi: "kapi_fly",
            jara: "jara_fly",
            terrazi: "terrazi_fly"
        };
        if (animMap[kind]) e.anims.play(animMap[kind], true);
        if (kind === "zakato") e.setAlpha(0);
    }

    spawnGroundRow(count = 2, hiddenChance = 0.25) {
        const choices = [
            { kind: "logram", tex: "logram", hp: 2 },
            { kind: "zolba", tex: "zolba", hp: 2 },
            { kind: "barra", tex: "barra", hp: 1 },
            { kind: "derota", tex: "derota", hp: 3 },
            { kind: "garuDerota", tex: "garuDerota", hp: 6 },
            { kind: "sol", tex: "sol", hp: 4 },
            { kind: "grabda", tex: "grabda", hp: 2 },
        ];
        const scales = { barra: 1.25, derota: 1.3, garuDerota: 0.9, sol: 0.75, grabda: 3.1 };
        const footprints = { barra: 18, derota: 20, garuDerota: 34, sol: 34, logram: 20, zolba: 20, grabda: 28 };

        for (let i = 0; i < count; i++) {
            const pick = choices[this.rng.between(0, choices.length - 1)];
            const y = -32 - i * 48;
            const x = pick.kind === "grabda"
                ? this.findRoadGroundX(y, footprints.grabda)
                : this.findSafeGroundX(y, footprints[pick.kind] || 20);
            if (x === null) continue;
            const g = this.groundTargets.get(x, y, pick.tex);
            if (!g) continue;

            g.anims.stop();
            g.setTexture(pick.tex);
            g.setActive(true).setVisible(true);
            g.body.enable = true;
            g.body.setSize(g.width, g.height, true);
            g.setVelocity(0, 0);
            g.setFlipX(false);
            g.setDepth(90);

            g.setData("kind", pick.kind);
            g.setData("hp", pick.hp);
            g.setData("fireCD", 0.7 + this.rng.frac() * 1.3);
            g.setData("moveDir", this.rng.frac() < 0.5 ? -1 : 1);

            // Ground targets must remain readable against the detailed map.
            g.setData("hidden", false);
            g.setAlpha(1.0);

            g.setScale(scales[pick.kind] || 1.25);
            if (pick.kind === "logram") g.anims.play("logram_idle", true);
            else if (pick.kind === "zolba") g.anims.play("zolba_idle", true);
            else if (pick.kind === "derota") g.anims.play("derota_idle", true);
            else if (pick.kind === "garuDerota") g.anims.play("garu_derota_idle", true);
            else if (pick.kind === "sol") g.anims.play("sol_rise", true);
            else if (pick.kind === "grabda") g.anims.play("grabda_tread", true);
        }
    }

    findSafeGroundX(screenY, footprintRadius) {
        const candidates = [48, 84, 122, 160, 198, 236, 274, 312, 350, 388, 426];
        Phaser.Utils.Array.Shuffle(candidates);
        for (const x of candidates) {
            if (this.isSafeGroundSite(x, screenY, footprintRadius)) return x;
        }
        return null;
    }

    findRoadGroundX(screenY, footprintRadius) {
        const candidates = [32, 48, 64, 80, 96, 112, 128, 144, 160, 176, 192,
            208, 224, 240, 256, 272, 288, 304, 320, 336, 352, 368, 384, 400, 416, 432, 448];
        Phaser.Utils.Array.Shuffle(candidates);
        for (const x of candidates) {
            if (this.isRoadSite(x, screenY, footprintRadius)) return x;
        }
        return null;
    }

    terrainColorAt(screenX, screenY) {
        const mapX = Math.floor(wrap(screenX * 0.5, TERRAIN_W));
        const mapY = Math.floor(wrap(this.terrain.tilePositionY + screenY * 0.5, TERRAIN_H));
        return this.textures.getPixel(mapX, mapY, "terrain");
    }

    isRoadSite(screenX, screenY, footprintRadius = 12) {
        const offsets = [-footprintRadius * 0.45, 0, footprintRadius * 0.45];
        for (const ox of offsets) {
            for (const oy of offsets) {
                const color = this.terrainColorAt(screenX + ox, screenY + oy);
                if (!color) return false;
                const isRoad = color.r >= 105 && color.g >= 100 && color.b >= 35 &&
                    color.b < 115 && Math.abs(color.r - color.g) < 55;
                if (!isRoad) return false;
            }
        }
        return true;
    }

    isSafeGroundSite(screenX, screenY, footprintRadius) {
        const radius = footprintRadius * 0.5;
        const offsets = [-radius, -radius * 0.5, 0, radius * 0.5, radius];
        let safeSamples = 0;
        let totalSamples = 0;

        for (const ox of offsets) {
            for (const oy of offsets) {
                const mapX = Math.floor(wrap((screenX + ox) * 0.5, TERRAIN_W));
                const mapY = Math.floor(wrap(this.terrain.tilePositionY + (screenY + oy) * 0.5, TERRAIN_H));
                const color = this.textures.getPixel(mapX, mapY, "terrain");
                if (!color) return false;

                // Rivers are blue; forest and tree details are darker green.
                if (color.b > color.g || color.b > 120) return false;
                if (color.g >= 120 && color.r >= 50 && color.b < 100) safeSamples++;
                totalSamples++;
            }
        }

        // Permit sparse grass/road texture dots but reject forest boundaries.
        return safeSamples / totalSamples >= 0.88;
    }

    spawnPowerup() {
        const p = this.powerups.get(60 + this.rng.frac() * (W - 120), -40, "powerup");
        if (!p) return;
        p.setActive(true).setVisible(true);
        p.body.enable = true;
        p.setDepth(150);
        p.setData("type", this.rng.frac() < 0.62 ? "weapon" : this.rng.frac() < 0.85 ? "radar" : "speed");
        p.setData("t", 0);
    }

    // ---------- enemy updates ----------
    updateAirEnemies(dt) {
        const difficulty = clamp(1 + this.score / 25000, 1, 1.8);
        const baseDown = (105 + this.distance * 0.02) * difficulty;

        this.airEnemies.children.iterate((e) => {
            if (!e || !e.active) return;

            const t = (e.getData("t") || 0) + dt;
            e.setData("t", t);

            const kind = e.getData("kind");
            e.body.velocity.y = baseDown;

            if (kind === "toroid") {
                let dir = e.getData("sweepDir") || 1;
                const margin = 38;

                if ((dir < 0 && e.x <= margin) || (dir > 0 && e.x >= W - margin)) {
                    dir *= -1;
                    e.setData("sweepDir", dir);
                    e.setData("sweepTurns", (e.getData("sweepTurns") || 0) + 1);
                }

                if (e.y < 75) {
                    // Enter the playfield before beginning the horizontal pass.
                    e.body.velocity.x = dir * 45;
                    e.body.velocity.y = 115 * difficulty;
                } else if (t < 6.5) {
                    // Persistent edge-to-edge sweep with a restrained weave.
                    e.body.velocity.x = dir * 125 + Math.sin(t * 4.2) * 24;
                    e.body.velocity.y = 28 * difficulty + Math.cos(t * 2.4) * 14;
                } else {
                    // Retreat only after completing a readable screen pass.
                    e.body.velocity.x = dir * 80;
                    e.body.velocity.y = -205 * difficulty;
                }
            } else if (kind === "torkan") {
                e.body.velocity.x = clamp((this.player.x - e.x) * 1.3, -145, 145);
                e.body.velocity.y = t < 1.35 ? 235 * difficulty : -260 * difficulty;
                if (!e.getData("fired") && e.y > 105) {
                    this.enemyFireAtPlayer(e);
                    e.setData("fired", true);
                }
            } else if (kind === "zoshi") {
                e.body.velocity.x = clamp((this.player.x - e.x) * 1.7, -190, 190) + Math.sin(t * 8) * 95;
                e.body.velocity.y = baseDown + Math.cos(t * 5) * 65;
                e.setRotation(t * 4.5);
            } else if (kind === "zakato") {
                e.body.velocity.x = Math.sin(t * 5) * 35;
                e.body.velocity.y = 55;
                e.setAlpha(t < 0.3 ? t / 0.3 : clamp((1.8 - t) / 0.35, 0, 1));
                if (t > 1.8) {
                    e.setActive(false).setVisible(false);
                    e.body.enable = false;
                    return;
                }
            } else if (kind === "bacura") {
                e.body.velocity.x = 0;
                e.body.velocity.y = 82 * difficulty;
            } else if (kind === "kapi") {
                if (t < 1.7) {
                    e.body.velocity.x = clamp((this.player.x - e.x) * 0.9, -115, 115);
                    e.body.velocity.y = 150 * difficulty;
                } else if (t < 3.1) {
                    e.body.velocity.x = Math.sin(t * 5) * 70;
                    e.body.velocity.y = 18;
                    this.fireOnCooldown(e, dt, 0.58 / difficulty, 1);
                } else {
                    e.body.velocity.x = e.x < W / 2 ? -125 : 125;
                    e.body.velocity.y = -235 * difficulty;
                }
            } else if (kind === "jara") {
                if (t < 1.5) {
                    e.body.velocity.x = Math.sin(t * 3.2) * 55;
                    e.body.velocity.y = 125 * difficulty;
                } else if (t < 3.8) {
                    e.body.velocity.x = Math.sin(t * 2.7) * 105;
                    e.body.velocity.y = 26;
                    this.fireOnCooldown(e, dt, 0.82 / difficulty, 3, 0.12);
                } else {
                    e.body.velocity.x = e.getData("sweepDir") * 105;
                    e.body.velocity.y = -210 * difficulty;
                }
            } else if (kind === "terrazi") {
                if (t < 1.25) {
                    e.body.velocity.x = clamp((this.player.x - e.x) * 1.8, -190, 190);
                    e.body.velocity.y = 245 * difficulty;
                } else if (t < 2.35) {
                    e.body.velocity.x = clamp((this.player.x - e.x) * 0.75, -90, 90);
                    e.body.velocity.y = 8;
                    this.fireOnCooldown(e, dt, 0.30 / difficulty, 1);
                } else {
                    e.body.velocity.x = e.x < W / 2 ? -175 : 175;
                    e.body.velocity.y = -305 * difficulty;
                }
            }

            if (kind === "zoshi" || kind === "zakato") {
                let cd = (e.getData("fireCD") || 0) - dt;
                if (cd <= 0 && e.alpha > 0.75) {
                    this.enemyFireAtPlayer(e);
                    const base = kind === "zakato" ? 0.20 : 0.85;
                    e.setData("fireCD", base / difficulty + this.rng.frac() * 0.16);
                } else e.setData("fireCD", cd);
            }
        });
    }

    updateGroundTargets(dt) {
        this.groundTargets.children.iterate((g) => {
            if (!g || !g.active) return;

            g.y += this.scrollSpeed * dt;
            if (g.getData("kind") === "grabda") {
                let dir = g.getData("moveDir") || 1;
                const probeX = g.x + dir * 30;
                if (probeX < 28 || probeX > W - 28 || !this.isRoadSite(probeX, g.y, 24)) {
                    dir *= -1;
                    g.setData("moveDir", dir);
                }
                const nextX = g.x + dir * 34 * dt;
                if (this.isRoadSite(nextX, g.y, 24)) g.x = nextX;
                g.setFlipX(dir < 0);
            }

            if (g.getData("hidden") && Math.abs(g.y - this.player.y) < 120) {
                g.setData("hidden", false);
                g.setAlpha(1.0);
            }

            let cd = (g.getData("fireCD") || 0) - dt;
            if (cd <= 0) {
                g.setData("fireCD", 0.9 + this.rng.frac() * 1.4);

                if (!g.getData("hidden")) {
                    const kind = g.getData("kind");
                    const r = this.rng.frac();

                    if (kind === "logram" || kind === "zolba" || kind === "derota" || kind === "sol" || kind === "grabda") {
                        if (r < 0.60) this.groundFire(g, 1.0);
                    } else if (kind === "garuDerota") {
                        if (r < 0.45) this.groundBurst(g, 3, 0.06);
                    }
                }
            } else {
                g.setData("fireCD", cd);
            }
        });

        this.powerups.children.iterate((p) => {
            if (!p || !p.active) return;
            p.y += this.scrollSpeed * dt;
            const t = (p.getData("t") || 0) + dt;
            p.setData("t", t);
            p.x += Math.sin(t * 3.5) * 0.7;
            p.setRotation(t * 1.6);
        });

        this.craters.children.iterate((crater) => {
            if (!crater?.active) return;
            crater.y += this.scrollSpeed * dt;
        });

        this.bombs.children.iterate((b) => {
            if (!b || !b.active) return;

            let ttl = (b.getData("ttl") || 0) - dt;
            b.setData("ttl", ttl);
            const life = (b.getData("life") || 0) + dt;
            b.setData("life", life);
            const p = clamp(life / 0.42, 0, 1);
            b.setPosition(
                lerp(b.getData("startX"), b.getData("targetX"), p),
                lerp(b.getData("startY"), b.getData("targetY"), p)
            );
            b.setScale(clamp(1.0 - p * 0.45, 0.55, 1.0));

            if (ttl <= 0) {
                this.explodeBomb(b.x, b.y, this.bombRadius);
                b.setActive(false).setVisible(false);
                b.body.enable = false;
            }
        });
    }

    enemyFireAtPlayer(enemy) {
        const bullet = this.enemyBullets.get(enemy.x, enemy.y + 10, "enemyBullet");
        if (!bullet) return;
        bullet.setActive(true).setVisible(true);
        bullet.body.enable = true;

        const ang = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
        const spd = 210 + this.distance * 0.02;
        bullet.setVelocity(Math.cos(ang) * spd, Math.sin(ang) * spd);
    }

    fireOnCooldown(enemy, dt, cooldown, count = 1, spread = 0) {
        let cd = (enemy.getData("fireCD") || 0) - dt;
        if (cd > 0) {
            enemy.setData("fireCD", cd);
            return;
        }

        enemy.setData("fireCD", cooldown + this.rng.frac() * 0.12);
        const aim = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
        const speed = 215 + this.distance * 0.02;
        for (let i = 0; i < count; i++) {
            const bullet = this.enemyBullets.get(enemy.x, enemy.y + 10, "enemyBullet");
            if (!bullet) continue;
            bullet.setActive(true).setVisible(true);
            bullet.body.enable = true;
            const angle = aim + (i - (count - 1) / 2) * spread;
            bullet.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
        }
    }

    groundFire(g, accuracy = 0.75) {
        const bullet = this.enemyBullets.get(g.x, g.y - 8, "enemyBullet");
        if (!bullet) return;
        bullet.setActive(true).setVisible(true);
        bullet.body.enable = true;

        const ang = Phaser.Math.Angle.Between(g.x, g.y, this.player.x, this.player.y);
        const spread = (1 - accuracy) * 0.35;
        const a = ang + this.rng.realInRange(-spread, spread);

        const spd = 185 + this.distance * 0.015;
        bullet.setVelocity(Math.cos(a) * spd * 0.75, Math.sin(a) * spd * 0.75);
    }

    groundBurst(g, shots = 3, gap = 0.06) {
        for (let i = 0; i < shots; i++) {
            this.time.delayedCall(i * gap * 1000, () => {
                if (!g.active) return;
                this.groundFire(g, 0.85);
            });
        }
    }

    // ---------- boss ----------
    spawnBoss() {
        this.airEnemies.clear(true, true);

        this.boss = this.physics.add.sprite(W / 2, -120, "boss").setDepth(500);
        this.boss.setData("t", 0);
        this.boss.setImmovable(true);
        this.bossWeakPoints.clear(true, true);

        const offsets = [[0, 0], [-60, -30], [60, -30], [-50, 42], [50, 42]];
        offsets.forEach(([ox, oy], index) => {
            const point = this.add.circle(this.boss.x + ox, this.boss.y + oy, index === 0 ? 12 : 9,
                index === 0 ? 0xffd65a : 0xff5d5d, 0.95).setDepth(520);
            this.physics.add.existing(point);
            point.body.setCircle(index === 0 ? 12 : 9);
            point.setData("offsetX", ox);
            point.setData("offsetY", oy);
            point.setData("hp", index === 0 ? 10 : 6);
            this.bossWeakPoints.add(point);
        });

        this.flash(0.18);
        this.camera.shake(200, 0.006);
        this.safePlay("andorAppear");

    }

    updateBoss(dt) {
        if (!this.boss || !this.boss.active) return;
        if (this.boss.getData("defeated")) return;

        const t = (this.boss.getData("t") || 0) + dt;
        this.boss.setData("t", t);

        if (this.boss.y < 140) this.boss.y += 80 * dt;
        else this.boss.x = W / 2 + Math.sin(t * 0.9) * 140;

        this.bossWeakPoints.children.iterate((point) => {
            if (!point?.active) return;
            point.setPosition(this.boss.x + point.getData("offsetX"), this.boss.y + point.getData("offsetY"));
            point.body.updateFromGameObject();
        });
        if (this.boss.y < 140) return;

        let hp = 0;
        this.bossWeakPoints.children.iterate((point) => { if (point?.active) hp += point.getData("hp") || 0; });
        let phase = 0;
        if (hp <= 24) phase = 1;
        if (hp <= 10) phase = 2;

        let cd = (this.boss.getData("fireCD") ?? 0.6) - dt;
        if (cd <= 0) {
            if (phase === 0) { this.bossRadial(7, 210); cd = 0.85; }
            else if (phase === 1) { this.bossRadial(11, 235); this.bossAimBurst(3, 260); cd = 0.75; }
            else { this.bossRadial(15, 250); this.bossAimBurst(5, 280); cd = 0.60; }
        }
        this.boss.setData("fireCD", cd);

        this.boss.y += this.scrollSpeed * dt * 0.04;
        if (this.boss.y > H * 0.35) this.boss.y = H * 0.35;
    }

    bossRadial(n, spd) {
        const base = Math.PI / 2;
        for (let i = 0; i < n; i++) {
            const a = base + (i - (n - 1) / 2) * 0.20;
            const b = this.enemyBullets.get(this.boss.x, this.boss.y + 15, "enemyBullet");
            if (!b) continue;
            b.setActive(true).setVisible(true);
            b.body.enable = true;
            b.setVelocity(Math.cos(a) * spd, Math.sin(a) * spd);
        }
    }

    bossAimBurst(count, spd) {
        const ang = Phaser.Math.Angle.Between(this.boss.x, this.boss.y, this.player.x, this.player.y);
        for (let i = 0; i < count; i++) {
            const a = ang + (i - (count - 1) / 2) * 0.10;
            const b = this.enemyBullets.get(this.boss.x, this.boss.y + 20, "enemyBullet");
            if (!b) continue;
            b.setActive(true).setVisible(true);
            b.body.enable = true;
            b.setVelocity(Math.cos(a) * spd, Math.sin(a) * spd);
        }
    }

    damageBoss(dmg, point) {
        if (!point?.active) return;
        const hp = point.getData("hp") - dmg;
        point.setData("hp", hp);
        this.flash(0.03);
        if (hp <= 0) {
            this.safePlay("airHit");
            this.spawnEnemyExplosion(point.x, point.y);
            point.setActive(false).setVisible(false);
            point.body.enable = false;
            this.addScore(1000);
        }
        if (this.bossWeakPoints.countActive(true) === 0) this.killBoss();
    }

    killBoss() {
        this.boss.setData("defeated", true);
        this.addScore(15000);
        this.camera.shake(260, 0.008);
        this.flash(0.25);
        this.safePlay("airHit");

        for (let i = 0; i < 10; i++) {
            this.time.delayedCall(i * 80, () => this.spawnEnemyExplosion(
                this.boss.x + this.rng.between(-50, 50),
                this.boss.y + this.rng.between(-30, 30)
            ));
        }

        this.time.delayedCall(900, () => {
            this.bossWeakPoints.clear(true, true);
            this.boss.destroy();
            this.boss = null;
            this.bossActive = false;

            // loop
            this.distance = 0;
            this.nextScriptIndex = 0;
            this.scrollSpeed = 180;
            this.weaponLevel = 3;
            this.radarCharges = Math.min(5, this.radarCharges + 2);
            this.flash(0.12);
        });
    }

    // ---------- collisions / scoring ----------
    onShotHitsAir(shot, enemy) {
        if (!shot.active || !enemy.active) return;
        shot.setActive(false).setVisible(false);
        shot.body.enable = false;
        if (enemy.getData("kind") === "bacura") {
            this.safePlay("bacuraHit");
            enemy.setTintFill(0xffffff);
            this.time.delayedCall(50, () => { if (enemy.active) enemy.clearTint(); });
            return;
        }
        this.damageAir(enemy, 1);
    }

    onBombTouchesGround(bomb, ground) {
        if (!bomb.active || !ground.active) return;
        this.explodeBomb(bomb.x, bomb.y, this.bombRadius);
        bomb.setActive(false).setVisible(false);
        bomb.body.enable = false;
    }

    damageAir(enemy, dmg) {
        enemy.setData("hp", (enemy.getData("hp") || 1) - dmg);
        if (enemy.getData("hp") <= 0) {
            this.safePlay("airHit");
            this.killEntity(enemy);
            this.addScore(this.applyCombo(120));
            if (this.rng.frac() < 0.08) this.spawnPowerup();
        }
    }

    damageGround(g, dmg) {
        g.setData("hp", (g.getData("hp") || 1) - dmg);
        if (g.getData("hp") <= 0) {
            this.safePlay("groundHit");
            this.spawnCrater(g.x, g.y);
            this.killEntity(g);
            this.addScore(this.applyCombo(170));
            if (this.rng.frac() < 0.09) this.spawnPowerup();
        }
    }

    killEntity(e) {
        this.spawnEnemyExplosion(e.x, e.y);
        e.setActive(false).setVisible(false);
        e.body.enable = false;
    }

    onPlayerHit() {
        if (this.playerInvuln > 0) return;
        this.loseLife();
    }

    onPlayerHitByBullet(player, bullet) {
        if (this.playerInvuln > 0) return;
        bullet.setActive(false).setVisible(false);
        bullet.body.enable = false;
        this.loseLife();
    }

    loseLife() {
        this.lives -= 1;
        this.combo = 0;
        this.comboTimer = 0;

        this.camera.shake(190, 0.006);
        this.flash(0.22);
        this.spawnPlayerExplosion(this.player.x, this.player.y);
        this.safePlay("solvalouExplosion");

        this.playerInvuln = 2.2;
        this.weaponLevel = Math.max(1, this.weaponLevel - 1);
        this.radarCharges = Math.max(0, this.radarCharges - 1);
        this.player.setVelocity(0, 0);
        this.player.setVisible(false);
        this.player.body.enable = false;
        this.bombTarget.setVisible(false);

        if (this.lives <= 0) {
            this.gameOver();
        } else {
            this.time.delayedCall(780, () => {
                this.player.setPosition(W / 2, H * 0.78);
                this.player.body.enable = true;
                this.player.setVisible(true);
                this.bombTarget.setVisible(true);
            });
        }
    }

    gameOver() {
        this.isPaused = true;
        this.add.bitmapText(W / 2, H / 2, "xeviousFont",
            `GAME OVER\nSCORE ${this.score}\n\nPress R to restart`, 18)
            .setLetterSpacing(-3).setTint(0xffffff).setCenterAlign()
            .setOrigin(0.5).setDepth(5000);
    }

    onPickupPowerup(player, p) {
        if (!p.active) return;

        const type = p.getData("type");
        p.setActive(false).setVisible(false);
        p.body.enable = false;

        if (type === "weapon") { this.weaponLevel = Math.min(3, this.weaponLevel + 1); this.addScore(800); }
        else if (type === "speed") { this.scrollSpeed = Math.min(260, this.scrollSpeed + 12); this.addScore(500); }
        else if (type === "radar") { this.radarCharges = Math.min(5, this.radarCharges + 1); this.addScore(650); }

        this.safePlay("credit");
        this.flash(0.10);
    }

    applyCombo(base) {
        this.combo = Math.min(12, this.combo + 1);
        this.comboTimer = 2.0;
        return Math.floor(base * (1 + (this.combo - 1) * 0.10));
    }

    addScore(v) { this.score += v; }

    spawnEnemyExplosion(x, y) {
        const s = this.add.sprite(x, y, "enemyExplosion").setDepth(900);
        s.play("enemyExplosionAnim");
        s.once("animationcomplete", () => s.destroy());
    }

    spawnCrater(x, y) {
        const crater = this.craters.get(x, y, "crater");
        if (!crater) return;
        crater.setTexture("crater").setActive(true).setVisible(true)
            .setDepth(85).setAlpha(1).setScale(0.65);
        this.tweens.add({
            targets: crater,
            scale: 1.2,
            duration: 180,
            ease: "Back.Out"
        });
    }

    spawnPlayerExplosion(x, y) {
        const s = this.add.sprite(x, y, "solvalouExplosion").setDepth(950);
        s.play("solvalouExplosionAnim");
        s.once("animationcomplete", () => s.destroy());
    }

    flash(strength = 0.12) {
        this.flashRect.setAlpha(strength);
        this.tweens.add({ targets: this.flashRect, alpha: 0, duration: 120 });
    }

    cleanupGroup(group, minY, maxY) {
        group.children.iterate((c) => {
            if (!c || !c.active) return;
            if (c.y < minY || c.y > maxY || c.x < -160 || c.x > W + 160) {
                c.setActive(false).setVisible(false);
                if (c.body) c.body.enable = false;
            }
        });
    }

    safeAddSound(key, volume, loop = false) {
        try { return this.sound.add(key, { volume, loop }); } catch { return null; }
    }

    safePlay(name) {
        const s = this.sfx?.[name];
        if (!s) return;
        if (s.isPlaying) return;
        s.play();
    }
}

// ---------- stage script ----------
function makeStageScript() {
    const s = [];
    let d = 18;

    s.push({ at: d, type: "groundRow", count: 3, hiddenChance: 0 }); d += 22;
    s.push({ at: d, type: "airWave", pattern: "zig", count: 3 }); d += 45;
    s.push({ at: d, type: "groundRow", count: 2, hiddenChance: 0 }); d += 55;

    s.push({ at: d, type: "airWave", pattern: "dive", count: 3 }); d += 65;
    s.push({ at: d, type: "airWave", pattern: "kapiStrike", count: 3 }); d += 60;
    s.push({ at: d, type: "airWave", pattern: "sweep", count: 2 }); d += 70;
    s.push({ at: d, type: "airWave", pattern: "jaraStrike", count: 2 }); d += 65;
    s.push({ at: d, type: "airWave", pattern: "materialize", count: 2 }); d += 75;
    s.push({ at: d, type: "airWave", pattern: "terraziStrike", count: 2 }); d += 65;
    s.push({ at: d, type: "airWave", pattern: "blockade", count: 2 }); d += 80;

    s.push({ at: d, type: "airWave", pattern: "formation", count: 5 }); d += 80;
    s.push({ at: d, type: "powerup" }); d += 80;

    for (let i = 0; i < 10; i++) {
        const patterns = ["zig", "kapiStrike", "dive", "jaraStrike", "sweep", "terraziStrike", "materialize", "blockade"];
        s.push({ at: d, type: "airWave", pattern: patterns[i % patterns.length], count: 2 + (i % 4) }); d += 55;
        s.push({ at: d, type: "groundRow", count: 2 + (i % 3 === 0 ? 1 : 0), hiddenChance: 0 }); d += 55;
        if (i === 4) s.push({ at: d, type: "radarCharge", amount: 1 });
    }

    return s;
}

