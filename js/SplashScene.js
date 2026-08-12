const W = 480;
const H = 600;

export class SplashScene extends Phaser.Scene {
    constructor() { super("Splash"); }

    create() {
        this.starting = false;

        this.ground = this.add.tileSprite(0, 0, W, H, "terrain")
            .setOrigin(0, 0)
            .setTileScale(2);
        this.ground.tilePositionY = 900;

        this.add.rectangle(W / 2, H / 2, W, H, 0x07100a, 0.18);

        this.add.image(W / 2 + 4, H / 2 + 5, "xeviousLogo")
            .setTint(0x000000)
            .setAlpha(0.55);
        this.logo = this.add.image(W / 2, H / 2, "xeviousLogo");

        this.prompt = this.add.bitmapText(W / 2, H / 2 + 112, "xeviousFont",
            "PRESS SPACE OR ENTER", 16)
            .setLetterSpacing(-3)
            .setTint(0xffffff)
            .setOrigin(0.5);

        this.add.bitmapText(W / 2, H - 42, "xeviousFont",
            "ARROWS MOVE   Z FIRE   X BOMB", 10)
            .setLetterSpacing(-2)
            .setTint(0xcfe8ff)
            .setOrigin(0.5);

        const begin = () => this.beginGame();
        this.input.keyboard.once("keydown-SPACE", begin);
        this.input.keyboard.once("keydown-ENTER", begin);
        this.input.keyboard.once("keydown-Z", begin);
        this.input.once("pointerdown", begin);

        this.cameras.main.fadeIn(350, 0, 0, 0);
    }

    update(time, deltaMs) {
        const dt = deltaMs / 1000;
        this.ground.tilePositionY -= 45 * dt;
        this.prompt.setAlpha(0.5 + Math.sin(time * 0.005) * 0.5);
        this.logo.y = H / 2 + Math.sin(time * 0.0018) * 3;
    }

    beginGame() {
        if (this.starting) return;
        this.starting = true;
        try { this.sound.play("s_credit", { volume: 0.55 }); } catch { /* audio unavailable */ }
        this.input.keyboard.removeAllListeners();
        this.input.removeAllListeners();
        this.cameras.main.fadeOut(350, 0, 0, 0);
        this.cameras.main.once("camerafadeoutcomplete", () => this.scene.start("Play"));
    }
}
