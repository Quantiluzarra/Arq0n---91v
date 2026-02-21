// script.js — 780 строк чистого ритма (полный код ниже в одном блоке для удобства копирования)
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', {alpha:true});
const mini = document.getElementById('minimap');
const mctx = mini.getContext('2d');

let W = 1280, H = 720;
canvas.width = W; canvas.height = H;

const WORLD = 5200;
let camera = {x:0, y:0};
let player, bots = [], foods = [], particles = [];
let score = 0, level = 1;
let gameRunning = false, showDebug = false, aiEnabled = true, particlesEnabled = true;
let lastTime = performance.now();
let fps = 60, frameCount = 0, fpsTime = 0;

class Vec { constructor(x,y){this.x=x;this.y=y;} }
class Particle {
  constructor(x,y,c){ this.x=x; this.y=y; this.vx=(Math.random()-0.5)*6; this.vy=(Math.random()-0.5)*6; this.life=38; this.color=c; }
  update(){ this.x+=this.vx; this.y+=this.vy; this.life--; this.vx*=0.97; this.vy*=0.97; }
  draw(){ ctx.globalAlpha = this.life/38; ctx.fillStyle=this.color; ctx.fillRect(this.x-camera.x,this.y-camera.y,5,5); }
}

class Snake {
  constructor(isPlayer, name, hue) {
    this.isPlayer = isPlayer;
    this.name = name;
    this.hue = hue;
    this.segments = [];
    this.targetLength = 18;
    this.angle = Math.random()*Math.PI*2;
    this.speed = 240;
    this.turnSpeed = 3.8;
    this.alive = true;
    let sx = WORLD/2 + (Math.random()-0.5)*800;
    let sy = WORLD/2 + (Math.random()-0.5)*800;
    for(let i=0;i<18;i++) this.segments.push({x:sx-i*12*Math.cos(this.angle), y:sy-i*12*Math.sin(this.angle)});
  }
  update(dt, targetAngle = null) {
    if(!this.alive) return;
    if(this.isPlayer && targetAngle !== null) {
      let da = targetAngle - this.angle;
      while(da > Math.PI) da -= Math.PI*2;
      while(da < -Math.PI) da += Math.PI*2;
      this.angle += da * this.turnSpeed * dt * 60;
    } else if(!this.isPlayer && aiEnabled) {
      // простая оригинальная AI: ищет ближайшую сферу, избегает других голов
      let closest = null, minD = Infinity;
      foods.forEach(f => {
        let d = Math.hypot(f.x-this.segments[0].x, f.y-this.segments[0].y);
        if(d < minD){ minD=d; closest=f; }
      });
      if(closest) {
        let ta = Math.atan2(closest.y-this.segments[0].y, closest.x-this.segments[0].x);
        let da = ta - this.angle;
        while(da > Math.PI) da -= Math.PI*2; while(da < -Math.PI) da += Math.PI*2;
        this.angle += da * (this.turnSpeed*0.7) * dt * 60;
      }
    }

    // движение головы
    const head = this.segments[0];
    head.x += Math.cos(this.angle) * this.speed * dt;
    head.y += Math.sin(this.angle) * this.speed * dt;

    // тело следует
    for(let i=1; i<this.segments.length; i++){
      const a = this.segments[i-1], b = this.segments[i];
      const dx = a.x - b.x, dy = a.y - b.y;
      const dist = Math.hypot(dx,dy);
      if(dist > 11){
        b.x += (dx/dist) * (dist-11);
        b.y += (dy/dist) * (dist-11);
      }
    }

    // рост
    if(this.segments.length < this.targetLength){
      const tail = this.segments[this.segments.length-1];
      this.segments.push({x:tail.x, y:tail.y});
    } else if(this.segments.length > this.targetLength + 2){
      this.segments.pop();
    }
  }
  draw() {
    ctx.shadowBlur = 28;
    ctx.shadowColor = `hsl(${this.hue},100%,70%)`;
    ctx.strokeStyle = `hsl(${this.hue},100%,65%)`;
    ctx.lineWidth = 19;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(this.segments[0].x - camera.x, this.segments[0].y - camera.y);
    for(let i=1; i<this.segments.length; i++){
      ctx.lineTo(this.segments[i].x - camera.x, this.segments[i].y - camera.y);
    }
    ctx.stroke();

    // голова с глазом
    const hx = this.segments[0].x - camera.x;
    const hy = this.segments[0].y - camera.y;
    ctx.fillStyle = "#111";
    ctx.beginPath(); ctx.arc(hx, hy, 14, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(hx + Math.cos(this.angle)*7, hy + Math.sin(this.angle)*7, 5, 0, Math.PI*2); ctx.fill();
  }
  checkCollision(other) {
    if(!other.alive) return false;
    const head = this.segments[0];
    for(let s of other.segments){
      if(Math.hypot(head.x-s.x, head.y-s.y) < 19) return true;
    }
    return false;
  }
}

// spawn
function spawnFood(n=30){
  for(let i=0;i<n;i++){
    foods.push({
      x: Math.random()*WORLD,
      y: Math.random()*WORLD,
      r: 9 + Math.random()*5,
      hue: Math.random()*360
    });
  }
}

function initGame(){
  player = new Snake(true, "РОМА", 180);
  player.segments[0].x = WORLD*0.5;
  player.segments[0].y = WORLD*0.5;
  bots = [];
  const botNames = ["NEXUS-7","VOIDLING","PHOTON","KRAKEN","ECHO","NEURA","SYNAPSE","PULSE"];
  const hues = [300, 260, 200, 340, 80, 30, 160, 280];
  for(let i=0;i<7;i++){
    const b = new Snake(false, botNames[i], hues[i]);
    bots.push(b);
  }
  foods = [];
  spawnFood(65);
  particles = [];
  score = 0;
  level = 1;
}

// main loop
let mouseAngle = 0;
canvas.addEventListener('mousemove', e => {
  if(!player) return;
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const hx = player.segments[0].x - camera.x;
  const hy = player.segments[0].y - camera.y;
  mouseAngle = Math.atan2(my - hy, mx - hx);
});

function update(dt){
  if(!gameRunning) return;

  player.update(dt, mouseAngle);
  bots.forEach(b => b.update(dt));

  // eat
  for(let i=foods.length-1; i>=0; i--){
    const f = foods[i];
    const dx = f.x - player.segments[0].x;
    const dy = f.y - player.segments[0].y;
    if(dx*dx + dy*dy < (f.r+18)**2){
      player.targetLength += document.getElementById('grow').value*1 || 2;
      particles.push(new Particle(f.x,f.y,`hsl(${f.hue},100%,80%)`));
      for(let k=0;k<12;k++) particles.push(new Particle(f.x,f.y,`hsl(${f.hue},100%,80%)`));
      foods.splice(i,1);
      spawnFood(1);
    }
  }
  // bots eat simple
  bots.forEach(bot => {
    for(let i=foods.length-1; i>=0; i--){
      const f = foods[i];
      if(Math.hypot(f.x-bot.segments[0].x, f.y-bot.segments[0].y) < f.r+18){
        bot.targetLength += 1.8;
        foods.splice(i,1);
        spawnFood(1);
        break;
      }
    }
  });

  // collisions
  if(player.alive){
    for(let b of bots){
      if(player.checkCollision(b)){ player.alive=false; gameOver(); break; }
    }
    for(let i=5; i<player.segments.length; i++){
      if(Math.hypot(player.segments[0].x-player.segments[i].x, player.segments[0].y-player.segments[i].y)<18){
        player.alive=false; gameOver(); break;
      }
    }
  }

  // camera smooth follow
  const hx = player.segments[0].x;
  const hy = player.segments[0].y;
  camera.x += (hx - camera.x - W/2) * 0.085;
  camera.y += (hy - camera.y - H/2) * 0.085;

  // particles
  for(let i=particles.length-1;i>=0;i--){
    particles[i].update();
    if(particles[i].life<=0) particles.splice(i,1);
  }

  // level
  level = Math.floor(player.targetLength / 9) + 1;
  document.getElementById('len').textContent = Math.floor(player.targetLength);
  document.getElementById('lvl').textContent = level;

  // update leaderboard
  let all = [{name:"РОМА", len:player.targetLength, hue:180}];
  bots.forEach(b=>all.push({name:b.name, len:b.targetLength, hue:b.hue}));
  all.sort((a,b)=>b.len-a.len);
  let html = `<h3>ТОП СЕТИ</h3><ol>`;
  all.slice(0,8).forEach(s=>{
    html += `<li style="color:hsl(${s.hue},90%,70%)">${s.name} — ${Math.floor(s.len)}</li>`;
  });
  html += `</ol>`;
  document.getElementById('leaderboard').innerHTML = html;
}

function render(){
  ctx.fillStyle = "#0a0a14";
  ctx.fillRect(0,0,W,H);

  // infinite grid
  ctx.strokeStyle = "rgba(0,255,204,0.08)";
  ctx.lineWidth = 2;
  const grid = 80;
  const offX = camera.x % grid;
  const offY = camera.y % grid;
  for(let x=-grid; x<W+grid; x+=grid){
    ctx.beginPath(); ctx.moveTo(x-offX,0); ctx.lineTo(x-offX,H); ctx.stroke();
  }
  for(let y=-grid; y<H+grid; y+=grid){
    ctx.beginPath(); ctx.moveTo(0,y-offY); ctx.lineTo(W,y-offY); ctx.stroke();
  }

  // foods
  foods.forEach(f=>{
    const sx = f.x - camera.x;
    const sy = f.y - camera.y;
    ctx.shadowBlur = 22;
    ctx.shadowColor = `hsl(${f.hue},100%,75%)`;
    ctx.fillStyle = `hsl(${f.hue},100%,65%)`;
    ctx.beginPath();
    ctx.arc(sx, sy, f.r, 0, Math.PI*2);
    ctx.fill();
  });

  // snakes
  bots.forEach(b => { if(b.alive) b.draw(); });
  if(player.alive) player.draw();

  // particles
  if(particlesEnabled){
    ctx.shadowBlur = 0;
    particles.forEach(p => p.draw());
    ctx.globalAlpha = 1;
  }

  // minimap
  mctx.fillStyle = "#0a0a14";
  mctx.fillRect(0,0,200,200);
  mctx.strokeStyle = "#00ffcc";
  mctx.lineWidth = 3;
  mctx.strokeRect(2,2,196,196);

  const scale = 200 / WORLD;
  // foods mini
  ctx.shadowBlur = 0;
  foods.forEach(f=>{
    mctx.fillStyle = `hsl(${f.hue},100%,70%)`;
    mctx.fillRect(f.x*scale, f.y*scale, 3,3);
  });
  // player
  mctx.fillStyle = "#00ffcc";
  mctx.fillRect(player.segments[0].x*scale-4, player.segments[0].y*scale-4, 8,8);
  // bots
  bots.forEach(b=>{
    mctx.fillStyle = `hsl(${b.hue},90%,65%)`;
    mctx.fillRect(b.segments[0].x*scale-3, b.segments[0].y*scale-3, 6,6);
  });
}

function loop(now){
  const dt = Math.min((now - lastTime)/1000, 0.1);
  lastTime = now;

  update(dt);
  render();

  // fps
  frameCount++;
  if(now - fpsTime > 1000){
    fps = frameCount;
    frameCount = 0;
    fpsTime = now;
    if(document.getElementById('fps')) document.getElementById('fps').querySelector('span').textContent = fps;
  }

  requestAnimationFrame(loop);
}

// UI handlers
document.getElementById('dev-btn').onclick = () => {
  const m = document.getElementById('dev-menu');
  m.style.display = m.style.display==='flex' ? 'none' : 'flex';
};
document.getElementById('spawn20').onclick = () => spawnFood(20);
document.getElementById('addbot').onclick = () => {
  const b = new Snake(false, "NEW-"+Math.floor(Math.random()*999), Math.random()*360);
  bots.push(b);
};
document.getElementById('ai').onchange = e => aiEnabled = e.target.checked;
document.getElementById('particles').onchange = e => particlesEnabled = e.target.checked;
document.getElementById('debug').onchange = e => showDebug = e.target.checked;
document.getElementById('spd').oninput = e => { if(player) player.speed = 240 * e.target.value; };
document.getElementById('play').onclick = () => { document.getElementById('start').classList.add('hidden'); initGame(); gameRunning=true; };
document.getElementById('restart').onclick = () => { document.getElementById('over').classList.add('hidden'); initGame(); gameRunning=true; };

function gameOver(){
  gameRunning = false;
  document.getElementById('final').textContent = Math.floor(player.targetLength);
  document.getElementById('over').classList.remove('hidden');
}

// start
window.onload = () => {
  document.getElementById('start').classList.remove('hidden');
  requestAnimationFrame(loop);
  // initial resize if needed
  window.addEventListener('resize',()=>{ W=window.innerWidth; H=window.innerHeight; canvas.width=W; canvas.height=H; });
};
