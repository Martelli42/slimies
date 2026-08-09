// ── Palettes ──────────────────────────────────────────────────────────────────
const PALETTES = {
  blue:   { body:'#5BC8F5', outline:'#1565C0', shine:'#B3E5FC' },
  pink:   { body:'#F48FB1', outline:'#C2185B', shine:'#FCE4EC' },
  green:  { body:'#81C784', outline:'#2E7D32', shine:'#E8F5E9' },
  purple: { body:'#CE93D8', outline:'#6A1B9A', shine:'#F3E5F5' },
  orange: { body:'#FFB74D', outline:'#E65100', shine:'#FFF3E0' },
  yellow: { body:'#FFF176', outline:'#F57F17', shine:'#FFFDE7' },
  red:    { body:'#EF9A9A', outline:'#B71C1C', shine:'#FFEBEE' },
};

// Mood tint multipliers (darken/shift body color)
const MOOD_TINTS = {
  happy:         { r:1,    g:1,    b:1    },
  ok:            { r:1,    g:1,    b:1    },
  miss_you:      { r:1,    g:1,    b:1    },
  need_attention:{ r:1,    g:1,    b:1    },
  alone_time:    { r:0.85, g:0.85, b:0.9  },
  hungry:        { r:0.95, g:0.85, b:0.7  },
  tired:         { r:0.75, g:0.75, b:0.8  },
  sad:           { r:0.65, g:0.7,  b:0.85 },
  stressed:      { r:1.1,  g:0.75, b:0.75 },
};

function tintColor(hex, tint) {
  let r=parseInt(hex.slice(1,3),16), g=parseInt(hex.slice(3,5),16), b=parseInt(hex.slice(5,7),16);
  r=Math.min(255,Math.round(r*tint.r)); g=Math.min(255,Math.round(g*tint.g)); b=Math.min(255,Math.round(b*tint.b));
  return `rgb(${r},${g},${b})`;
}

// ── Sprite rows ───────────────────────────────────────────────────────────────
// 0=transparent 1=body 2=outline 3=eye/dark 4=shine
const EYES = {
  happy:         [0,2,1,1,1,3,1,3,1,1,2,0],
  ok:            [0,2,1,1,1,3,1,3,1,1,2,0],
  miss_you:      [0,2,1,1,2,3,1,3,2,1,2,0],
  need_attention:[0,2,1,1,4,3,1,3,4,1,2,0],
  alone_time:    [0,2,1,1,2,2,1,2,2,1,2,0],
  hungry:        [0,2,1,3,2,1,1,1,2,3,2,0],
  tired:         [0,2,1,1,2,2,1,2,2,1,2,0],
  sad:           [0,2,1,1,3,2,1,2,3,1,2,0],
  stressed:      [0,2,1,2,3,2,1,2,3,2,2,0],
};
const MOUTHS = {
  happy:         [0,2,1,1,2,1,1,2,1,1,2,0],
  ok:            [0,2,1,1,2,1,1,2,1,1,2,0],
  miss_you:      [0,2,1,1,2,1,1,2,1,1,2,0],
  need_attention:[0,2,1,1,2,4,4,2,1,1,2,0],
  alone_time:    [0,2,1,1,1,2,2,1,1,1,2,0],
  hungry:        [0,2,1,1,2,4,4,2,1,1,2,0],
  tired:         [0,2,1,1,1,2,1,1,1,1,2,0],
  sad:           [0,2,1,1,1,2,2,1,1,1,2,0],
  stressed:      [0,2,1,2,1,2,1,2,1,2,2,0],
};

function makeIdleFrame(mood) {
  return [
    [0,0,2,2,2,2,2,2,2,2,0,0],
    [0,2,1,1,1,1,1,1,1,1,2,0],
    [0,2,1,4,4,1,1,1,1,1,2,0],
    EYES[mood]   || EYES.happy,
    [0,2,1,1,1,1,1,1,1,1,2,0],
    MOUTHS[mood] || MOUTHS.happy,
    [2,1,1,1,1,1,1,1,1,1,1,2],
    [2,1,1,1,1,1,1,1,1,1,1,2],
    [0,2,2,1,1,1,1,1,1,2,2,0],
    [0,0,0,2,2,2,2,2,2,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0],
  ];
}
function makeSquishFrame(mood) {
  return [
    [0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,2,2,2,2,2,2,2,2,0,0],
    [0,2,1,4,1,1,1,1,1,1,2,0],
    EYES[mood]   || EYES.happy,
    [2,1,1,1,1,1,1,1,1,1,1,2],
    MOUTHS[mood] || MOUTHS.happy,
    [2,1,1,1,1,1,1,1,1,1,1,2],
    [0,2,2,1,1,1,1,1,1,2,2,0],
    [0,0,0,2,2,2,2,2,2,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0],
  ];
}
const GRABBED_FRAME = [
  [0,0,0,2,2,2,2,2,0,0,0,0],
  [0,0,2,1,1,1,1,1,2,0,0,0],
  [0,2,1,4,1,1,1,1,1,2,0,0],
  [0,2,1,1,4,3,1,3,4,2,0,0],
  [0,2,1,1,1,1,1,1,1,2,0,0],
  [0,2,1,1,2,1,2,1,1,2,0,0],
  [0,2,1,1,1,1,1,1,1,2,0,0],
  [0,2,2,1,1,1,1,1,2,2,0,0],
  [0,0,2,2,2,2,2,2,2,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0],
];

