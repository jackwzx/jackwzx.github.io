---
layout:     post
title:      iOS运行时消息转发
subtitle:   iOS Runtime
date:       2017-12-14
tags:
    - iOS
---


> 最近读了一遍apple 文档，对于iOS运行时消息转发机制发现有些细节还是理解有所偏差，写此文章加深理解



### iOS 方法调用探讨

这个话题还要从OC是一门动态语言说起，OC的动态性体现在编译和链接期，并没有直接绑定函数调用关系，编译器将方法调用转成objc_msgSend(receiver, selector, arg1, arg2, ...)方法这种方式

在运行时，通过isa对象通过从子类到父类的方法查找，找到具体的函数入口进行调用，这其中还包括cache等机制，这里不在赘述，这次主要讨论的是Dynamic Method Resolution和Message Forwarding

如果调用的Seletor在类的方法列表中找不到，以实例对象的方法为例，将进入如下流程：

![image.png](https://oh144b0ji.qnssl.com/OC%20runTime.jpg)



主要流程可以总结为，先进入消息动态处理流程，再进入消息转发流程

1.消息动态处理流程：resloveInstanceMethod中可以通过class_addMethod为此对象动态添加方法，这样就使该对象正常响应此方法

```
+ (BOOL)resolveInstanceMethod:(SEL)aSEL{
  
    if (aSEL == @selector(notFoundFunctiion)) {
        
        class_addMethod([self class], aSEL, (IMP) dynamicMethodIMP, "v@:");
        return YES;
    }
    
    return [super resolveInstanceMethod:aSEL];
}
```

​	需要注意的是，不仅[self notFoundFunctiion]会触发这里，在

```
[self respondsToSelector:@selector(notFoundFunctiion)]
```

​	这句代码中，同样会触发消息动态处理流程，这和后面讲的消息转发有很大区别。



2.如果上面的消息处理流程返回NO，那么就会进入消息转发流程

可以将此消息转发给另外一个对象进行执行。首先进入的是forwardingTargetForSelector，这里可以返回一个可以响应此消息的对象，如果仍然返回nil，就会进入methodSignatureForSelector和forwardInvocation的流程，其实这两种方式本质的意义相同，只不过一个是通过另外的对象selector调用，一个是通过invocation的方式调用，但是要注意，这里的selector对于原来的对象来讲，respondsToSelector返回为NO



#### 参考文章：

[Objective-C Runtime Programming Guide](https://developer.apple.com/library/content/documentation/Cocoa/Conceptual/ObjCRuntimeGuide/Introduction/Introduction.html)




