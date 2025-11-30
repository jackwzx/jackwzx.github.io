---
title: Android Surface 延迟释放策略
date: 2025-11-30 14:39:27
published: true
tags:
---

你的这个思路非常棒！这就是所谓的 **"延迟销毁 (Lazy/Deferred Destruction)"** 或者 **"Surface 缓存"** 策略。

这在很多高性能渲染引擎（如游戏、地图SDK）中是常见的做法。

### 你的方案分析

**核心逻辑：**
1.  **切后台 (`surfaceDestroyed`)**：
    *   停止渲染 (`swapBuffers`)。
    *   **不销毁** `EGLSurface`。
    *   **不销毁** `EGLContext`。
    *   线程进入等待。
2.  **切回前台 (`surfaceCreated`)**：
    *   检测到已经存在旧的 `EGLSurface`。
    *   销毁旧的 `EGLSurface`（因为它绑定的 NativeWindow 已经失效了）。
    *   使用新的 `Surface` 创建新的 `EGLSurface`。
    *   恢复渲染。
3.  **彻底退出 (`quit`)**：
    *   此时 `EGLSurface` 还在（虽然底层的 Window 没了）。
    *   尝试 `makeCurrent`。
    *   调用 `nativeDestroy` (释放 C++ 资源)。
    *   最后销毁 Surface 和 Context。

**这样做的好处：**
1.  **解决了 Context 丢失问题**：Context 一直活着，纹理不需要重新加载。
2.  **解决了 `nativeDestroy` 的环境问题**：在退出时，因为 `EGLSurface` 对象还在，调用 `eglMakeCurrent` **通常**是成功的（取决于 GPU 驱动实现），这让你可以合法地调用 `glDelete*`。
3.  **无缝切换**：如果是屏幕旋转（导致 Surface 销毁重建），这种方式切换速度最快。

---

### 修改后的代码实现 (支持延迟释放)

我们需要修改 `CustomGLRenderThread` 的逻辑。

#### 1. 状态控制变量
我们需要区分“是否应该渲染”和“是否持有 Surface”。

```kotlin
// 只有当持有有效的 Android Window 时，才为 true，才能 swapBuffers
private var hasValidWindow = false 

// 记录是否已经创建了 EGLSurface 对象（哪怕底层的 Window 已经销毁了，这个对象可能还在）
private var hasEglSurface = false 
```

#### 2. 线程主循环 (Run Method)

```kotlin
override fun run() {
    initEGL()
    initGLContext()
    
    // 初始化 C++ 引擎（此时还没有 Surface，先不调 OpenGL 相关的 setup，或者创建一个 Pbuffer）
    // 通常建议：把 C++ 的 init 放到第一次 createEGLSurface 之后，或者这里先不做 GL 操作
    
    while (isRunning) {
        synchronized(lock) {
            // 只要没有有效的 Window，就等待 (延迟销毁策略的核心：不在这里销毁 EGLSurface)
            while (isRunning && !hasValidWindow) {
                lock.wait()
            }
        }
        
        if (!isRunning) break

        // --- 核心修改：Surface 替换逻辑 ---
        
        // 1. 如果有新的 Window 来了，但我们手里还捏着旧的 EGLSurface
        if (hasEglSurface && (surface != currentBoundSurface)) {
            // 必须先销毁旧的，因为它绑定的是上一个无效的 Window
            releaseEGLSurface() 
            Log.d("GLThread", "Releasing old EGLSurface (Lazy Release)")
        }

        // 2. 如果当前没有 EGLSurface，就创建一个新的
        if (!hasEglSurface && surface?.isValid == true) {
            createEGLSurface(surface!!)
            makeCurrent()
            
            // 如果是第一次启动，初始化 C++ 引擎
            if (!isEngineInitialized) {
                nativeCreate()
                isEngineInitialized = true
            }
            
            currentBoundSurface = surface // 记录当前绑定的 Surface 对象
            Log.d("GLThread", "Created new EGLSurface")
        }

        // 3. 渲染
        nativeRender()
        
        // 4. 交换缓冲
        if (!swapBuffers()) {
            Log.w("GLThread", "Swap failed, window might be lost")
            synchronized(lock) {
                hasValidWindow = false // 标记 Window 失效，下次循环进入 wait
            }
        }
    }

    // --- 退出逻辑 (Destruction) ---
    
    // 此时我们要退出了。
    // 如果 EGLSurface 还在（说明是延迟释放的），我们可以尝试 MakeCurrent 来清理资源
    if (hasEglSurface) {
        // 尝试绑定。即使底层 Window 销毁了，EGLSurface 句柄通常还能用于 MakeCurrent
        // 注意：这里不能 SwapBuffers，只能做 glDelete 等操作
        if (makeCurrent()) {
            nativeDestroy() // 完美：在 GL 环境中销毁
        } else {
            // 极端情况：驱动不允许绑定失效 Surface，只能强行清理 C++ 内存
            nativeDestroy() 
        }
        releaseEGLSurface()
    } else {
        // 连 Surface 都没有，直接盲调（主要为了释放 C++ 内存）
        nativeDestroy()
    }

    releaseEGL()
}
```

#### 3. 外部回调的配合 (MyGLSurfaceView)

View 层的逻辑变得更简单了，只需要控制开关。

```kotlin
// 外部调用：当 Surface 创建/重建
fun onSurfaceCreated(surface: Surface) {
    synchronized(lock) {
        this.surface = surface
        this.hasValidWindow = true // 允许渲染
        lock.notifyAll()
    }
}

// 外部调用：当 Surface 销毁
fun onSurfaceDestroyed() {
    synchronized(lock) {
        // 关键点：只标记 Window 不可用，不销毁 EGLSurface！
        this.hasValidWindow = false 
        // 注意：这里不需要设置 surface = null，保留引用以便对比
        // 线程会在下一次循环因为 !hasValidWindow 而进入 wait
    }
}
```

---

### 这个方案的唯一风险点

你需要注意一个底层的技术细节：**`EGL_BAD_NATIVE_WINDOW`**。

当你调用 `onSurfaceDestroyed` 时，Android 系统会销毁底层的 Window BufferQueue。
在你的方案中，`EGLSurface` 还活着，但它背后的 Window 死了。

在 `quit()` 阶段：
```kotlin
if (hasEglSurface) {
    makeCurrent() // <--- 这里
    nativeDestroy()
}
```

*   **大多数 GPU 驱动 (Adreno, Mali)**：允许这么做。只要你不调用 `swapBuffers`，仅仅是 `makeCurrent` 和 `glDeleteTextures` 是可以的。
*   **少数严格的驱动**：可能会在 `makeCurrent` 时检测到底层 Window 已失效，返回 `EGL_FALSE`。

**解决办法**：
在 `nativeDestroy` 的 C++ 代码中，以及 Java 调用处，要做好**容错**。
即：如果 `makeCurrent` 失败了，也要强行调用 `nativeDestroy` 来释放 C++ 的 `std::vector` 等内存，只是跳过 `glDelete` 而已（反正 Context 马上要被销毁了，显存会自动回收，不会造成永久泄漏）。

### 总结
你的“延迟释放”思路是**完全可行且推荐**的。
1.  **暂停时**：保留 `EGLSurface`，停止 `Swap`，线程休眠。
2.  **恢复时**：对比 Surface 对象，不同则 `Release Old` -> `Create New`。
3.  **退出时**：利用残留的 `EGLSurface` 恢复环境进行清理。

这比每次都销毁重建要优雅得多，尤其是在处理屏幕旋转等配置变更时。
