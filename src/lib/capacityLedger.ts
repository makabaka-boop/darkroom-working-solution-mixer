/**
 * 药液处理容量台账（领域服务）。
 *
 * 与配液计算相互独立：这里跟踪一批药液按「等效胶片数」计的额定容量、
 * 逐次登记的处理用量与剩余容量，避免凭记忆继续使用已耗尽的药液。
 *
 * 契约 = 两个命令（纯函数，不修改传入状态，返回新状态）：
 * - createBatch：创建带名称与额定容量的药液批次；
 * - recordUsage：向指定批次登记一次处理用量，写入前重新计算剩余量，
 *   剩余量 = 额定容量 − 该批全部已登记用量之和；登记后剩余为 0 即「已耗尽」。
 *
 * 使用记录一旦写入不可修改：命令只追加、不更新、不删除；
 * 累计用量 / 剩余容量 / 状态均由记录推导，不单独存储。
 *
 * 校验失败时返回中文原因且不产生任何写入：
 * - 名称为空；
 * - 额定容量 / 胶片数量为空、非整数或非正整数；
 * - 登记数量超过当前剩余容量。
 * 字段校验函数同时导出，界面可借此把错误放到对应字段下方，
 * 但命令本身仍是最终闸门（同样校验在命令内再执行一次）。
 */

/** 批次状态：使用中 / 已耗尽 */
export type BatchStatus = 'active' | 'exhausted';

export const BATCH_STATUS_LABEL: Record<BatchStatus, string> = {
  active: '使用中',
  exhausted: '已耗尽',
};

export interface ChemicalBatch {
  id: string;
  /** 药液名称（非空，已去除首尾空白） */
  name: string;
  /** 额定容量：整批药液可处理的等效胶片总数（正整数） */
  capacity: number;
  /** 创建时间（ISO 8601） */
  createdAt: string;
}

export interface UsageRecord {
  id: string;
  batchId: string;
  /** 本次处理的等效胶片数量（正整数） */
  films: number;
  /** 备注（可为空字符串） */
  note: string;
  /** 写入前重新计算出的、本次登记之后的剩余容量（恒 ≥ 0） */
  remainingAfter: number;
  /** 登记时间（ISO 8601） */
  createdAt: string;
}

export interface LedgerState {
  batches: ChemicalBatch[];
  records: UsageRecord[];
}

export const EMPTY_LEDGER: LedgerState = { batches: [], records: [] };

/** 命令依赖：时间与 id 生成器可注入，便于测试复现。 */
export interface LedgerDeps {
  now: () => Date;
  nextId: () => string;
}

