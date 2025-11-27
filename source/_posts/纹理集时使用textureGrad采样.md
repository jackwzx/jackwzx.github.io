---
title: textureGrad
published: false
date: 2025-10-20 10:47:29
tags:
---

---

## 纹理图集的问题

### **什么是纹理图集？**
```
┌─────────────────────────────────┐
│ [Icon1] [Icon2] [Icon3] [Icon4] │
│ [Icon5] [Icon6] [Icon7] [Icon8] │  ← 一张大纹理
│ [Icon9] [Icon10][Icon11][Icon12]│
│ [Icon13][Icon14][Icon15][Icon16]│
└─────────────────────────────────┘
```

### **核心问题：边界渗透（Bleeding）**

当 GPU 进行**双线性插值**或**mipmap 采样**时，会采样到**相邻图标的像素**：

```glsl
// 采样 Icon6，但可能采样到 Icon5 或 Icon7 的边缘
vec2 uv = getIconUV(6);  // 获取 Icon6 的 UV 坐标
vec4 color = texture(atlas, uv);  // 可能包含相邻图标的颜色！
```

---

## 边界渗透的具体表现

### **1. 双线性插值渗透**
```
Icon 边界：┌───────┐
          │ Icon6 │
          │       │ ← 采样点接近边缘时
          └───────┘    会插值到 Icon5 的像素
Icon5 ←──→ Icon6
```

### **2. Mipmap 渗透**
```
原始尺寸：[64x64 Icon] [64x64 Icon]
Mip 1:    [32x32 Icon] [32x32 Icon]  ← 相邻图标开始混合
Mip 2:    [16x16 Icon] [16x16 Icon]  ← 严重混合
Mip 3:    [混合的模糊块]              ← 完全混合了
```

### **3. 视觉效果**
- Icon 边缘出现**其他图标的颜色**
- 远距离时图标**颜色不正确**
- 动画时出现**闪烁或色彩污染**

---

## textureGrad 的解决方案

### **1. 限制采样梯度**

```glsl
vec4 sampleAtlasIcon(sampler2D atlas, vec2 iconUV, vec2 iconSize) {
    // 计算 UV 空间中一个像素的大小
    vec2 texelSize = 1.0 / textureSize(atlas, 0);
    
    // 限制梯度，防止采样到相邻图标
    // 梯度不应超过图标内部的安全区域
    vec2 maxGradient = iconSize * 0.5 * texelSize;
    
    vec2 gradX = clamp(dFdx(iconUV), -maxGradient, maxGradient);
    vec2 gradY = clamp(dFdy(iconUV), -maxGradient, maxGradient);
    
    return textureGrad(atlas, iconUV, gradX, gradY);
}
```

### **2. 固定梯度采样**

```glsl
vec4 sampleIcon(sampler2D atlas, int iconID, vec2 localUV) {
    // 获取图标在图集中的位置和大小
    vec4 iconRect = getIconRect(iconID);  // (x, y, width, height)
    
    // 转换到图集 UV 坐标
    vec2 atlasUV = iconRect.xy + localUV * iconRect.zw;
    
    // 使用固定的小梯度，基于图标大小
    vec2 iconTexelSize = iconRect.zw / 64.0;  // 假设图标是 64x64
    vec2 safeGradient = iconTexelSize * 0.5;
    
    return textureGrad(atlas, atlasUV, safeGradient, vec2(0.0, safeGradient.y));
}
```

### **3. 安全边界采样**

```glsl
vec4 sampleIconSafe(sampler2D atlas, vec2 iconUV, vec2 iconSize) {
    // 缩小 UV 范围，避免边界
    vec2 margin = 0.5 / textureSize(atlas, 0);  // 0.5 像素边距
    vec2 safeIconSize = iconSize - margin * 2.0;
    vec2 safeUV = iconUV + margin + localUV * safeIconSize;
    
    // 使用限制的梯度
    vec2 maxGrad = safeIconSize * 0.5;
    vec2 gradX = clamp(dFdx(safeUV), -maxGrad, maxGrad);
    vec2 gradY = clamp(dFdy(safeUV), -maxGrad, maxGrad);
    
    return textureGrad(atlas, safeUV, gradX, gradY);
}
```

