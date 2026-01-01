---
title: Unreal Engine (UE) 中的 HISM (Hierarchical Instanced Static Mesh)
date: 2025-12-14 14:08:14
published: false
tags:
---

Unreal Engine (UE) 中的 **HISM (Hierarchical Instanced Static Mesh)** 是 `Instanced Static Mesh (ISM)` 的进化版。

简单来说，ISM 解决了“一次绘制成千上万个相同物体”的问题（通过 GPU Instancing），但 HISM 进一步解决了**“这些物体中，有的离得近（需要高精度 LOD），有的离得远（需要低精度 LOD），有的看不见（需要剔除）”**的问题。

以下是 HISM 实现机制的深度解析，主要从数据结构、剔除逻辑、LOD 处理和渲染流程四个方面来讲解。

---

### 1. 核心数据结构：Cluster Tree (聚类树)

HISM 与 ISM 最大的区别在于那个 **"H" (Hierarchical，分层)**。

*   **ISM 的数据结构**：是一个线性的数组。GPU 绘制时，基本上是“要么全画，要么全不画”（或者视锥体剔除做得非常粗糙），而且所有实例通常必须使用相同的 LOD。
*   **HISM 的数据结构**：在内部构建了一个 **BVH (Bounding Volume Hierarchy，包围体层次结构)**，在 UE 源码中通常被称为 **Cluster Tree**。

#### 构建过程 (BuildTree)：
当你向 HISM 组件添加实例（Instance）时，HISM 不仅仅是把它们扔进数组，而是会运行一个构建算法：
1.  **分组 (Clustering)**：根据实例在空间中的位置，将相邻的实例打包成一个“簇” (Cluster)。
2.  **层级 (Hierarchy)**：这些簇会进一步合并，形成父节点，直到形成一个根节点。每个节点都保存着一个 **包围球 (Bounding Sphere)** 或包围盒，包含了该节点下所有子实例的空间范围。

> **代价**：这就是为什么 HISM 添加/删除实例比 ISM 慢的原因。每次变动，可能都需要 `BuildTree` 或重新平衡这棵树。

---

### 2. 视锥体剔除 (Frustum Culling)

有了这棵树，渲染线程在每一帧就可以进行高效的剔除，而不需要遍历每一个实例（O(N) vs O(log N)）：

1.  **从根节点开始**：检查根节点的包围球是否在相机视锥体内。
2.  **递归判断**：
    *   如果父节点完全在视锥体外 -> **整棵子树全部剔除**（极大地节省了 CPU 计算）。
    *   如果父节点在视锥体内 -> 继续检查子节点。
    *   直到遍历到叶子节点（具体的 Instance 集合）。
3.  **结果**：最终得到一份“当前帧可见的实例列表”。

---

### 3. LOD (Level of Detail) 计算

这是 HISM 的杀手锏。ISM 很难对同一个 Draw Call 中的不同实例应用不同的 LOD，但 HISM 可以。

**实现原理：**
在遍历 Cluster Tree 的过程中，除了判断可见性，还会判断**节点在屏幕上的大小 (Screen Size)**：

1.  **距离判断**：计算节点包围球中心到摄像机的距离。
2.  **LOD 选择**：
    *   如果是内部节点（非叶子），且该节点代表的区域对应的屏幕尺寸非常小（比如远处的森林），引擎可能会直接决定：**该节点下的所有实例都使用最低级的 LOD (比如 LOD 3)**，甚至直接剔除（Cull Distance）。
    *   如果节点离得近，则深入到叶子节点，为每个具体的 Instance（或小簇）计算它应该显示哪一级 LOD。

**数据重组 (Internal Mapping)：**
由于 HISM 允许场景中同时存在 LOD0, LOD1, LOD2 的树，它不能在一个 Draw Call 里画完所有东西（因为不同的 LOD 对应不同的 Mesh 顶点数据）。
*   HISM 会将可见的实例按 LOD 分组。
*   **Draw Call 生成**：例如，如果有 1000 棵树，300 棵是 LOD0，500 棵是 LOD1，200 棵是 LOD2。渲染器会分别发起针对 LOD0、LOD1、LOD2 的绘制指令（共 3 个主要的 Instanced Draw Calls，而不是 1 个，也不是 1000 个）。