// ── Draw function ─────────────────────────────────────────────────────────────
const SCALE = 5;
const SW = 12 * SCALE;
const SH = 11 * SCALE;

function drawSlime(ctx, cx, cy, colorName, mood, squish, grabbed) {
  const pal = PALETTES[colorName] || PALETTES.blue;
  const tint = MOOD_TINTS[mood] || MOOD_TINTS.ok;
  const colors = [
    null,
    tintColor(pal.body, tint),
    pal.outline,
    '#0D1B4B',
    tintColor(pal.shine, { r:1, g:1, b:1 }),
  ];

  const frame = grabbed ? GRABBED_FRAME : (squish ? makeSquishFrame(mood) : makeIdleFrame(mood));

  ctx.save();
  frame.forEach((row, y) => row.forEach((c, x) => {
    if (!colors[c]) return;
    ctx.fillStyle = colors[c];
    ctx.fillRect(Math.round(cx - SW/2 + x*SCALE), Math.round(cy - SH + y*SCALE), SCALE, SCALE);
  }));
  ctx.restore();
}

// ── Particles ─────────────────────────────────────────────────────────────────
class Particle {
  constructor(x, y, emoji, vx, vy) {
    this.x=x; this.y=y; this.emoji=emoji; this.vx=vx; this.vy=vy;
    this.life=1; this.decay=0.02; this.size=20;
  }
  update() {
    this.x+=this.vx; this.y+=this.vy; this.vy-=0.3;
    this.life-=this.decay; this.vx*=0.98;
  }
  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = this.life;
    ctx.font = `${this.size}px serif`;
    ctx.textAlign='center';
    ctx.fillText(this.emoji, this.x, this.y);
    ctx.restore();
  }
}

let particles = [];
function spawnParticles(x, y, emoji, count=6) {
  for (let i=0; i<count; i++) {
    const angle = (Math.PI*2/count)*i;
    particles.push(new Particle(x, y, emoji, Math.cos(angle)*3, Math.sin(angle)*3+2));
  }
}
function updateParticles(ctx) {
  particles = particles.filter(p => p.life > 0);
  particles.forEach(p => { p.update(); p.draw(ctx); });
}

// ── Slime AI ──────────────────────────────────────────────────────────────────
class SlimeAI {
  constructor(side) {
    this.side = side; // 'left' or 'right'
    this.x = 0; this.y = 0;
    this.targetX = 0; this.targetY = 0;
    this.nextMove = 0;
    this.walkStep = false;
    this.walkTimer = 0;
    this.squish = false;
    this.bounceTimer = 0;
  }

  init(canvasW, canvasH) {
    this.x = this.side==='left' ? canvasW*0.25 : canvasW*0.75;
    this.y = canvasH * 0.65;
    this.targetX = this.x; this.targetY = this.y;
    this.canvasW = canvasW; this.canvasH = canvasH;
  }

  getSpeed(mood) {
    if (mood==='tired')    return 40;
    if (mood==='stressed') return 140;
    if (mood==='sad')      return 35;
    return 70;
  }

  getBounceRate(mood) {
    if (mood==='tired') return 900;
    if (mood==='sad')   return 1200;
    if (mood==='stressed') return 200;
    return 500;
  }

  update(dt, mood, partnerX, partnerY) {
    const now = Date.now();
    const W = this.canvasW, H = this.canvasH;
    if (!W) return;

    // Pick new target
    if (now > this.nextMove) {
      const meetMoods = ['need_attention','miss_you'];
      const meetChance = meetMoods.includes(mood) ? 0.55 : 0.15;
      if (Math.random() < meetChance && partnerX) {
        // Move toward partner
        this.targetX = (this.x + partnerX) / 2 + (Math.random()-0.5)*40;
        this.targetY = (this.y + partnerY) / 2 + (Math.random()-0.5)*30;
      } else if (mood === 'alone_time') {
        // Stay far from partner
        this.targetX = this.side==='left' ? W*0.05 + Math.random()*W*0.25 : W*0.7 + Math.random()*W*0.25;
        this.targetY = H*0.3 + Math.random()*H*0.5;
      } else {
        // Normal wander in own half
        if (this.side==='left') {
          this.targetX = W*0.05 + Math.random()*W*0.5;
        } else {
          this.targetX = W*0.45 + Math.random()*W*0.5;
        }
        this.targetY = H*0.3 + Math.random()*H*0.55;
      }
      this.nextMove = now + 2500 + Math.random()*4000;
    }

    // Move toward target
    const dx = this.targetX - this.x;
    const dy = this.targetY - this.y;
    const dist = Math.sqrt(dx*dx+dy*dy);
    const speed = this.getSpeed(mood) * dt;
    if (dist > 5) {
      this.x += (dx/dist)*Math.min(speed, dist);
      this.y += (dy/dist)*Math.min(speed, dist);
    }

    // Clamp to canvas
    this.x = Math.max(SW/2+5, Math.min(W-SW/2-5, this.x));
    this.y = Math.max(SH+5,   Math.min(H-10,      this.y));

    // Bounce animation
    this.bounceTimer += dt * 1000;
    if (this.bounceTimer > this.getBounceRate(mood)) {
      this.squish = !this.squish;
      this.bounceTimer = 0;
    }
  }
}
