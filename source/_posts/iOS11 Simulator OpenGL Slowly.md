---
layout:     post
title:      iOS11模拟器运行OpenGL相关程序卡顿
subtitle:   Xcode9.0 problem
date:       2017-09-19
author:     jack
header-img: img/post-bg-ios9-web.jpg
catalog: true
tags:
    - iOS
---


> 最近升级Xcode9.0后发现模拟器上运行OpenGL程序非常卡顿，查了一下原因，原来是苹果的一处bug



### 具体的解决方案是
替换此路径下的文件用附件文件，替换此路径下文件即可

*/Applications/Xcode.app/Contents/Developer/Platforms/iPhoneOS.platform/Developer/Library/CoreSimulator/Profiles/Runtimes/iOS.simruntime/Contents/Resources/RuntimeRoot/System/Library/Frameworks/OpenGLES.framework/libCoreVMClient.dylib*  

[libCoreVMClient.dylib下载链接](http://ox0sey9ue.bkt.clouddn.com/libCoreVMClient.dylib)



### 参考文献

[苹果开发者论坛](https://forums.developer.apple.com/thread/83570)