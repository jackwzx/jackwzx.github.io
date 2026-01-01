---
title: 移动端模板测试与Eary-z分析
date: 2025-12-09 20:45:31
published: true
tags:
---

在移动端（特别是基于 TBDR 架构的 GPU，如 Adreno, Mali, Apple GPU）使用模版缓存（Stencil Buffer）时，导致 Early-Z 失效并引起 Fragment Shader（片元着色器）占用率上升，主要原因是 **GPU 无法在着色器执行前确定深度和模版测试的最终结果，从而被迫回退到 Late-Z（后期深度测试）模式。**

以下是底层的技术原因分析以及解决方案：

### 1. 核心原因：数据依赖与管线顺序 (Data Dependency & Pipeline Order)

#### 标准管线 vs. 硬件优化
*   **逻辑上的 OpenGL 管线：** 顶点着色器 -> 光栅化 -> 片元着色器 -> **模版测试** -> **深度测试** -> 混合。
*   **Early-Z 优化：** 为了性能，GPU 尝试将 **深度测试** 提前到 片元着色器 **之前**。如果 Early-Z 失败，直接丢弃该像素，不运行昂贵的片元着色器。

#### Stencil 的破坏力
当你启用了模版测试，尤其是当你 **写入模版值**（例如 `glStencilOp` 设置为 `GL_REPLACE` 或 `GL_INCR` 等非 `GL_KEEP` 操作）时，会发生以下冲突：

1.  **模版写入导致的不确定性：** 如果你的绘制调用会修改模版缓冲区，硬件会认为当前的深度/模版状态是“易变的”。为了保证渲染结果的逻辑正确性（即符合 OpenGL 标准管线顺序），GPU 可能会保守地禁用 Early-Z。
2.  **复合测试依赖：** 深度测试和模版测试在硬件层面通常是绑定在一起的一个单元（Depth/Stencil Unit）。
    *   如果 **深度测试依赖于模版测试的结果**（比如模版测试挂了，深度就不应该写入），而模版值又是在 Late Stage 确定的，那么深度测试也必须推迟到 Fragment Shader 之后（Late-Z）。
    *   一旦回退到 Late-Z，所有的片元着色器都会被执行，计算出的颜色最后才会被扔掉，导致 Fragment 占用率飙升。

### 2. 移动端 TBDR 架构的特殊性

移动端 GPU（Tile-Based Deferred Rendering）非常依赖 Early-Z 来减少 Overdraw（过度绘制）。

*   **Tile Memory 限制：** 深度和模版数据都存储在片上高速缓存（On-chip Memory）中。
*   **Early-Z/Stencil 单元：** 现代移动 GPU 实际上有专门的 "Early-Z/Stencil" 单元。
    *   **情况 A（纯读取）：** 如果你只是 **读取** 模版（`glStencilMask(0x00)` 或 `glStencilOp(GL_KEEP, ...)`），大多数现代 GPU（如 Mali-G7x 系列, Adreno 6xx+）通常 **可以** 保持 Early-Z 开启。
    *   **情况 B（写入/修改）：** 如果你在 Draw Call 中 **写入** 模版，硬件往往无法预测后续像素对该模版的依赖关系，为了安全起见，它会关闭 Early-Z。

### 3. 重复绘制 Mesh 的场景分析

你提到的“重复绘制 Mesh”通常是这种 Shader Effect 流程（例如描边、遮罩、透视效果）：

1.  **Pass 1:** 绘制 Mesh，**写入 Stencil**（标记区域），关闭 Color Write。
2.  **Pass 2:** 再次绘制 Mesh，**读取 Stencil**，进行着色。

**为什么 Pass 2 也无法被 Early-Z 优化？**

*   如果 Pass 1 和 Pass 2 在同一个 Render Pass 中（中间没有 `glFlush` 或显式的依赖屏障），并且 Pass 1 写入了 Stencil，GPU 的光栅化队列可能会因为状态切换或数据竞争风险，使得 Pass 2 也无法利用之前的 Z-Buffer 进行剔除，或者 Pass 2 本身因为开启了复杂的 Stencil Test 导致硬件决定采用 Late-Z。
*   更常见的情况是：**Pass 2 的深度比较函数设置问题**。如果 Pass 2 的深度设置为 `GL_LEQUAL` 或 `GL_EQUAL`，且 Pass 1 已经写入了深度，理论上 Early-Z 应该生效。但如果 Pass 2 为了根据 Stencil 剔除像素而开启了 `discard` 或者是 Alpha Test，这会 100% 强制关闭 Early-Z。

### 4. 解决方案与优化建议

要解决这个问题，重新获得 Early-Z 的性能收益，可以尝试以下方案：

#### 方案一：分离“写”与“读”（最推荐）

将模版写入和复杂的着色计算彻底分开，并确保状态明确。

1.  **Stencil Pre-pass (极简 Shader):**
    *   只开启 Stencil Write。
    *   关闭 Color Write (`glColorMask(false,...)`)。
    *   关闭 Depth Write (如果不需要更新深度)。
    *   **Shader 极其简单**（甚至可以使用空 Fragment Shader），这样即使发生了 Late-Z，开销也极低。

2.  **Color Pass (复杂 Shader):**
    *   开启 Stencil Test (**只读模式**: `glStencilMask(0x00)`，`glStencilOp(GL_KEEP...)`)。
    *   **重要：** 因为是只读 Stencil，现代 GPU 大概率会重新启用 Early-Z/Early-Stencil 剔除。
    *   执行复杂的 Fragment Shader。

#### 方案二：利用 Depth Pre-pass

如果你是因为 Overdraw 严重才关注 Early-Z，可以使用标准的 Depth Pre-pass 技术：

1.  先绘制所有不透明物体的深度（关闭颜色写入）。
2.  再绘制不透明物体（开启颜色写入，深度测试设为 `GL_LEQUAL` 或 `GL_EQUAL`）。
3.  在此流程中插入模版逻辑时，尽量遵循“方案一”的只读原则。

#### 方案三：检查 Shader 代码中的陷阱

检查你的 Fragment Shader 中是否有以下操作，它们会直接杀死 Early-Z，无论模版设置如何：
*   `discard` (GLSL) / `clip` (HLSL)
*   写入 `gl_FragDepth`
*   开启 Alpha to Coverage

如果 Shader 包含 `discard`，GPU 无法预知深度（因为深度可能会被扔掉），必须运行 Shader。
**优化技巧：** 如果必须用 `discard`，尝试使用 **Alpha Testing**（在某些硬件上有固定功能优化）或尽量减少 `discard` 的使用范围。

#### 方案四：调整绘制顺序

确保你的物体是 **从前向后 (Front-to-Back)** 绘制的。虽然这听起来是老生常谈，但在结合 Stencil 时尤为重要。让最靠近摄像机的物体先写入 Z-Buffer，后续被遮挡的物体（即使有 Stencil 逻辑）也能在 Z-Test 阶段（如果是只读 Stencil）被快速剔除。

### 总结

重复绘制 Mesh 导致 Fragment 占用率高的核心原因是 **Stencil Write 操作迫使 GPU 关闭了 Early-Z 优化**。

**最佳实践：**
将操作拆分为两个 Pass。第一个 Pass **只写 Stencil（和深度）**，使用最廉价的 Shader；第二个 Pass **只读 Stencil** 并进行着色。只要在着色 Pass 中不修改 Stencil 且不使用 `discard`，Early-Stencil/Early-Z 通常就能正常工作，大幅降低 Fragment Shader 的执行次数。
