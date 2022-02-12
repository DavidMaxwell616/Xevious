function preload() {
    game.load.onLoadStart.add(loadStart, this);
    game.load.onFileComplete.add(fileComplete, this);
    game.load.onLoadComplete.add(loadComplete, this);
    loadText = game.add.text(32, 32, '', {
      fill: '#ffffff',
    });
  
    this.load.path = 'assets/images/';
    this.load.image('splash', 'xevious_logo.png');
    this.load.image('splash2', 'homeicon.jpg');
    this.load.image('background', 'background.png');
    this.load.image('solvalou', 'solvalou.png');
    
    //AIR ENEMIES
    this.load.image('andorgenesis', 'enemy_andorgenesis.png'); //mothership
    this.load.spritesheet('bacura', 'enemy_bacura.png',70,40); //spinning walls
    this.load.spritesheet('torkan', 'enemy_torkan.png',35,30); //cylon ship
    this.load.spritesheet('toroid', 'enemy_toroid.png',30,30); //spinning rings
    this.load.image('zakato', 'enemy_zakato.png'); //tarball

    //GROUND ENEMIES
    this.load.image('barra', 'enemy_barra.png');//pyramid
    this.load.spritesheet('derota', 'enemy_derota.png',30,30); //shooting octagon
    this.load.spritesheet('garu_derota', 'enemy_garu_derota.png',60,60); //big shooting octagon
    this.load.spritesheet('logram', 'enemy_logram.png',30,30); //plain shooting dome
    this.load.spritesheet('sol', 'enemy_sol.png',80,80); //cone
    this.load.spritesheet('zolbak', 'enemy_zolbak.png',30,30); //non-shooting glowing dome
    this.load.spritesheet('zoshi', 'enemy_zoshi.png',30,30); //spiky derota

    this.load.image('maxxdaddy', 'maxxdaddy.gif');
  
    this.load.start();
  }
  
  function loadStart() {
    loadText.setText('Loading ...');
  }
  
  function loadComplete() {
    loadText.setText('Load Complete');
  }
 
  function fileComplete(progress, cacheKey, success, totalLoaded, totalFiles) {
  
    loadText.setText("File Complete: " + progress + "% - " + totalLoaded + " out of " + totalFiles);
  
  loadText.visible = false;
  }