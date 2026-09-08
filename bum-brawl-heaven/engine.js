/* Bum Brawl: Heaven — deterministic combat and wave simulation. No dependencies. */
(function (root) {
  'use strict';
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const WAVES = [
    { name: 'GATE CRASHERS', foes: ['clerk', 'clerk', 'runner', 'clerk', 'runner', 'clerk', 'heavy', 'runner'] },
    { name: 'UPPER MANAGEMENT', foes: ['clerk', 'runner', 'sentinel', 'clerk', 'heavy', 'runner', 'sentinel', 'clerk', 'runner', 'heavy'] },
    { name: 'BAD COMPANY', foes: ['clerk', 'scribe', 'runner', 'sentinel', 'heavy', 'runner', 'scribe', 'clerk', 'sentinel', 'runner', 'heavy', 'scribe'] },
    { name: 'NO MERCY IN HEAVEN', foes: ['runner', 'heavy', 'scribe', 'sentinel', 'runner', 'clerk', 'heavy', 'scribe', 'runner', 'sentinel', 'heavy', 'clerk', 'scribe', 'runner'] },
    { name: 'THE GATEKEEPER', foes: ['sentinel', 'runner', 'scribe', 'heavy', 'clerk', 'runner', 'boss', 'sentinel', 'scribe', 'heavy', 'runner', 'clerk', 'sentinel', 'scribe', 'heavy', 'runner'] }
  ];
  const ENEMIES = {
    clerk: { hp: 50, growth: 6, speed: 110, damage: 9, size: 1, windup: .55, reach: 140, engage: 110, recovery: 1.1 },
    heavy: { hp: 94, growth: 4, speed: 90, damage: 13, size: 1.12, windup: .72, reach: 164, engage: 130, recovery: 1.35 },
    runner: { hp: 38, growth: 4, speed: 182, damage: 7, size: .88, windup: .48, reach: 145, engage: 195, recovery: 1.35 },
    sentinel: { hp: 100, growth: 5, speed: 78, damage: 14, size: 1.08, windup: .8, reach: 170, engage: 133, recovery: 1.5 },
    scribe: { hp: 46, growth: 4, speed: 86, damage: 10, size: .98, windup: .95, reach: 440, engage: 295, recovery: 2.2 },
    boss: { hp: 360, growth: 0, speed: 96, damage: 20, size: 1.45, windup: .72, reach: 184, engage: 147, recovery: 1.3 }
  };
  const POWERUPS = {
    health: { label: 'HEALTH +30', amount: 30 },
    halo: { label: 'HALO +50', amount: 50 },
    fury: { label: 'DOUBLE DAMAGE', duration: 8 },
    shield: { label: 'SHIELD', duration: 8 }
  };
  const DROP_ORDER = ['halo', 'health', 'fury', 'shield'];
  const MOVES = {
    punch: { duration: .32, active: .09, range: 146, damage: 18, push: 230, stun: .32 },
    uppercut: { duration: .42, active: .12, range: 154, damage: 30, push: 340, stun: .48 },
    kick: { duration: .53, active: .18, range: 186, damage: 32, push: 430, stun: .46 },
    special: { duration: .84, active: .24, range: 370, damage: 64, push: 670, stun: .8 }
  };
  class HaloEngine {
    constructor(width = 1280, rng = Math.random) {
      this.width = width; this.rng = rng; this.mode = 'title'; this.events = [];
      this.player = this.makePlayer(); this.enemies = []; this.spawnQueue = [];
      this.pickups = []; this.projectiles = []; this.defeated = 0; this.dropIndex = 0;
      this.wave = 0; this.score = 0; this.combo = 0; this.maxCombo = 0; this.time = 0;
      this.hitStop = 0; this.waveDelay = -1; this.held = { x: 0, y: 0 }; this.uid = 0;
    }
    makePlayer() {
      return { x: this.width * .38, y: 590, z: 0, vz: 0, vx: 0, dir: 1, hp: 100,
        maxHp: 100, power: 35, action: null, stun: 0, invul: 0, walk: 0, moving: false,
        chain: 0, lastPunch: -100, lastHit: -100, fury: 0, shield: 0, type: 'hero' };
    }
    emit(type, data = {}) { this.events.push({ type, ...data }); }
    drainEvents() { return this.events.splice(0); }
    resize(width) {
      const scale = width / this.width;
      this.player.x *= scale;
      this.enemies.forEach(e => e.x *= scale);
      this.pickups.forEach(p => p.x *= scale);
      this.projectiles.forEach(p => p.x *= scale);
      this.width = width;
    }
    start() {
      this.player = this.makePlayer(); this.enemies = []; this.events = [];
      this.pickups = []; this.projectiles = []; this.defeated = 0; this.dropIndex = 0;
      this.score = 0; this.combo = 0; this.maxCombo = 0; this.comboTimer = 0;
      this.time = 0; this.hitStop = 0; this.uid = 0; this.waveDelay = -1;
      this.mode = 'playing'; this.beginWave(0);
    }
    beginWave(index) {
      this.wave = index; this.waveDelay = -1; this.supplyAt = this.time + 4;
      this.projectiles = [];
      this.spawnQueue = WAVES[index].foes.map((type, i) => ({ type, at: this.time + 1.1 + i * 1.15 }));
      this.emit('wave', { number: index + 1, name: WAVES[index].name, boss: index === 4 });
    }
    spawn(type) {
      const stats = ENEMIES[type], hp = stats.hp + this.wave * stats.growth;
      const left = this.uid % 2 === 1;
      this.enemies.push({ id: ++this.uid, type, x: left ? -65 : this.width + 65,
        y: 505 + this.rng() * 130, z: 0, vz: 0, vx: 0, dir: left ? 1 : -1,
        ...stats, hp, maxHp: hp, stun: 0, invul: 0, walk: 0,
        moving: false, action: null, cooldown: .8 + this.rng(), dead: null,
        guardBroken: 0, guardHits: 0, targetLane: (this.rng() - .5) * 32 });
    }
    get remaining() { return this.enemies.filter(e => e.dead === null).length + this.spawnQueue.length; }
    get maxEnemies() { return this.width < 700 ? 4 : 6; }
    get waveName() { return WAVES[this.wave].name; }
    get busy() { return !!this.player.action || this.player.stun > 0; }
    dropPickup(kind, x, y) {
      const pickup = { id: ++this.uid, kind, x: clamp(x, 55, this.width - 55), y: clamp(y, 505, 645), life: 22 };
      this.pickups.push(pickup);
      this.emit('drop', { kind, x: pickup.x, y: pickup.y });
      return pickup;
    }
    updatePickups(dt) {
      const p = this.player;
      for (const item of this.pickups) {
        item.life -= dt;
        if (item.life <= 0 || p.hp <= 0 || p.z > 48 || Math.abs(item.x - p.x) > 48 || Math.abs(item.y - p.y) > 34) continue;
        const config = POWERUPS[item.kind];
        if ((item.kind === 'health' && p.hp >= p.maxHp) || (item.kind === 'halo' && p.power >= 100)) continue;
        const wasReady = p.power >= 100;
        let amount = 0;
        if (item.kind === 'health') { amount = Math.min(config.amount, p.maxHp - p.hp); p.hp += amount; }
        else if (item.kind === 'halo') { amount = Math.min(config.amount, 100 - p.power); p.power += amount; }
        else p[item.kind] = config.duration;
        item.life = 0;
        this.emit('pickup', { kind: item.kind, amount, duration: config.duration || 0, x: p.x, y: p.y - 170 });
        if (!wasReady && p.power >= 100) this.emit('ready');
      }
      this.pickups = this.pickups.filter(item => item.life > 0);
    }
    fireBolt(e, action) {
      if (this.projectiles.length >= 4) return;
      const distance = Math.max(100, Math.abs(action.aimX - e.x));
      this.projectiles.push({ x: e.x + e.dir * 52, y: e.y, z: 105, vx: e.dir * 315,
        vy: clamp((action.aimY - e.y) / distance * 315, -80, 80), dir: e.dir, damage: e.damage, life: 3.5 });
      this.emit('bolt', { x: e.x + e.dir * 52, y: e.y - 105 });
    }
    updateProjectiles(dt) {
      const p = this.player;
      for (const bolt of this.projectiles) {
        bolt.life -= dt; bolt.x += bolt.vx * dt; bolt.y += bolt.vy * dt;
        if (bolt.x < -40 || bolt.x > this.width + 40) bolt.life = 0;
        if (bolt.life > 0 && p.z <= 42 && Math.abs(bolt.x - p.x) < 30 && Math.abs(bolt.y - p.y) < 30) {
          this.hitPlayer(bolt); bolt.life = 0;
        }
      }
      this.projectiles = this.projectiles.filter(bolt => bolt.life > 0);
    }
    attack(kind) {
      const p = this.player;
      if (this.mode !== 'playing' || p.hp <= 0 || this.busy) return false;
      if (kind === 'special' && p.power < 100) return false;
      if (kind === 'punch') {
        p.chain = this.time - p.lastPunch < .8 ? (p.chain + 1) % 3 : 0;
        p.lastPunch = this.time;
        if (p.chain === 2) kind = 'uppercut';
      } else p.chain = 0;
      if (!MOVES[kind]) return false;
      if (kind === 'special') { p.power = 0; p.invul = 1.05; }
      p.action = { kind, t: 0, hit: false };
      this.emit('swing', { kind, x: p.x, y: p.y, dir: p.dir });
      return true;
    }
    jump() {
      const p = this.player;
      if (this.mode !== 'playing' || p.z > 0 || p.stun > 0 || p.hp <= 0) return false;
      p.vz = 490; p.z = .1; this.emit('jump', { x: p.x, y: p.y }); return true;
    }
    hitEnemy(e, move, dir) {
      if (e.dead !== null || e.invul > 0) return;
      const p = this.player, wasReady = p.power >= 100;
      const guarding = e.type === 'sentinel' && e.guardBroken <= 0 && (p.x - e.x) * e.dir >= -10;
      const blocked = guarding && move === MOVES.punch && p.z <= 20 && p.fury <= 0;
      const amount = Math.round((move.damage + (p.z > 20 ? 8 : 0)) * (p.fury > 0 ? 2 : 1) * (blocked ? .25 : 1));
      e.hp = Math.max(0, e.hp - amount); e.invul = .1;
      if (guarding && (!blocked || ++e.guardHits >= 3)) {
        e.guardBroken = 3; e.guardHits = 0; e.stun = .65; e.action = null;
        this.emit('guardBreak', { x: e.x, y: e.y - 160 });
      }
      if (!blocked) {
        e.stun = Math.max(e.stun, move.stun * (e.type === 'boss' ? .7 : 1)); e.action = null;
        e.vx = move.push * dir * (e.type === 'boss' ? .5 : 1);
        if (move === MOVES.uppercut || move === MOVES.special) { e.vz = 330; e.z = Math.max(e.z, 1); }
      } else e.vx = dir * 45;
      this.combo++; this.comboTimer = 2.2; this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.score += amount * 5 + Math.min(this.combo, 20) * 10;
      if (move !== MOVES.special) p.power = clamp(p.power + (blocked ? 5 : 11), 0, 100);
      this.hitStop = Math.max(this.hitStop, move === MOVES.special ? .075 : .045);
      this.emit(blocked ? 'block' : 'hit', { x: e.x, y: e.y - 120 - e.z, dir, damage: amount,
        heavy: move !== MOVES.punch, special: move === MOVES.special, combo: this.combo });
      if (e.hp === 0) {
        e.dead = .85; e.vx = dir * (e.type === 'boss' ? 190 : 320); e.vz = 270; e.z += 3;
        this.score += e.type === 'boss' ? 2000 : e.type === 'heavy' ? 350 : 200;
        p.power = clamp(p.power + 8, 0, 100);
        this.emit('ko', { x: e.x, y: e.y - 165, boss: e.type === 'boss' });
        this.defeated++;
        if (this.defeated % 3 === 0) this.dropPickup(DROP_ORDER[this.dropIndex++ % DROP_ORDER.length], e.x - dir * 35, e.y + 12);
      }
      if (!wasReady && p.power >= 100) this.emit('ready');
    }
    hitPlayer(e) {
      const p = this.player;
      if (p.invul > 0 || p.z > 42 || p.hp <= 0) return;
      if (p.shield > 0) {
        p.invul = .25; this.emit('shieldBlock', { x: p.x, y: p.y - 120 }); return;
      }
      p.hp = Math.max(0, p.hp - e.damage); p.stun = .36; p.invul = .95;
      p.action = null; p.vx = e.dir * 240; this.combo = 0; this.comboTimer = 0;
      const wasReady = p.power >= 100; p.power = Math.min(100, p.power + 7);
      this.hitStop = .05;
      this.emit('hurt', { x: p.x, y: p.y - 125 - p.z, dir: e.dir, damage: e.damage });
      if (!wasReady && p.power >= 100) this.emit('ready');
      if (p.hp === 0) { this.mode = 'lost'; this.emit('end', { won: false }); }
    }
    stepActor(a, dt) {
      a.stun = Math.max(0, a.stun - dt); a.invul = Math.max(0, a.invul - dt);
      a.x += a.vx * dt; a.vx *= Math.exp(-9 * dt);
      if (a.z > 0 || a.vz > 0) {
        a.vz -= 1350 * dt; a.z += a.vz * dt;
        if (a.z <= 0) { a.z = 0; a.vz = 0; }
      }
    }
    update(dt, input = { x: 0, y: 0 }) {
      if (this.mode !== 'playing') return;
      dt = clamp(dt, 0, .04);
      if (this.hitStop > 0) { this.hitStop -= dt; return; }
      this.time += dt;
      const p = this.player; this.stepActor(p, dt);
      p.fury = Math.max(0, p.fury - dt); p.shield = Math.max(0, p.shield - dt);
      const ix = clamp(input.x || 0, -1, 1), iy = clamp(input.y || 0, -1, 1);
      const length = Math.max(1, Math.hypot(ix, iy));
      p.moving = p.stun === 0 && (ix !== 0 || iy !== 0);
      if (p.moving) {
        const speed = 264 * (p.action ? .38 : 1);
        p.x += ix / length * speed * dt; p.y += iy / length * speed * .67 * dt;
        if (ix !== 0 && (!p.action || p.action.t < .055)) p.dir = Math.sign(ix);
        p.walk += dt * 13;
      } else p.walk += dt * 2;
      p.x = clamp(p.x, 45, this.width - 45); p.y = clamp(p.y, 493, 655);
      if (p.action) {
        const a = p.action, move = MOVES[a.kind]; a.t += dt;
        if (a.t >= move.active && !a.hit) {
          a.hit = true;
          if (a.kind === 'special') this.emit('special', { x: p.x, y: p.y - 100 });
          const victims = this.enemies.filter(e => e.dead === null).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x));
          let hit = false;
          for (const e of victims) {
            const dx = e.x - p.x, dy = Math.abs(e.y - p.y);
            if (Math.abs(dx) <= move.range + (e.type === 'boss' ? 25 : 0) &&
              dy < (a.kind === 'special' ? 165 : 62) && (a.kind === 'special' || dx * p.dir >= -32)) {
              this.hitEnemy(e, move, a.kind === 'special' ? Math.sign(dx) || p.dir : p.dir); hit = true;
            }
          }
          if (!hit) this.emit('miss', { kind: a.kind });
        }
        if (a.t >= move.duration) p.action = null;
      }
      if (this.supplyAt >= 0 && this.time >= this.supplyAt) {
        this.dropPickup(['health', 'halo', 'fury', 'shield', 'health'][this.wave], this.width * .5, 630);
        this.supplyAt = -1;
      }
      this.updatePickups(dt);
      while (this.spawnQueue.length && this.spawnQueue[0].at <= this.time && this.enemies.filter(e => e.dead === null).length < this.maxEnemies) {
        this.spawn(this.spawnQueue.shift().type);
      }
      const attackers = this.enemies.filter(e => e.action && e.dead === null).length;
      let committed = attackers;
      for (const e of this.enemies) {
        this.stepActor(e, dt);
        if (e.dead !== null) { e.dead -= dt; continue; }
        e.cooldown -= dt; e.guardBroken = Math.max(0, e.guardBroken - dt);
        if (e.stun > 0) { e.moving = false; continue; }
        if (e.action) {
          const a = e.action; a.t += dt;
          const windup = e.windup;
          if (e.type === 'runner' && a.t >= windup - .16 && a.t < windup + .12) e.x = clamp(e.x + e.dir * 380 * dt, 20, this.width - 20);
          if (a.t >= windup && !a.hit) {
            a.hit = true;
            this.emit('enemySwing', { x: e.x, y: e.y, heavy: e.type !== 'clerk' });
            if (e.type === 'scribe') this.fireBolt(e, a);
            else if (Math.abs(p.x - e.x) < e.reach && Math.abs(p.y - e.y) < 58 && (p.x - e.x) * e.dir > -30) this.hitPlayer(e);
          }
          if (a.t > windup + .33) { e.action = null; e.cooldown = e.recovery + this.rng() * .5; }
          continue;
        }
        const dx = p.x - e.x, dy = p.y + e.targetLane - e.y;
        e.dir = Math.sign(dx) || e.dir;
        const range = e.type === 'scribe' ? Math.min(e.engage, this.width * .42) : e.engage;
        const inRange = Math.abs(dx) <= (e.type === 'scribe' ? Math.min(e.reach, this.width * .8) : range) && Math.abs(dy) < 40;
        if (inRange && e.x > 15 && e.x < this.width - 15 && e.cooldown <= 0 && committed < 2 && p.hp > 0) {
          e.action = { t: 0, hit: false, aimX: p.x, aimY: p.y }; e.moving = false; committed++;
        } else {
          let mx = Math.abs(dx) > range - 10 ? Math.sign(dx) : 0;
          if (e.type === 'scribe' && Math.abs(dx) < range * .58 && e.x > 65 && e.x < this.width - 65) mx = -Math.sign(dx);
          let my = Math.abs(dy) > 12 ? Math.sign(dy) * .65 : 0;
          for (const other of this.enemies) {
            if (other === e || other.dead !== null) continue;
            if (Math.abs(e.x - other.x) < 65 && Math.abs(e.y - other.y) < 34) {
              my += (e.y > other.y || (e.y === other.y && e.id > other.id)) ? .7 : -.7;
              if (Math.abs(e.x - p.x) > Math.abs(other.x - p.x)) mx *= .35;
            }
          }
          const m = Math.max(1, Math.hypot(mx, my));
          e.x += mx / m * e.speed * dt; e.y += my / m * e.speed * dt;
          e.y = clamp(e.y, 493, 655); e.x = clamp(e.x, -85, this.width + 85);
          e.moving = Math.abs(mx) + Math.abs(my) > .1; e.walk += dt * (e.moving ? 11 : 2);
        }
      }
      this.enemies = this.enemies.filter(e => e.dead === null || e.dead > 0);
      if (this.mode === 'playing') this.updateProjectiles(dt);
      if (this.comboTimer > 0) { this.comboTimer -= dt; if (this.comboTimer <= 0) this.combo = 0; }
      if (this.mode !== 'playing') return;
      if (this.remaining === 0 && this.waveDelay < 0) {
        this.waveDelay = 3.1; this.projectiles = []; this.supplyAt = -1;
        if (this.wave < 4) {
          const heal = Math.min(20, 100 - p.hp); p.hp += heal;
          this.emit('clear', { heal, number: this.wave + 1 });
        } else this.emit('clear', { heal: 0, number: 5, final: true });
      }
      if (this.waveDelay >= 0) {
        this.waveDelay -= dt;
        if (this.waveDelay <= 0) {
          if (this.wave === 4) { this.mode = 'won'; this.score += Math.round(p.hp * 20); this.emit('end', { won: true }); }
          else this.beginWave(this.wave + 1);
        }
      }
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { HaloEngine, WAVES, MOVES, ENEMIES, POWERUPS };
  else root.HaloEngine = HaloEngine;
})(typeof globalThis !== 'undefined' ? globalThis : this);
