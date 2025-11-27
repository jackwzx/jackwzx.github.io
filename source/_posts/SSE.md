---
title: LOG距离计算
date: 2024-12-19 10:00:00
tags: [Java, Hook, 动态代理, 反射, Apollo]
published: false
categories: [技术分析]
---

这是一个非常经典且核心的3D GIS/地图渲染问题。要同时满足“垂视（Top-down）时LOD均匀”和“斜视（Tilt）时LOD随距离单调变化”的要求，单纯使用“欧氏距离（Euclidean Distance）”是不够的。

业界标准（如Cesium 3D Tiles, Unreal Engine, Unity）通常使用的是 **屏幕空间误差 (Screen Space Error - SSE)** 算法，但在距离计算的具体选取上，为了满足你的特定约束，需要使用 **“沿相机视线方向的投影距离” (Projected Distance along View Direction)**。

下面为你详细拆解计算逻辑：

### 1. 为什么“点到点”的距离不行？

如果你直接计算 **Eye（相机位置）** 到 **Tile Center（瓦片中心）** 或 **Tile Edge（瓦片边缘）** 的欧氏距离：

*   **垂视（Top-down）时的问题：**
    当相机垂直向下看时，位于屏幕中心的瓦片距离相机最近，而位于屏幕边缘（角落）的瓦片距离相机较远。
    *   *结果：* 如果FOV（视场角）较大，你会看到类似“靶心”的效果——中间是高清LOD，四周变成低清LOD。这违反了你“垂视时所有瓦片默认使用相同level”的需求。

### 2. 解决方案：使用“投影距离” (Projected Distance)

为了保证垂视时所有瓦片判定距离一致，你需要计算 **瓦片到“相机平面”的距离**，而不是到“相机点”的距离。

**核心算法：**
计算瓦片包围盒（Bounding Sphere 或 AABB）中心点到相机视平面的垂直距离。也就是将“相机到瓦片的向量”投影到“相机朝向向量”上。

#### 数学公式：

设：
*   $P_{eye}$ = 相机位置 (World Position)
*   $\vec{V}_{dir}$ = 相机朝向单位向量 (Camera Forward Vector, normalized)
*   $P_{tile}$ = 瓦片中心点或包围盒最近点 (Tile Center)

我们要求的距离 $D$ 为：
$$ D = | (P_{tile} - P_{eye}) \cdot \vec{V}_{dir} | $$
*(注意：这里用的是点积 Dot Product)*

#### 为什么这样做能满足你的两个条件？

1.  **垂视时（Vertical View）：**
    *   相机朝向 $\vec{V}_{dir}$ 指向地面（例如 $(0, -1, 0)$ 或 $(0, 0, -1)$）。
    *   所有处于同一平面的瓦片（假设地势平坦），它们在视线方向上的 $Z$ 深度差（相对于相机）几乎是一样的（都等于相机高度）。
    *   **结果：** 无论瓦片在屏幕中心还是边缘，算出来的 $D$ 都等于“相机高度”。所有瓦片LOD一致。

2.  **斜视/平视时（Horizontal View）：**
    *   相机朝向变了，指向地平线。
    *   此时，远处的瓦片在 $\vec{V}_{dir}$ 方向上的投影长度非常大，近处的瓦片投影长度小。
    *   **结果：** $D$ 随深度单调增加，LOD随之降低。

### 3. 结合LOD判定的完整标准：SSE (Screen Space Error)

算出距离 $D$ 只是第一步。因为不同LOD的瓦片物理尺寸（Geometric Error）是不一样的，你不能只看距离，还要看瓦片的**几何误差**。

通常使用 **SSE（屏幕空间误差）** 公式来决定是否加载下一级瓦片：

$$ SSE = \frac{GeometricError \times ScreenHeight}{2 \times D \times \tan(\frac{FOV}{2})} $$

*   **GeometricError (几何误差):** 当前瓦片这一层级与真实地面的最大误差（通常瓦片元数据里有，Level越高，误差越小）。
*   **D:** 上面计算出的“投影距离”。
*   **SSE:** 最终算出的像素误差值。

**判定逻辑：**
*   如果计算出的 $SSE >$ 设定的阈值（比如16像素），说明当前瓦片太模糊了，误差太大，需要**分裂**（加载更高LOD）。
*   如果 $SSE <$ 阈值，说明当前瓦片足够清晰，保持现状。

### 4. 进阶微调（以什么点为准？）

在计算 $P_{tile}$（瓦片位置）时，有几种选择，建议如下：

*   **方案 A：瓦片包围球最近点（最推荐，最平滑）**
    不直接用中心点，而是计算相机到瓦片包围球（Bounding Sphere）表面的最近距离，然后投影。
    $$ D_{raw} = \max(0, \text{distance}(P_{eye}, P_{center}) - Radius) $$
    $$ D_{final} = D_{raw} \text{ projected onto } \vec{V}_{dir} $$
    *优点：* 避免相机穿入瓦片内部时距离变成0导致LOD计算崩溃。

*   **方案 B：瓦片中心点（最简单，足够用）**
    直接使用瓦片AABB的中心。
    *适用场景：* 如果你的瓦片切分比较细，且相机不会贴地飞行太近，这个方法最快且能完美满足你的“垂视均匀”要求。

### 总结

为了满足你的需求，请按以下步骤计算：

1.  获取 **相机的位置** $P_{eye}$ 和 **相机视线方向** $\vec{V}_{dir}$。
2.  获取 **瓦片的中心点** $P_{center}$。
3.  计算向量 $\vec{V}_{delta} = P_{center} - P_{eye}$。
4.  计算 **投影距离** $D = \vec{V}_{delta} \cdot \vec{V}_{dir}$。
5.  代入 **SSE公式**：$Value = \frac{GeometricError}{D}$ （简化版，常数可忽略）。
6.  比较 $Value$ 与阈值来决定LOD。

**效果验证：**
*   **垂视：** $D$ 约等于相机高度（Altitude），所有瓦片 $D$ 相同 $\rightarrow$ LOD 相同。
*   **平视：** $D$ 变成了深度距离，近处 $D$ 小 $\rightarrow$ LOD 高；远处 $D$ 大 $\rightarrow$ LOD 低。
*   **过渡：** 从垂视转到平视，$\vec{V}_{dir}$ 连续变化，点积运算保证了 $D$ 的单调连续变化。
