function mainMenuCreate(scene) {
    splash2 = scene.add.image(-70, 0, 'splash2');
    splash2.anchor.setTo(0, 0);
    splash2.width *= 2.8;
    splash2.height *= 2.8;
    splash = scene.add.image(game.width/2, 150, 'splash');
    splash.anchor.setTo(0.5, 0.5);
    maxxdaddy = game.add.image(0, game.height * 0.92, 'maxxdaddy');
    game.input.onDown.addOnce(StartGame, this);
    game.spaceKey = game.input.keyboard.addKey(Phaser.Keyboard.SPACEBAR);
   
    game.input.keyboard.onUpCallback = function (e) {
      if (e.keyCode == Phaser.Keyboard.SPACEBAR) 
        StartGame(scene);
    }
  }
  
  function StartGame(scene){
    if (startGame)
    return;
  splash.visible = false;
  splash2.visible = false;
  startGame = true;
  gameCreate(scene);
  }