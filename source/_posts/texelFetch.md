---
title: texelFetch
date: 2024-10-06 18:16:59
tags:
---

`texelFetch` 是一个在着色器编程中用于从纹理中获取特定纹素（texel）的函数。与常规的纹理采样不同，`texelFetch` 使用整数纹理坐标来直接访问纹理数据，不进行过滤或插值。

在 OpenGL 的 GLSL（OpenGL Shading Language）中，`texelFetch` 的用法如下：

```glsl
vec4 texelFetch(sampler2D sampler, ivec2 coord, int lod);
```

- `sampler`：纹理采样器。
- `coord`：整数形式的纹理坐标。
- `lod`：细节层次（level of detail），通常为 0。

`texelFetch` 适用于需要精确访问纹理像素的场合，比如在一些计算或图像处理效果中。