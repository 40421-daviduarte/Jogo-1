/**
 * entities.js - Classes do Protagonista, Transformações, Inimigos, Chefes e Efeitos
 * Contém a lógica física, estados de combate, IA e comportamentos das criaturas.
 */

// Configurações e Estatísticas das Formas
const FORM_STATS = {
  human: {
    name: 'Humano (Kael)',
    icon: '👤',
    width: 20,
    height: 38,
    speed: 3.4,
    jumpPower: 9.8,
    damage: 22,
    defense: 1.0,
    desc: 'Equilibrado. Espada ancestral e interação mística.'
  },
  mouse: {
    name: 'Espírito do Rato',
    icon: '🐭',
    width: 16,
    height: 14,
    speed: 3.8,
    jumpPower: 8.6,
    damage: 10,
    defense: 0.6,
    desc: 'Minúsculo. Passa por fendas estreitas e áreas secretas.'
  },
  gorilla: {
    name: 'Espírito do Gorila',
    icon: '🦍',
    width: 34,
    height: 42,
    speed: 2.2,
    jumpPower: 9.0,
    damage: 48,
    defense: 1.6,
    desc: 'Força bruta. Destrói paredes de rocha e empurra pilares.'
  },
  cheetah: {
    name: 'Espírito do Guepardo',
    icon: '🐆',
    width: 34,
    height: 22,
    speed: 6.2,
    jumpPower: 10.8,
    damage: 32,
    defense: 0.8,
    desc: 'Velocidade extrema. Atravessa pisos que desmoronam e armadilhas.'
  },
  shark: {
    name: 'Espírito do Tubarão',
    icon: '🦈',
    width: 34,
    height: 24,
    speed: 1.4, // Em terra
    swimSpeed: 4.8, // Na água
    jumpPower: 6.5,
    damage: 38,
    defense: 1.1,
    desc: 'Natação 360° total. Domínio de rios e lagos submersos.'
  },
  anteater: {
    name: 'Espírito do Tamanduá',
    icon: '🦔',
    width: 32,
    height: 24,
    speed: 2.9,
    jumpPower: 8.2,
    damage: 28,
    defense: 1.2,
    desc: 'Escavador. Cava pela terra macia e desenterra curas e relíquias.'
  }
};

// -------------------------------------------------------------
// CLASSE PLAYER (Protagonista com 6 Transformações)
// -------------------------------------------------------------
class Player {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.form = 'human';
    this.unlockedForms = new Set(['human']);
    this.facing = 1; // 1 = direita, -1 = esquerda
    
    // Status
    this.maxHp = 100;
    this.hp = 100;
    this.maxStamina = 100;
    this.stamina = 100;
    this.relics = 0;

    // Estados
    this.onGround = false;
    this.isInWater = false;
    this.isDigging = false;
    this.digTimer = 0;
    this.isDefending = false;
    this.isDashing = false;
    this.dashTimer = 0;
    this.invulnerableTimer = 0;
    this.waterWarningTimer = 0;
    this.attackTimer = 0;
    this.attackDuration = 0.22;
    this.attackCooldown = 0;
    this.isDownSlashing = false;
    this.anteaterCooldown = 0;
    this.anteaterMaxCooldown = 1.2;
    this.animTime = 0;

