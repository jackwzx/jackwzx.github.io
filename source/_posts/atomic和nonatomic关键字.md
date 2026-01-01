---
title: Objective-C 属性（`@property`）中的 `atomic` 和 `nonatomic` 关键字。
date: 2025-12-15 12:00:34
published: true
tags:
---

这两个宏定义的区别完全对应 Objective-C 属性（`@property`）中的 `atomic` 和 `nonatomic` 关键字。

### 1. 核心区别表格

| 宏定义 | 对应属性写法 | 线程安全性 | 性能 | 适用场景 |
| :--- | :--- | :--- | :--- | :--- |
| **`OBJC_ASSOCIATION_RETAIN_NONATOMIC`** | `@property (nonatomic, strong)` | **不安全** | 快 | 单线程操作，或明确已在外部加锁 |
| **`OBJC_ASSOCIATION_RETAIN`** | `@property (atomic, strong)` | **安全** (读写原子性) | 稍慢 (有锁开销) | 多线程并发读写同一个关联对象 |

---

### 2. 结合你的代码场景分析

在你的代码中：
```objectivec
// 设置关联对象
objc_setAssociatedObject(cmdBuffer, kMockErrorKey, error, OBJC_ASSOCIATION_RETAIN_NONATOMIC);

// 读取关联对象 (在 custom_get_error 中)
NSError *mockError = objc_getAssociatedObject(self, kMockErrorKey);
```

#### 如果使用 `NONATOMIC` (当前代码)
运行时在底层处理 `set` 和 `get` 时**不加锁**。

**崩溃场景模拟（竞态条件）：**
假设有两个线程同时操作同一个 `cmdBuffer` 对象：
*   **线程 A (渲染线程)**: 触发了回调，检测到新的错误，正在执行 `objc_setAssociatedObject` 更新错误对象（把 `OldError` 换成 `NewError`）。
*   **线程 B (业务线程)**: 正在调用 `[cmdBuffer error]` 读取错误。

**底层发生的步骤（简化版）：**

1.  **线程 A** 开始写入：它需要释放旧值 (`OldError`) 并保留新值。
    *   A 执行：`[OldError release]` -> `OldError` 的引用计数变为 0，内存被回收（变成了野指针/Zombie）。
2.  **线程 B** 此时刚好介入：
    *   B 执行：`objc_getAssociatedObject`。
    *   因为没有锁，B 可能刚好读到了 `OldError` 的内存地址（此时 A 还没来得及把指针指向 `NewError`，或者 A 刚 Release 完但还没把指针置空）。
3.  **崩溃发生**：
    *   B 拿到 `OldError` 的地址，试图对它发送消息（比如 `retain` 或者 `autorelease` 以便返回）。
    *   **结果**：`EXC_BAD_ACCESS`。因为 `OldError` 已经被线程 A 销毁了。

#### 如果使用 `OBJC_ASSOCIATION_RETAIN` (推荐修改)
运行时在底层处理关联对象时，会使用一把**自旋锁 (Spinlock)** 或 **互斥锁** 来保护内部的 Hash Map 操作。

**安全场景模拟：**

1.  **线程 A** 开始写入：
    *   **Runtime 内部加锁**。
    *   A 执行：`release OldError`，`retain NewError`，更新指针。
    *   **Runtime 内部解锁**。
2.  **线程 B** 尝试读取：
    *   **Runtime 尝试加锁** -> 发现被 A 锁住了 -> **等待**。
    *   等到 A 解锁后，B 获得锁。
    *   B 读取到的是完整的 `NewError`（或者如果 B 先拿到锁，读取到的就是完整的 `OldError`）。
    *   **不会崩溃**。

### 3. 代码中的具体建议

在你的 `HookMethod.cpp` 中，`cmdBuffer` 是由 Metal 创建的，回调在 GPU 驱动的后台线程触发。而 `cmdBuffer.error` 的读取可能发生在主线程（UI展示）或者其他业务逻辑线程。

**这是一个典型的多线程读写场景。**

虽然 `cmdBuffer` 完成后通常 error 不会再变，但为了防止极端情况（例如你手动 Mock Error 导致的状态变化，或者 Metal 驱动层面的某些重置），**必须使用 Atomic**。

**修改代码：**

```objectivec
// 1. 存储 Mock Error 时
objc_setAssociatedObject(cmdBuffer, 
                         kMockErrorKey, 
                         error, 
                         OBJC_ASSOCIATION_RETAIN); // 改为 RETAIN，即 Atomic

// 2. 存储 IMP 时 (虽然有 synchronized，但为了防止多线程读取 IMP 时的野指针风险，也建议改)
objc_setAssociatedObject(cmdBufferClass, 
                         kOriginalGetErrorIMPKey, 
                         impValue, 
                         OBJC_ASSOCIATION_RETAIN); // 改为 RETAIN
```

### 总结
*   **NONATOMIC**: 就像两个人同时进试衣间，没有门锁。A 正在换衣服（修改内存），B 冲进来看到 A 没穿衣服（内存状态不一致/野指针），尴尬且容易出事（崩溃）。
*   **RETAIN (ATOMIC)**: 试衣间有锁。A 进去锁门换衣服。B 想进进不去，只能在门口等 A 换完出来，B 再进去。保证每个人看到的都是穿戴整齐的。
