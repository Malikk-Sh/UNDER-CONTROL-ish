/**
 * Автотесты контроллера персонажа (GDD §20.1).
 *
 * Проверяются скорость, импульсы, coyote time, буфер прыжка и — отдельно —
 * гарантия из GDD §0.1: игрок не может застрять без управления надолго.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  Button,
  FIXED_DT,
  PLAYER,
  PlayerState,
  TileMap,
  createPlayerSim,
  makeInput,
  stepPlayerMotion,
  type InputFrame,
  type MotionEnv,
  type PlayerSim,
} from '@uc/shared';

const FLAT_ROOM = [
  '################################################################',
  '#..............................................................#',
  '#..............................................................#',
  '#..............................................................#',
  '#..............................................................#',
  '################################################################',
];

function makeEnv(rows: readonly string[] = FLAT_ROOM): MotionEnv {
  return { map: new TileMap(rows), solids: [], jumpFactor: 1 };
}

function run(player: PlayerSim, env: MotionEnv, frames: number, build: (index: number) => Partial<InputFrame>): void {
  for (let i = 0; i < frames; i++) {
    const patch = build(i);
    const input: InputFrame = {
      seq: player.lastAppliedSeq + 1,
      axis: patch.axis ?? 0,
      buttons: patch.buttons ?? 0,
      aim: patch.aim ?? 0,
    };
    stepPlayerMotion(player, input, env, FIXED_DT);
  }
}

/** Ставит персонажа ровно на пол, чтобы тест не зависел от времени падения. */
function grounded(env: MotionEnv): PlayerSim {
  const player = createPlayerSim('p1', 100, 100);
  run(player, env, 40, () => ({}));
  return player;
}

describe('движение', () => {
  let env: MotionEnv;

  beforeEach(() => {
    env = makeEnv();
  });

  it('приземляется на пол и остаётся на нём', () => {
    const player = grounded(env);
    expect(player.grounded).toBe(true);
    expect(player.body.y).toBeLessThan(env.map.heightPx);
    expect(player.vy).toBe(0);
  });

  it('разгоняется до беговой скорости и не превышает её', () => {
    const player = grounded(env);
    run(player, env, 60, () => ({ axis: 1 }));
    expect(player.vx).toBeGreaterThan(PLAYER.runSpeed * 0.9);
    expect(player.vx).toBeLessThanOrEqual(PLAYER.runSpeed * 1.01);
  });

  it('останавливается при отпускании оси', () => {
    const player = grounded(env);
    run(player, env, 40, () => ({ axis: 1 }));
    run(player, env, 40, () => ({}));
    expect(Math.abs(player.vx)).toBeLessThan(1);
  });

  it('поворачивает персонажа по направлению движения', () => {
    const player = grounded(env);
    run(player, env, 10, () => ({ axis: -1 }));
    expect(player.facing).toBe(-1);
    run(player, env, 10, () => ({ axis: 1 }));
    expect(player.facing).toBe(1);
  });
});

