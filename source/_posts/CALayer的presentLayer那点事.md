---
layout:     post
title:      iOSCALayer的presentLayer那点事
subtitle:   关于PresentLayer
date:       2017-11-12
author:     jack
header-img: img/post-bg-ios9-web.jpg
catalog: true
tags:
    - iOS
---


> 最近开发过程中遇到的一个问题，要求在一个View的动画过程中，获取它的实时位置，这里讲如何解决



### 动画过程中，如何获取它的实时位置

这个话题涉及对CALayer的理解和使用

CALayer内部系统维护着三种LayerTree，分别为modelLayer，presentLayer和renderLayer，renderLayer为系统渲染时内部维护，对于开发者来讲是透明不可见的，这里指讨论modelLayer和presentLayer



- modelLayer 实际上就是通常操作的layer，我们可以修改这个layer的各种属性，可以理解这个layer只保存数据
- presentLayer 是当使用CoreAnimation做动画时，每一帧动的位置都可以从这个layer中读取到，我们可以通过下面的代码来测试



```
UIView* view = [[UIView alloc]initWithFrame:CGRectMake(100, 100, 100, 100)];

    view.backgroundColor = [UIColor redColor];

    [self.view addSubview:view];

    NSLog(@"model   Layeer = %@", NSStringFromCGRect([view.layer modelLayer].frame));

    NSLog(@"present Layeer = %@", NSStringFromCGRect([view.layer presentationLayer].frame));

    [UIView animateWithDuration:10 animations:^{

        view.frame = CGRectMake(200, 100, 100, 100);
        
    } completion:^(BOOL finished) {
    }];

    [NSTimer scheduledTimerWithTimeInterval:1 repeats:YES block:^(NSTimer * _Nonnull timer) {
    
        NSLog(@"model   Layeer = %@", NSStringFromCGRect([view.layer modelLayer].frame));
        NSLog(@"present Layeer = %@", NSStringFromCGRect([view.layer presentationLayer].frame));
    }];

```



通过控制台日志可以分析看到，presentLayer在没有做动画的时候是nil，在有动画时才有数值，并且是实时的view的位置
