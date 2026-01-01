---
title: 这是一个非常经典的 JNI 性能优化问题。
date: 2025-12-16 13:27:31
published: true
tags:
---

这是一个非常经典的 JNI 性能优化问题。

**直接结论：**
**调用一次自定义 Java 函数（Scenario A）的性能绝对优于调用多次 Java API（Scenario B），即使 Scenario B 已经缓存了 `jclass` 和 `jmethodID`。**

在渲染循环（Draw Text）这种高频调用场景下，差距会非常明显。你应该**毫不犹豫地选择方案 A**（封装一个 Java 方法，C++ 调一次）。

---

### 详细性能分析

为了理解为什么“缓存了 ID”依然慢，我们需要剖析 JNI 调用的成本构成。

#### 1. JNI 调用的固有开销（Overhead）

JNI 不是简单的函数指针调用，它是一座连接 C++ 运行时和 Java 虚拟机（JVM）运行时的桥梁。每次跨越这座桥梁（CallVoidMethod 等），都会发生以下不可消除的开销：

*   **上下文切换（Context Switch）：** 必须保存 C++ 的寄存器状态，设置 JVM 的执行环境栈帧。
*   **安全点检查（Safepoint Checks）：** JVM 需要管理垃圾回收（GC）。当线程处于 Native 状态时，GC 无法停止它；但当它试图调用 Java 方法返回 JVM 时，必须检查是否有 GC 请求。如果有，线程会被挂起。调用越频繁，遇到锁或挂起的概率越大。
*   **参数与引用管理（Marshalling & References）：** 就算传递的是 `int` 或 `float`，JNI 环境也需要处理参数入栈。如果是对象，还需要处理 `LocalReference` 表的创建和销毁。
*   **异常检查（Exception Check）：** 规范的 JNI 调用在每次 Call 之后都应该检查 `ExceptionOccurred`。虽然你可以偷懒不查，但这会埋下隐患。

#### 2. 方案对比：绘制一个文字

假设绘制文字需要以下步骤：
1.  设置颜色 (`Paint.setColor`)
2.  设置字号 (`Paint.setTextSize`)
3.  设置抗锯齿 (`Paint.setAntiAlias`)
4.  执行绘制 (`Canvas.drawText`)

---

**方案 A：调用一次自定义 Java 函数（推荐）**

*   **流程**：C++ -> `JNI_Call` -> Java `MyRender.drawText(text, x, y, color, size)` -> (Java 内部执行 set, set, draw) -> Return C++。
*   **JNI 边界跨越次数**：**1 次**。
*   **性能特征**：
    *   只有一次 JNI 调用开销。
    *   Java 内部的方法调用（`paint.setColor` 等）是非常快的，JVM 的 JIT（即时编译器）可以将这些代码内联（Inline）优化成极高效的机器码。
    *   **String 转换成本**：仅需创建一次 `jstring`。

**方案 B：C++ 侧多次调用（缓存了 ID）**

*   **流程**：
    1.  C++ -> `CallVoidMethod(setColor)` -> Java -> Return C++
    2.  C++ -> `CallVoidMethod(setTextSize)` -> Java -> Return C++
    3.  C++ -> `CallVoidMethod(setAntiAlias)` -> Java -> Return C++
    4.  C++ -> `CallVoidMethod(drawText)` -> Java -> Return C++
*   **JNI 边界跨越次数**：**4 次**（甚至更多）。
*   **性能特征**：
    *   **缓存 ID 的作用**：缓存 `jmethodID` 只是省去了 `GetMethodID` 的查找过程（这是一个字符串哈希查找过程，非常慢）。缓存后，这部分时间省了。
    *   **无法消除的开销**：依然存在 4 次上下文切换、4 次引用表操作、4 次潜在的 GC 暂停点。
    *   **阻碍 JIT 优化**：因为中间隔着 C++ 层，JVM 无法将这 4 个操作内联在一起进行全局优化。

---

### 量化估算（仅供参考）

虽然具体数值取决于 CPU 和 Android 版本，但大致的量级如下：

*   **Java 内部调用函数**：~ 1 - 5 纳秒 (ns)
*   **JNI 空函数调用 (Cached ID)**：~ 10 - 50 纳秒 (ns)
*   **JNI 查找 ID (GetMethodID)**：~ 100 - 500 纳秒 (ns)

**计算绘制一次文字的“额外”开销：**

*   **方案 A**：1 次 JNI 调用 = **~20ns**。
*   **方案 B**：4 次 JNI 调用 = **~80ns**。

看起来 60ns 很少？但在渲染循环中：
如果你一帧要绘制 100 个文字标签：
*   方案 A 额外耗时：2ms (微秒)
*   方案 B 额外耗时：8ms (微秒)

如果场景更复杂，参数更多，方案 B 的代码量会爆炸，且性能会线性下降。

### 进阶优化建议

既然选择了**方案 A**，还有几个点可以进一步提升性能：

1.  **关键参数使用基本类型数组（Primitive Arrays）：**
    如果你的绘制参数特别多（比如同时传颜色、坐标、透明度、旋转角度等），不要一个个传参，也不要传 Java 对象。
    可以定义一个 `drawTextBatch(String text, float[] params)`。
    在 C++ 层使用 `SetFloatArrayRegion` 批量拷贝数据，这比多次传递单个参数通常更高效。

2.  **String 的处理（痛点）：**
    绘制文字最大的性能瓶颈通常不是方法调用，而是 `char*` 转 `jstring` (`NewStringUTF`)。
    *   **避免在 Draw 循环中创建 String**：如果文字内容不变，尽早在 C++ 层创建好全局引用的 `jstring` 缓存起来。
    *   **仅在文字变化时重新创建**。

3.  **Critical Access (慎用)：**
    对于数组操作，可以使用 `GetPrimitiveArrayCritical`，这会暂停 GC，速度极快，但必须在该块内只做内存拷贝，不能调用其他 JNI 函数。

### 总结

对于 **Canvas / OpenGL 渲染** 这种每秒 60 帧、每帧调用上百次的高频场景：

**请务必在 Java 层封装一个 Helper 方法（如 `RenderProxy.drawText(...)`），接收所有必要参数，在 Java 内部完成所有 `Paint` 设置和 `Canvas` 绘制，C++ 只调用这一个接口。**

不要试图在 C++ 层像写 Java 代码一样一行行去 Set 属性，那是性能杀手。