    this.applyFormDimensions();
  }

  applyFormDimensions() {
    const stats = FORM_STATS[this.form];
    this.width = stats.width;
    this.height = stats.height;
  }

  canTransform(newForm) {
    if (!this.unlockedForms.has(newForm)) return false;
    if (this.form === newForm) return false;
    // Não pode sair da forma de Tubarão se estiver submerso na água
    if (this.isInWater && newForm !== 'shark') {
      game.showFloatingText(this.x + this.width / 2, this.y - 12, 'Apenas o Tubarão sobrevive na água!', '#00cec9');
      return false;
    }
    // Não pode transformar em formas grandes se estiver dentro de um túnel estreito
    if (this.form === 'mouse') {
      const room = game.world.getCurrentRoom();
      const col = Math.floor((this.x + this.width / 2) / TILE_SIZE);
      const rowAbove = Math.floor((this.y - 10) / TILE_SIZE);
      if (room && room.grid[rowAbove] && room.grid[rowAbove][col] === TILE.SOLID) {
        return false; // Teto muito baixo para crescer!
      }
    }
    return true;
  }

  transform(newForm) {
    if (!this.canTransform(newForm)) return false;
    
    // Salva base de posição para manter os pés no chão
    const bottom = this.y + this.height;
    this.form = newForm;
    this.applyFormDimensions();
    this.y = bottom - this.height;

    // Efeitos visuais e sonoros
    soundSystem.playTransform();
    game.addParticles(this.x + this.width / 2, this.y + this.height / 2, 20, '#f1c40f');
    game.showFloatingText(this.x + this.width / 2, this.y - 10, FORM_STATS[newForm].name, '#f1c40f');
    game.updateHUD();
    return true;
  }

  getAttackCooldown() {
    switch (this.form) {
      case 'cheetah': return 0.22;
      case 'mouse': return 0.24;
      case 'human': return 0.32;
      case 'shark': return 0.30;
      case 'anteater': return 0.35;
      case 'gorilla': return 0.48;
      default: return 0.32;
    }
  }

  attack() {
    // Cooldown para ataques do personagem principal
    if (this.attackCooldown > 0) return;

    // Checagem se o jogador está no ar e segurando para baixo -> Ataque para Baixo (Pogo estilo Hollow Knight)
    const isHoldingDown = game.input.keys['KeyS'] || game.input.keys['ArrowDown'] || game.input.touchDown;
    const isAirborne = !this.onGround && !this.isInWater;

    if (isAirborne && isHoldingDown) {
      this.performDownAttack();
      return;
    }

    this.performStandardAttack();
  }

  performStandardAttack() {
    this.isDownSlashing = false;
    this.attackTimer = this.attackDuration;
    this.attackCooldown = this.getAttackCooldown();

    soundSystem.playAttack();

    // Cria área de hitbox do golpe à frente
    const stats = FORM_STATS[this.form];
    let reach = 26;
    let atkDamage = stats.damage;

    if (this.form === 'gorilla') {
      reach = 34;
      soundSystem.playSlam();
      game.triggerCameraShake(6, 0.2);
    } else if (this.form === 'cheetah') {
      reach = 30;
      soundSystem.playDash();
    }

    const hitX = this.facing === 1 ? this.x + this.width : this.x - reach;
    const hitBox = {
      x: hitX,
      y: this.y - 4,
      width: reach,
      height: this.height + 8
    };

    // 1. Acertar Inimigos
    const room = game.world.getCurrentRoom();
    if (room) {
      room.enemies.forEach(enemy => {
        if (enemy.hp > 0 && game.checkOverlap(hitBox, enemy)) {
          let multiplier = 1;
          // Gorila dá dano devastador em Golem blindado
          if (this.form === 'gorilla' && enemy.type === 'golem') {
            multiplier = 2.5;
            game.showFloatingText(enemy.x, enemy.y, 'QUEBRA DE ESCUDO!', '#e74c3c');
          }
          enemy.takeDamage(atkDamage * multiplier, this.x);
        }
      });

      // 2. Acertar Chefe da Sala
      if (room.activeBoss && room.activeBoss.hp > 0 && game.checkOverlap(hitBox, room.activeBoss)) {
        room.activeBoss.takeDamage(atkDamage, this.form);
      }

      // 3. Gorila pode quebrar blocos de rocha rachada (TILE.CRACKED_ROCK)
      if (this.form === 'gorilla') {
        const checkCol = Math.floor((this.facing === 1 ? this.x + this.width + 8 : this.x - 8) / TILE_SIZE);
        const checkRow1 = Math.floor(this.y / TILE_SIZE);
        const checkRow2 = Math.floor((this.y + this.height - 2) / TILE_SIZE);

        for (let r = checkRow1; r <= checkRow2; r++) {
          if (room.grid[r] && room.grid[r][checkCol] === TILE.CRACKED_ROCK) {
            game.world.destroyTile(game.world.currentRoomX, game.world.currentRoomY, checkCol, r);
            soundSystem.playSlam();
            game.addParticles(checkCol * TILE_SIZE + 16, r * TILE_SIZE + 16, 25, '#7f8c8d');
            game.showFloatingText(checkCol * TILE_SIZE, r * TILE_SIZE, 'DEMOLIDO!', '#ffa502');
          }
        }
      }
    }
  }

  performDownAttack() {
    this.isDownSlashing = true;
    this.attackTimer = this.attackDuration;
    this.attackCooldown = this.getAttackCooldown();

    soundSystem.playAttack();

    const stats = FORM_STATS[this.form];
    const reach = this.form === 'gorilla' ? 38 : 28;
    const hitBox = {
      x: this.x - 6,
      y: this.y + this.height - 2,
      width: this.width + 12,
      height: reach
    };

    let pogoTriggered = false;
    let isSpikePogo = false;
    const room = game.world.getCurrentRoom();

    if (room) {
      // 1. Acertar Inimigos por cima com corte descendente
      room.enemies.forEach(enemy => {
        if (enemy.hp > 0 && game.checkOverlap(hitBox, enemy)) {
          enemy.takeDamage(stats.damage * 1.25, this.x);
          pogoTriggered = true;
        }
      });

      // 2. Acertar Chefe por cima
      if (room.activeBoss && room.activeBoss.hp > 0 && game.checkOverlap(hitBox, room.activeBoss)) {
        room.activeBoss.takeDamage(stats.damage * 1.25, this.form);
        pogoTriggered = true;
      }

      // 3. Pogo em Espinhos (TILE.SPIKES) - Estilo Hollow Knight
      const checkRow = Math.floor((this.y + this.height + 10) / TILE_SIZE);
      const minCol = Math.floor(this.x / TILE_SIZE);
      const maxCol = Math.floor((this.x + this.width) / TILE_SIZE);
      for (let c = minCol; c <= maxCol; c++) {
        if (room.grid[checkRow] && room.grid[checkRow][c] === TILE.SPIKES) {
          pogoTriggered = true;
          isSpikePogo = true;
          break;
        }
      }
    }

    // Se acertou inimigo, chefe ou espinhos: Impulsão para Cima (Pogo Bounce)!
    if (pogoTriggered) {
      this.vy = -(stats.jumpPower * 0.98); // Impulsão que arremessa para cima
      this.onGround = false;
      this.invulnerableTimer = Math.max(this.invulnerableTimer, 0.25); // Breve imunidade ao saltar em espinhos

      soundSystem.playPogo();
      game.triggerCameraShake(3.5, 0.14);
      game.addShieldSparks(this.x + this.width / 2, this.y + this.height);
      game.addParticles(this.x + this.width / 2, this.y + this.height, 14, '#00cec9');
      game.showFloatingText(this.x + this.width / 2, this.y + this.height + 6, isSpikePogo ? 'SPIKE POGO!' : 'POGO!', '#00cec9');
    }
  }

  specialAction() {
    const stats = FORM_STATS[this.form];

    // Habilidade Especial por Forma:
    switch (this.form) {
      case 'gorilla':
        // Ground Slam: impacto sísmico em área
        if (this.stamina >= 25) {
          this.stamina -= 25;
          soundSystem.playSlam();
          game.triggerCameraShake(9, 0.3);
          game.addShockwave(this.x + this.width / 2, this.y + this.height);
          // Dano a todos os inimigos próximos no chão
          const room = game.world.getCurrentRoom();
          if (room) {
            room.enemies.forEach(e => {
              if (Math.abs(e.x - this.x) < 90 && Math.abs(e.y - this.y) < 40) {
                e.takeDamage(55, this.x);
              }
            });
          }
        }
        break;

      case 'cheetah':
        // Super Dash / Bote Feroz
        if (this.stamina >= 20 && !this.isDashing) {
          this.stamina -= 20;
          this.isDashing = true;
          this.dashTimer = 0.28;
          this.vx = this.facing * 11.0;
          soundSystem.playDash();
          game.addParticles(this.x + this.width / 2, this.y + this.height / 2, 15, '#f1c40f');
        }
        break;

      case 'shark':
        // Hydro Dash (Impulso aquático)
        if (this.isInWater && this.stamina >= 15) {
          this.stamina -= 15;
          this.vx = this.facing * 9.0;
          soundSystem.playSplash();
        }
        break;

      case 'anteater':
        this.digAction();
        break;
    }
  }

  startDefend() {
    if (this.hp <= 0) return;
    this.isDefending = true;
  }

  stopDefend() {
    this.isDefending = false;
  }

  digAction() {
    if (this.hp <= 0) return;

    // Se o jogador não estiver na forma de Tamanduá, tenta transformar caso desbloqueado
    if (this.form !== 'anteater') {
      if (this.unlockedForms.has('anteater')) {
        this.transform('anteater');
        game.showFloatingText(this.x + this.width / 2, this.y - 12, 'Espírito do Tamanduá!', '#e67e22');
      } else {
        game.showFloatingText(this.x + this.width / 2, this.y - 12, 'Tamanduá não despertado!', '#e74c3c');
        return;
      }
    }

    const room = game.world.getCurrentRoom();
    if (!room) return;

    // Cooldown específico para as habilidades do Tamanduá (escavar e ataque de garras)
    if (this.anteaterCooldown > 0) {
      game.showFloatingText(this.x + this.width / 2, this.y - 12, `Recarga: ${this.anteaterCooldown.toFixed(1)}s`, '#e67e22');
      return;
    }
    this.anteaterCooldown = this.anteaterMaxCooldown;

    // Ativa animação e efeito de escavação
    this.digTimer = 0.4;
    this.isDigging = true;
    soundSystem.playDig();
    game.triggerCameraShake(2.5, 0.15);

    const centerCol = Math.floor((this.x + this.width / 2) / TILE_SIZE);
    const centerRow = Math.floor((this.y + this.height / 2) / TILE_SIZE);
    const underRow = Math.floor((this.y + this.height + 4) / TILE_SIZE);
    const facingCol = Math.floor((this.x + (this.facing === 1 ? this.width + 6 : -6)) / TILE_SIZE);

    let dugAny = false;
    const checkAndDig = (r, c) => {
      if (room.grid[r] && room.grid[r][c] === TILE.SOFT_DIRT) {
        room.grid[r][c] = TILE.EMPTY;
        game.addParticles(c * TILE_SIZE + TILE_SIZE / 2, r * TILE_SIZE + TILE_SIZE / 2, 22, '#8d6e63');
        game.addParticles(c * TILE_SIZE + TILE_SIZE / 2, r * TILE_SIZE + TILE_SIZE / 2, 12, '#a1887f');
        dugAny = true;
        return true;
      }
      return false;
    };

    // Escava terra macia abaixo, à frente e na posição atual
    checkAndDig(underRow, centerCol);
    checkAndDig(centerRow, facingCol);
    checkAndDig(underRow, facingCol);
    checkAndDig(centerRow, centerCol);

    game.addParticles(this.x + this.width / 2, this.y + this.height, 16, '#8d6e63');

    // Quando desenterra e abre passagens no mapa
    if (dugAny) {
      soundSystem.playChest();
      game.showFloatingText(this.x + this.width / 2, this.y - 14, 'NOVA PASSAGEM ESCAVADA!', '#f39c12');
      game.triggerCameraShake(3.5, 0.2);
    }

    // Golpe de garras em inimigos próximos no chão
    room.enemies.forEach(e => {
      if (Math.abs(e.x - this.x) < 55 && Math.abs(e.y - this.y) < 32) {
        e.takeDamage(35, this.x);
        game.showFloatingText(e.x + e.width / 2, e.y - 8, 'GARRAS!', '#e67e22');
      }
    });
  }

  takeDamage(amount, sourceX) {
    if (this.invulnerableTimer > 0) return;

    // Bloqueio com Escudo Totêmico Místico
    if (this.isDefending && this.stamina >= 10) {
      this.stamina = Math.max(0, this.stamina - 15);
      const stats = FORM_STATS[this.form];
      const blockedDamage = Math.max(0, Math.round((amount * 0.15) / stats.defense));

      this.hp -= blockedDamage;
      this.invulnerableTimer = 0.5;

      // Recuo amortecido pelo escudo
      this.vx = (this.x > sourceX ? 1 : -1) * 1.8;
      this.vy = -1.5;

      soundSystem.playBlock();
      game.triggerCameraShake(2.5, 0.12);
      game.addShieldSparks(this.x + this.width / 2, this.y + this.height / 2);

      if (blockedDamage > 0) {
        game.showFloatingText(this.x + this.width / 2, this.y - 8, `BLOQUEIO! (-${blockedDamage})`, '#3498db');
      } else {
        game.showFloatingText(this.x + this.width / 2, this.y - 8, 'DEFENDIDO!', '#3498db');
      }

      if (this.hp <= 0) {
        this.hp = 0;
        game.onPlayerDeath();
      }
      game.updateHUD();
      return;
    }

    const stats = FORM_STATS[this.form];
    const actualDamage = Math.max(1, Math.round(amount / stats.defense));

    this.hp -= actualDamage;
    this.invulnerableTimer = 1.0;
    
    // Recuo
    this.vx = (this.x > sourceX ? 1 : -1) * 4.0;
    this.vy = -4.5;

    soundSystem.playHit();
    game.triggerCameraShake(5, 0.2);
    game.showFloatingText(this.x + this.width / 2, this.y, `-${actualDamage}`, '#e74c3c');
    game.addParticles(this.x + this.width / 2, this.y + this.height / 2, 12, '#e74c3c');

    if (this.hp <= 0) {
      this.hp = 0;
      game.onPlayerDeath();
    }
    game.updateHUD();
  }

  update(input, world, dt) {
    this.animTime += dt;
    if (this.invulnerableTimer > 0) this.invulnerableTimer -= dt;
    if (this.attackTimer > 0) {
      this.attackTimer -= dt;
      if (this.attackTimer <= 0) this.isDownSlashing = false;
    }
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.anteaterCooldown > 0) this.anteaterCooldown -= dt;
    if (this.digTimer > 0) this.digTimer -= dt;
    if (this.waterWarningTimer > 0) this.waterWarningTimer -= dt;

    // Recuperação passiva de Stamina (não recupera se estiver ativamente defendendo)
    if (this.stamina < this.maxStamina && !this.isDefending) {
      this.stamina = Math.min(this.maxStamina, this.stamina + 25 * dt);
    }

    const stats = FORM_STATS[this.form];
    const room = world.getCurrentRoom();
    if (!room) return;

    // 1. Checagem se está na água (Exclusivo da forma de Tubarão)
    const centerCol = Math.floor((this.x + this.width / 2) / TILE_SIZE);
    const centerRow = Math.floor((this.y + this.height / 2) / TILE_SIZE);
    const tileAtCenter = room.grid[centerRow] ? room.grid[centerRow][centerCol] : 0;
    this.isInWater = (tileAtCenter === TILE.WATER && this.form === 'shark');

    // 2. Movimentação Horizontal
    let moveDir = 0;
    if (input.keys['KeyA'] || input.keys['ArrowLeft'] || input.touchLeft) moveDir -= 1;
    if (input.keys['KeyD'] || input.keys['ArrowRight'] || input.touchRight) moveDir += 1;

    if (moveDir !== 0) this.facing = moveDir;

    if (this.isDashing) {
      this.dashTimer -= dt;
      if (this.dashTimer <= 0) this.isDashing = false;
    } else {
      let curSpeed = stats.speed;
      if (this.isInWater) {
        curSpeed = stats.swimSpeed;
      }
      if (this.isDefending) {
        curSpeed *= 0.35; // Guarda tática de defesa
      }
      this.vx = moveDir * curSpeed;
    }

    // 3. Física Vertical e Pulo
    if (this.isInWater && this.form === 'shark') {
      // Física Aquática do Tubarão (Natação livre 360°)
      let swimY = 0;
      if (input.keys['KeyW'] || input.keys['ArrowUp'] || input.keys['Space']) swimY -= 1;
      if (input.keys['KeyS'] || input.keys['ArrowDown']) swimY += 1;
      this.vy = swimY * stats.swimSpeed;
    } else {
      // Gravidade Terrestre Padrão
      const gravity = 22;
      this.vy += gravity * dt;

      // Pulo do chão (KeyK reservado para Defesa)
      if ((input.keys['Space'] || input.keys['KeyW'] || input.touchJump) && this.onGround && !this.isDefending) {
        this.vy = -stats.jumpPower;
        this.onGround = false;
        this.isDigging = false;
        soundSystem.playJump();
        game.addParticles(this.x + this.width / 2, this.y + this.height, 8, '#bdc3c7');
      }
    }

    // 4. Integração de Movimento e Colisões AABB com o Cenário
    this.resolveCollisions(world, room, dt);

    // 5. Bloco Empurrável do Gorila (PUSH_BLOCK)
    if (this.form === 'gorilla' && moveDir !== 0) {
      this.handleGorillaPush(room, moveDir);
    }
  }

  resolveCollisions(world, room, dt) {
    // Passo 1: Movimento Horizontal
    this.x += this.vx;
    this.checkTileCollisionX(room);

    // Passo 2: Movimento Vertical
    this.y += this.vy * (this.isInWater && this.form === 'shark' ? 1 : 28 * dt);
    this.onGround = false;
    this.checkTileCollisionY(room);

    // Confinamento e Transição entre Salas
    this.handleRoomBoundaries(world);
  }

  checkTileCollisionX(room) {
    const leftCol = Math.floor(this.x / TILE_SIZE);
    const rightCol = Math.floor((this.x + this.width) / TILE_SIZE);
    const topRow = Math.floor(this.y / TILE_SIZE);
    const botRow = Math.floor((this.y + this.height - 1) / TILE_SIZE);

    for (let r = topRow; r <= botRow; r++) {
      for (let c = leftCol; c <= rightCol; c++) {
        if (!room.grid[r]) continue;
        const tile = room.grid[r][c];

        if (this.isSolidForPlayer(tile)) {
          if (tile === TILE.WATER && this.form !== 'shark') {
            this.handleWaterBarrier();
          }
          if (this.vx > 0) {
            this.x = c * TILE_SIZE - this.width;
          } else if (this.vx < 0) {
            this.x = (c + 1) * TILE_SIZE;
          }
          this.vx = 0;
          return;
        }
      }
    }
  }

  checkTileCollisionY(room) {
    const leftCol = Math.floor(this.x / TILE_SIZE);
    const rightCol = Math.floor((this.x + this.width - 1) / TILE_SIZE);
    const topRow = Math.floor(this.y / TILE_SIZE);
    const botRow = Math.floor((this.y + this.height) / TILE_SIZE);

    for (let r = topRow; r <= botRow; r++) {
      for (let c = leftCol; c <= rightCol; c++) {
        if (!room.grid[r]) continue;
        const tile = room.grid[r][c];

        // Pisos que desmoronam ao pisar (Guepardo)
        if (tile === TILE.CRUMBLING && this.vy >= 0) {
          game.world.crumblingTiles.push({ c, r, timer: 0.35 });
        }

        // Espinhos causam dano imediato
        if (tile === TILE.SPIKES) {
          this.takeDamage(20, this.x);
          this.vy = -6;
          return;
        }

        if (this.isSolidForPlayer(tile)) {
          if (tile === TILE.WATER && this.form !== 'shark') {
            this.handleWaterBarrier();
          }
          if (this.vy > 0) {
            this.y = r * TILE_SIZE - this.height;
            this.vy = 0;
            this.onGround = true;
          } else if (this.vy < 0) {
            this.y = (r + 1) * TILE_SIZE;
            this.vy = 0;
          }
          return;
        }
      }
    }
  }

  handleWaterBarrier() {
    if (this.waterWarningTimer <= 0) {
      this.waterWarningTimer = 1.0;
      soundSystem.playSplash();
      game.addWaterSpray(this.x + this.width / 2, this.y + this.height);
      game.showFloatingText(this.x + this.width / 2, this.y - 12, 'Águas Profundas: Use o Tubarão [5]!', '#0984e3');
    }
  }

  isSolidForPlayer(tile) {
    if (tile === TILE.SOLID || tile === TILE.CRACKED_ROCK || tile === TILE.PUSH_BLOCK) {
      return true;
    }
    // Água Profunda: apenas o Tubarão pode submergir e nadar nela!
    if (tile === TILE.WATER) {
      return this.form !== 'shark';
    }
    // Túnel estreito só deixa o Rato (ou Tamanduá cavando) passar
    if (tile === TILE.TUNNEL) {
      return !(this.form === 'mouse' || (this.form === 'anteater' && this.isDigging));
    }
    // Solo de terra macia bloqueia a menos que o Tamanduá esteja cavando
    if (tile === TILE.SOFT_DIRT) {
      return !(this.form === 'anteater' && this.isDigging);
    }
    return false;
  }

  handleGorillaPush(room, dir) {
    const frontCol = Math.floor((this.facing === 1 ? this.x + this.width + 4 : this.x - 4) / TILE_SIZE);
    const frontRow = Math.floor((this.y + this.height / 2) / TILE_SIZE);

    if (room.grid[frontRow] && room.grid[frontRow][frontCol] === TILE.PUSH_BLOCK) {
      const nextCol = frontCol + dir;
      if (room.grid[frontRow][nextCol] === TILE.EMPTY) {
        room.grid[frontRow][frontCol] = TILE.EMPTY;
        room.grid[frontRow][nextCol] = TILE.PUSH_BLOCK;
        soundSystem.playSlam();
      }
    }
  }

  handleRoomBoundaries(world) {
    let targetRx = world.currentRoomX;
    let targetRy = world.currentRoomY;
    let dir = null;

    // Checagem de transposição das 4 bordas da tela
    if (this.x > ROOM_WIDTH - this.width / 2) {
      targetRx += 1;
      dir = 'right';
    } else if (this.x < -this.width / 2) {
      targetRx -= 1;
      dir = 'left';
    } else if (this.y > ROOM_HEIGHT - this.height / 2) {
      targetRy += 1;
      dir = 'down';
    } else if (this.y < -this.height / 2) {
      targetRy -= 1;
      dir = 'up';
    }

    if (!dir) return;

    const nextRoomKey = world.getRoomKey(targetRx, targetRy);
    const nextRoom = world.rooms.get(nextRoomKey);

    // SE A SALA DE DESTINO NÃO EXISTIR: Bloqueia o personagem dentro da sala atual!
    // Corrige o bug de teleporte acidental para o outro lado da tela!
    if (!nextRoom) {
      if (dir === 'right') this.x = ROOM_WIDTH - this.width - 2;
      else if (dir === 'left') this.x = 2;
      else if (dir === 'down') { this.y = ROOM_HEIGHT - this.height - 2; this.vy = 0; }
      else if (dir === 'up') { this.y = 2; this.vy = 0; }
      return;
    }

    // A sala de destino existe! Calcula o ponto de entrada correto e seguro
    let newX = this.x;
    let newY = this.y;

    if (dir === 'right') {
      newX = 8;
    } else if (dir === 'left') {
      newX = ROOM_WIDTH - this.width - 8;
    } else if (dir === 'down') {
      newY = 8;
    } else if (dir === 'up') {
      newY = ROOM_HEIGHT - this.height - 8;
    }

    this.x = newX;
    this.y = newY;
    game.changeRoom(targetRx, targetRy);

    // Garante que o jogador não spawne preso dentro de um bloco sólido
    this.ensureSafeSpawn(nextRoom);
  }

  ensureSafeSpawn(room) {
    if (!room) return;

    const isSolid = (px, py) => {
      const minC = Math.max(0, Math.floor(px / TILE_SIZE));
      const maxC = Math.min(ROOM_COLS - 1, Math.floor((px + this.width) / TILE_SIZE));
      const minR = Math.max(0, Math.floor(py / TILE_SIZE));
      const maxR = Math.min(ROOM_ROWS - 1, Math.floor((py + this.height) / TILE_SIZE));

      for (let r = minR; r <= maxR; r++) {
        for (let c = minC; c <= maxC; c++) {
          const tile = room.grid[r][c];
          if (tile === TILE.SOLID || tile === TILE.CRACKED_ROCK || tile === TILE.PUSH_BLOCK) {
            return true;
          }
        }
      }
      return false;
    };

    if (isSolid(this.x, this.y)) {
      // Ajuste suave para a posição livre mais próxima
      const offsets = [
        [0, -8], [0, -16], [0, -24], [0, -32],
        [8, 0], [-8, 0], [16, 0], [-16, 0],
        [0, 8], [0, 16], [0, 24]
      ];
      for (const [ox, oy] of offsets) {
        const testX = Math.max(2, Math.min(ROOM_WIDTH - this.width - 2, this.x + ox));
        const testY = Math.max(2, Math.min(ROOM_HEIGHT - this.height - 2, this.y + oy));
        if (!isSolid(testX, testY)) {
          this.x = testX;
          this.y = testY;
          break;
        }
      }
    }
  }
}

