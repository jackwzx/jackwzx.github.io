---
layout:     post
title:      iOS不受用户手动修改时间的影响的计时技术
subtitle:   一种不受系统时钟影响的实现
date:       2017-09-17
author:     jack
header-img: img/post-bg-ios9-web.jpg
catalog: true
tags:
    - iOS
---

### iOS不受用户手动修改时间的影响的计时技术

### 前言

这几天的项目中，要求实现一个用户计时的功能，其中遇到了经理了几种技术方法，分别是利用NSTimer，NSDate，都有各自的问题，Timer计时不够精准，以及需要程序在后台执行，NSDate会受到用户修改系统时间，而导致计时不准，最后找到了一种完美的解决方案



### 解决问题

直接说最终方案

`[[NSProcessInfo processInfo] systemUptime];`

这个函数返回的是开机到当前的时间，秒数为单位，并且**不受系统时钟的影响**，在一些需要准确记录时间长度的场景里，配合Timer非常适合，解决了前沿描述的所有痛点.



### 参考文献

[苹果接口文档](https://developer.apple.com/documentation/foundation/nsprocessinfo/1414553-systemuptime?language=objc)