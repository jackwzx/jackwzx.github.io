---
layout: post
title: CALayer属性positon和anchor
date: 2016-10-26 14:24:18
tags: iOS
---



### CALayer 的frame，bounds, position和anchor

frame描述的是在父layer上的坐标和尺寸

bounds是类似于View的bounds

anchor描述的是做动画时，比如旋转时的中心点，以某个点旋转，默认时（0.5，0.5）左上点是（0，0），右下点是（1，1）

position描述的是anchor的在父layer的坐标



举例来说，一个View的Frame是（40，40，100，100）

那么layer的frame是（40，40，100，100）

bound是（0，0，100，100）

position是：（140，140）

position计算：

pos.x = origin.x + anchor.x*size.with

pos.y = origin.y + anchor.y*size.height


如果想修改anchor,一定要同时修改position，才能保证位置不变，否则，单独修改position或者anchor，根据上面公式会导致layer位置发生变化

如果想修改anchor，而不影响layer移动，只需修改完成后，再设置一次layer的frame即可

    CGRect oldFrame = _redView.frame;
    _redView.layer.anchorPoint = CGPointMake(0.5, 1);
    _redView.frame = oldFrame;
注意，position并不适用这一点