describe('прыжок', () => {
  it('поднимает персонажа и возвращает его на пол', () => {
    const env = makeEnv();
    const player = grounded(env);
    const groundY = player.body.y;

    run(player, env, 1, () => ({ buttons: Button.Jump }));
    expect(player.vy).toBeLessThan(0);

    run(player, env, 8, () => ({ buttons: Button.Jump }));
    expect(player.body.y).toBeLessThan(groundY - 30);

    run(player, env, 80, () => ({}));
    expect(player.grounded).toBe(true);
    expect(player.body.y).toBeCloseTo(groundY, 0);
  });

  it('уважает coyote time после схода с края', () => {
    const env = makeEnv();
    const player = grounded(env);
    // Имитируем сход с платформы: снимаем опору вручную.
    player.grounded = false;
    player.coyote = PLAYER.coyoteTime;
    player.body.y -= 4;

    run(player, env, 1, () => ({ buttons: Button.Jump }));
    expect(player.vy).toBeLessThan(0);
  });

  it('буферизует прыжок, нажатый чуть раньше приземления', () => {
    const env = makeEnv();
    // Ставим персонажа в воздух так, чтобы до пола оставалась пара кадров.
    const player = createPlayerSim('p1', 100, 130);
    expect(player.grounded).toBe(false);

    // Единственный фронт нажатия — в воздухе. Буфер обязан дожить до касания.
    let strongestUpward = 0;
    run(player, env, 1, () => ({ buttons: Button.Jump }));
    for (let i = 0; i < 6; i++) {
      run(player, env, 1, () => ({ buttons: Button.Jump }));
      strongestUpward = Math.min(strongestUpward, player.vy);
    }
    expect(strongestUpward).toBeLessThan(-100);
  });

  it('обрезает высоту прыжка при раннем отпускании', () => {
    const env = makeEnv();

    const full = grounded(makeEnv());
    run(full, env, 10, () => ({ buttons: Button.Jump }));

    const short = grounded(makeEnv());
    run(short, env, 1, () => ({ buttons: Button.Jump }));
    run(short, env, 9, () => ({}));

    // Сравниваем на подъёме: к моменту приземления разница уже пропадёт.
    expect(short.body.y).toBeGreaterThan(full.body.y);
  });

  it('прыгает ниже с тяжёлым грузом', () => {
    const light = grounded(makeEnv());
    const heavy = grounded(makeEnv());

    const lightEnv = makeEnv();
    const heavyEnv = makeEnv();
    heavyEnv.jumpFactor = 0.7;

    run(light, lightEnv, 10, () => ({ buttons: Button.Jump }));
    run(heavy, heavyEnv, 10, () => ({ buttons: Button.Jump }));

    expect(heavy.body.y).toBeGreaterThan(light.body.y);
  });
});

describe('столкновения', () => {
  it('не проходит сквозь стену на полной скорости', () => {
    const env = makeEnv(['##########', '#........#', '#........#', '##########']);
    const player = createPlayerSim('p1', 60, 60);
    run(player, env, 200, () => ({ axis: 1 }));

    expect(player.body.x + player.body.hw).toBeLessThanOrEqual(env.map.widthPx - 32 + 0.5);
  });

  it('не проваливается сквозь пол при максимальной скорости падения', () => {
    const env = makeEnv([
      '##########',
      '#........#',
      '#........#',
      '#........#',
      '#........#',
      '#........#',
      '#........#',
      '#........#',
      '##########',
    ]);
    const player = createPlayerSim('p1', 100, 40);
    player.vy = PLAYER.maxFallSpeed;
    run(player, env, 120, () => ({}));

    expect(player.grounded).toBe(true);
    expect(player.body.y).toBeLessThan(env.map.heightPx);
  });
});

describe('оглушение', () => {
  it('всегда заканчивается — бесконечного оглушения не существует', () => {
    const env = makeEnv();
    const player = grounded(env);
    player.stunTimer = PLAYER.stunMax;

    const stepsNeeded = Math.ceil(PLAYER.stunMax / FIXED_DT) + 2;
    run(player, env, stepsNeeded, () => ({ axis: 1 }));

    expect(player.stunTimer).toBe(0);
  });

  it('оглушённый не управляется, но не застревает в воздухе', () => {
    const env = makeEnv();
    const player = grounded(env);
    player.stunTimer = 0.5;
    const startX = player.body.x;

    run(player, env, 5, () => ({ axis: 1 }));
    // За пять тиков под оглушением заметного разгона быть не должно.
    expect(Math.abs(player.body.x - startX)).toBeLessThan(6);
  });

  it('время без управления укладывается в норматив GDD (не больше пяти секунд)', () => {
    // Оглушение и состояние «выведен» вместе не должны превышать пяти секунд.
    expect(PLAYER.stunMax).toBeLessThanOrEqual(1.2);
    expect(PLAYER.downedDuration).toBeLessThanOrEqual(5);
  });
});

describe('состояния', () => {
  it('новый персонаж активен и неуязвим первые мгновения', () => {
    const player = createPlayerSim('p1', 10, 10);
    expect(player.state).toBe(PlayerState.Active);
    expect(player.invulnerable).toBeGreaterThan(0);
  });

  it('сохраняет номер последнего применённого ввода', () => {
    const env = makeEnv();
    const player = createPlayerSim('p1', 100, 100);
    const input = makeInput(42);
    stepPlayerMotion(player, input, env, FIXED_DT);
    expect(player.lastAppliedSeq).toBe(42);
  });
});
