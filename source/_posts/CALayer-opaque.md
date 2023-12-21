---
layout: post
title: CALayer opaque
date: 2016-12-30 10:51:46
tags: iOS

---

### 颜色合成公式

**R = S + D \* ( 1 – Sa )**

 ![20130819170332968](/Users/baidu/Downloads/20130819170332968.png)

其中，R表示混合结果的颜色，S是源颜色(位于上层的红色图层一)，D是目标颜色(位于下层的绿色图层二)，Sa是源颜色的alpha值，即透明度。公式中所有的S和D颜色都假定已经预先乘以了他们的透明度。

设置opaque相当于是设置了Sa=1，此时R = S，省去了GPU的计算

注意：设置opaque为YES时，要确保alpha为1.0f，否则结果不可预期
