import { BootScene } from "./BootScene.js";
import { SplashScene } from "./SplashScene.js";
import { PlayScene } from "./PlayScene.js";
const W = 480;
const H = 600;

// Enhanced Xevious-ish Clone with EXTERNAL ASSETS (Phaser 3)
//
// Controls:
//  Arrows = move
//  Z / Space = shoot (air targets)
//  X = bomb (ground targets)
//  C = radar reveal sweep (reveals hidden ground targets)
//  P = pause
//  R = restart (when paused / game over)
//
// Assets expected in assets/img and assets/sfx as named in the folder layout.
const CONFIG = {
    type: Phaser.AUTO,
    width: W,
    height: H,
    backgroundColor: "#0b0f16",
    pixelArt: true,
    physics: { default: "arcade", arcade: { gravity: { y: 0 }, debug: false } },
    scene: [BootScene, SplashScene, PlayScene]
};

new Phaser.Game(CONFIG);

