---
title: Transform Feedback计算蒙皮技术
date: 2025-12-07 18:18:44
published: true
tags:
---

**Transform Feedback (变换反馈)** 进行蒙皮计算，是一种利用 GPU 的 **Vertex Shader (顶点着色器)** 计算蒙皮，并将计算后的顶点位置**写回显存（Buffer）**，而不是直接拿去渲染像素的技术。

在 DirectX 中，这个技术被称为 **Stream Output**。

为了让你透彻理解，我们对比一下**传统流程**和**Transform Feedback流程**。

---

### 一、 为什么要这么做？（痛点分析）

#### 1. 传统蒙皮渲染流程
在普通的渲染管线中：
*   **输入**：静态的 T-Pose 顶点 + 骨骼矩阵。
*   **VS 计算**：Vertex Shader 根据骨骼矩阵算出当前帧的顶点位置。
*   **光栅化**：算好的顶点直接传给光栅化器，变成屏幕上的像素。
*   **遗忘**：**一旦这一帧画完，GPU 就把刚才算好的顶点位置丢弃了。**

**痛点**：
如果你要渲染同一个角色多次（比如：一次画进 Shadow Map 投射阴影，一次画进 G-Buffer，一次画进水面反射），**GPU 必须在每一次 DrawCall 里都重新计算一遍蒙皮公式**。这是巨大的算力浪费。

#### 2. Transform Feedback 的核心思想
*   **一次计算，多次复用**：我们专门跑一次 Pass，只计算蒙皮，把算好的顶点存到一个新的 Buffer 里（Cache 起来）。
*   **后续渲染**：之后的阴影Pass、主渲染Pass，直接把这个 Buffer 当作一个普通的静态 Mesh 来渲染。

---

### 二、 Transform Feedback 蒙皮的工作流程

#### 步骤 1：准备两个 Buffer
1.  **Source Buffer**：存原始模型的 T-Pose 顶点、骨骼索引、权重。
2.  **Destination Buffer (TFO)**：一块空的显存，大小和顶点数量一致，用来存计算后的结果。

#### 步骤 2：蒙皮计算 Pass (Pre-pass)
*   **Shader**：编写一个特殊的 Vertex Shader，里面只做蒙皮计算（矩阵乘法）。
*   **开关**：开启 `GL_RASTERIZER_DISCARD`。这意味着我们告诉 GPU：“我只要顶点数据，不要帮我画成像素，别走光栅化，省点电。”
*   **绑定**：绑定 Destination Buffer 到 Transform Feedback 绑定点。
*   **执行**：调用 `glDrawArrays`。
*   **结果**：现在 Destination Buffer 里存的就是**当前姿势下**真实的顶点坐标（World Space Positions）。

#### 步骤 3：真正的渲染 Pass
*   **Shader**：使用普通的 Shader。
*   **输入**：直接把 Destination Buffer 绑定为 `GL_ARRAY_BUFFER`（顶点属性）。
*   **执行**：渲染。此时对于 GPU 来说，**它在渲染一个静态模型**（因为位置已经是最终位置了，不需要再乘骨骼矩阵了）。

---

### 三、 主要应用场景

除了优化多 Pass 渲染，Transform Feedback 蒙皮还有两个高级用法：

#### 1. GPU 粒子系统 (GPU Particles)
这是最酷的用法。
*   **需求**：你想让粒子（比如火焰、火花）从角色的**皮肤表面**发射出来。
*   **难题**：粒子系统通常需要知道发射点的坐标。但在传统流程中，蒙皮后的坐标只有 GPU 知道，CPU 不知道（也不想读回来，太慢）。
*   **TF 方案**：
    1. 用 TF 算出蒙皮后的顶点位置存入 Buffer。
    2. 粒子系统的 Shader 直接读取这个 Buffer。
    3. 粒子就能完美地吸附在正在运动的角色身上发射了。

#### 2. 布料与物理模拟
*   如果你需要在 GPU 上做简单的布料模拟（比如披风随风飘动），你需要上一帧计算后的顶点位置作为下一帧的输入。Transform Feedback 天然支持这种“乒乓（Ping-Pong）”操作（输出作为下一次的输入）。

---

### 四、 优缺点分析

#### 优点
1.  **减少重复计算**：对于多 Pass 渲染（CSM 阴影、反射、延迟渲染 G-Buffer），只需要计算一次蒙皮。
2.  **数据复用**：算好的顶点可以被其他 Shader（如粒子、物理）读取。

#### 缺点
1.  **显存带宽压力 (Bandwidth Heavy)**：这是最大的坑。
    *   蒙皮计算是 ALU（算术逻辑单元）密集型，现在的 GPU 算数很快。
    *   Transform Feedback 是 Memory（显存）密集型。你需要把几万个 float3 写回显存，再读出来。
    *   **在移动端（手机），带宽通常比算力更宝贵。** 写回显存产生的发热和耗电，有时甚至超过了重新计算蒙皮的开销。
2.  **显存占用**：需要额外的显存来存一整份顶点副本。
3.  **动画插值限制**：如果使用了 TF，顶点位置是锁死的。如果在两帧之间需要极高的平滑度（Motion Blur），可能需要特殊处理。

---

### 五、 现代替代方案：Compute Shader

虽然 Transform Feedback 很有用，但在现代图形 API（Vulkan, DirectX 12, Metal, OpenGL ES 3.1+）中，**Compute Shader (计算着色器)** 正在取代 TF 蒙皮。

**Compute Shader 蒙皮的优势：**
*   **更灵活**：TF 必须走图形管线，必须有“顶点”的概念。Compute Shader 是纯粹的通用计算，可以随意读写 Buffer，逻辑更自由。
*   **性能更好**：Compute Shader 可以利用 Shared Memory 优化读写，且不需要走 Vertex Setup 等固定管线阶段。

**总结：**
*   **Transform Feedback 蒙皮** 是 OpenGL ES 3.0 时代的经典技术，用于缓存蒙皮结果以供复用或特效使用。
*   在现代高性能渲染中，如果设备支持，通常优先选择 **Compute Shader** 来完成同样的任务。
