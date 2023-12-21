---
layout: post
title: 光照学习
date: 2017-01-02 13:43:54
tags: openGL
---

### 基本概念

1 发射光（emission）：物体本身发的光，如果物体不发光，一般无此属性

2 环境光（ambient）：在环境中充分散射的光，光线在物体表面各个方向均匀泛射在openGL中，全局光强度为（0.2，0.2，0.2，1.0）

3 漫反射光（diffuse）：关于来自某个方向，但是在物体表面向各个方向反射

4 镜面高光：光线来自某一个特定的方向，然后在物体表面，以一个特定方向反射出去，在OpenGL中，镜面反射的强度，可以通过光泽度（shiness）来调节



### 光的计算：

1 发射光计算：发射颜色=物体的发射材质颜色

2 环境光计算

环境颜色 = 光源的环境光颜色*物体的环境材质颜色

3 漫反射计算：

漫反射颜色=光源的漫反射光颜色 * 物体的漫反射材质颜色 * DiffuseFactor

其中DiffuseFactor = max（0，dot（N，L））

dot表示两个向量夹角的cos

4 镜面反射：

镜面反射颜色 = 光源的镜面光颜色 * 物体的镜面材质颜色 * SpecularFactor

SpecularFactor = power（max（0， dot（N，H）），shininess）

H = normalise（L+E）