// -------------------------------------------------------------
// CLASSE ENEMY (Inimigos com Inteligência Artificial)
// -------------------------------------------------------------
class Enemy {
  constructor(data) {
    this.type = data.type;
    this.x = data.x * TILE_SIZE;
    this.y = data.y * TILE_SIZE;
    this.vx = 1.0;
    this.vy = 0;
    this.facing = 1;
    this.hurtTimer = 0;
    this.animTime = 0;
    this.attackCooldown = 0;
    this.maxAttackCooldown = (this.type === 'golem' ? 1.8 : (this.type === 'boar' ? 1.5 : (this.type === 'aquatic_serpent' ? 1.4 : 1.2)));

    switch (this.type) {
      case 'slime':
        this.width = 24; this.height = 20;
        this.maxHp = 30; this.hp = 30;
        this.damage = 12;
        break;
      case 'bat':
        this.width = 20; this.height = 18;
        this.maxHp = 25; this.hp = 25;
        this.damage = 10;
        this.startY = this.y;
        break;
      case 'boar':
        this.width = 32; this.height = 24;
        this.maxHp = 60; this.hp = 60;
        this.damage = 22;
        break;
      case 'golem':
        this.width = 32; this.height = 36;
        this.maxHp = 120; this.hp = 120;
        this.damage = 26;
        break;
      case 'aquatic_serpent':
        this.width = 28; this.height = 18;
        this.maxHp = 45; this.hp = 45;
        this.damage = 16;
        break;
      case 'burrower':
        this.width = 28; this.height = 22;
        this.maxHp = 50; this.hp = 50;
        this.damage = 18;
        break;
    }
  }

