# 暗房配液台

纯前端配液计算工具（React + TypeScript + Vite）。输入稀释式 `1+n`、目标总量、量筒容量与显影罐数量，
实时算出浓缩液与清水体积，并把超出量筒容量的液体拆成「若干满量筒 + 最后余量」的量取步骤，
同时生成适合打印的配液卡。**所有数字均由 `src/lib/dilution.ts` 现场计算，无任何写死的结果。**

同批处理多只显影罐时，整批工作液只计算一次，再按罐均分领取：目标总量与浓缩液分别均分，
不能整除的余量依次补给前面的罐，每罐清水 = 该罐目标量 − 该罐浓缩液，因此各罐总量相差
不超过 1 mL，且各罐汇总严格还原整批结果，避免逐罐重算造成取整累计偏差。

## 启动（Docker Compose）

```bash
docker compose up --build web
# 默认访问 http://localhost:5173

# 宿主端口由 WEB_PORT 覆盖：
WEB_PORT=8080 docker compose up --build web
# → http://localhost:8080
```

## 一次性验收（Vitest + Playwright）

`verify` 服务会先等 `web` 健康检查通过，再运行 Vitest 单元测试与 Playwright 端到端测试
（通过 `E2E_BASE_URL=http://web` 直接访问 compose 网络内的页面），跑完即退出：

```bash
docker compose run --rm verify
# 等价于：docker compose --profile verify up --build --abort-on-container-exit
```

本地无 Docker 时也可手动执行同一链路：

```bash
npm ci
npm run test        # Vitest（计算规则 + 渲染冒烟）
npm run test:e2e    # Playwright（自动构建并起 preview 服务器）
```

## 输入边界

| 字段           | 合法范围                |
| -------------- | ----------------------- |
| 稀释式 `1+n`   | `n` 为 1–99 的整数      |
| 目标总量 (mL)  | 100–5000 的整数         |
| 量筒容量 (mL)  | 100–5000 的整数         |
| 显影罐数量     | 1–20 的整数（默认 1）   |

非法输入（越界、小数、非数字、留空）会在对应字段下方就地提示，且旧配液卡立即消失，
不会残留过期结果；全部字段合法后才重新计算并展示。

## 计算规则

- 浓缩液精确值 = 目标总量 ÷ (n+1)，以 0.5 mL 为界四舍五入到整数（0.5 进位）；
- 清水量 = 目标总量 − 取整后的浓缩液，因此两者之和恒等于目标总量；
- 单项液体超过量筒容量时拆成若干满量筒加最后余量；恰好等于容量（或其整数倍）时
  不生成零余量步骤；
- 分罐：整批只算一次工作液，目标总量与浓缩液分别按罐均分，余量依次补给前面的罐；
  每罐清水 = 该罐目标量 − 该罐浓缩液，各罐总量相差不超过 1 mL，各罐汇总严格还原整批结果；
- 界面同时给出校验行：每一步 ≤ 量筒容量，且所有步骤合计严格等于目标总量；
- 罐数大于 1 时结果区按罐展示两种液体与量取步骤，勾选进度覆盖全部分罐步骤，
  任一参数变化都会清空勾选；打印卡使用同一分配结果列出每罐明细。

## 目录结构

```
src/lib/dilution.ts    计算与校验核心（纯函数）
src/App.tsx            表单、结果、量取步骤、打印配液卡
tests/unit/            Vitest：取整边界、和不变性、分次量取、输入边界、渲染冒烟
tests/e2e/             Playwright：真实浏览器中的交互验收
Dockerfile             web（nginx 静态服务）与 verify（Playwright 镜像）两个构建目标
docker-compose.yml     web 服务 + verify 一次性验收服务，WEB_PORT 覆盖宿主端口
```
