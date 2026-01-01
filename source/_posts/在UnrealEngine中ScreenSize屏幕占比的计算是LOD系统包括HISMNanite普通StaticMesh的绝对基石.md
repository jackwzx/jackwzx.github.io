---
title: Screen Size的计算
date: 2025-12-14 14:46:20
published: false
tags:
---

在 Unreal Engine 中，**Screen Size (屏幕占比)** 的计算是 LOD 系统（包括 HISM、Nanite、普通 Static Mesh）的绝对基石。

它不是指物体在屏幕上占据了多少个像素，而是一个**归一化（Normalized）的数值**。通常，**1.0** 表示物体直径填满整个屏幕高度，**0.5** 表示填满一半高度，以此类推。

以下是其核心公式、依赖参数及背后的科学/几何原理。

---

### 1. 核心公式

在 UE 的渲染底层（例如 `SceneVisibility.cpp` 中的 `ComputeBoundsScreenSize` 函数），简化后的计算公式如下：

$$ \text{ScreenSize} = \frac{2 \times \text{SphereRadius}}{\text{Distance}} \times \text{ProjectionScale} $$

或者更直观的几何表达：

$$ \text{ScreenSize} = \frac{\text{ObjectDiameter}}{\text{Distance} \times 2 \times \tan(\frac{\text{FOV}}{2})} $$

其中：
*   **ObjectDiameter** ($2 \times R$): 物体包围球的直径。
*   **Distance**: 物体中心到摄像机的距离（通常是投影深度 $Z$）。
*   **ProjectionScale**: 由视场角 (FOV) 决定的缩放系数。

---

### 2. 依赖参数详解

要算出这个数值，引擎依赖以下三个关键数据：

#### A. 包围球半径 (Bounding Sphere Radius)
*   **来源**：当你导入模型时，UE 会自动计算一个能包裹住整个模型的最小球体。HISM 的 Cluster Tree 节点也有自己的合并包围球。
*   **作用**：代表物体的**物理尺寸**。
*   **为什么用球？** 因为球体在任何角度下的投影形状都很接近（圆形），且计算旋转后的包围盒代价太大，球体只需判断圆心距离，非常廉价。

#### B. 视锥体深度 (View Space Depth / Distance)
*   **来源**：$\text{Distance} = \text{CameraPosition} - \text{ObjectCenter}$。
*   **细节**：通常使用**投影空间下的 Z 值**（物体在摄像机朝向方向上的距离），而不是欧几里得距离（直线距离）。这样可以避免物体在屏幕边缘时因为直线距离变长而错误地切换 LOD。

#### C. 投影矩阵系数 (Projection Matrix [1][1])
*   **来源**：摄像机的 **FOV (Field of View，视场角)**。
*   **作用**：决定了透视关系的强弱。
    *   FOV 越大（广角），远处的物体看起来越小，Screen Size 计算结果越小。
    *   FOV 越小（长焦），远处的物体看起来越大，Screen Size 计算结果越大。
*   **数学体现**：在投影矩阵中，元素 `[1][1]` 的值通常等于 $\frac{1}{\tan(FOV_{vertical} / 2)}$。这正是公式中分母部分的来源。

---

### 3. 科学依据：小孔成像与相似三角形

Screen Size 的计算原理源于最基础的**透视投影几何 (Perspective Projection Geometry)**。

#### 原理模型：相似三角形
想象一个侧视图：
1.  **三角形 A**：底边是物体在世界空间的高度（直径 $2R$），高是物体到相机的距离 ($D$)。
2.  **三角形 B**：底边是物体在投影平面（屏幕）上的高度 ($H_{screen}$)，高是相机的焦距 ($f$) 或投影平面的距离（在归一化设备坐标中通常视为 1）。

根据**截线定理（Thales's theorem）**，这两个三角形相似：

$$ \frac{H_{screen}}{f} = \frac{2R}{D} $$

$$ H_{screen} = \frac{2R}{D} \times f $$

在计算机图形学中，相机的“焦距” $f$ 是由 FOV 决定的。
如果我们把屏幕总高度定义为 1（归一化），那么半个屏幕的高度对应 $\tan(FOV/2)$。因此焦距 $f$ 的缩放关系约为 $1 / \tan(FOV/2)$。

将这些代入公式，就得到了 UE 的计算逻辑：**物体在屏幕上的占比，与物体大小成正比，与距离成反比。**

---

### 4. 实际计算中的特殊情况

#### A. 视口分辨率无关性 (Resolution Independence)
你可能会问：*“如果我把窗口从 720p 拉大到 4k，LOD 会变吗？”*

**理论上不会。**
UE 的 `Screen Size` 计算的是**屏幕占比（百分比）**，而不是像素数。
*   物体占屏幕高度的 50% (Screen Size = 0.5)。
*   在 720p 下，它高 360 像素。
*   在 4k 下，它高 1080 像素。
*   但无论哪种分辨率，LOD 系统都认为它的 Screen Size 是 **0.5**。

这意味着同样的 LOD 配置在不同分辨率的显示器上，视觉密度（多边形相对于屏幕面积的比例）是一致的。

#### B. 宽高比 (Aspect Ratio)
通常公式使用**垂直 FOV**。但在宽屏或超宽屏下，简单地用高度可能不准确。
UE 的 `View.ViewMatrices.GetScreenScale()` 会取投影矩阵中 `[0][0]` (水平缩放) 和 `[1][1]` (垂直缩放) 的**较大值**（或者根据主导轴），以确保物体无论在宽屏还是竖屏下，LOD 的切换都能保证其包围球至少占据那么大的比例。

#### C. 偏差 (LOD Bias)
在 `Scalability Settings`（可伸缩性设置）中调整 "View Distance Quality" 时，或者在 Static Mesh 编辑器里调整 `LOD Group`，实际上是在修改一个乘数因子。
$$ \text{FinalScreenSize} = \text{CalculatedScreenSize} \times \text{LODDistanceScale} $$
*   **LODDistanceScale > 1**: 欺骗系统认为物体更大了 -> 即使离得远也用高精模 -> 画质更好，性能更差。
*   **LODDistanceScale < 1**: 欺骗系统认为物体更小了 -> 离得近就切换成纸片 -> 性能更好，画质更差。

### 总结

UE 的 HISM Screen Size 计算本质上就是执行一次**虚拟的透视投影**：

1.  拿球体直径（**世界尺寸**）。
2.  除以深度（**近大远小**）。
3.  除以 FOV 正切值（**透视缩放**）。

这个结果是一个纯粹的数学比率，它**不依赖于显卡性能，也不依赖于具体的像素分辨率**，从而保证了美术在编辑器里配置的 LOD 距离在任何设备上都能保持一致的视觉比例。
