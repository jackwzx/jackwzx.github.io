---
title: Jni NewGlobalRef
date: 2025-12-17 11:36:01
published: true
tags:
---

这是一个非常核心的 JNI 知识点。要理解为什么你的代码会崩，以及 `NewGlobalRef` 到底做了什么，我们需要深入到底层机制。

我们把 JNI 的引用想象成 **“指针”** 或 **“句柄”**，它们指向 Java 堆内存中的真实对象。

### 1. 局部引用 (Local Reference) —— "临时通行证"

`jenv->FindClass`、`jenv->NewObject`、`jenv->GetObjectClass` 这些函数返回的**全部**都是局部引用。

*   **生命周期**：**极短**。它只在 **当前 Native 方法执行期间** 有效。一旦 C++ 函数执行完毕返回给 Java，JVM 会自动释放所有在该函数内创建的局部引用。
*   **线程作用域**：**线程私有**。线程 A 创建的局部引用，**线程 B 绝对不能访问**。这就像线程 A 的栈内存，线程 B 无法读取。
*   **底层实现**：在 ART 虚拟机中，每个线程维护一个 **"Local Reference Table"（局部引用表）**。当你调用 `FindClass` 时，JVM 在表里加一条记录指向那个 Java 对象，然后给你一个索引（句柄）。

**你的 Bug 场景中的 `FindClass`：**
```cpp
// baseclass 是 static 全局变量
baseclass = jenv->FindClass(...); 
```
你把一个 **“仅限当前线程、仅限当前函数调用有效”** 的临时句柄，赋值给了一个 **“生命周期伴随整个 App”** 的静态变量。
当另一个线程（或者同一个线程在函数返回后）再次使用这个 `baseclass` 时，那个临时句柄早就失效了，或者属于别人的私有领地，访问它就会导致 `accessed stale Local`（访问了腐烂/过期的局部引用）。

---

### 2. 全局引用 (Global Reference) —— "永久居住证"

`baseclass = (jclass) jenv->NewGlobalRef(local_cls);`

这句话是 JNI 中最重要的“升级”操作。

*   **生命周期**：**永久**。直到你显式调用 `DeleteGlobalRef` 之前，它永远有效。
*   **线程作用域**：**全线程共享**。线程 A 创建的全局引用，线程 B、C、D 都可以安全使用。
*   **底层实现**：JVM 维护了一个 **"Global Reference Table"**。
    1.  `NewGlobalRef` 拿着你传入的局部引用，找到对应的 Java 真实对象。
    2.  它在 **全局引用表** 中创建一条新记录，指向那个对象。
    3.  **关键点**：只要这个记录存在，JVM 的 **垃圾回收器 (GC)** 就会认为这个对象正在被 C++ 层使用，**绝对不会回收它**（即使 Java 层已经没有任何变量指向它了）。
    4.  它返回这个全局引用表中的索引（句柄）给你。

---

### 3. `NewGlobalRef` 具体做了什么？（图解流程）

让我们看看这句话执行时，内存里发生了什么：

`baseclass = (jclass) jenv->NewGlobalRef(local_cls);`

**步骤 1：输入**
*   你传入了 `local_cls`。这是一个局部引用，假设它的值是 `0x21`（这是 ART 内部的一个 handle）。
*   JVM 查**局部引用表**：`0x21` 对应 Java 堆内存地址 `0xFF00` (即 `SwigApolloCallback` 类对象)。

**步骤 2：升级**
*   JVM 锁定 **全局引用表**（防止多线程冲突）。
*   JVM 在 **全局引用表** 中分配一个新槽位。
*   JVM 把 Java 堆内存地址 `0xFF00` 填入这个新槽位。
*   JVM 生成一个新的 Handle（比如 `0x8000`）指向这个槽位。

**步骤 3：GC 标记 (Root Set)**
*   JVM 告诉垃圾回收器：“嘿，`0xFF00` 这个对象被 Native 层的一个全局引用锁定了，以后 GC 扫描的时候，把它当作 **GC Root**，千万别回收它！”

**步骤 4：返回**
*   函数返回 `0x8000`。
*   你把 `0x8000` 赋值给了 C++ 的静态变量 `baseclass`。

**结果：**
以后无论哪个线程，拿着 `baseclass` (即 `0x8000`) 去调用 JNI 函数，JVM 都会去查 **全局引用表**，发现它是合法的，并且能找到正确的 Java 对象。

---

### 4. 回到你的崩溃：竞态条件详解

为什么说你的旧代码会崩？我们用刚才的知识复盘一下：

**代码片段：**
```cpp
static jclass baseclass = 0; // 静态变量
// ...
if (!baseclass) {
    // 线程 A 执行到这里
    baseclass = jenv->FindClass(...); // 返回局部引用 0x21
    // ---> 线程 A 在这里被 CPU 挂起了！还没有执行 NewGlobalRef
}
```

**此时的状态：**
*   `baseclass` 的值是 `0x21`。
*   `0x21` 是线程 A 的局部引用表里的 ID。

**线程 B 进场：**
```cpp
if (!baseclass) { ... } 
// 线程 B 发现 baseclass 是 0x21 (非 0)，跳过初始化块。

// 线程 B 执行：
jenv->IsSameObject(baseclass, ...);
```
*   线程 B 把 `0x21` 传给 JVM。
*   JVM 检查：当前是线程 B。
*   JVM 查 **线程 B 的局部引用表**：查找 `0x21`。
*   **结果**：线程 B 的表里可能根本没有 `0x21`，或者 `0x21` 指向了线程 B 的某个完全不相关的对象。
*   **报错**：JVM 发现你在乱用引用，直接抛出 `JNI ERROR: accessed stale Local` 并终止程序。

### 总结

*   **FindClass** = “给我当前线程当前函数的一个临时访问权”。
*   **NewGlobalRef** = “给我一个全线程通用、永不过期的访问权，并告诉 GC 别动这个对象”。
*   **修复方案的核心**：坚决不能把 `FindClass` 的结果（局部引用）直接赋值给静态变量，中间必须用局部变量过渡，直到拿到 GlobalRef 才能赋值给静态变量。
