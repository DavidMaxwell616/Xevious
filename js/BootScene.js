export class BootScene extends Phaser.Scene {
    constructor() { super("Boot"); }

    preload() {
        // --- Images
        this.load.image("bomb", "assets/images/bomb.png");
        this.load.image("player", "assets/images/solvalou.png");
        this.load.image("xeviousLogo", "assets/images/xevious_logo.png");
        this.load.image("xeviousFontSheet", "assets/images/xevious_font.png");
        this.load.image("target", "assets/images/target.png");
        this.load.spritesheet("solvalouExplosion", "assets/images/solvalou_explode.png", {
            frameWidth: 90,
            frameHeight: 90
        });
        this.load.spritesheet("torkan", "assets/images/enemy_torkan.png",
            {
                frameWidth: 30,
                frameHeight: 30
            }
        );
        this.load.spritesheet("logram", "assets/images/enemy_logram.png",
            {
                frameWidth: 30,
                frameHeight: 30
            }
        );
        this.load.spritesheet("toroid", "assets/images/enemy_toroid.png",
            {
                frameWidth: 56,
                frameHeight: 56
            }
        );
        this.load.spritesheet("bacura", "assets/images/enemy_bacura.png",
            {
                frameWidth: 70,
                frameHeight: 40
            }
        );
        this.load.image("barra", "assets/images/enemy_barra.png");
        this.load.spritesheet("derota", "assets/images/enemy_derota.png",
            {
                frameWidth: 30,
                frameHeight: 30
            }
        );
        this.load.spritesheet("garuDerota", "assets/images/enemy_garu_derota.png", {
            frameWidth: 60,
            frameHeight: 60
        });
        this.load.spritesheet("sol", "assets/images/enemy_sol.png", {
            frameWidth: 80,
            frameHeight: 80
        });
        this.load.spritesheet("grabda", "assets/images/enemy_grabda.png", {
            frameWidth: 17,
            frameHeight: 17
        });
        this.load.spritesheet("kapi", "assets/images/enemy_kapi.png", {
            frameWidth: 38,
            frameHeight: 38
        });
        this.load.spritesheet("jara", "assets/images/enemy_jara.png", {
            frameWidth: 34,
            frameHeight: 34
        });
        this.load.spritesheet("terrazi", "assets/images/enemy_terrazi.png", {
            frameWidth: 38,
            frameHeight: 46
        });
        this.load.spritesheet("zoshi", "assets/images/enemy_zoshi.png",
            {
                frameWidth: 30,
                frameHeight: 30
            }
        );
        this.load.image("zakato", "assets/images/enemy_zakato.png");
        this.load.spritesheet("zolba", "assets/images/enemy_zolbak.png", {
            frameWidth: 30,
            frameHeight: 30
        });

        this.load.image("boss", "assets/images/enemy_andorgenesis.png");
        for (let i = 0; i < 5; i++) {
            this.load.image(`andorChild${i}`, `assets/images/enemy_andorgenesis_child${i}.png`);
        }

        this.load.image("shot", "assets/images/shot.png");
        this.load.image("enemyBullet", "assets/images/enemyBullet.png");
        this.load.image("powerup", "assets/images/powerup.png");
        this.load.spritesheet("crater", "assets/images/crater.png", {
            frameWidth: 24,
            frameHeight: 24
        });
        this.load.spritesheet("enemyExplosion", "assets/images/enemies_explode.png", {
            frameWidth: 60,
            frameHeight: 60
        });
        // Asset filenames use "collapes"; keep descriptive keys in the game.
        for (const [key, file, size] of [
            ["enemyCollapse", "enemies_collapes.png", 40],
            ["enemyCollapse0", "enemies_collapes0.png", 60],
            ["enemyCollapse3", "enemies_collapes3.png", 50]
        ]) {
            this.load.spritesheet(key, `assets/images/${file}`, { frameWidth: size, frameHeight: size });
        }

        // Backgrounds (tileable recommended)
        this.load.image("terrain", "assets/images/terrain 1.png");
        this.load.image("terrain2", "assets/images/terrain 2.png");
        this.load.image("terrain3", "assets/images/terrain 3.png");
        this.load.image("terrain4", "assets/images/terrain 4.png");

        // --- Original-style Xevious audio cues
        this.load.audio("s_credit", "assets/sfx/01. Credit Sound.mp3");
        this.load.audio("s_startMusic", "assets/sfx/02. Start Music.mp3");
        this.load.audio("s_gameMusic", "assets/sfx/03. In-Game Music.mp3");
        this.load.audio("s_zapper1", "assets/sfx/05. Zapper - Shoot1.mp3");
        this.load.audio("s_airHit", "assets/sfx/06. Airbone Enemy - Stricken.mp3");
        this.load.audio("s_zapper2", "assets/sfx/07. Zapper - Shoot2.mp3");
        this.load.audio("s_bacuraHit", "assets/sfx/08. Bacura - Hit By Zapper.mp3");
        this.load.audio("s_blaster1", "assets/sfx/09. Blaster - Shoot1.mp3");
        this.load.audio("s_groundHit", "assets/sfx/10. Ground-Based Enemy - Stricken.mp3");
        this.load.audio("s_blaster2", "assets/sfx/11. Blaster - Shoot2.mp3");
        this.load.audio("s_andorAppear", "assets/sfx/17. Andor Genesis - Apperance.mp3");
        this.load.audio("s_solvalouExplosion", "assets/sfx/18. Solvalou explosion.mp3");
    }

    create() {
        for (let i = 0; i < 5; i++) {
            const key = `andorChild${i}`;
            const texture = this.textures.get(key);
            const source = texture.getSourceImage();
            const size = i === 4 ? 30 : 18;
            // The small strips end with a 16px frame; preserve that cropped edge.
            for (let frame = 0; frame < 6; frame++) {
                texture.add(frame, 0, frame * size, 0, Math.min(size, source.width - frame * size), size);
            }
            this.anims.create({
                key: `${key}Explode`,
                frames: this.anims.generateFrameNumbers(key, { start: 0, end: 5 }),
                frameRate: 18,
                repeat: -1
            });
        }

        const xeviousChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_?!:.,+-*/=()[] ";
        this.cache.bitmapFont.add("xeviousFont", Phaser.GameObjects.RetroFont.Parse(this, {
            image: "xeviousFontSheet",
            width: 74,
            height: 75,
            chars: xeviousChars,
            charsPerRow: 80,
            spacing: { x: 0, y: 0 }
        }));


        // Explosion and crater animations.
        for (const [key, end] of [["enemyCollapse", 3], ["enemyCollapse0", 9], ["enemyCollapse3", 11]]) {
            this.anims.create({
                key: `${key}Anim`,
                frames: this.anims.generateFrameNumbers(key, { start: 0, end }),
                frameRate: 18,
                repeat: 0
            });
        }
        this.anims.create({
            key: "enemyExplosionAnim",
            frames: this.anims.generateFrameNumbers("enemyExplosion", { start: 0, end: 6 }),
            frameRate: 20,
            repeat: 0
        });
        this.anims.create({
            key: "craterAnim",
            frames: this.anims.generateFrameNumbers("crater", { start: 0, end: 1 }),
            frameRate: 6,
            repeat: 0
        });
        this.anims.create({
            key: "solvalouExplosionAnim",
            frames: this.anims.generateFrameNumbers("solvalouExplosion", { start: 0, end: 22 }),
            frameRate: 30,
            repeat: 0
        });
        // Enemy animation ranges match the frames in each sprite sheet.

        this.anims.create({
            key: "torkan_fly",
            frames: this.anims.generateFrameNumbers("torkan", { start: 0, end: 6 }),
            frameRate: 10,
            repeat: -1
        });

        this.anims.create({
            key: "logram_idle",
            frames: this.anims.generateFrameNumbers("logram", { start: 0, end: 5 }),
            frameRate: 9,
            repeat: -1
        });

        this.anims.create({
            key: "toroid_fly",
            frames: this.anims.generateFrameNumbers("toroid", { start: 0, end: 6 }),
            frameRate: 12,
            repeat: -1
        });

        this.anims.create({
            key: "bacura_fly",
            frames: this.anims.generateFrameNumbers("bacura", { start: 0, end: 7 }),
            frameRate: 7,
            repeat: -1
        });

        this.anims.create({
            key: "derota_idle",
            frames: this.anims.generateFrameNumbers("derota", { start: 0, end: 5 }),
            frameRate: 6,
            repeat: -1
        });

        this.anims.create({
            key: "garu_derota_idle",
            frames: this.anims.generateFrameNumbers("garuDerota", { start: 0, end: 11 }),
            frameRate: 8,
            repeat: -1
        });

        this.anims.create({
            key: "sol_rise",
            frames: this.anims.generateFrameNumbers("sol", { start: 0, end: 7 }),
            frameRate: 7,
            repeat: 0
        });

        this.anims.create({
            key: "grabda_tread",
            frames: this.anims.generateFrameNumbers("grabda", { start: 0, end: 3 }),
            frameRate: 9,
            repeat: -1
        });

        this.anims.create({
            key: "kapi_fly",
            frames: this.anims.generateFrameNumbers("kapi", { start: 0, end: 6 }),
            frameRate: 10,
            repeat: -1
        });

        this.anims.create({
            key: "jara_fly",
            frames: this.anims.generateFrameNumbers("jara", { start: 0, end: 5 }),
            frameRate: 9,
            repeat: -1
        });

        this.anims.create({
            key: "terrazi_fly",
            frames: this.anims.generateFrameNumbers("terrazi", { start: 0, end: 6 }),
            frameRate: 12,
            repeat: -1
        });

        this.anims.create({
            key: "zoshi_spin",
            frames: this.anims.generateFrameNumbers("zoshi", { start: 0, end: 5 }),
            frameRate: 8,
            repeat: -1
        });

        this.anims.create({
            key: "zolba_idle",
            frames: this.anims.generateFrameNumbers("zolba", { start: 0, end: 7 }),
            frameRate: 7,
            repeat: -1
        });

        this.scene.start("Splash");
    }
}