  takeDamage(amount, sourceX) {
    this.hp -= amount;
    this.hurtTimer = 0.25;
    this.vx = (this.x > sourceX ? 1 : -1) * 3.5;

    soundSystem.playHit();
    game.showFloatingText(this.x + this.width / 2, this.y, `-${Math.round(amount)}`, '#fff');
    game.addParticles(this.x + this.width / 2, this.y + this.height / 2, 8, '#2ed573');

    if (this.hp <= 0) {
      this.hp = 0;
      game.onEnemyDefeated(this);
    }
  }

  update(player, dt) {
    this.animTime += dt;
    if (this.hurtTimer > 0) this.hurtTimer -= dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.hp <= 0) return;

    const distToPlayer = Math.hypot(player.x - this.x, player.y - this.y);

    switch (this.type) {
      case 'slime':
        // Pulos periódicos
        if (Math.floor(this.animTime * 2) % 3 === 0) {
          this.x += this.facing * 1.5;
        }
        break;

      case 'bat':
        // Voo senoidal perseguindo o jogador
        if (distToPlayer < 220) {
          this.x += (player.x > this.x ? 1 : -1) * 1.8;
          this.y += (player.y > this.y ? 1 : -1) * 1.4;
          this.facing = player.x > this.x ? 1 : -1;
        } else {
          this.y = this.startY + Math.sin(this.animTime * 4) * 16;
        }
        break;

      case 'boar':
        // Investida rápida quando o jogador está na mesma altura
        if (distToPlayer < 180 && Math.abs(player.y - this.y) < 30) {
          this.facing = player.x > this.x ? 1 : -1;
          this.x += this.facing * 3.6;
        } else {
          this.x += this.facing * 0.8;
        }
        break;

      case 'aquatic_serpent':
        // Natação fluida
        this.x += Math.sin(this.animTime * 3) * 2;
        this.y += Math.cos(this.animTime * 2) * 1.5;
        break;

      default:
        this.x += this.facing * 1.0;
        break;
    }

