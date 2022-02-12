const game = new Phaser.Game(448, 576, Phaser.ARCADE, 'game', {
    preload,
    create,
    update,
   });
  
  
  
  function create() {
    if (!startGame) mainMenuCreate(this);
    else gameCreate();

    //first attack waves
    // 5 waves of toroids
    // wave size: 5-7
    //attack method: straight down and then spin off to the right or left 1/2 way between top and player


  }
  
  function gameCreate() {
    background = game.add.image(0, 0, 'background');
    background.y=-2300;
    background.x=-400;
    player = game.add.image(game.width/2, 350, 'solvalou');
    airEnemies = game.add.group();
    groundEnemies = game.add.group();
    var enemy = game.add.sprite(200, -160, 'logram');
    groundEnemies.add(enemy);
}

  function update(){
    if (!startGame)
      return;
    if(game.rnd.integerInRange(1, 100)==1)
      CreateAirEnemy();
    MoveAirEnemies();
    MoveGroundEnemies();
    background.y++;
    if(background.y>100)
    background.y=-2300;
    
    if (game.input.keyboard.isDown(Phaser.Keyboard.RIGHT) && player.x<game.width)
    {
      player.x+=5;
    }
    if (game.input.keyboard.isDown(Phaser.Keyboard.LEFT) && player.x>0)
    {
      player.x-=5;
    }
    if (game.input.keyboard.isDown(Phaser.Keyboard.UP) && player.y>game.height*.2)
    {
      player.y-=5;
    }
    if (game.input.keyboard.isDown(Phaser.Keyboard.DOWN) && player.y<game.height)
    {
      player.y+=5;
    }
  }

function MoveAirEnemies(){
  airEnemies.forEach(enemy => {
  enemy.y++;    
  if(enemy.y>game.height)
    enemy.destroy();
});
}
function MoveGroundEnemies(){
  groundEnemies.forEach(enemy => {
  enemy.y++;    
  if(enemy.y>game.height)
    enemy.destroy();
});
}

  function CreateAirEnemy(){
    var enemyX = game.rnd.integerInRange(20, game.width-20);
    var enemy = game.add.sprite(enemyX, -20, 'toroid');
    var anim = enemy.animations.add('move');
    anim.play(10, true);
    airEnemies.add(enemy);
  }