---

### 4. GPU 数据管理 (Instance Buffer)

为了支持上述功能，HISM 在 GPU 显存管理上比 ISM 更复杂。

*   **Instance Reordering (实例重排序)**：
    UE 的 HISM 组件在逻辑层（Game Thread）有一个实例索引（Index），但在渲染层（Render Thread），为了配合 Cluster Tree 的遍历和内存连续性，实例在 Buffer 中的顺序可能与逻辑层不同。
    *   HISM 维护了一个 `InstanceReorderTable` 来映射逻辑索引和内部渲染索引。
    *   当你 `RemoveInstance(5)` 时，它通常会将数组末尾的实例移动到空缺位置（Swap and Pop），并更新映射表和树结构，而不是重新分配整个 Buffer。

*   **Per-Instance Data**：
    GPU 缓冲区存储了 Transform矩阵（位置/旋转/缩放）以及 Custom Data（自定义浮点数，用于材质变色等）。绘制时，顶点着色器 (Vertex Shader) 根据 `InstanceID` 从缓冲区读取对应的 Transform。

---

### 5. 现代改进：GPU Scene & Compute Shaders

在较新的 UE 版本（尤其是开启了 GPUScene / Auto Instancing 后），HISM 的很多工作被转移到了 GPU 上：

1.  **GPU Culling**：
    以前是在 CPU 上遍历八叉树。现在，引擎可以将所有实例的 Transform 数据上传到 GPU。然后使用 **Compute Shader (计算着色器)** 并行处理所有实例的剔除计算（视锥体剔除 + 遮挡剔除）。
2.  **Compact Buffer**：
    Compute Shader 计算出哪些实例可见后，会将可见实例的索引写入一个新的、紧凑的 Buffer (Indirect Draw Argument Buffer)。
3.  **Indirect Drawing**：
    渲染管线直接使用这个由 GPU 生成的 Buffer 进行 `DrawInstancedIndirect`。这意味着 CPU 甚至不知道这一帧到底画了多少棵树，完全由 GPU 自产自销，极大地降低了 CPU Draw Call 的开销。

---

### 6. HISM vs Nanite (UE5)

这是必须要提的一点。

*   **HISM 的局限**：HISM 虽然解决了 LOD 切换，但在 LOD 切换的瞬间（例如 LOD0 变 LOD1），可能会有明显的“跳变 (Popping)”。虽然有 Dither Fade（抖动淡入淡出），但会有 Overdraw 开销。
*   **Nanite 的降维打击**：在 UE5 中，如果是 Nanite Mesh，HISM 的 LOD 机制本质上就**失效**了。因为 Nanite 自己有一套更先进的、基于 Cluster（微多边形簇）的流送和剔除机制。
    *   如果你用 Nanite 网格体，使用 ISM 和 HISM 的性能差距变得很小，因为剔除和 LOD 全由 Nanite 在 GPU 极细粒度下接管了。
    *   但是，HISM 的 **Cull Distance (剔除距离)** 设置依然对 Nanite 有效（用于彻底不渲染远处的物体）。

### 总结

**HISM 的实现核心在于：**
1.  **空间换时间**：在内存中维护一棵空间树（Cluster Tree）。
2.  **分治策略**：利用树结构在 CPU（或 Compute Shader）端快速剔除大片不可见的物体。
3.  **按需分配**：根据屏幕占比，动态计算不同区域应使用的 LOD，并将实例按 LOD 分组提交给 GPU。

**适用场景**：植被（树木、草地）、建筑碎片、大量重复的非 Nanite 道具。不适合频繁移动的物体（因为树结构更新代价大）。