/** 生产环境默认依赖。 */
export function defaultLedgerDeps(): LedgerDeps {
  let counter = 0;
  return {
    now: () => new Date(),
    nextId: () => {
      counter += 1;
      return `${Date.now().toString(36)}-${counter.toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
    },
  };
}

export type CommandResult<T> =
  | { ok: true; value: T; state: LedgerState }
  | { ok: false; error: string };

/** 严格解析整数字符串：拒绝空串、小数、非数字字符。 */
function parseStrictInteger(raw: string): number | null {
  const text = raw.trim();
  if (text === '') return null;
  if (!/^[+-]?\d+$/.test(text)) return null;
  return Number.parseInt(text, 10);
}

/** 批次名称校验：空（含纯空白）不允许。 */
export function validateBatchName(name: string): string | undefined {
  if (name.trim() === '') return '请输入药液名称';
  return undefined;
}

/** 额定容量校验：正整数。 */
export function validateCapacityInput(raw: string): string | undefined {
  if (raw.trim() === '') return '请输入额定容量';
  const value = parseStrictInteger(raw);
  if (value === null) return '额定容量必须为整数，不能含小数或字母';
  if (value <= 0) return '额定容量须为大于 0 的整数';
  return undefined;
}

/** 登记数量校验：正整数（是否超过剩余容量由 recordUsage 判定）。 */
export function validateFilmsInput(raw: string): string | undefined {
  if (raw.trim() === '') return '请输入等效胶片数量';
  const value = parseStrictInteger(raw);
  if (value === null) return '数量必须为整数，不能含小数或字母';
  if (value <= 0) return '数量须为大于 0 的整数';
  return undefined;
}

/** 某批次已登记用量之和（累计用量）。 */
export function usedCapacity(state: LedgerState, batchId: string): number {
  return state.records
    .filter((record) => record.batchId === batchId)
    .reduce((sum, record) => sum + record.films, 0);
}

/** 某批次当前剩余容量 = 额定容量 − 累计用量。 */
export function remainingCapacity(batch: ChemicalBatch, state: LedgerState): number {
  return batch.capacity - usedCapacity(state, batch.id);
}

/** 状态由剩余量推导：剩余为 0 即已耗尽，否则使用中。 */
export function batchStatus(batch: ChemicalBatch, state: LedgerState): BatchStatus {
  return remainingCapacity(batch, state) === 0 ? 'exhausted' : 'active';
}

/** 某批次的全部使用记录，按登记时间（写入顺序）排列。 */
export function batchRecords(state: LedgerState, batchId: string): UsageRecord[] {
  return state.records.filter((record) => record.batchId === batchId);
}

export interface CreateBatchInput {
  name: string;
  /** 表单原始字符串，由命令内部校验 */
  capacity: string;
}

/**
 * 命令一：创建药液批次。
 * 名称为空、额定容量为空 / 非整数 / 非正整数时返回原因，不写入任何记录。
 */
export function createBatch(
  state: LedgerState,
  input: CreateBatchInput,
  deps: LedgerDeps,
): CommandResult<ChemicalBatch> {
  const nameError = validateBatchName(input.name);
  if (nameError) return { ok: false, error: nameError };
  const capacityError = validateCapacityInput(input.capacity);
  if (capacityError) return { ok: false, error: capacityError };

  const batch: ChemicalBatch = Object.freeze({
    id: deps.nextId(),
    name: input.name.trim(),
    capacity: parseStrictInteger(input.capacity)!,
    createdAt: deps.now().toISOString(),
  });
  return {
    ok: true,
    value: batch,
    state: { ...state, batches: [...state.batches, batch] },
  };
}

export interface RecordUsageInput {
  batchId: string;
  /** 表单原始字符串，由命令内部校验 */
  films: string;
  note?: string;
}

/**
 * 命令二：登记一次处理用量。
 * 写入前重新计算剩余量（额定容量 − 已登记用量之和）：
 * 数量为空 / 非整数 / 非正整数 / 超过剩余容量时返回原因，不写入记录；
 * 成功后追加一条不可修改的使用记录，remainingAfter 记录登记后的剩余容量。
 */
export function recordUsage(
  state: LedgerState,
  input: RecordUsageInput,
  deps: LedgerDeps,
): CommandResult<UsageRecord> {
  const batch = state.batches.find((candidate) => candidate.id === input.batchId);
  if (!batch) {
    return { ok: false, error: '批次不存在或已被移除' };
  }
  const filmsError = validateFilmsInput(input.films);
  if (filmsError) return { ok: false, error: filmsError };

  const films = parseStrictInteger(input.films)!;
  // 每条记录写入前重新计算剩余量，而不是沿用界面上的旧值。
  const remaining = remainingCapacity(batch, state);
  if (films > remaining) {
    return {
      ok: false,
      error: `超过剩余容量：本批仅剩 ${remaining}，无法登记 ${films}`,
    };
  }
  const record: UsageRecord = Object.freeze({
    id: deps.nextId(),
    batchId: batch.id,
    films,
    note: (input.note ?? '').trim(),
    remainingAfter: remaining - films,
    createdAt: deps.now().toISOString(),
  });
  return {
    ok: true,
    value: record,
    state: { ...state, records: [...state.records, record] },
  };
}
