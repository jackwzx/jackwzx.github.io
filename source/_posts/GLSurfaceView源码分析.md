---
title: GLSurfaceView源码分析
date: 2025-12-03 12:03:03
published: true
tags:
---


基于 Android Open Source Project (AOSP) 的 `GLSurfaceView.java` 源码，我为你深入梳理了各个核心事件的内部实现细节。

`GLSurfaceView` 的核心机制是 **生产者-消费者模式**。它内部维护了一个 **`GLThread`**（渲染线程），而 `GLSurfaceView` 本身（主线程）负责监听系统回调，并通过 **Monitor 锁 (synchronize)** 修改状态变量，通知 `GLThread` 进行相应的 EGL 操作。

以下是各个关键事件的源码实现细节拆解：

---v

### 1. 构造与初始化 (Initialization)

当你创建一个 `GLSurfaceView` 时，它首先做的是通过 `SurfaceView` 的机制注册回调。

*   **源码行为：**
    ```java
    // GLSurfaceView.java
    private void init() {
        // ...
        getHolder().addCallback(this); // 注册 SurfaceHolder.Callback
        // ...
    }
    ```
*   **细节：** 此时 `GLThread` 可能还没创建，或者处于 `State.DETACHED` 状态。直到你调用 `setRenderer()`，线程才会启动（调用 `start()`）。

---

### 2. onAttachedToWindow (View 添加到窗口)

*   **触发时机：** View 被添加到 Activity 的 Window 树中。
*   **源码逻辑：**
    ```java
    protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        // 如果之前 detached 导致线程退出了，这里会尝试重新 attach
        if (mDetached && (mRenderer != null)) {
            int renderMode = RENDERMODE_CONTINUOUSLY;
            if (mGLThread != null) {
                renderMode = mGLThread.getRenderMode();
            }
            // 创建一个新的 GLThread！旧的线程在 detach 时已经销毁了。
            mGLThread = new GLThread(mWeakThis); 
            if (renderMode != RENDERMODE_CONTINUOUSLY) {
                mGLThread.setRenderMode(renderMode);
            }
            mGLThread.start(); // 启动渲染线程
        }
        mDetached = false;
    }
    ```
*   **核心细节：** `GLThread` 是不可重用的。一旦退出（Detached），必须 `new` 一个新的。

---

### 3. surfaceCreated (Surface 准备就绪)

这是 GL 环境建立的起点。

*   **触发时机：** `SurfaceHolder.Callback.surfaceCreated` 被系统调用。
*   **主线程 (UI) 行为：**
    ```java
    public void surfaceCreated(SurfaceHolder holder) {
        mGLThread.surfaceCreated(); 
    }
    ```
*   **GLThread (渲染线程) 行为：**
    `mGLThread.surfaceCreated()` 只是设置了一个标志位并唤醒线程，真正的逻辑在 `guardedRun()` 循环中：
    1.  **加锁：** `synchronized(sGLThreadManager)`
    2.  **设置状态：** `mHasSurface = true;`
    3.  **唤醒：** `sGLThreadManager.notifyAll();`
    4.  **循环执行：** 线程循环检测到 `mHasSurface` 且 `mHaveEglContext` 为 false 时，调用 `mEglHelper.createSurface()` 和 `createContext()`。
    5.  **回调 Renderer：** 执行 `renderer.onSurfaceCreated()`。

---

### 4. surfaceChanged (尺寸变更)

*   **触发时机：** 屏幕旋转、分屏或初始化布局完成。
*   **主线程行为：**
    ```java
    public void surfaceChanged(SurfaceHolder holder, int format, int w, int h) {
        mGLThread.onWindowResize(w, h);
    }
    ```
*   **GLThread 行为：**
    1.  **设置状态：** `mWidth = w; mHeight = h; mSizeChanged = true;`
    2.  **唤醒：** `sGLThreadManager.notifyAll();`
    3.  **循环执行：** `guardedRun()` 循环检测到 `mSizeChanged` 为 true。
    4.  **执行 GL 指令：** 调用 `glViewport(0, 0, w, h)`。
    5.  **回调 Renderer：** 执行 `renderer.onSurfaceChanged()`。

---

### 5. onDrawFrame (渲染循环)

这是源码中最核心的死循环：`GLThread.run()` -> `guardedRun()`。

