---
title: 在 Unreal Engine 中，HISM (Hierarchical Instanced Static Mesh) 的 LOD 选择机制是其性能优化的核心。
date: 2025-12-14 14:16:50
published: false
tags:
---

在 Unreal Engine 中，HISM (Hierarchical Instanced Static Mesh) 的 LOD 选择机制是其性能优化的核心。不同于普通 ISM（通常基于整体或粗略判断），HISM 利用**聚类树（Cluster Tree）**实现了精确且高效的 LOD 计算。

以下是 HISM LOD 选择的详细实现原理，分为 **衡量标准**、**树遍历逻辑**、**LOD 映射** 和 **GPU 过渡** 四个部分。

---

### 1. 衡量标准：屏幕占比 (Screen Size)

UE 的 LOD 系统（无论是普通 Mesh 还是 HISM）核心依据通常不是单纯的“距离”，而是**屏幕尺寸 (Screen Size)**。

**原理公式（简化版）：**
$$ \text{ScreenSize} = \frac{\text{BoundsSphereRadius}}{\text{DistanceToCamera}} \times \text{ProjectionFactor} $$

*   **BoundsSphereRadius**: 实例（或树节点）包围球的半径。
*   **DistanceToCamera**: 包围球中心到摄像机的距离。
*   **ProjectionFactor**: 包含 FOV（视场角）和屏幕分辨率的系数。

**判定逻辑：**
每个 Static Mesh 资源里都定义了一组 `Screen Size` 阈值（例如：LOD0 > 1.0, LOD1 > 0.5, LOD2 > 0.1）。
HISM 在运行时计算出当前节点的 Screen Size，然后与这些阈值对比，决定使用哪一级 LOD。

---

### 2. 核心算法：基于 Cluster Tree 的层次遍历

这是 HISM 高效的关键。它不需要对 10 万个实例逐个计算 `Distance / ScreenSize`。它利用构建好的 BVH（包围体层次结构）进行**剪枝**和**批量处理**。

这个过程主要发生在 `FHierarchicalStaticMeshSceneProxy::GetDynamicMeshElements` 或相关的 Compute Shader 中。

#### 遍历流程（递归或堆栈式）：

1.  **从根节点 (Root) 开始**：获取根节点的包围球。
2.  **视锥体剔除**：先看这个节点在不在画面内？不在直接丢弃。
3.  **计算节点 LOD 范围**：
    *   计算该节点（包含下面所有子实例）的 Screen Size。
    *   **关键判断**：如果这个节点（作为一个整体）的 Screen Size 已经**小于等于**最低级 LOD（例如 LOD3）所需的尺寸，或者小于剔除距离 (Cull Distance)。
        *   **决策**：**停止向下遍历！**
        *   **结果**：该节点下的所有子实例（可能包含几百个）直接全部标记为 LOD3（或者直接剔除）。
        *   *这被称为“Early Exit”（提前退出），极大地减少了 CPU/GPU 计算量。*
    *   **反之**：如果这个节点很大（离相机很近），说明它内部可能包含 LOD0 的树，也包含 LOD1 的树（因为节点有体积）。
        *   **决策**：**继续向下钻取 (Recurse)**，访问它的子节点（Children）。

4.  **到达叶子节点 (Leaf Node)**：
    *   叶子节点通常包含实际的一个或几个具体的 Instance。
    *   计算具体 Instance 的 Screen Size，精准指定它是 LOD0 还是 LOD1。

---

### 3. 数据重组：LOD Binning (分桶)

经过上面的树遍历后，我们得到了一堆可见的实例索引，以及它们各自对应的 LOD 级别。但是 GPU 不能直接渲染“第1个是LOD0，第2个是LOD1”这种杂乱的数据。

**实现机制：**
HISM 维护了对应每个 LOD 等级的 **Index Buffer**（索引缓冲）。

