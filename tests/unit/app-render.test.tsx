import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App from '../../src/App';

/**
 * 无浏览器环境下的界面冒烟测试：
 * 确认关键 data-testid 与计算结果真实渲染（Playwright 覆盖交互部分）。
 */
describe('App 渲染冒烟（默认 1+4 / 1000 mL / 250 mL 量筒）', () => {
  // SSR 会在文本插值间插入 <!-- --> 注释节点，先去除再断言
  const html = renderToString(<App />).replace(/<!-- -->/g, '');

  it('渲染浓缩液 200 mL、清水 800 mL', () => {
    expect(html).toContain('data-testid="result-concentrate"');
    expect(html).toContain('200 mL');
    expect(html).toContain('800 mL');
  });

  it('渲染 5 个量取步骤（浓缩液 1 步 + 清水 4 步）且各步不超容量', () => {
    expect((html.match(/data-testid="measure-step"/g) ?? []).length).toBe(5);
    const amounts = [...html.matchAll(/data-testid="step-amount">(\d+)</g)].map((m) =>
      Number.parseInt(m[1], 10),
    );
    expect(amounts).toEqual([200, 250, 250, 250, 50]);
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(1000);
    for (const amount of amounts) {
      expect(amount).toBeLessThanOrEqual(250);
    }
  });

  it('渲染可打印配液卡与勾选框', () => {
    expect(html).toContain('data-testid="print-card"');
    expect(html).toContain('data-testid="step-checkbox"');
  });
});
