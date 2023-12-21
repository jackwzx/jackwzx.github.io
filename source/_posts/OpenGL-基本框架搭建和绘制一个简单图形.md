---
layout: post
title: opengl iOS创建OpenGL环境绘制一个简单三角形
date: 2016-12-30 15:42:35
tags: 
    - openGL 
    - iOS
---

### EAGLView创建要点

1 EAGLView的layer为CAEAGLLayer，设置kEAGLDrawablePropertyRetainedBacking和kEAGLDrawablePropertyColorFormat属性

```
- (void)setupLayer{

    CAEAGLLayer* layer = (CAEAGLLayer*)self.layer;
    
    layer.opaque = YES;
    
    layer.drawableProperties = [NSDictionary dictionaryWithObjectsAndKeys:@(NO), kEAGLDrawablePropertyRetainedBacking,
                                kEAGLColorFormatRGBA8, kEAGLDrawablePropertyColorFormat, nil];
}
```

2  创建EAGLContext

```
_context = [[EAGLContext alloc]initWithAPI:kEAGLRenderingAPIOpenGLES2];
```

3  加载着着色器程序，获取到着色器变量的索引，此过程，大致可分为：

a获取着色器源文件，创建shader，编译

b创建program，attachShader，link，useProgram

c从program，通过名字获取着色器中变量的索引(后续可以向着色器中传递参数)

这里有一点需要注意，此过程的前提，一定是已经设置了EAGLContext的currentContext

4 每一帧绘制流程

在外面使用CADisplayLink来控制播放帧率，每一帧的绘制流程就是

```
- (void)drawFrame{

    [_eaglView setFramebuffer];
    
    [_eaglView draw];
    
    [_eaglView presentFramebuffer];
}
```

5 关于frameBuffetObject的创建和释放

前提：context确保设置

流程大致是

```
- (void)createBuffer{
    
    [self checkContext];
    
    glGenRenderbuffers(1, &_colorRenderBuffer);
    
    glBindRenderbuffer(GL_RENDERBUFFER, _colorRenderBuffer);
    
    [_context renderbufferStorage:GL_RENDERBUFFER fromDrawable:(CAEAGLLayer*)self.layer];
    
    glGenFramebuffers(1, &_frameBuffer);
    
    glBindFramebuffer(GL_FRAMEBUFFER, _frameBuffer);
    
    glFramebufferRenderbuffer(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0,
    						GL_RENDERBUFFER, _colorRenderBuffer);
}

- (void)deleteBuffer{

    [self checkContext];
    
    glDeleteRenderbuffers(1, &_colorRenderBuffer);
    
    _colorRenderBuffer = 0;
    
    glDeleteFramebuffers(1, &_frameBuffer);
    
    _frameBuffer = 0;
}

- (void)setFramebuffer
{
    if ([self checkContext])
    {
        if (!_frameBuffer){
            [self createBuffer];
        }
        glBindFramebuffer(GL_FRAMEBUFFER, _frameBuffer);
    }
}

- (BOOL)presentFramebuffer
{
    BOOL success = FALSE;
    
    if ([self checkContext])
    {
        glBindRenderbuffer(GL_RENDERBUFFER, _colorRenderBuffer);
        
        success = [_context presentRenderbuffer:GL_RENDERBUFFER];
    }
    return success;
}
```

6 关于绘制三角形

```
- (void)draw{
    //设置背景颜色为绿色
    glClearColor(0, 1.0, 0,1.0);
    glClear(GL_COLOR_BUFFER_BIT);
    //设置管区域大小
    glViewport(0, 0, self.frame.size.width, self.frame.size.height);
    
    GLfloat vertices[] = {
        0.0f,  0.5f, 0.0f,
        -0.5f, -0.5f, 0.0f,
        0.5f,  -0.5f, 0.0f };
    //设置着色器中的vPositon
    glVertexAttribPointer(_positionSlot, 3, GL_FLOAT, GL_FALSE, 0, vertices);
    //使上一步的设置生效
    glEnableVertexAttribArray(_positionSlot);
    //绘制三角形
    glDrawArrays(GL_TRIANGLES, 0, 3);
}
```
