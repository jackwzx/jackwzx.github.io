---
title: invalidDepth FrameBuffer之后提交同一个framebuffer draw 性能问题
date: 2025-12-07 17:51:52
published: true
tags:
---

这是一个非常经典且深度的移动端图形优化问题。你观察到的现象（CPU 飙升 7%、开销与 DrawCall 数据量无关）直指移动端 GPU 架构的核心痛点：**Tile-Based Rendering (TBR) 架构下的 Render Pass 打断（Render Pass Split）**。

简单来说，你的操作迫使 GPU 驱动将本来可以一次做完的事情，强行拆成了两次，不仅增加了 GPU 的负担（带宽），更重要的是极大地增加了 **CPU 端的驱动开销**。

以下是详细的原理分析：

---

### 1. 核心背景：移动端 GPU 是如何工作的？

移动端 GPU（高通 Adreno, ARM Mali, PowerVR）几乎都是 **TBR (Tile-Based Rendering)** 或 **TBDR** 架构。

*   **GMEM (On-Chip Memory)**：GPU 内部有一块极快但很小的显存。
*   **Tile (图块)**：屏幕被切分成小块（如 16x16 或 32x32）。
*   **Render Pass (渲染通道)**：绘制流程是先把所有 DrawCall 记录下来，然后对每个 Tile 进行：`Load（读入数据）` -> `Rendering（绘制）` -> `Store（写回系统内存）`。

**最理想的性能**来自于：
1.  **Clear/Don't Care**：开始时不需要从系统内存读取数据（LoadOp = Clear/DontCare）。
2.  **Draw...**：所有绘制都在 GMEM 中完成。
3.  **Store/Discard**：结束时只写回需要的颜色，丢弃不需要的深度（StoreOp = Store Color, Discard Depth）。

### 2. 你的操作发生了什么？（Render Pass 被打断）

你描述的序列是：`Invalidate Depth` -> `DrawCall` -> `Blit`。

#### 正常的高效流程（如果你把 Draw 放在前面）：
*   **Draw All** -> **Invalidate Depth** -> **Blit (End)**
*   **CPU/驱动**：只需要构建**一个** Render Pass 的命令。
*   **GPU**：
    1.  Load Color (或者 Clear)。
    2.  绘制所有三角形。
    3.  **Invalidate Depth**：告诉 GPU “深度数据我不要了”。
    4.  **End/Blit**：将颜色写回内存（Store Color），**深度数据直接丢弃，不写回内存**（节省带宽）。
    *这是最完美的路径。*

#### 你的低效流程（Invalidate 插在中间）：
序列：`...Previous Draws...` -> **`Invalidate Depth`** -> **`DrawCall`** -> **`Blit`**

这个序列被驱动解释为：

1.  **Phase 1 (前半段绘制)**:
    *   驱动检测到 `Invalidate Depth`。这对 TBR 架构来说是一个明确的信号：**“当前的 Render Pass 结束了，立刻处理数据！”**
    *   **GPU 行为**：Color 写回内存，Depth 丢弃。

2.  **The "Gap" (灾难发生点)**:
    *   紧接着你又提交了一个 `DrawCall`。
    *   驱动会想：“哎？你不是刚结束了吗？怎么又要画？”
    *   驱动必须**强制开启一个新的 Render Pass (Phase 2)**。

3.  **Phase 2 (那个多余的 DrawCall)**:
    *   为了保证画面正确，因为是画在同一张图上，GPU 必须把刚才写回内存的 Color 数据，**重新从系统内存读回 GMEM (System Memory -> GMEM)**。这就是 **Load Action: Load**。
    *   然后执行你的那个小小的 `DrawCall`。
    *   最后 `Blit` 再次触发 Store 操作。

### 3. 为什么 CPU 占用率会上升 7%？

你可能会问：“重新读写内存是 GPU 的事，为什么 CPU 会累？”

这正是问题的关键。**开销与 DrawCall 数据量无关**，是因为这是**纯粹的驱动管理开销（Driver Overhead）**：

1.  **命令缓冲区重建 (Command Buffer Submission)**：
    *   `Invalidate` 往往会触发驱动将当前积攒的命令流（Command Buffer）强制提交给内核/GPU，因为这标志着一个阶段的完成。
    *   随后的 `DrawCall` 迫使驱动分配新的命令缓冲区结构。频繁的 Submit 和 Setup 是非常消耗 CPU 的。

2.  **状态验证与同步 (Validation & Synchronization)**：
    *   驱动必须确保 Phase 1 的写入已经完成，Phase 2 才能开始读取（虽然硬件可能自动处理，但在驱动层需要插入 Pipeline Barrier 或 Fence）。
    *   这种状态追踪和依赖管理在驱动层是纯 CPU 逻辑。

3.  **Render Pass 描述符构建**：
    *   在 Vulkan/Metal 时代，我们手动创建 Render Pass。但在 OpenGL ES 中，驱动要在后台猜你的意图并动态构建 Render Pass。
    *   当你“打断”了流程，驱动需要销毁前一个 Pass 的上下文，并初始化一个新的 Pass 上下文（配置 Load/Store Ops，分配内部数据结构）。这个**“上下文切换”**是固定开销，不管你画一个三角形还是一万个，CPU 都要做这一套动作。

### 4. 为什么和 DrawCall 数据量无关？

因为这个 7% 的 CPU 不是用来处理顶点的，而是用来**处理“打断”这个行为本身的**。

*   **比喻**：
    *   **正常流程**：你把 100 份文件一次性交给快递员（1 次沟通成本）。
    *   **你的流程**：你把 99 份文件给他，让他出发（Invalidate）；然后你突然想起还有 1 份，把他叫回来（Load 成本），把那 1 份给他，再让他出发（第二次沟通成本）。
    *   无论那“第 100 份文件”是一张纸还是一箱书，**“把他叫回来并重新发单”** 这个沟通流程（CPU 管理成本）是固定的且昂贵的。

### 5. 总结与建议

**现象解释**：
`Invalidate Depth` 在 OpenGL ES 驱动看来是一个强烈的**“结束当前渲染并丢弃深度”**的信号。在此之后继续 Draw，迫使驱动**分割 Render Pass**，导致了额外的 CPU 状态管理开销（7% CPU）和 GPU 带宽浪费（多余的 Load/Store）。

**结论**：
正如你测试发现的那样，**必须严格遵守 TBR 架构的黄金法则**：

1.  **Start**：Clear (LoadOp: Clear)
2.  **Draw**：所有不透明物体
3.  **Draw**：所有透明物体
4.  **...其他所有绘制...**
5.  **Invalidate**：`glInvalidateFramebuffer(Depth | Stencil)` —— **这必须是 SwapBuffer 或 Blit 之前的最后一步操作。**
6.  **End**：Swap / Blit

不要在 Invalidate 之后进行任何针对同一 FBO 的绘制操作。
