import { describe, expect, it } from 'vitest';
import {
  computeMix,
  roundHalfUpToInt,
  splitVolume,
  validateInputs,
  N_MIN,
  N_MAX,
  VOLUME_MIN,
  VOLUME_MAX,
} from '../../src/lib/dilution';

describe('roundHalfUpToInt：以 0.5 mL 为界四舍五入', () => {
  it('小于 0.5 舍去', () => {
    expect(roundHalfUpToInt(25.49)).toBe(25);
  });
  it('恰好 0.5 进位', () => {
    expect(roundHalfUpToInt(25.5)).toBe(26);
  });
  it('大于 0.5 进位', () => {
    expect(roundHalfUpToInt(25.51)).toBe(26);
  });
  it('整数保持不变', () => {
    expect(roundHalfUpToInt(25)).toBe(25);
  });
});

describe('computeMix：浓缩液与清水', () => {
  it('1+4、1000 mL → 浓缩液 200 mL、清水 800 mL', () => {
    const r = computeMix({ n: 4, total: 1000, capacity: 5000 });
    expect(r.exactConcentrate).toBe(200);
    expect(r.concentrate).toBe(200);
    expect(r.water).toBe(800);
  });

  it('0.5 边界：102 ÷ 4 = 25.5 → 26，清水随之减少', () => {
    const r = computeMix({ n: 3, total: 102, capacity: 5000 });
    expect(r.concentrate).toBe(26);
    expect(r.water).toBe(76);
  });

  it('0.5 边界之下：101 ÷ 4 = 25.25 → 25', () => {
    const r = computeMix({ n: 3, total: 101, capacity: 5000 });
    expect(r.concentrate).toBe(25);
    expect(r.water).toBe(76);
  });

  it('清水 = 总量 − 取整后浓缩液：全量程扫描，两者之和恒等于目标总量', () => {
    for (let total = VOLUME_MIN; total <= VOLUME_MAX; total += 13) {
      for (let n = N_MIN; n <= N_MAX; n += 3) {
        const r = computeMix({ n, total, capacity: VOLUME_MIN });
        expect(r.concentrate + r.water).toBe(total);
        expect(r.concentrate).toBe(roundHalfUpToInt(total / (n + 1)));
      }
    }
  });
});

describe('splitVolume：满量筒 + 最后余量', () => {
  it('800 mL / 300 mL 量筒 → 300 + 300 + 200', () => {
    expect(splitVolume(800, 300)).toEqual([300, 300, 200]);
  });

  it('恰好等于容量 → 单个满量筒，无零余量步骤', () => {
    expect(splitVolume(300, 300)).toEqual([300]);
  });

  it('容量的整数倍 → 全是满量筒，无零余量步骤', () => {
    expect(splitVolume(600, 300)).toEqual([300, 300]);
  });

  it('不足一筒 → 单步余量', () => {
    expect(splitVolume(120, 300)).toEqual([120]);
  });

  it('体积为 0 → 无步骤', () => {
    expect(splitVolume(0, 300)).toEqual([]);
  });
});

describe('computeMix：量取步骤全局性质', () => {
  it('全量程扫描：每步 ≤ 容量、无零步、各步合计严格等于目标总量', () => {
    for (let total = VOLUME_MIN; total <= VOLUME_MAX; total += 97) {
      for (let capacity = VOLUME_MIN; capacity <= VOLUME_MAX; capacity += 173) {
        for (let n = N_MIN; n <= N_MAX; n += 11) {
          const r = computeMix({ n, total, capacity });
          expect(r.steps.length).toBeGreaterThan(0);
          for (const step of r.steps) {
            expect(step.amount).toBeGreaterThan(0);
            expect(step.amount).toBeLessThanOrEqual(capacity);
          }
          const sum = r.steps.reduce((acc, s) => acc + s.amount, 0);
          expect(sum).toBe(total);
        }
      }
    }
  });

  it('步骤按液体分组：先浓缩液后清水，次数编号从 1 连续递增', () => {
    const r = computeMix({ n: 4, total: 1000, capacity: 300 });
    // 浓缩液 200 → [200]；清水 800 → [300, 300, 200]
    expect(r.steps.map((s) => [s.liquid, s.amount])).toEqual([
      ['concentrate', 200],
      ['water', 300],
      ['water', 300],
      ['water', 200],
    ]);
    expect(r.steps.map((s) => s.step)).toEqual([1, 1, 2, 3]);
    expect(r.steps.map((s) => s.ofSteps)).toEqual([1, 3, 3, 3]);
  });
});

describe('validateInputs：输入边界', () => {
  const valid = { n: '4', total: '1000', capacity: '250' };

  it('合法输入通过', () => {
    const { inputs, errors } = validateInputs(valid);
    expect(errors).toEqual({});
    expect(inputs).toEqual({ n: 4, total: 1000, capacity: 250 });
  });

  it.each(['0', '100', '-1', '1.5', 'abc', ''])('非法 n=%s 被拒绝', (n) => {
    const { inputs, errors } = validateInputs({ ...valid, n });
    expect(inputs).toBeNull();
    expect(errors.n).toBeTruthy();
  });

  it('n 边界 1 与 99 均合法', () => {
    expect(validateInputs({ ...valid, n: '1' }).inputs?.n).toBe(1);
    expect(validateInputs({ ...valid, n: '99' }).inputs?.n).toBe(99);
  });

  it.each(['99', '5001', '100.5', 'abc', ''])('非法总量=%s 被拒绝', (total) => {
    const { inputs, errors } = validateInputs({ ...valid, total });
    expect(inputs).toBeNull();
    expect(errors.total).toBeTruthy();
  });

  it.each(['99', '5001', '250.5', 'abc', ''])('非法容量=%s 被拒绝', (capacity) => {
    const { inputs, errors } = validateInputs({ ...valid, capacity });
    expect(inputs).toBeNull();
    expect(errors.capacity).toBeTruthy();
  });

  it('总量与容量边界 100 与 5000 均合法', () => {
    expect(validateInputs({ ...valid, total: '100' }).inputs?.total).toBe(100);
    expect(validateInputs({ ...valid, total: '5000' }).inputs?.total).toBe(5000);
    expect(validateInputs({ ...valid, capacity: '100' }).inputs?.capacity).toBe(100);
    expect(validateInputs({ ...valid, capacity: '5000' }).inputs?.capacity).toBe(5000);
  });

  it('任一字段非法时 inputs 为 null（界面须丢弃旧配液卡）', () => {
    expect(validateInputs({ n: '0', total: '1000', capacity: '250' }).inputs).toBeNull();
    expect(validateInputs({ n: '4', total: '99', capacity: '250' }).inputs).toBeNull();
    expect(validateInputs({ n: '4', total: '1000', capacity: '5001' }).inputs).toBeNull();
  });
});
