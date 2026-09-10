/**
 * 暗房配液核心计算。
 *
 * 规则（全部由本模块实时计算，界面不使用任何固定结果）：
 * - 稀释式 1+n：n 为 1–99 的整数；
 * - 目标总量、量筒容量：100–5000 mL 的整数；
 * - 浓缩液精确值 = 总量 ÷ (n+1)，以 0.5 mL 为界四舍五入到整数；
 * - 清水量 = 目标总量 − 取整后的浓缩液，保证两者之和恒等于目标总量；
 * - 单项液体超过量筒容量时，拆成「若干满量筒 + 最后余量」；
 *   恰好等于容量时不产生零余量步骤。
 */

export const N_MIN = 1;
export const N_MAX = 99;
export const VOLUME_MIN = 100;
export const VOLUME_MAX = 5000;

export interface RawInputs {
  n: string;
  total: string;
  capacity: string;
}

export interface MixInputs {
  n: number;
  total: number;
  capacity: number;
}

export interface FieldErrors {
  n?: string;
  total?: string;
  capacity?: string;
}

export type LiquidKind = 'concentrate' | 'water';

export interface MeasureStep {
  liquid: LiquidKind;
  liquidLabel: string;
  /** 本步量取体积（mL），保证 ≤ 量筒容量 */
  amount: number;
  /** 该液体的第几步（从 1 开始） */
  step: number;
  /** 该液体共需几步 */
  ofSteps: number;
}

export interface MixResult {
  n: number;
  total: number;
  capacity: number;
  /** 浓缩液精确值（未取整），仅用于展示 */
  exactConcentrate: number;
  /** 取整后的浓缩液体积（mL） */
  concentrate: number;
  /** 清水体积（mL），= total − concentrate */
  water: number;
  steps: MeasureStep[];
}

/** 以 0.5 为界四舍五入到整数（0.5 进位）。 */
export function roundHalfUpToInt(value: number): number {
  return Math.floor(value + 0.5);
}

/** 严格解析整数字符串：拒绝空串、小数、非数字字符。 */
function parseStrictInteger(raw: string): number | null {
  const text = raw.trim();
  if (text === '') return null;
  if (!/^[+-]?\d+$/.test(text)) return null;
  return Number.parseInt(text, 10);
}

export function validateField(field: keyof RawInputs, raw: string): string | undefined {
  if (raw.trim() === '') return '请输入数值';
  const value = parseStrictInteger(raw);
  if (value === null) return '必须为整数，不能含小数或字母';
  if (field === 'n') {
    if (value < N_MIN || value > N_MAX) {
      return `n 须为 ${N_MIN}–${N_MAX} 的整数`;
    }
  } else if (value < VOLUME_MIN || value > VOLUME_MAX) {
    return `须为 ${VOLUME_MIN}–${VOLUME_MAX} mL 的整数`;
  }
  return undefined;
}

/**
 * 校验全部输入。任一字段非法时 inputs 为 null，
 * 调用方必须丢弃旧配液结果（不保留旧配液卡）。
 */
export function validateInputs(raw: RawInputs): {
  inputs: MixInputs | null;
  errors: FieldErrors;
} {
  const errors: FieldErrors = {
    n: validateField('n', raw.n),
    total: validateField('total', raw.total),
    capacity: validateField('capacity', raw.capacity),
  };
  if (errors.n || errors.total || errors.capacity) {
    return { inputs: null, errors };
  }
  return {
    inputs: {
      n: Number.parseInt(raw.n.trim(), 10),
      total: Number.parseInt(raw.total.trim(), 10),
      capacity: Number.parseInt(raw.capacity.trim(), 10),
    },
    errors: {},
  };
}

/**
 * 把单项液体体积拆成量取步骤：若干满量筒 + 最后余量。
 * 体积恰好为容量整数倍时不追加零余量步骤；体积为 0 时返回空数组。
 */
export function splitVolume(volume: number, capacity: number): number[] {
  const amounts: number[] = [];
  let remaining = volume;
  while (remaining > capacity) {
    amounts.push(capacity);
    remaining -= capacity;
  }
  if (remaining > 0) {
    amounts.push(remaining);
  }
  return amounts;
}

function toSteps(liquid: LiquidKind, liquidLabel: string, amounts: number[]): MeasureStep[] {
  return amounts.map((amount, index) => ({
    liquid,
    liquidLabel,
    amount,
    step: index + 1,
    ofSteps: amounts.length,
  }));
}

/** 由合法输入计算完整配液结果。 */
export function computeMix(inputs: MixInputs): MixResult {
  const { n, total, capacity } = inputs;
  const exactConcentrate = total / (n + 1);
  const concentrate = roundHalfUpToInt(exactConcentrate);
  // 清水必须由目标总量减去取整后的浓缩液，保证两者之和不变。
  const water = total - concentrate;
  const steps = [
    ...toSteps('concentrate', '浓缩液', splitVolume(concentrate, capacity)),
    ...toSteps('water', '清水', splitVolume(water, capacity)),
  ];
  return { n, total, capacity, exactConcentrate, concentrate, water, steps };
}