    // Colisão de ataque com o jogador (com cooldown para todos os inimigos)
    if (game.checkOverlap(this, player)) {
      if (this.attackCooldown <= 0) {
        player.takeDamage(this.damage, this.x);
        this.attackCooldown = this.maxAttackCooldown;
        game.addParticles(this.x + this.width / 2, this.y + this.height / 2, 6, '#e74c3c');
      }
    }
  }
}

// -------------------------------------------------------------
// CLASSE BOSS (Chefes Multifásicos com Mecânicas Estratégicas)
// -------------------------------------------------------------
class Boss {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.x = config.x * TILE_SIZE;
    this.y = config.y * TILE_SIZE;
    this.rewardTotem = config.rewardTotem || null;
    this.isFinalBoss = config.isFinalBoss || false;
    this.phase = 1;
    this.animTime = 0;
    this.hurtTimer = 0;
    this.facing = -1;
    this.attackCooldown = 0;
    this.maxAttackCooldown = 1.3;

    switch (this.id) {
      case 'cragmor':
        this.width = 68; this.height = 72;
        this.maxHp = 300; this.hp = 300;
        this.damage = 25;
        break;
      case 'scylla':
        this.width = 76; this.height = 60;
        this.maxHp = 380; this.hp = 380;
        this.damage = 28;
        break;
      case 'zephyrion':
        this.width = 72; this.height = 54;
        this.maxHp = 420; this.hp = 420;
        this.damage = 32;
        break;
      case 'void_lord':
        this.width = 84; this.height = 90;
        this.maxHp = 600; this.hp = 600;
        this.damage = 35;
        break;
    }