---

## 实际应用示例

### **UI 图标系统**

```glsl
// UI 图标着色器
uniform sampler2D iconAtlas;
uniform int iconID;
varying vec2 vLocalUV;  // 0.0 到 1.0 的局部坐标

// 图标信息（通常从 uniform 或纹理传入）
struct IconInfo {
    vec2 atlasPos;    // 在图集中的位置 (0-1)
    vec2 atlasSize;   // 在图集中的大小 (0-1)
};

uniform IconInfo icons[MAX_ICONS];

void main() {
    IconInfo icon = icons[iconID];
    
    // 转换局部 UV 到图集 UV
    vec2 atlasUV = icon.atlasPos + vLocalUV * icon.atlasSize;
    
    // 计算安全梯度
    vec2 texelSize = 1.0 / textureSize(iconAtlas, 0);
    vec2 safeGradient = icon.atlasSize * 0.25;  // 保守的梯度
    
    vec4 color = textureGrad(iconAtlas, atlasUV, 
                            vec2(safeGradient.x, 0.0), 
                            vec2(0.0, safeGradient.y));
    
    gl_FragColor = color;
}
```

### **精灵动画系统**

```glsl
// 精灵动画
uniform sampler2D spriteSheet;
uniform float frameTime;
uniform int frameCount;
uniform vec2 frameSize;  // 单帧在图集中的尺寸

void main() {
    // 计算当前帧
    int currentFrame = int(mod(frameTime * 10.0, float(frameCount)));
    
    // 计算帧在图集中的位置
    int framesPerRow = int(1.0 / frameSize.x);
    vec2 framePos = vec2(
        float(currentFrame % framesPerRow) * frameSize.x,
        float(currentFrame / framesPerRow) * frameSize.y
    );
    
    // 转换 UV
    vec2 atlasUV = framePos + vLocalUV * frameSize;
    
    // 固定梯度，防止帧间渗透
    vec2 frameGradient = frameSize * 0.3;
    
    vec4 color = textureGrad(spriteSheet, atlasUV,
                            vec2(frameGradient.x, 0.0),
                            vec2(0.0, frameGradient.y));
    
    gl_FragColor = color;
}
```

---

## 高级技巧

### **1. 动态梯度调整**

```glsl
vec4 sampleIconAdaptive(sampler2D atlas, vec2 iconUV, vec2 iconSize, float scale) {
    // 根据缩放调整梯度
    vec2 adaptiveGradient = iconSize * 0.5 / scale;
    
    // 距离越远，梯度越大（更模糊，但不会渗透）
    float distance = length(vWorldPos - cameraPos);
    float distanceFactor = clamp(distance / 100.0, 0.1, 2.0);
    adaptiveGradient *= distanceFactor;
    
    return textureGrad(atlas, iconUV, 
                      vec2(adaptiveGradient.x, 0.0),
                      vec2(0.0, adaptiveGradient.y));
}
```

### **2. 边界检测**

```glsl
bool isNearBoundary(vec2 localUV, float threshold) {
    return any(lessThan(localUV, vec2(threshold))) || 
           any(greaterThan(localUV, vec2(1.0 - threshold)));
}

vec4 sampleIconWithBoundaryCheck(sampler2D atlas, vec2 iconUV, vec2 iconSize) {
    if (isNearBoundary(vLocalUV, 0.1)) {
        // 靠近边界时使用更保守的梯度
        vec2 conservativeGrad = iconSize * 0.1;
        return textureGrad(atlas, iconUV, conservativeGrad, conservativeGrad);
    } else {
        // 中心区域可以使用正常采样
        return texture(atlas, iconUV);
    }
}
```

---

## 总结

在纹理图集中使用 `textureGrad` 的关键目的：

1. **防止边界渗透**：避免采样到相邻图标的像素
2. **控制 Mipmap 级别**：防止远距离时的颜色混合
3. **保持图标独立性**：确保每个图标的视觉完整性
4. **改善动画质量**：避免帧切换时的颜色污染

这是**纹理图集渲染的核心技术**，特别在 UI 系统、精灵游戏和图标渲染中必不可少！