*   **源码逻辑 (简化版)：**
    ```java
    private void guardedRun() throws InterruptedException {
        while (true) {
            synchronized (sGLThreadManager) {
                while (true) {
                    // 1. 处理 queueEvent 进来的 Runnable
                    if (!mEventQueue.isEmpty()) {
                        event = mEventQueue.remove(0);
                        break; // 跳出内层锁去执行 event
                    }
                    
                    // 2. 检查暂停、Surface丢失等状态
                    if (mPaused || !mHasSurface) {
                        sGLThreadManager.wait(); // 阻塞等待
                        continue;
                    }
                    
                    // 3. 如果 Surface 刚创建或重建
                    if (!mHaveEglContext) {
                        mEglHelper.start(); // 创建 EGLContext
                        view.mRenderer.onSurfaceCreated(...);
                    }
                    
                    // 4. 如果大小改变
                    if (mSizeChanged) {
                        view.mRenderer.onSurfaceChanged(...);
                        mSizeChanged = false;
                    }
                    
                    // 准备好绘制了！
                    break; 
                }
            } // 释放锁
            
            // 执行 Runnable (queueEvent)
            if (event != null) {
                event.run();
                event = null;
                continue;
            }
            
            // 核心绘制
            view.mRenderer.onDrawFrame(...);
            
            // 交换缓冲区 (显示到屏幕)
            int swapError = mEglHelper.swap();
        }
    }
    ```
*   **核心细节：** **Monitor 锁 (sGLThreadManager)** 保护了所有状态。在执行 `onDrawFrame` 时，**锁是释放的**，这允许主线程在渲染时进行 `onPause` 等操作（虽然 `onPause` 会在下一次循环时生效）。

---

### 6. surfaceDestroyed (Surface 销毁)

*   **触发时机：** 按 Home 键回到后台、切换 Activity。
*   **主线程行为：**
    ```java
    public void surfaceDestroyed(SurfaceHolder holder) {
        mGLThread.surfaceDestroyed();
    }
    ```
*   **GLThread 行为：**
    1.  **设置状态：** `synchronized` 块中设置 `mHasSurface = false;`
    2.  **唤醒：** `sGLThreadManager.notifyAll();`
    3.  **循环响应：** `guardedRun` 发现 `!mHasSurface`。
    4.  **销毁 EGL Surface：** 调用 `stopEglSurfaceLocked()` -> `eglDestroySurface()`。
    5.  **保留 Context：** 默认情况下，**不会**销毁 EGLContext（除非调用了 `setPreserveEGLContextOnPause(false)`）。这意味着纹理 ID 依然保留。
    6.  **阻塞等待：** 线程进入 `wait()` 状态，不再消耗 CPU，直到 `surfaceCreated` 再次被调用。

---

### 7. onDetachedFromWindow (View 移除/销毁)

这是最严格的清理步骤，也是你之前遇到 Crash 的关键点。

*   **触发时机：** `Activity.onDestroy()` 或 `ViewGroup.removeView()`。
*   **源码逻辑：**
    ```java
    protected void onDetachedFromWindow() {
        if (mGLThread != null) {
            // 请求退出，并阻塞等待！
            mGLThread.requestExitAndWait();
        }
        mDetached = true;
        super.onDetachedFromWindow();
    }
    ```
*   **GLThread.requestExitAndWait() 实现：**
    ```java
    public void requestExitAndWait() {
        synchronized(sGLThreadManager) {
            mShouldExit = true; // 设置退出标志
            sGLThreadManager.notifyAll(); // 唤醒 GL 线程
            while (!mExited) { // 循环等待
                try {
                    sGLThreadManager.wait(); // 主线程在此死等！
                } catch (InterruptedException ex) { ... }
            }
        }
    }
    ```
*   **核心细节 (非常重要)：**
    `GLSurfaceView` 在销毁时，**主线程会挂起 (Wait)**，直到渲染线程跑完最后一次循环，执行完清理工作（`eglDestroyContext`），并将 `mExited` 设为 true 后，主线程才会继续执行。
    **这正是为什么 GLSurfaceView 不容易崩的原因：它强制实现了线程同步退出。** 如果你自己写 EGL 环境，往往忘记了这一步 `wait`，导致主线程把 Surface 销毁了，渲染线程还在 `swapBuffers`，从而引发 Crash。

---

### 8. onPause / onResume (生命周期管理)

*   **实现：**
    *   `onPause()` 设置 `mRequestPaused = true`，并 `notifyAll`。GL 线程检测到该标志后，释放 EGLSurface 并进入 wait。
    *   `onResume()` 设置 `mRequestPaused = false`，并 `notifyAll`。GL 线程醒来，重建 EGLSurface，继续渲染。

---

### 总结：对自定义 GLBaseMapView 的启示

通过分析源码，如果你要写 `GLBaseMapView`，必须模仿 `GLSurfaceView` 的以下行为：

1.  **使用一把大锁 (Monitor Lock)：** 所有的状态变量（Surface 是否存在、宽高、是否暂停、是否退出）的读写，必须在同一个对象锁（`synchronized`）的保护下。
2.  **退出同步 (Exit Sync)：** 在 `onDetachedFromWindow` 中，**必须阻塞等待** 渲染线程彻底结束。不要仅仅发一个 boolean 标志就走了。
3.  **Surface 状态分离：** 区分 `EGLContext` (资源) 和 `EGLSurface` (窗口)。Activity 暂停时销毁 Surface 但保留 Context（避免重载纹理）；Activity 销毁时才销毁 Context。