---
layout:     post
title:      iOS手势事件分发原理
subtitle:   iOSHitTest和PointInSide实现探究
date:       2017-07-01
author:     jack
header-img: img/post-bg-ios9-web.jpg
catalog: true
tags:
    - iOS
---

HitTest的主要目的就是找到对于UIEvent的响应者，本文实现代码是根据apple文档描述的一种猜测实现，帮助大家理解原理

```
- (UIView *)hitTest:(CGPoint)point withEvent:(nullable UIEvent *)event{
    
    //apple文档描述，不接受事件的情况
    if (self.userInteractionEnabled == NO || self.isHidden == YES || self.alpha < 0.01) {
        return nil;
    }
    
    //如果当前View包含此Point
    if ([self pointInside:point withEvent:event]) {
        
        //遍历子View，这里注意要从后往前遍历，因为后面的是越靠近用户的
        for (NSInteger i=self.subviews.count-1; i>=0; i--) {
            
            UIView* subView = [self.subviews objectAtIndex:i];
            
            //将父View的Point转换成子View坐标系的Point
            CGPoint pointInSubView = [subView convertPoint:point fromView:self];
            
            //递归子View调用HitTest:
            UIView* resultView = [subView hitTest:pointInSubView withEvent:event];
            
            //找到了子View可以响应
            if (resultView) {
                return resultView;
            }
            
        }
        
        //没有找到可以响应的子View，返回自己
        return self;
    }
    
    //返回nil，告诉上一级自己无法响应此事件
    return nil;
}
```

流程图总结

![image.png](http://upload-images.jianshu.io/upload_images/2042621-dcfdbeeda6c9ce40.png?imageMogr2/auto-orient/strip%7CimageView2/2/w/1240)