    soundSystem.playBossRoar();
    soundSystem.setBiome('boss');
  }

  takeDamage(amount, playerForm) {
    let actual = amount;

    // Mecânica Cragmor: O Gorila causa o dobro de dano no Titã de Pedra
    if (this.id === 'cragmor' && playerForm === 'gorilla') {
      actual *= 2.0;
      game.showFloatingText(this.x + this.width / 2, this.y, 'GOLPE ESMAGADOR!', '#f1c40f');
    }

    this.hp -= actual;
    this.hurtTimer = 0.2;
    soundSystem.playHit();

    game.showFloatingText(this.x + this.width / 2, this.y, `-${Math.round(actual)}`, '#ff7675');
    game.updateBossHUD(this);

    // Mudança de Fase
    if (this.phase === 1 && this.hp <= this.maxHp * 0.5) {
      this.phase = 2;
      soundSystem.playBossRoar();
      game.triggerCameraShake(8, 0.4);
      game.showFloatingText(this.x + this.width / 2, this.y - 20, 'FASE 2: FÚRIA ANCESTRAL!', '#e74c3c');
    }

    if (this.hp <= 0) {
      this.hp = 0;
      game.onBossDefeated(this);
    }
  }

  update(player, dt) {
    this.animTime += dt;
    if (this.hurtTimer > 0) this.hurtTimer -= dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.hp <= 0) return;

    this.facing = player.x > this.x ? 1 : -1;

    // Padrões de Ataque por Chefe
    switch (this.id) {
      case 'cragmor':
        // Saltos sísmicos periódicos
        if (Math.floor(this.animTime * 1.5) % 4 === 0) {
          this.x += this.facing * (this.phase === 2 ? 3.0 : 1.5);
        }
        break;

      case 'scylla':
        // Movimento senoidal em onda subaquática
        this.x += this.facing * 2.2;
        this.y += Math.sin(this.animTime * 4) * 2.5;
        break;

      case 'zephyrion':
        // Rasantes aéreos de alta velocidade
        this.x += this.facing * (this.phase === 2 ? 5.5 : 3.8);
        this.y += Math.cos(this.animTime * 3) * 3.0;
        break;

      case 'void_lord':
        // Flutuação cósmica e teleporte periódico
        this.x += Math.sin(this.animTime * 2) * 2.0;
        this.y += Math.cos(this.animTime * 2) * 1.5;
        break;
    }

    // Dano ao colidir com o jogador (com cooldown para ataques do chefe)
    if (game.checkOverlap(this, player)) {
      if (this.attackCooldown <= 0) {
        player.takeDamage(this.damage, this.x);
        this.attackCooldown = (this.phase === 2 ? 0.9 : 1.3);
        game.addParticles(this.x + this.width / 2, this.y + this.height / 2, 10, '#e74c3c');
      }
    }
  }
}
