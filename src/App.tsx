import { useEffect, useMemo, useState } from 'react';
import {
  computeMix,
  validateInputs,
  N_MIN,
  N_MAX,
  VOLUME_MIN,
  VOLUME_MAX,
  type RawInputs,
} from './lib/dilution';

const FIELDS: Array<{
  key: keyof RawInputs;
  label: string;
  hint: string;
  testId: string;
  errorTestId: string;
}> = [
  {
    key: 'n',
    label: '稀释式 1 + n',
    hint: `n 为 ${N_MIN}–${N_MAX} 的整数`,
    testId: 'input-n',
    errorTestId: 'error-n',
  },
  {
    key: 'total',
    label: '目标总量 (mL)',
    hint: `${VOLUME_MIN}–${VOLUME_MAX} mL 的整数`,
    testId: 'input-total',
    errorTestId: 'error-total',
  },
  {
    key: 'capacity',
    label: '量筒容量 (mL)',
    hint: `${VOLUME_MIN}–${VOLUME_MAX} mL 的整数`,
    testId: 'input-capacity',
    errorTestId: 'error-capacity',
  },
];

export default function App() {
  const [raw, setRaw] = useState<RawInputs>({ n: '4', total: '1000', capacity: '250' });
  const [checked, setChecked] = useState<boolean[]>([]);

  // 每次输入变化都重新校验、重新计算；任一字段非法则 result 为 null，
  // 旧配液卡随之卸载，不会残留。
  const { inputs, errors } = useMemo(() => validateInputs(raw), [raw]);
  const result = useMemo(() => (inputs ? computeMix(inputs) : null), [inputs]);

  useEffect(() => {
    setChecked(result ? result.steps.map(() => false) : []);
  }, [result]);

  const doneCount = checked.filter(Boolean).length;
  const stepsSum = result ? result.steps.reduce((sum, s) => sum + s.amount, 0) : 0;
  const cardDate = useMemo(() => new Date().toLocaleDateString('zh-CN'), [result]);

  const setField = (key: keyof RawInputs) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setRaw((prev) => ({ ...prev, [key]: event.target.value }));
  };

  const toggleStep = (index: number) => {
    setChecked((prev) => prev.map((value, i) => (i === index ? !value : value)));
  };

  return (
    <div className="app">
      <header className="no-print">
        <h1>暗房配液台</h1>
        <p className="tagline">按 1+n 稀释式计算浓缩液与清水，自动拆分量筒量取步骤</p>
      </header>

      <main>
        <section className="panel no-print" aria-label="配液参数">
          <div className="fields">
            {FIELDS.map(({ key, label, hint, testId, errorTestId }) => (
              <div className={`field${errors[key] ? ' field--invalid' : ''}`} key={key}>
                <label htmlFor={testId}>{label}</label>
                <input
                  id={testId}
                  data-testid={testId}
                  inputMode="numeric"
                  value={raw[key]}
                  onChange={setField(key)}
                  aria-invalid={Boolean(errors[key])}
                  aria-describedby={`${errorTestId} ${testId}-hint`}
                />
                <small id={`${testId}-hint`} className="hint">
                  {hint}
                </small>
                {errors[key] && (
                  <p className="error" role="alert" id={errorTestId} data-testid={errorTestId}>
                    {errors[key]}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        {result && (
          <>
            <section className="panel result no-print" data-testid="result-card" aria-label="配液结果">
              <h2>
                配液结果 <span className="ratio">1+{result.n}</span>
              </h2>
              <dl className="summary">
                <div>
                  <dt>浓缩液</dt>
                  <dd data-testid="result-concentrate">{result.concentrate} mL</dd>
                </div>
                <div>
                  <dt>清水</dt>
                  <dd data-testid="result-water">{result.water} mL</dd>
                </div>
                <div>
                  <dt>合计</dt>
                  <dd data-testid="result-total">{result.concentrate + result.water} mL</dd>
                </div>
              </dl>
              <p className="note" data-testid="result-exact">
                浓缩液精确值 {result.exactConcentrate.toFixed(2)} mL，按 0.5 mL 为界取整为{' '}
                {result.concentrate} mL；清水 = 目标总量 {result.total} mL − 取整后浓缩液。
              </p>

              <h3>
                量取步骤
                <span className="progress" data-testid="steps-progress">
                  已勾选 {doneCount}/{result.steps.length}
                </span>
              </h3>
              <ol className="steps">
                {result.steps.map((step, index) => (
                  <li key={`${step.liquid}-${step.step}`} data-testid="measure-step">
                    <label className={checked[index] ? 'step step--done' : 'step'}>
                      <input
                        type="checkbox"
                        data-testid="step-checkbox"
                        checked={checked[index] ?? false}
                        onChange={() => toggleStep(index)}
                      />
                      <span>
                        {step.liquidLabel} 第 {step.step}/{step.ofSteps} 次：量取{' '}
                        <strong data-testid="step-amount">{step.amount}</strong> mL
                        {step.amount === result.capacity ? '（满量筒）' : '（余量）'}
                      </span>
                    </label>
                  </li>
                ))}
              </ol>
              <p className="note" data-testid="steps-sum">
                校验：每步 ≤ 量筒容量 {result.capacity} mL；各步合计 {stepsSum} mL = 目标总量{' '}
                {result.total} mL{stepsSum === result.total ? ' ✓' : ' ✗'}
              </p>

              <button type="button" className="print-button" onClick={() => window.print()}>
                打印配液卡
              </button>
            </section>

            <section className="print-card" data-testid="print-card" aria-label="配液卡">
              <h2>暗房配液卡</h2>
              <table>
                <tbody>
                  <tr>
                    <th>日期</th>
                    <td>{cardDate}</td>
                    <th>稀释式</th>
                    <td>1+{result.n}</td>
                  </tr>
                  <tr>
                    <th>目标总量</th>
                    <td>{result.total} mL</td>
                    <th>量筒容量</th>
                    <td>{result.capacity} mL</td>
                  </tr>
                  <tr>
                    <th>浓缩液</th>
                    <td>{result.concentrate} mL</td>
                    <th>清水</th>
                    <td>{result.water} mL</td>
                  </tr>
                </tbody>
              </table>
              <h3>量取步骤</h3>
              <table>
                <thead>
                  <tr>
                    <th>✓</th>
                    <th>液体</th>
                    <th>次数</th>
                    <th>体积</th>
                  </tr>
                </thead>
                <tbody>
                  {result.steps.map((step) => (
                    <tr key={`card-${step.liquid}-${step.step}`}>
                      <td className="box">☐</td>
                      <td>{step.liquidLabel}</td>
                      <td>
                        {step.step}/{step.ofSteps}
                      </td>
                      <td>{step.amount} mL</td>
                    </tr>
                  ))}
                  <tr className="total-row">
                    <td colSpan={3}>合计</td>
                    <td>{stepsSum} mL</td>
                  </tr>
                </tbody>
              </table>
              <p className="sign">配制人：＿＿＿＿＿＿　复核人：＿＿＿＿＿＿</p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
