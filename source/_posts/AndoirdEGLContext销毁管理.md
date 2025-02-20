---
title: AndoirdEGLContext销毁管理
date: 2024-08-01 00:19:32
tags:
---

```java
public interface EGLContextFactory {
    EGLContext createContext(EGL10 egl, EGLDisplay display, EGLConfig eglConfig);
    void destroyContext(EGL10 egl, EGLDisplay display, EGLContext context);
} 
```
### EGLContext 如果释放时，会删除在当前Context 下创建的bufffer,texture 以及fbo等资源吗

### 在 OpenGL ES 中，当一个 EGLContext 被销毁时，所有在该上下文中创建的 OpenGL 资源（如 buffer、texture 和 framebuffer objects (FBO) 等）都会被删除。这是因为这些资源是与特定的 OpenGL 上下文相关联的，一旦上下文被销毁，与之相关的所有资源也会被自动释放。

具体来说，当你调用 `EGLContextFactory` 接口的 `destroyContext` 方法来销毁一个 EGLContext 时，OpenGL ES 会自动处理这个上下文的清理工作，包括删除所有在该上下文中创建的资源。

因此，你不需要手动删除这些资源，销毁上下文的过程会自动处理它们的释放。

不过，如果你需要提前释放某些资源以便在上下文还没有销毁之前释放内存，你可以在合适的时机手动删除这些资源（例如通过调用 `glDeleteBuffers`、`glDeleteTextures`、`glDeleteFramebuffers` 等方法）。