---
title: high-low-float
date: 2025-06-30 14:00:00
published: false
tags: 
---

**核心思想**
- 许多图形管线（WebGL/GL ES/部分 Metal 阶段）不支持 `double`，只有 32 位 `float`（约 24-bit 有效位）。
- 将一个 `double` 拆成两个 `float`：`hi` 携带高位有效数字，`lo` 携带剩余的残差；在着色器侧用成对算术保持精度。
- 通过“浮点-浮点”配对（float-float，又称 double-double 变体）可把有效精度提升到约 48 位，远高于单个 `float` 的 24 位。

**为什么需要**
- 大范围坐标（地理经纬度、地球半径级别、世界空间大场景）用 `float` 会出现抖动、缝隙、Z-fighting 或顶点合并错误。
- `hi/lo` 编码让你在不支持 `double` 的着色器里维持接近 `double` 的效果，常用于地图渲染、天文/地质可视化、CAD 等。

**数学原理**
- `hi = round_to_float(d)`，`lo ≈ d - hi`，令 `hi+lo ≈ d`。
- `hi` 是把 `double d` 舍入到最近的 `float` 后得到的主值；`lo` 是剩余的细节（残差），绝对值远小于 `hi`。
- 直接做 `hi + lo` 会遭遇舍入；为降低误差，运算采用补偿算法（TwoSum/Dekker/Priest）在 `float` 中维护一对数的高/低部分。

**CPU 侧编码（推荐）**
- 在 CPU 上做一次精确拆分，然后把两个 `float` 传入着色器：
```
inline void encodeDoubleFP64(double x, float& hi, float& lo) {
  float f = static_cast<float>(x);
  double diff = x - static_cast<double>(f);
  hi = f;
  lo = static_cast<float>(diff);
}
```
- 三维向量按分量拆分；或对“世界原点”亦拆分，着色器侧用位置减原点的方式减少量级、提升稳定性。

**着色器侧基础算术（fp64 算法）**
- 加法（TwoSum 变体）：
```
vec2 add_fp64(vec2 a, vec2 b) {
  float s = a.x + b.x;
  float e = s - a.x;
  float t = (a.x - (s - e)) + (b.x - e) + (a.y + b.y);
  float hi = s + t;
  float lo = t + (s - hi);
  return vec2(hi, lo);
}
```
- 减法：
```
vec2 sub_fp64(vec2 a, vec2 b) {
  return add_fp64(a, vec2(-b.x, -b.y));
}
```
- 乘法（Dekker 变体，单精度分裂常数 `c=8193` 或 `c=4097`）：
```
vec2 mul_fp64(vec2 a, vec2 b) {
  float p = a.x * b.x;
  float c = 8193.0;
  float ah = (a.x * c) - ((a.x * c) - a.x);
  float al = a.x - ah;
  float bh = (b.x * c) - ((b.x * c) - b.x);
  float bl = b.x - bh;
  float e = ((ah * bh - p) + ah * b.y + al * b.x) + (al * b.y + a.y * b.x + a.y * b.y);
  float hi = p + e;
  float lo = e + (p - hi);
  return vec2(hi, lo);
}
```
- 归一化（保持 `hi` 为主值，`lo` 为小残差）：
```
vec2 normalize_fp64(vec2 x) {
  float s = x.x + x.y;
  float e = x.y - (s - x.x);
  return vec2(s, e);
}
```

**典型用法：世界坐标到裁剪空间**
- 把顶点位置 `position` 和相机/模型原点 `origin` 都用 `hi/lo` 传入；先做“位置减原点”再乘矩阵。
- 三维场景示例（每分量一个 `vec2`）：
```
vec2 px = sub_fp64(positionX64, originX64);
vec2 py = sub_fp64(positionY64, originY64);
vec2 pz = sub_fp64(positionZ64, originZ64);
px = normalize_fp64(px);
py = normalize_fp64(py);
pz = normalize_fp64(pz);
```
- 后续与矩阵相乘可用 `mul_fp64` 与 `add_fp64` 逐分量、逐项累加，最后只在输出阶段降到单 `float`。

**精度与上界**
- 单 `float`：约 7～8 十进制有效位（24-bit mantissa）。
- `hi/lo` 对：在良好归一化和补偿算术下，约 14～15 十进制有效位（≈48-bit），满足米-厘米级稳定性，多数地图/地形场景足够。
- 若需要再高精度，只能用真正的 `double` 管线（GL 4.x/Metal 某些设备/Compute）或多重定点/整数方案。

**实践建议**
- 始终传入 `origin` 并在着色器先做“位置减原点”，降低数值量级，减少灾难性抵消。
- 每次复合运算后做 `normalize_fp64`，防止 `lo` 漂移过大导致后续误差累积。
- 谨慎选择分裂常数（`4097` 或 `8193`），不同 GPU/编译器下以能稳定分裂 24 位尾数为准。
- 优化热点：尽量把高代价的 `mul_fp64`/矩阵乘法放在顶点着色器，片段阶段采用单精度插值后使用。
- 通过单元测试或 GPU 捕获验证：将结果与 CPU 双精度对比，统计最大/均方误差，确保满足业务阈值。

**常见误区**
- 在着色器中直接做 `lo = d - hi`：着色器没有 `double`，必须在 CPU 侧拆分。
- 不做归一化或把很多 `fp64` 运算级联，误差会加速增长。
- 只把 `hi` 传入却继续做大场景变换，抖动无法消除；必须配合 `lo` 和“减原点”。
- 使用 `mediump` 导致进一步丢精度；涉及 `fp64` 例程应使用 `highp`。

**替代方案**
- 局部化坐标（CPU 预减相机原点，然后只传单 `float` 到 GPU），若可接受每帧 CPU 预处理且管线简单，这是最快路径。
- 采用整数/定点表示（如 32-bit 定点）在着色器中做有限算术，适合规则网格/栅格类数据。
- 某些平台可用 `double` 于 Compute 或高端 GPU 的顶点阶段，但需谨慎评估性能与可用性。

需要时我可以给出三维 `vec3` 的 `fp64` 矩阵乘法例程，或根据你的管线（GLSL/Metal/WGSL）把上述函数改写为对应语言版本并做性能与误差基准。