1.  **收集阶段**：
    在遍历树的过程中，引擎会将实例的 ID 放入对应的桶（Bucket）中：
    *   Instance A -> 放入 `LOD0_Indices` 数组
    *   Instance B -> 放入 `LOD1_Indices` 数组
    *   Instance C -> 放入 `LOD0_Indices` 数组
    *   Instance D -> 放入 `LOD2_Indices` 数组

2.  **提交渲染 (Draw Calls)**：
    渲染线程会遍历这些桶，发起绘制指令：
    *   **DrawCall 1**: 使用 Mesh LOD0 的顶点数据，绘制 `LOD0_Indices` 里的所有实例。
    *   **DrawCall 2**: 使用 Mesh LOD1 的顶点数据，绘制 `LOD1_Indices` 里的所有实例。
    *   ...

这就是为什么你在 RenderDoc 里看 HISM，会发现它按 LOD 级别分成了几个 `DrawIndexedInstanced` 调用。

---

### 4. 平滑过渡：Dither Fade (抖动淡出)

如果 LOD0 瞬间变成 LOD1，画面会“跳变” (Pop)。UE 的 HISM 支持 **Dithered LOD Transition**。

**原理：**
1.  **重叠区域**：
    在 LOD0 和 LOD1 的切换临界点（Screen Size 阈值附近），HISM 不会非黑即白地切。它会定义一个“过渡带”。
2.  **双重渲染**：
    在这个过渡带内的实例，会被**同时放入** `LOD0_Indices` 和 `LOD1_Indices`。也就是同一个位置，画了两个模型。
3.  **Pixel Shader 魔法**：
    *   引擎会向 Shader 传递一个 `LODFade` 参数。
    *   在材质的 Pixel Shader 中，使用一个高频噪声图（Dither Pattern）作为蒙版。
    *   LOD0 逐渐变得“镂空”（Discard 像素），LOD1 逐渐填补这些镂空。
    *   视觉上看起来像是一个半透明混合，但实际上是基于像素剔除的（Opaque pass），避免了半透明排序问题，但增加了 Overdraw（重绘）开销。

---

### 5. 现代优化：GPU Scene & Compute Shader

在 UE4 后期版本和 UE5 中，上述的 CPU 遍历逻辑被移植到了 GPU 上（Compute Shader），称为 **GPU Instance Culling**。

**逻辑流向：**
1.  **数据上传**：CPU 一次性把所有实例的 Transform 传给 GPU（放在一个巨大的 Buffer 里）。
2.  **Compute Shader 并行计算**：
    *   GPU 启动数千个线程，每个线程处理一个实例（或一个 Cluster）。
    *   **数学计算**：在 Shader 代码里直接算：
        ```hlsl
        float Dist = length(ViewOrigin - InstancePos);
        float ScreenSize = BoundsRadius / Dist; // 简化
        uint DesiredLOD = CalculateLOD(ScreenSize);
        ```
3.  **Indirect Draw Argument**：
    *   Compute Shader 算出哪些实例属于 LOD0，哪些属于 LOD1。
    *   它将这些可见实例的索引写入 `VisibleInstanceBuffer`。
    *   同时填写 `IndirectArgsBuffer`（告诉显卡：LOD0 有多少个，LOD1 有多少个）。
4.  **ExecuteIndirect**：
    *   渲染管线直接调用间接绘制指令。CPU 此时完全不插手 LOD 的选择和计数，效率极高。

### 总结

HISM 的 LOD 选择机制之所以快，核心在于：
1.  **层级剔除**：利用树结构，对于远处（屏幕占比小）的区域，**父节点直接决定所有子节点的命运**，避免逐个计算。
2.  **分类渲染**：将计算结果按 LOD 分组，合并成极少量的 Draw Call。
3.  **GPU 卸载**：现代管线将上述所有数学计算（距离、屏幕占比、剔除）全部移交 GPU Compute Shader 并行处理。
