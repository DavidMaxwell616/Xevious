import { GROUND_MAP } from "./GroundMap.js";

const W = 480;
const H = 600;
const BULLET_SPEED = 590;
const TERRAIN_W = 256;
const TERRAIN_H = 2900;
const TERRAIN_SCALE = 2;
const TERRAIN_SEGMENT_HEIGHT = TERRAIN_H * TERRAIN_SCALE;
const TERRAIN_KEYS = ["terrain", "terrain2", "terrain3", "terrain4"];
const TOTAL_TERRAIN_TRAVEL = TERRAIN_KEYS.length * TERRAIN_SEGMENT_HEIGHT - H;
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }

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
        this.terrainTravel = 0;
        this.groundScrollDelta = 0;
        this.nextScriptIndex = 0;
        this.nextGroundIndex = 0;
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
        this.bacuraWaveNumber = 0;

        // cooldowns
        this.playerInvuln = 0;
        this.shotCooldown = 0;
        this.bombCooldown = 0;
        this.bombKeyWasDown = false;
        this.activeBomb = null;
        this.radarCooldown = 0;

        // backgrounds
        this.terrainSegments = TERRAIN_KEYS.map((key, index) => this.add.image(
            W / 2,
            H - TERRAIN_SEGMENT_HEIGHT - index * TERRAIN_SEGMENT_HEIGHT,
            key
        ).setOrigin(0.5, 0).setScale(TERRAIN_SCALE).setDepth(0));

        // groups
        this.playerShots = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, maxSize: 160 });
        this.bombs = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, maxSize: 40 });
        this.airEnemies = this.physics.add.group({ classType: Phaser.Physics.Arcade.Sprite, maxSize: 100 });
        this.groundTargets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Sprite, maxSize: 120 });
        this.enemyBullets = this.physics.add.group({ classType: Phaser.Physics.Arcade.Image, maxSize: 260 });
        this.powerups = this.physics.add.group({ classType: Phaser.Physics.Arcade.Sprite, maxSize: 30 });
        this.craters = this.add.group({ classType: Phaser.GameObjects.Sprite, maxSize: 120 });

        // player
        this.player = this.physics.add.sprite(W / 2, H * 0.78, "player").setDepth(50);
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
        // Scroll from the bottom of Terrain 1 through Terrain 4 exactly once.
        const remainingTerrain = Math.max(0, TOTAL_TERRAIN_TRAVEL - this.terrainTravel);
        this.groundScrollDelta = this.bossActive ? 0 : Math.min(this.scrollSpeed * dt, remainingTerrain);
        this.terrainTravel += this.groundScrollDelta;
        this.distance += this.groundScrollDelta * 0.06;

        // background scroll (correct direction)
        this.terrainSegments.forEach((segment) => { segment.y += this.groundScrollDelta; });

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
        const bombKeyDown = this.keys.bomb.isDown;
        if (this.player.visible && bombKeyDown && !this.bombKeyWasDown && this.bombCooldown <= 0) {
            this.dropBomb();
            this.bombCooldown = 0.58;
        }
        this.bombKeyWasDown = bombKeyDown;

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
        this.spawnMappedGroundTargets();
        this.updateBombTargetLock();
        this.updateBoss(dt);

        // cleanup
        this.cleanupGroup(this.playerShots, -80, H + 80);
        this.cleanupGroup(this.enemyBullets, -120, H + 120);
        this.cleanupGroup(this.airEnemies, -1600, H + 160);
        // Ground units may be pre-positioned well ahead in the stitched map.
        this.cleanupGroup(this.groundTargets, -1600, H + 160);
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
        if (!this.bossActive && this.terrainTravel >= TOTAL_TERRAIN_TRAVEL) {
            this.spawnBoss();
            this.bossActive = true;
        }
        if (this.bossActive) return;

        while (this.nextScriptIndex < this.stageScript.length &&
            this.distance >= this.stageScript[this.nextScriptIndex].at) {
            const ev = this.stageScript[this.nextScriptIndex];
            if (ev.type === "airWave") {
                const bonus = Math.min(2, Math.floor(this.score / 12000));
                const count = ev.pattern === "blockade" ? 12 : Math.max(5, ev.count + bonus);
                this.spawnAirWave(ev.pattern, count);
                this.waveNumber++;
            }
            if (ev.type === "powerup") this.spawnPowerup();
            if (ev.type === "radarCharge") this.radarCharges = Math.min(5, this.radarCharges + (ev.amount || 1));
            this.nextScriptIndex++;
        }
    }

    // ---------- weapons ----------
    fireShot() {
        const px = this.player.x, py = this.player.y - 18;
        const configs = [
            [{ dx: 0, dy: -BULLET_SPEED }],
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
            b.setScale(2);
            b.body.setSize(b.width * 2, b.height * 2, true);
            b.setVelocity(s.dx, s.dy);
            b.setData("damage", 1);
        }
        this.zapperSoundIndex ^= 1;
        this.safePlay(this.zapperSoundIndex ? "zapper1" : "zapper2");
    }

    dropBomb() {
        if (this.activeBomb?.active) return;
        const b = this.bombs.get(this.player.x, this.player.y - 10, "bomb");
        if (!b) return;

        this.activeBomb = b;
        b.setActive(true).setVisible(true);
        b.body.enable = true;
        b.setDepth(110);
        b.setVelocity(0, 0);
        b.setData("ttl", 0.42);
        b.setData("life", 0);
        b.setData("detonated", false);
        b.setData("startX", this.player.x);
        b.setData("startY", this.player.y - 10);
        b.setData("targetX", this.bombTarget.x);
        b.setData("targetY", this.bombTarget.y);
        b.setScale(2);
        b.body.setSize(b.width * 2, b.height * 2, true);

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
        hit.forEach(t => this.damageGround(t, t.getData("twoHit") ? 1 : 99));

    }

    detonateBomb(bomb) {
        if (!bomb?.active || bomb.getData("detonated")) return;
        bomb.setData("detonated", true);
        const x = bomb.x;
        const y = bomb.y;
        bomb.setActive(false).setVisible(false);
        bomb.body.enable = false;
        if (this.activeBomb === bomb) this.activeBomb = null;
        this.explodeBomb(x, y, this.bombRadius);
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

    updateBombTargetLock() {
        let locked = false;
        this.groundTargets.children.iterate((ground) => {
            if (locked || !ground?.active || !ground.visible) return;
            if (ground.getBounds().contains(this.bombTarget.x, this.bombTarget.y)) locked = true;
        });

        if (locked) this.bombTarget.setTintFill(0xff0000);
        else this.bombTarget.clearTint();
        this.bombTarget.setData("locked", locked);
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
        if (kind === "toroid") count = Math.max(5, count);
        count *= 2;

        if (kind === "toroid") {
            const startLeft = this.rng.frac() < 0.5;
            const startX = startLeft ? 58 : W - 58;
            const chain = { leader: null, path: [], lastX: startX, lastY: -50 };
            for (let p = 0; p < 90; p++) chain.path.push({ x: startX, y: -50 - p * 8 });

            for (let i = 0; i < count; i++) {
                const e = this.spawnAirEnemy("toroid", startX, -50 - i * 56, pattern);
                if (!e) continue;
                e.setData("chain", chain);
                e.setData("chainIndex", i);
                e.setData("sweepDir", startLeft ? 1 : -1);
                if (i === 0) chain.leader = e;
            }
            return;
        }

        if (kind === "bacura") {
            const lanes = [48, 112, 176, 240, 304, 368, 432];
            const boardsPerRow = 3;
            const rows = 2 + this.bacuraWaveNumber++;
            for (let row = 0; row < rows; row++) {
                const available = [...lanes];
                Phaser.Utils.Array.Shuffle(available);
                const selected = available.slice(0, boardsPerRow).sort((a, b) => a - b);
                for (const lane of selected) {
                    const x = clamp(lane + this.rng.between(-10, 10), 38, W - 38);
                    const y = -50 - row * 105 + this.rng.between(-12, 12);
                    this.spawnAirEnemy("bacura", x, y, "blockade");
                }
            }
            return;
        }

        for (let i = 0; i < count; i++) {
            const x = 55 + this.rng.frac() * (W - 110);
            const spacing = 42;
            const y = kind === "zakato" ? -8 + i * 52 : -50 - i * spacing;
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
        e.setData("retreatFired", false);
        e.setData("enteredPlayfield", false);
        const retreatTimes = { toroid: 6.5, torkan: 1.35, kapi: 3.1, jara: 3.8, terrazi: 2.35 };
        e.setData("retreatAt", retreatTimes[kind] ? retreatTimes[kind] * (0.9 + this.rng.frac() * 0.2) : null);
        e.setData("chain", null);
        e.setData("chainIndex", 0);
        e.setData("sweepDir", x < W / 2 ? 1 : -1);
        e.setData("sweepTurns", 0);

        const hpMap = { toroid: 1, torkan: 1, zoshi: 2, zakato: 1, bacura: 9999, kapi: 2, jara: 2, terrazi: 3 };
        e.setData("hp", hpMap[kind] ?? 1);

        const fireBase = { toroid: 99, torkan: 0.7, zoshi: 1.0, zakato: 0.18, bacura: 99, kapi: 0.35, jara: 0.55, terrazi: 0.18 };
        e.setData("fireCD", (fireBase[kind] ?? 0.9) + this.rng.frac() * 0.8);

        const scaleMap = { toroid: 1.0, torkan: 1.08, zoshi: 1.12, zakato: 1.35, bacura: 1.0, kapi: 1.0, jara: 1.0, terrazi: 1.0 };
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
        return e;
    }

    spawnMappedGroundTargets() {
        while (this.nextGroundIndex < GROUND_MAP.length) {
            const site = GROUND_MAP[this.nextGroundIndex];
            const x = W / 2 - TERRAIN_W * TERRAIN_SCALE / 2 + site.x * TERRAIN_SCALE;
            const y = this.terrainSegments[site.segment].y + site.y * TERRAIN_SCALE;
            if (y < -80) break;
            if (y > H + 80) {
                this.nextGroundIndex++;
                continue;
            }
            if (!this.spawnGroundTarget(site.kind, x, y, site)) break;
            this.nextGroundIndex++;
        }
    }

    spawnGroundTarget(kind, x, y, site) {
        const hp = { logram: 2, zolba: 2, barra: 1, derota: 3, grabda: 2, garuBara: 2, garuDerotaStatic: 2, bozaLogram: 1, domogram: 1 };
        const twoHit = kind === "garuBara" || kind === "garuDerotaStatic";
        const g = this.groundTargets.get(x, y, kind);
        if (!g) return false;
        g.anims.stop();
        g.setTexture(kind).setActive(true).setVisible(true);
        if (twoHit) g.setFrame(0);
        g.setScale(kind === "grabda" ? 2 : kind === "bozaLogram" ? 1.7 : twoHit ? 2 : kind === "domogram" ? 2.4 : 1.2);
        g.body.enable = true;
        g.body.setSize(g.width, g.height, true);
        g.setVelocity(0, 0).setFlipX(false).setDepth(90).setAlpha(1);
        g.setData("kind", kind);
        g.setRotation(0);
        g.setData("roadSite", site);
        if (kind === "grabda") {
            // Start at the nearest point along the route, including straight spans.
            let closest = { distance: Infinity, index: 0, x: site.x, y: site.y };
            for (let i = 0; i < site.path.length - 1; i++) {
                const [ax, ay] = site.path[i], [bx, by] = site.path[i + 1];
                const dx = bx - ax, dy = by - ay;
                const t = clamp(((site.x - ax) * dx + (site.y - ay) * dy) / (dx * dx + dy * dy), 0, 1);
                const px = ax + dx * t, py = ay + dy * t;
                const distance = Math.hypot(site.x - px, site.y - py);
                if (distance < closest.distance) closest = { distance, index: i + 1, x: px, y: py };
            }
            g.setData("roadPosition", { x: closest.x, y: closest.y });
            g.setData("roadIndex", closest.index);
            g.setData("roadDirection", 1);
        }
        g.setData("hp", hp[kind]);
        g.setData("twoHit", twoHit);
        g.setData("destroyed", false);
        g.setData("hidden", false);
        g.setData("fireCD", 0.7 + this.rng.frac() * 1.3);
        g.setData("moveDir", this.rng.frac() < 0.5 ? -1 : 1);
        const animations = { logram: "logram_idle", zolba: "zolba_idle", derota: "derota_idle", grabda: "grabda_tread", bozaLogram: "boza_logram_idle", domogram: "domogram_idle" };
        g.setData("canFire", Boolean(animations[kind]));
        if (animations[kind]) g.anims.play(animations[kind], true);
        return true;
    }

    terrainColorAt(screenX, screenY) {
        const displayLeft = W / 2 - TERRAIN_W * TERRAIN_SCALE / 2;
        const mapX = Math.floor((screenX - displayLeft) / TERRAIN_SCALE);
        if (mapX < 0 || mapX >= TERRAIN_W) return null;

        for (let i = 0; i < this.terrainSegments.length; i++) {
            const segment = this.terrainSegments[i];
            if (screenY < segment.y || screenY >= segment.y + TERRAIN_SEGMENT_HEIGHT) continue;
            const mapY = Math.floor((screenY - segment.y) / TERRAIN_SCALE);
            return this.textures.getPixel(mapX, mapY, TERRAIN_KEYS[i]);
        }
        return null;
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

    isClearingSite(screenX, screenY, footprintRadius) {
        const radius = footprintRadius * 0.5;
        const offsets = [-radius, -radius * 0.5, 0, radius * 0.5, radius];
        let clearingSamples = 0;
        let totalSamples = 0;

        for (const ox of offsets) {
            for (const oy of offsets) {
                const color = this.terrainColorAt(screenX + ox, screenY + oy);
                if (!color) return false;

                // Rivers are blue, roads are tan, and forest/trees are dark.
                if (color.b > color.g || color.b > 120) return false;
                const isBrightClearing = color.g >= 120 && color.g - color.r >= 42 && color.b < 85;
                if (isBrightClearing) clearingSamples++;
                totalSamples++;
            }
        }

        // Allow one small grass texture fleck, but never a tree line or road.
        return clearingSamples / totalSamples >= 0.96;
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

            const kind = e.getData("kind");
            const retreatAt = e.getData("retreatAt");
            if (e.y >= 0) e.setData("enteredPlayfield", true);
            const t = (e.getData("t") || 0) + (!retreatAt || e.getData("enteredPlayfield") ? dt : 0);
            e.setData("t", t);
            e.body.velocity.y = baseDown;

            if (kind !== "toroid" && retreatAt && t >= retreatAt) {
                this.fireBeforeRetreat(e);
                const chain = e.getData("chain");
                if (chain?.leader === e) chain.leader = null;
                e.setData("chain", null);
                const speeds = { toroid: 205, torkan: 260, kapi: 235, jara: 210, terrazi: 305 };
                e.body.velocity.x = (e.getData("sweepDir") || 1) * 80;
                e.body.velocity.y = -speeds[kind] * difficulty;
                e.setRotation(clamp(e.body.velocity.x / 300, -1, 1) * 0.18);
                return;
            }

            if (kind === "toroid") {
                const chain = e.getData("chain");
                if (chain && (!chain.leader || !chain.leader.active)) {
                    chain.leader = e;
                    e.setData("chainIndex", 0);
                    chain.lastX = e.x;
                    chain.lastY = e.y;
                }

                if (chain && chain.leader !== e) {
                    if (chain.leader.getData("retreatFired")) this.fireBeforeRetreat(e);
                    const trailIndex = Math.min(
                        chain.path.length - 1,
                        Math.max(1, (e.getData("chainIndex") || 1) * 7)
                    );
                    const target = chain.path[trailIndex];
                    const angle = Phaser.Math.Angle.Between(e.x, e.y, target.x, target.y);
                    const distance = Phaser.Math.Distance.Between(e.x, e.y, target.x, target.y);
                    const speed = clamp(distance * 5.5, 90, 250 * difficulty);
                    e.body.velocity.x = Math.cos(angle) * speed;
                    e.body.velocity.y = Math.sin(angle) * speed;
                    e.setRotation(clamp(e.body.velocity.x / 300, -1, 1) * 0.18);
                    return;
                }

                let dir = e.getData("sweepDir") || 1;
                const margin = 38;

                if ((dir < 0 && e.x <= margin) || (dir > 0 && e.x >= W - margin)) {
                    dir *= -1;
                    e.setData("sweepDir", dir);
                    e.setData("sweepTurns", (e.getData("sweepTurns") || 0) + 1);
                }

                if (e.getData("retreatFired") || (t >= retreatAt && e.y >= H * 0.55)) {
                    // Keep recording the leader's escape path for the formation.
                    this.fireBeforeRetreat(e);
                    e.body.velocity.x = dir * 80;
                    e.body.velocity.y = -205 * difficulty;
                } else if (e.y < 75) {
                    // Enter the playfield before beginning the horizontal pass.
                    e.body.velocity.x = dir * 45;
                    e.body.velocity.y = 115 * difficulty;
                } else {
                    // Persistent edge-to-edge sweep with a restrained weave.
                    e.body.velocity.x = dir * 125 + Math.sin(t * 4.2) * 24;
                    e.body.velocity.y = 28 * difficulty + Math.cos(t * 2.4) * 14;
                }

                if (chain) {
                    const moved = Phaser.Math.Distance.Between(chain.lastX, chain.lastY, e.x, e.y);
                    if (moved >= 7) {
                        chain.path.unshift({ x: e.x, y: e.y });
                        chain.path.length = Math.min(chain.path.length, 180);
                        chain.lastX = e.x;
                        chain.lastY = e.y;
                    }
                }
            } else if (kind === "torkan") {
                e.body.velocity.x = clamp((this.player.x - e.x) * 1.3, -145, 145);
                e.body.velocity.y = 235 * difficulty;
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
                } else {
                    e.body.velocity.x = Math.sin(t * 5) * 70;
                    e.body.velocity.y = 18;
                    this.fireOnCooldown(e, dt, 0.58 / difficulty, 1);
                }
            } else if (kind === "jara") {
                if (t < 1.5) {
                    e.body.velocity.x = Math.sin(t * 3.2) * 55;
                    e.body.velocity.y = 125 * difficulty;
                } else {
                    e.body.velocity.x = Math.sin(t * 2.7) * 105;
                    e.body.velocity.y = 26;
                    this.fireOnCooldown(e, dt, 0.82 / difficulty, 3, 0.12);
                }
            } else if (kind === "terrazi") {
                if (t < 1.25) {
                    e.body.velocity.x = clamp((this.player.x - e.x) * 1.8, -190, 190);
                    e.body.velocity.y = 245 * difficulty;
                } else {
                    e.body.velocity.x = clamp((this.player.x - e.x) * 0.75, -90, 90);
                    e.body.velocity.y = 8;
                    this.fireOnCooldown(e, dt, 0.30 / difficulty, 1);
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

    updateRoadTank(tank, dt) {
        const site = tank.getData("roadSite");
        const position = tank.getData("roadPosition");
        let index = tank.getData("roadIndex");
        let direction = tank.getData("roadDirection");
        let remaining = 17 * dt; // Image pixels per second (34 screen pixels).
        while (remaining > 0) {
            const [x, y] = site.path[index];
            const dx = x - position.x, dy = y - position.y;
            const distance = Math.hypot(dx, dy);
            if (distance > 0) {
                const step = Math.min(remaining, distance);
                position.x += dx / distance * step;
                position.y += dy / distance * step;
                tank.setRotation(Math.atan2(dy, dx) + Math.PI / 2);
                remaining -= step;
                if (step < distance) break;
            }
            if (index + direction < 0 || index + direction >= site.path.length) {
                // The road centerline ends at forest, water, or the map edge.
                direction *= -1;
            }
            index += direction;
        }
        tank.setData("roadIndex", index);
        tank.setData("roadDirection", direction);
        tank.setPosition(W / 2 - TERRAIN_W * TERRAIN_SCALE / 2 + position.x * TERRAIN_SCALE,
            this.terrainSegments[site.segment].y + position.y * TERRAIN_SCALE);
    }

    updateGroundTargets(dt) {
        this.groundTargets.children.iterate((g) => {
            if (!g || !g.active) return;

            g.y += this.groundScrollDelta;
            if (g.getData("kind") === "grabda") this.updateRoadTank(g, dt);

            if (g.getData("hidden") && Math.abs(g.y - this.player.y) < 120) {
                g.setData("hidden", false);
                g.setAlpha(1.0);
            }

            let cd = (g.getData("fireCD") || 0) - dt;
            if (cd <= 0) {
                g.setData("fireCD", 0.9 + this.rng.frac() * 1.4);

                if (g.getData("canFire") && !g.getData("hidden") && g.y > 10 && g.y < H - 20) {
                    const kind = g.getData("kind");
                    const r = this.rng.frac();

                    if (kind === "bozaLogram") {
                        this.bozaLogramFire(g);
                    } else if (kind === "logram" || kind === "zolba" || kind === "derota" || kind === "sol" || kind === "grabda" || kind === "domogram") {
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
            p.y += this.groundScrollDelta;
            const t = (p.getData("t") || 0) + dt;
            p.setData("t", t);
            p.x += Math.sin(t * 3.5) * 0.7;
            p.setRotation(t * 1.6);
        });

        this.craters.children.iterate((crater) => {
            if (!crater?.active) return;
            crater.y += this.groundScrollDelta;
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
            const bombScale = clamp(2.0 - p * 0.9, 1.1, 2.0);
            b.setScale(bombScale);
            b.body.setSize(b.width * bombScale, b.height * bombScale, true);

            if (ttl <= 0) {
                this.detonateBomb(b);
            }
        });
    }

    fireBeforeRetreat(enemy) {
        if (enemy.getData("retreatFired")) return;
        this.enemyFireAtPlayer(enemy);
        enemy.setData("retreatFired", true);
    }

    launchEnemyBullet(bullet, angle) {
        // Select again on every shot, including reused pooled bullets.
        bullet.setFrame(this.rng.between(0, 3));
        // The bullet artwork points up; Phaser angles start at the right.
        bullet.setRotation(angle + Math.PI / 2);
        bullet.setVelocity(Math.cos(angle) * BULLET_SPEED, Math.sin(angle) * BULLET_SPEED);
    }

    enemyFireAtPlayer(enemy) {
        const bullet = this.enemyBullets.get(enemy.x, enemy.y + 10, "enemyBullet");
        if (!bullet) return;
        bullet.setActive(true).setVisible(true);
        bullet.body.enable = true;
        bullet.setScale(2);
        bullet.body.setSize(bullet.width * 2, bullet.height * 2, true);

        const ang = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
        this.launchEnemyBullet(bullet, ang);
    }

    fireOnCooldown(enemy, dt, cooldown, count = 1, spread = 0) {
        let cd = (enemy.getData("fireCD") || 0) - dt;
        if (cd > 0) {
            enemy.setData("fireCD", cd);
            return;
        }

        enemy.setData("fireCD", cooldown + this.rng.frac() * 0.12);
        const aim = Phaser.Math.Angle.Between(enemy.x, enemy.y, this.player.x, this.player.y);
        for (let i = 0; i < count; i++) {
            const bullet = this.enemyBullets.get(enemy.x, enemy.y + 10, "enemyBullet");
            if (!bullet) continue;
            bullet.setActive(true).setVisible(true);
            bullet.body.enable = true;
            bullet.setScale(2);
            bullet.body.setSize(bullet.width * 2, bullet.height * 2, true);
            const angle = aim + (i - (count - 1) / 2) * spread;
            this.launchEnemyBullet(bullet, angle);
        }
    }

    bozaLogramFire(g) {
        if (!g.active || !g.getData("canFire")) return;
        for (const [dx, dy, angle] of [
            [0, -1, -Math.PI / 2], [1, 0, 0],
            [0, 1, Math.PI / 2], [-1, 0, Math.PI]
        ]) {
            const bullet = this.enemyBullets.get(
                g.x + dx * g.displayWidth / 2,
                g.y + dy * g.displayHeight / 2, "enemyBullet");
            if (!bullet) continue;
            bullet.setActive(true).setVisible(true).setScale(2);
            bullet.body.enable = true;
            bullet.body.setSize(bullet.width * 2, bullet.height * 2, true);
            this.launchEnemyBullet(bullet, angle);
        }
    }

    groundFire(g, accuracy = 0.75) {
        if (!g.active || !g.getData("canFire")) return;
        const bullet = this.enemyBullets.get(g.x, g.y - 8, "enemyBullet");
        if (!bullet) return;
        bullet.setActive(true).setVisible(true);
        bullet.body.enable = true;
        bullet.setScale(2);
        bullet.body.setSize(bullet.width * 2, bullet.height * 2, true);

        const ang = Phaser.Math.Angle.Between(g.x, g.y, this.player.x, this.player.y);
        const spread = (1 - accuracy) * 0.35;
        const a = ang + this.rng.realInRange(-spread, spread);

        this.launchEnemyBullet(bullet, a);
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
            b.setScale(2);
            b.body.setSize(b.width * 2, b.height * 2, true);
            this.launchEnemyBullet(b, a);
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
            b.setScale(2);
            b.body.setSize(b.width * 2, b.height * 2, true);
            this.launchEnemyBullet(b, a);
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
        if (!this.boss || this.boss.getData("defeated")) return;
        this.boss.setData("defeated", true);
        this.addScore(15000);
        this.camera.shake(260, 0.008);
        this.flash(0.25);
        this.safePlay("airHit");

        this.spawnAndorDestruction(this.boss);

        this.time.delayedCall(1800, () => {
            this.bossWeakPoints.clear(true, true);
            this.boss.destroy();
            this.boss = null;
            this.bossActive = false;

            // loop
            this.distance = 0;
            this.terrainTravel = 0;
            this.groundScrollDelta = 0;
            this.terrainSegments.forEach((segment, index) => {
                segment.y = H - TERRAIN_SEGMENT_HEIGHT - index * TERRAIN_SEGMENT_HEIGHT;
            });
            this.groundTargets.clear(true, true);
            this.craters.clear(true, true);
            this.nextScriptIndex = 0;
            this.nextGroundIndex = 0;
            this.scrollSpeed = 180;
            this.weaponLevel = 3;
            this.radarCharges = Math.min(5, this.radarCharges + 2);
            this.flash(0.12);
        });
    }

    spawnAndorDestruction(boss) {
        const cx = boss.x, cy = boss.y;
        const radiusX = boss.displayWidth * 0.42;
        const radiusY = boss.displayHeight * 0.42;
        const colors = [0xffffff, 0xfff4c2, 0xffe45c, 0xffb52e, 0xff751f, 0xff3820];
        if (!this.textures.exists("andorGlow")) {
            const texture = this.textures.createCanvas("andorGlow", 32, 32);
            const context = texture.getContext();
            const glow = context.createRadialGradient(16, 16, 0, 16, 16, 16);
            glow.addColorStop(0, "rgba(255,255,255,1)");
            glow.addColorStop(0.2, "rgba(255,255,255,0.9)");
            glow.addColorStop(0.5, "rgba(255,255,255,0.3)");
            glow.addColorStop(1, "rgba(255,255,255,0)");
            context.fillStyle = glow;
            context.fillRect(0, 0, 32, 32);
            texture.refresh();
        }
        const sparks = this.add.particles(0, 0, "andorGlow", {
            emitting: false,
            lifespan: { min: 1000, max: 2400 },
            speed: { min: 45, max: 230 },
            angle: { min: 0, max: 360 },
            scale: { start: 0.8, end: 0 },
            alpha: { start: 0.9, end: 0 },
            tint: colors,
            blendMode: "ADD",
            maxParticles: 1000
        }).setDepth(1001);
        sparks.explode(180, cx, cy);
        // Last burst at 1386ms + 2400ms maximum particle life.
        this.time.delayedCall(4000, () => sparks.destroy());
        for (let i = 0; i < 100; i++) {
            const angle = this.rng.realInRange(0, Math.PI * 2);
            // Squaring the radius concentrates origins around the core.
            const radius = Math.pow(this.rng.frac(), 2);
            const x = cx + Math.cos(angle) * radiusX * radius;
            const y = cy + Math.sin(angle) * radiusY * radius;
            const distance = this.rng.realInRange(90, 330);
            const tint = colors[this.rng.between(0, colors.length - 1)];
            this.time.delayedCall(i * 14, () => {
                sparks.explode(8, x, y);
                const key = `andorChild${i % 5}`;
                const debris = this.add.sprite(x, y, key, 1)
                    .setDepth(1000).setScale(this.rng.realInRange(1.2, 2.5))
                    .setTintFill(tint).setRotation(angle);
                debris.play({ key: `${key}Explode`, startFrame: 1 });
                debris.anims.timeScale = 0.5;
                this.tweens.add({
                    targets: debris,
                    x: x + Math.cos(angle) * distance,
                    y: y + Math.sin(angle) * distance,
                    rotation: angle + this.rng.realInRange(-5, 5),
                    alpha: 0,
                    duration: this.rng.between(1300, 2600),
                    ease: "Cubic.Out",
                    onComplete: () => debris.destroy()
                });
            });
        }
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
        if (!g?.active || g.getData("destroyed")) return;
        g.setData("hp", (g.getData("hp") || 1) - dmg);
        if (g.getData("twoHit") && g.getData("hp") > 0) {
            g.setFrame(1);
            this.safePlay("groundHit");
            this.spawnEnemyExplosion(g.x, g.y);
        }
        if (g.getData("hp") <= 0) {
            // Physics overlap callbacks can queue more than once in a frame.
            // Mark destruction before creating effects so this remains one-shot.
            g.setData("destroyed", true);
            this.safePlay("groundHit");
            this.spawnCrater(g.x, g.y);
            this.spawnEnemyCollapse(g.x, g.y);
            this.killEntity(g);
            this.addScore(this.applyCombo(170));
            if (this.rng.frac() < 0.09) this.spawnPowerup();
        }
    }

    killEntity(e) {
        const chain = e.getData("chain");
        if (chain?.leader === e) chain.leader = null;
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
        if (GOD_MODE) return;

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
        this.startMusic?.stop();
        this.gameMusic?.stop();
        this.add.bitmapText(W / 2, H / 2, "xeviousFont",
            `GAME OVER\n\nSCORE ${this.score}\n\nPress R to restart`, 18)
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

        this.flash(0.10);
    }

    applyCombo(base) {
        this.combo = Math.min(12, this.combo + 1);
        this.comboTimer = 2.0;
        return Math.floor(base * (1 + (this.combo - 1) * 0.10));
    }

    addScore(v) { this.score += v; }

    spawnEnemyCollapse(x, y) {
        const keys = ["enemyCollapse", "enemyCollapse0", "enemyCollapse3"];
        const key = keys[this.rng.between(0, keys.length - 1)];
        const debris = this.add.sprite(x, y, key).setDepth(901);
        debris.play(`${key}Anim`);
        debris.once("animationcomplete", () => debris.destroy());
    }

    spawnEnemyExplosion(x, y) {
        const s = this.add.sprite(x, y, "enemyExplosion").setDepth(900);
        s.play("enemyExplosionAnim");
        s.once("animationcomplete", () => s.destroy());
    }

    spawnCrater(x, y) {
        const crater = this.craters.get(x, y, "crater");
        if (!crater) return;
        this.tweens.killTweensOf(crater);
        crater.anims.stop();
        crater.setTexture("crater").setActive(true).setVisible(true)
            .setDepth(85).setAlpha(1).setScale(0.65);
        crater.play("craterAnim");
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

    const addAirSeries = (pattern, counts, waveSpacing = 48, recovery = 28) => {
        for (const count of counts) {
            const waveCount = pattern === "blockade" ? 12 : Math.max(5, count);
            s.push({ at: d, type: "airWave", pattern, count: waveCount });
            d += waveSpacing;
        }
        d += recovery;
    };

    s.push({ at: d, type: "groundRow", count: 3, hiddenChance: 0 }); d += 22;

    // Each enemy type gets its own escalating attack series.
    addAirSeries("zig", [5, 5, 5], 46, 24);                 // Toroids
    s.push({ at: d, type: "groundRow", count: 2, hiddenChance: 0 }); d += 38;
    addAirSeries("dive", [2, 3], 48, 26);                  // Torkans
    addAirSeries("kapiStrike", [2, 3], 46, 24);            // Kapi
    s.push({ at: d, type: "powerup" }); d += 34;
    s.push({ at: d, type: "groundRow", count: 3, hiddenChance: 0 }); d += 38;
    addAirSeries("sweep", [2, 2, 3], 48, 26);              // Zoshi
    addAirSeries("jaraStrike", [2, 3], 48, 26);            // Jara
    s.push({ at: d, type: "radarCharge", amount: 1 }); d += 30;
    addAirSeries("materialize", [2, 3, 4], 42, 24);        // Zakato
    s.push({ at: d, type: "groundRow", count: 3, hiddenChance: 0 }); d += 36;
    addAirSeries("terraziStrike", [2, 3], 46, 24);         // Terrazi
    addAirSeries("blockade", [12, 12], 58, 20);            // 12-board Bacura minefields

    // Fill any remaining course with mixed same-type two-wave attack sets.
    const lateSeries = ["zig", "kapiStrike", "dive", "jaraStrike", "sweep", "terraziStrike"];
    for (const pattern of lateSeries) {
        addAirSeries(pattern, [3, 4], 44, 18);
        s.push({ at: d, type: "groundRow", count: 2, hiddenChance: 0 });
        d += 30;
    }

    return s;
}
