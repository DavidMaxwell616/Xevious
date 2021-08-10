const game = new Phaser.Game(600, 600, Phaser.ARCADE, 'game', {
    preload,
    create,
    update,
   });
  
  
  
  function create() {
    if (!startGame) mainMenuCreate(this);
    else gameCreate();
  }
  
  function gameCreate() {
    background = game.add.image(0, 0, 'background');
    background.width = game.width;
    background.y=-2300;
    player = game.add.image(game.width/2, 350, 'solvalou');
    
}
  function update(){
    if (!startGame)
    return;
   background.y++;
   if(background.y>100)
    background.y=-2300;
   
  }