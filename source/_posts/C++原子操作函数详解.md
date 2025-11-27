---
title: C++原子操作函数详解：多线程编程的利器
date: 2025-06-25 10:00:00
tags: 
  - C++
  - 多线程
  - 原子操作
  - 并发编程
categories: 
  - C++编程
---

在多线程编程中，数据竞争和同步问题一直是开发者面临的挑战。C++11引入的原子操作（atomic operations）为解决这些问题提供了强有力的工具。本文将详细介绍几个重要的原子操作函数：`atomic_store`、`atomic_compare_exchange_strong_explicit`、`atomic_load_explicit` 和 `atomic_fetch_sub_explicit`，帮助你在多线程编程中正确使用这些函数。

<!--more-->

## 什么是原子操作

原子操作是不可分割的操作，要么完全执行，要么完全不执行，不会被其他线程中断。在多线程环境中，原子操作保证了数据的一致性，避免了竞态条件。

## 内存序（Memory Order）：为什么需要它

### 背景：CPU和编译器的优化带来的问题

在现代计算机系统中，为了提高性能，CPU和编译器会进行各种优化，这些优化可能会改变程序的执行顺序：

#### 1. 编译器重排序

```cpp
// 原始代码
int a = 1;
int b = 2;
int c = a + b;

// 编译器可能重排序为：
int b = 2;
int a = 1;
int c = a + b;  // 因为a和b的赋值顺序不影响结果
```

#### 2. CPU乱序执行

现代CPU为了提高吞吐量，会：
- **乱序执行**：CPU可能不按程序顺序执行指令
- **写缓冲**：写操作可能先进入缓冲区，稍后才写入内存
- **缓存一致性延迟**：多核CPU的缓存同步不是瞬时的

#### 3. 多线程环境下的问题

```cpp
// 线程1
data = 42;        // 写入数据
ready = true;     // 设置标志

// 线程2
if (ready) {      // 检查标志
    use(data);    // 使用数据
}
```

由于重排序，可能发生：
```cpp
// 实际执行顺序可能是：
// 线程1: ready = true; data = 42;  (重排序!)
// 线程2: if (ready) { use(data); } // data可能还是旧值!
```

### 什么是内存序

**内存序（Memory Ordering）**是一套规则，用来控制多线程程序中内存操作的可见性顺序。它告诉编译器和CPU：

1. **哪些重排序是允许的**
2. **哪些重排序是禁止的**
3. **何时需要确保内存操作的可见性**

### 内存模型的发展历史

```cpp
// C++98/03时代：没有标准的多线程支持
pthread_mutex_t mutex;
int shared_data;

void thread_function() {
    pthread_mutex_lock(&mutex);
    shared_data++;  // 依赖平台特定的内存语义
    pthread_mutex_unlock(&mutex);
}

// C++11引入内存模型
std::atomic<int> shared_data{0};

void thread_function() {
    shared_data.fetch_add(1, std::memory_order_seq_cst);  // 明确的内存语义
}
```

### C++11内存序的六种类型

```cpp
enum memory_order {
    memory_order_relaxed,    // 宽松序：只保证原子性，允许重排序
    memory_order_consume,    // 消费序：较少使用，类似acquire但更弱
    memory_order_acquire,    // 获取序：读操作的同步点，防止后续操作重排到前面
    memory_order_release,    // 释放序：写操作的同步点，防止前面操作重排到后面
    memory_order_acq_rel,    // 获取-释放序：同时具有acquire和release语义
    memory_order_seq_cst     // 顺序一致性：最强的内存序，全局统一顺序
};
```

### 为什么需要不同强度的内存序

#### 1. 性能考虑

```cpp
#include <atomic>
#include <chrono>
#include <thread>
#include <vector>

std::atomic<long long> counter{0};

// 测试不同内存序的性能
void benchmark_memory_orders() {
    const int iterations = 1000000;
    const int num_threads = 4;
    
    // relaxed内存序 - 最快
    auto start = std::chrono::high_resolution_clock::now();
    std::vector<std::thread> threads;
    
    for (int i = 0; i < num_threads; ++i) {
        threads.emplace_back([&]() {
            for (int j = 0; j < iterations; ++j) {
                counter.fetch_add(1, std::memory_order_relaxed);
            }
        });
    }
    
    for (auto& t : threads) t.join();
    
    auto end = std::chrono::high_resolution_clock::now();
    auto relaxed_time = std::chrono::duration_cast<std::chrono::microseconds>(end - start);
    
    counter.store(0);
    threads.clear();
    
    // seq_cst内存序 - 较慢但提供更强保证
    start = std::chrono::high_resolution_clock::now();
    
    for (int i = 0; i < num_threads; ++i) {
        threads.emplace_back([&]() {
            for (int j = 0; j < iterations; ++j) {
                counter.fetch_add(1, std::memory_order_seq_cst);
            }
        });
    }
    
    for (auto& t : threads) t.join();
    
    end = std::chrono::high_resolution_clock::now();
    auto seq_cst_time = std::chrono::duration_cast<std::chrono::microseconds>(end - start);
    
    std::cout << "Relaxed: " << relaxed_time.count() << " μs" << std::endl;
    std::cout << "Seq_cst: " << seq_cst_time.count() << " μs" << std::endl;
    std::cout << "性能差异: " << (double)seq_cst_time.count() / relaxed_time.count() << "x" << std::endl;
}
```

#### 2. 不同场景需要不同强度的同步

```cpp
#include <atomic>
#include <thread>
#include <iostream>

// 场景1：简单计数器，只需要原子性
std::atomic<int> hit_counter{0};

void increment_counter() {
    // 只需要保证原子性，允许重排序
    hit_counter.fetch_add(1, std::memory_order_relaxed);
}

// 场景2：生产者-消费者，需要同步
std::atomic<bool> data_ready{false};
std::atomic<int> data{0};

void producer() {
    data.store(42, std::memory_order_relaxed);    // 1. 写入数据
    data_ready.store(true, std::memory_order_release);  // 2. 发布信号（不能重排到1之前）
}

void consumer() {
    // 获取信号（后续读取不能重排到这之前）
    while (!data_ready.load(std::memory_order_acquire)) {
        std::this_thread::yield();
    }
    // 现在可以安全读取data
    int value = data.load(std::memory_order_relaxed);
    std::cout << "读取到: " << value << std::endl;
}

// 场景3：全局状态需要强一致性
std::atomic<int> global_state{0};

void critical_state_change() {
    // 需要全局统一的观察顺序
    global_state.store(1, std::memory_order_seq_cst);
}
```

### 内存序的实际硬件映射

```cpp
// 在x86-64架构上的大致映射
class X86MemoryOrdering {
public:
    // relaxed: 普通的mov指令
    void relaxed_store(std::atomic<int>& var, int value) {
        // mov %eax, (%rdi)  - 普通存储
        var.store(value, std::memory_order_relaxed);
    }
    
    // release: 可能需要sfence指令
    void release_store(std::atomic<int>& var, int value) {
        // sfence; mov %eax, (%rdi)  - 存储屏障
        var.store(value, std::memory_order_release);
    }
    
    // seq_cst: 需要mfence指令
    void seq_cst_store(std::atomic<int>& var, int value) {
        // mfence; mov %eax, (%rdi); mfence  - 完全内存屏障
        var.store(value, std::memory_order_seq_cst);
    }
};

// 在ARM架构上的映射
class ARMMemoryOrdering {
public:
    // relaxed: 普通的str指令
    void relaxed_store(std::atomic<int>& var, int value) {
        // str w1, [x0]  - 普通存储
        var.store(value, std::memory_order_relaxed);
    }
    
    // release: 需要dmb ish指令
    void release_store(std::atomic<int>& var, int value) {
        // dmb ish; str w1, [x0]  - 数据内存屏障
        var.store(value, std::memory_order_release);
    }
    
    // seq_cst: 需要更强的屏障
    void seq_cst_store(std::atomic<int>& var, int value) {
        // dmb ish; str w1, [x0]; dmb ish  - 完全屏障
        var.store(value, std::memory_order_seq_cst);
    }
};
```

### 没有内存序会发生什么

```cpp
// 错误示例：没有适当的内存序
#include <atomic>
#include <thread>
#include <iostream>

std::atomic<bool> flag{false};
int normal_variable = 0;

void writer() {
    normal_variable = 42;  // 普通写入
    flag.store(true, std::memory_order_relaxed);  // 原子写入，但使用relaxed
}

void reader() {
    // 可能的问题：由于relaxed语义，这两个操作可能被重排序
    while (!flag.load(std::memory_order_relaxed)) {
        std::this_thread::yield();
    }
    
    // 这里读取normal_variable可能得到旧值！
    // 因为relaxed不提供同步保证
    std::cout << normal_variable << std::endl;  // 可能输出0而不是42
}

// 正确示例：使用适当的内存序
void correct_writer() {
    normal_variable = 42;
    flag.store(true, std::memory_order_release);  // release确保前面的写入先完成
}

void correct_reader() {
    while (!flag.load(std::memory_order_acquire)) {  // acquire确保后续读取不会重排
        std::this_thread::yield();
    }
    std::cout << normal_variable << std::endl;  // 保证输出42
}
```

### 总结：为什么内存序至关重要

1. **现代硬件的现实**：CPU和编译器的优化使得简单的代码变得复杂
2. **性能与正确性的平衡**：不同强度的内存序提供了性能优化的机会
3. **可移植性**：统一的内存模型确保代码在不同架构上的行为一致
4. **可预测性**：明确的内存序语义让多线程程序的行为变得可预测

通过理解内存序，我们可以：
- 编写正确的多线程代码
- 在性能和正确性之间找到平衡
- 避免微妙的并发bug
- 充分利用现代硬件的性能

## 1. atomic_store 和 atomic_store_explicit

### 基本用法

`atomic_store` 用于原子地存储一个值到原子变量中。

```cpp
#include <atomic>
#include <thread>
#include <iostream>

std::atomic<int> counter{0};

void atomic_store_example() {
    // 简单的原子存储，使用默认内存序（seq_cst）
    std::atomic_store(&counter, 42);
    
    // 显式指定内存序的原子存储
    std::atomic_store_explicit(&counter, 100, std::memory_order_release);
}
```

### 内存序的影响

```cpp
#include <atomic>
#include <thread>
#include <vector>

std::atomic<bool> ready{false};
std::atomic<int> data{0};

// 生产者线程
void producer() {
    data.store(42, std::memory_order_relaxed);
    // 使用release语义，确保data的写入在ready之前完成
    ready.store(true, std::memory_order_release);
}

// 消费者线程
void consumer() {
    // 使用acquire语义，确保在读取data之前ready已经为true
    while (!ready.load(std::memory_order_acquire)) {
        std::this_thread::yield();
    }
    // 此时可以安全地读取data
    int value = data.load(std::memory_order_relaxed);
    std::cout << "读取到的值: " << value << std::endl;
}
```

## 2. atomic_load 和 atomic_load_explicit

### 基本用法

`atomic_load` 用于原子地读取原子变量的值。

```cpp
#include <atomic>
#include <thread>
#include <iostream>

std::atomic<int> shared_value{10};

void atomic_load_example() {
    // 简单的原子加载
    int value1 = std::atomic_load(&shared_value);
    
    // 显式指定内存序的原子加载
    int value2 = std::atomic_load_explicit(&shared_value, std::memory_order_acquire);
    
    std::cout << "Value1: " << value1 << ", Value2: " << value2 << std::endl;
}
```

### 实际应用：状态检查

```cpp
#include <atomic>
#include <thread>
#include <chrono>
#include <iostream>

class ThreadSafeCounter {
private:
    std::atomic<int> count_{0};
    std::atomic<bool> stop_flag_{false};

public:
    void increment() {
        while (!stop_flag_.load(std::memory_order_acquire)) {
            count_.fetch_add(1, std::memory_order_relaxed);
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
        }
    }
    
    void stop() {
        stop_flag_.store(true, std::memory_order_release);
    }
    
    int get_count() const {
        return count_.load(std::memory_order_relaxed);
    }
};
```

## 3. atomic_compare_exchange_strong_explicit 和 atomic_compare_exchange_weak_explicit

### 基本概念

这是一个比较并交换操作，它原子地比较变量的值与期望值，如果相等则交换为新值。C++提供了两个版本：

```cpp
// strong版本：原子地比较并交换，如果比较失败则不交换
bool atomic_compare_exchange_strong_explicit(
    atomic<T>* obj,
    T* expected,
    T desired,
    memory_order success,
    memory_order failure
);

// weak版本：原子地比较并交换，可能出现伪失败
bool atomic_compare_exchange_weak_explicit(
    atomic<T>* obj,
    T* expected,
    T desired,
    memory_order success,
    memory_order failure
);
```

### 函数行为详解

两个函数都执行相同的基本操作：
1. **原子地读取** `obj` 的当前值
2. **比较**当前值与 `*expected` 是否相等
3. 如果**相等**：将 `desired` 写入 `obj`，返回 `true`
4. 如果**不相等**：将当前值写入 `*expected`，返回 `false`

### strong vs weak 的关键区别

- **strong版本**：
  - 如果比较相等，**保证**交换操作成功
  - 只有在实际值与期望值不同时才返回 `false`
  - 适合单次尝试的场景

- **weak版本**：
  - 如果比较相等，交换**可能**失败（伪失败，spurious failure）
  - 即使实际值与期望值相同，也可能返回 `false`
  - 伪失败通常由硬件原因造成（如Load-Link/Store-Conditional指令被中断）
  - 适合循环重试的场景，在某些架构上性能更好

### strong版本的基本用法

```cpp
#include <atomic>
#include <thread>
#include <iostream>

std::atomic<int> value{10};

void compare_exchange_strong_example() {
    int expected = 10;
    int desired = 20;
    
    // 如果value等于expected(10)，则将其设置为desired(20)
    bool success = std::atomic_compare_exchange_strong_explicit(
        &value,
        &expected,  // 注意：这是指针！
        desired,
        std::memory_order_acq_rel,  // 成功时的内存序
        std::memory_order_acquire   // 失败时的内存序
    );
    
    if (success) {
        std::cout << "交换成功，新值: " << value.load() << std::endl;
    } else {
        std::cout << "交换失败，期望值: " << expected 
                  << ", 实际值: " << value.load() << std::endl;
    }
}
```

### weak版本的基本用法

```cpp
#include <atomic>
#include <thread>
#include <iostream>

std::atomic<int> counter{0};

void compare_exchange_weak_example() {
    int expected = 0;
    int desired = 1;
    
    // weak版本通常在循环中使用，因为可能出现伪失败
    while (!std::atomic_compare_exchange_weak_explicit(
        &counter,
        &expected,
        desired,
        std::memory_order_acq_rel,
        std::memory_order_acquire)) {
        
        // 失败的原因可能是：
        // 1. 实际值与期望值不同（真失败）- expected已被更新为实际值
        // 2. 值相等但发生伪失败（spurious failure）- expected保持不变
        
        // 可以根据实际值决定是否继续尝试
        if (expected >= desired) {
            break;  // 已经达到或超过目标值，退出
        }
        // 继续重试，expected现在包含最新的实际值
    }
    
    std::cout << "最终值: " << counter.load() << std::endl;
}
```

### 何时使用weak版本

weak版本主要用于循环中，因为它在某些硬件架构上性能更好：

```cpp
#include <atomic>
#include <thread>
#include <vector>

std::atomic<int> shared_counter{0};

// 使用weak版本实现原子增量
void atomic_increment_weak() {
    int current = shared_counter.load(std::memory_order_relaxed);
    
    // 使用weak版本在循环中重试
    while (!shared_counter.compare_exchange_weak(
        current,
        current + 1,
        std::memory_order_acq_rel,
        std::memory_order_relaxed)) {
        // 失败后current包含最新的实际值
        // 可能是真失败（值被其他线程改变）或伪失败
        // 无论哪种情况，都继续重试
    }
}

// 使用strong版本实现原子增量
void atomic_increment_strong() {
    int current = shared_counter.load(std::memory_order_relaxed);
    
    // strong版本也需要循环，但只有真失败时才重试
    while (!shared_counter.compare_exchange_strong(
        current,
        current + 1,
        std::memory_order_acq_rel,
        std::memory_order_relaxed)) {
        // 失败意味着值确实被其他线程改变了
        // current已经被更新为最新值，继续尝试
    }
}
```

### 详细行为分析：value与expected的比较结果

让我们用具体的例子来详细分析两个函数在不同情况下的行为：

```cpp
#include <atomic>
#include <iostream>

void detailed_behavior_analysis() {
    std::atomic<int> value{10};  // 原子变量初始值为10
    int expected;
    int desired = 20;
    bool result;
    
    std::cout << "=== 情况分析 ===" << std::endl;
    std::cout << "初始状态: value = " << value.load() << std::endl;
    
    // ========== 情况1：value == expected (10) ==========
    std::cout << "\n--- 情况1: value(10) == expected(10) ---" << std::endl;
    
    // 1.1 使用 strong 版本
    value.store(10);  // 重置为10
    expected = 10;
    result = value.compare_exchange_strong(expected, desired);
    
    std::cout << "strong版本结果:" << std::endl;
    std::cout << "  返回值: " << (result ? "true" : "false") << std::endl;
    std::cout << "  value变为: " << value.load() << std::endl;
    std::cout << "  expected变为: " << expected << std::endl;
    std::cout << "  结论: 比较相等，交换成功，保证返回true" << std::endl;
    
    // 1.2 使用 weak 版本
    value.store(10);  // 重置为10
    expected = 10;
    result = value.compare_exchange_weak(expected, desired);
    
    std::cout << "\nweak版本结果:" << std::endl;
    std::cout << "  返回值: " << (result ? "true" : "false") << std::endl;
    std::cout << "  value变为: " << value.load() << std::endl;
    std::cout << "  expected变为: " << expected << std::endl;
    
    if (result) {
        std::cout << "  结论: 比较相等，交换成功" << std::endl;
    } else {
        if (expected == 10) {
            std::cout << "  结论: 比较相等但发生伪失败，value未改变，expected未改变" << std::endl;
        }
    }
    
    // ========== 情况2：value != expected ==========
    std::cout << "\n--- 情况2: value(15) != expected(10) ---" << std::endl;
    
    // 2.1 使用 strong 版本
    value.store(15);  // 设置为与expected不同的值
    expected = 10;
    result = value.compare_exchange_strong(expected, desired);
    
    std::cout << "strong版本结果:" << std::endl;
    std::cout << "  返回值: " << (result ? "true" : "false") << std::endl;
    std::cout << "  value保持: " << value.load() << std::endl;
    std::cout << "  expected变为: " << expected << std::endl;
    std::cout << "  结论: 比较不相等，不交换，expected被更新为实际值" << std::endl;
    
    // 2.2 使用 weak 版本
    value.store(15);  // 设置为与expected不同的值
    expected = 10;
    result = value.compare_exchange_weak(expected, desired);
    
    std::cout << "\nweak版本结果:" << std::endl;
    std::cout << "  返回值: " << (result ? "true" : "false") << std::endl;
    std::cout << "  value保持: " << value.load() << std::endl;
    std::cout << "  expected变为: " << expected << std::endl;
    std::cout << "  结论: 比较不相等，不交换，expected被更新为实际值（与strong相同）" << std::endl;
}
```

### 完整的行为对比表

| 场景 | 函数版本 | value值 | expected值(调用前) | 返回值 | value值(调用后) | expected值(调用后) | 说明 |
|------|----------|---------|-------------------|--------|----------------|-------------------|------|
| **相等情况** | strong | 10 | 10 | **true** | **20** | 10 | 保证交换成功 |
| **相等情况** | weak | 10 | 10 | **true或false** | **20或10** | 10 | 可能成功或伪失败 |
| **不等情况** | strong | 15 | 10 | **false** | 15 | **15** | 不交换，更新expected |
| **不等情况** | weak | 15 | 10 | **false** | 15 | **15** | 不交换，更新expected |

### 伪失败的检测方法

```cpp
void detect_spurious_failure() {
    std::atomic<int> value{10};
    int expected = 10;
    int desired = 20;
    
    // 记录调用前的状态
    int value_before = value.load();
    int expected_before = expected;
    
    bool result = value.compare_exchange_weak(expected, desired);
    
    if (!result) {
        // 失败了，判断是真失败还是伪失败
        if (expected == expected_before) {
            std::cout << "发生伪失败！" << std::endl;
            std::cout << "  value调用前: " << value_before << std::endl;
            std::cout << "  expected调用前: " << expected_before << std::endl;
            std::cout << "  value调用后: " << value.load() << std::endl;
            std::cout << "  expected调用后: " << expected << std::endl;
            std::cout << "  结论: 值确实相等，但交换失败，expected未被修改" << std::endl;
        } else {
            std::cout << "真失败：值不匹配" << std::endl;
            std::cout << "  期望值: " << expected_before << std::endl;
            std::cout << "  实际值: " << expected << std::endl;
        }
    } else {
        std::cout << "交换成功" << std::endl;
    }
}
```

### 实际应用中的处理模式

```cpp
// 模式1：使用strong版本进行单次尝试
bool try_once_with_strong(std::atomic<int>& counter, int expected_val, int new_val) {
    int expected = expected_val;
    
    // strong版本：如果返回false，一定是真失败
    if (counter.compare_exchange_strong(expected, new_val)) {
        std::cout << "成功将 " << expected_val << " 改为 " << new_val << std::endl;
        return true;
    } else {
        std::cout << "失败：期望 " << expected_val << "，实际是 " << expected << std::endl;
        return false;
    }
}

// 模式2：使用weak版本进行循环重试
void retry_with_weak(std::atomic<int>& counter, int increment) {
    int current = counter.load();
    
    // weak版本：在循环中重试，不区分真失败和伪失败
    while (!counter.compare_exchange_weak(current, current + increment)) {
        // current已经被更新为最新值（如果是真失败）
        // 如果是伪失败，current保持不变，但会继续重试
        // 无论哪种情况，都继续循环
    }
    
    std::cout << "成功增加 " << increment << "，最终值: " << counter.load() << std::endl;
}
```

### 性能对比和选择建议

```cpp
#include <atomic>
#include <chrono>
#include <thread>
#include <vector>
#include <iostream>

class PerformanceTest {
private:
    std::atomic<long long> counter_{0};
    
public:
    // 使用weak版本的测试
    void test_weak(int iterations) {
        for (int i = 0; i < iterations; ++i) {
            long long current = counter_.load(std::memory_order_relaxed);
            while (!counter_.compare_exchange_weak(
                current,
                current + 1,
                std::memory_order_relaxed)) {
                // 重试
            }
        }
    }
    
    // 使用strong版本的测试
    void test_strong(int iterations) {
        for (int i = 0; i < iterations; ++i) {
            long long current = counter_.load(std::memory_order_relaxed);
            while (!counter_.compare_exchange_strong(
                current,
                current + 1,
                std::memory_order_relaxed)) {
                // 重试
            }
        }
    }
    
    void reset() {
        counter_.store(0, std::memory_order_relaxed);
    }
    
    long long get_value() const {
        return counter_.load(std::memory_order_relaxed);
    }
};

void performance_comparison() {
    PerformanceTest test;
    const int iterations = 100000;
    const int num_threads = 4;
    
    // 测试weak版本
    test.reset();
    auto start = std::chrono::high_resolution_clock::now();
    
    std::vector<std::thread> threads;
    for (int i = 0; i < num_threads; ++i) {
        threads.emplace_back([&test, iterations]() {
            test.test_weak(iterations);
        });
    }
    
    for (auto& t : threads) {
        t.join();
    }
    
    auto end = std::chrono::high_resolution_clock::now();
    auto weak_duration = std::chrono::duration_cast<std::chrono::microseconds>(end - start);
    
    std::cout << "Weak版本耗时: " << weak_duration.count() << " 微秒" << std::endl;
    std::cout << "Weak版本最终值: " << test.get_value() << std::endl;
    
    // 测试strong版本
    test.reset();
    threads.clear();
    start = std::chrono::high_resolution_clock::now();
    
    for (int i = 0; i < num_threads; ++i) {
        threads.emplace_back([&test, iterations]() {
            test.test_strong(iterations);
        });
    }
    
    for (auto& t : threads) {
        t.join();
    }
    
    end = std::chrono::high_resolution_clock::now();
    auto strong_duration = std::chrono::duration_cast<std::chrono::microseconds>(end - start);
    
    std::cout << "Strong版本耗时: " << strong_duration.count() << " 微秒" << std::endl;
    std::cout << "Strong版本最终值: " << test.get_value() << std::endl;
}
```

### 实际应用：无锁栈的两种实现

#### 使用strong版本的无锁栈

```cpp
#include <atomic>
#include <memory>

template<typename T>
class LockFreeStackStrong {
private:
    struct Node {
        T data;
        std::shared_ptr<Node> next;
        
        Node(T const& data_) : data(data_) {}
    };
    
    std::atomic<std::shared_ptr<Node>> head_;

public:
    void push(T const& data) {
        auto new_node = std::make_shared<Node>(data);
        new_node->next = head_.load();
        
        // 使用compare_exchange_strong确保原子性
        while (!head_.compare_exchange_strong(
            new_node->next,
            new_node,
            std::memory_order_release,
            std::memory_order_relaxed)) {
            // 如果失败，new_node->next已经被更新为head_的当前值
            // 循环重试
        }
    }
    
    std::shared_ptr<T> pop() {
        auto old_head = head_.load();
        
        while (old_head && !head_.compare_exchange_strong(
            old_head,
            old_head->next,
            std::memory_order_acquire,
            std::memory_order_relaxed)) {
            // 如果失败，old_head已经被更新为head_的当前值
        }
        
        return old_head ? std::make_shared<T>(old_head->data) : std::shared_ptr<T>();
    }
};
```

#### 使用weak版本的无锁栈（推荐）

```cpp
template<typename T>
class LockFreeStackWeak {
private:
    struct Node {
        T data;
        std::shared_ptr<Node> next;
        
        Node(T const& data_) : data(data_) {}
    };
    
    std::atomic<std::shared_ptr<Node>> head_;

public:
    void push(T const& data) {
        auto new_node = std::make_shared<Node>(data);
        new_node->next = head_.load();
        
        // 使用weak版本，在某些架构上性能更好
        while (!head_.compare_exchange_weak(
            new_node->next,
            new_node,
            std::memory_order_release,
            std::memory_order_relaxed)) {
            // weak版本可能出现伪失败，但在循环中这不是问题
            // new_node->next已经被更新为head_的当前值
        }
    }
    
    std::shared_ptr<T> pop() {
        auto old_head = head_.load();
        
        // 使用weak版本进行pop操作
        while (old_head && !head_.compare_exchange_weak(
            old_head,
            old_head->next,
            std::memory_order_acquire,
            std::memory_order_relaxed)) {
            // 伪失败时会自动重试
        }
        
        return old_head ? std::make_shared<T>(old_head->data) : std::shared_ptr<T>();
    }
};
```

### 选择strong还是weak的决策指南

```cpp
// 决策流程图的代码示例

class DecisionGuide {
public:
    // 场景1：单次尝试，失败后不重试
    bool try_once_operation() {
        std::atomic<int> value{10};
        int expected = 10;
        
        // 使用strong版本，因为我们只尝试一次
        return value.compare_exchange_strong(
            expected, 20,
            std::memory_order_acq_rel,
            std::memory_order_acquire);
    }
    
    // 场景2：循环重试直到成功
    void loop_until_success() {
        std::atomic<int> counter{0};
        int current = counter.load();
        
        // 使用weak版本，因为在循环中，性能更好
        while (!counter.compare_exchange_weak(
            current, current + 1,
            std::memory_order_relaxed)) {
            // 继续重试
        }
    }
    
    // 场景3：有复杂的失败处理逻辑
    bool complex_failure_handling() {
        std::atomic<int> state{0};
        int expected = 0;
        
        // 使用strong版本，因为我们需要明确知道是否真的失败
        if (!state.compare_exchange_strong(
            expected, 1,
            std::memory_order_acq_rel,
            std::memory_order_acquire)) {
            
            // 复杂的失败处理
            if (expected == 2) {
                // 特殊情况处理
                return handle_special_case();
            }
            return false;
        }
        return true;
    }
    
private:
    bool handle_special_case() { return false; }
};
```

### 硬件架构的影响

```cpp
// 不同架构上的性能差异示例
class ArchitectureComparison {
public:
    // 在支持LL/SC指令的架构上（如ARM），weak版本更高效
    void arm_optimized_increment(std::atomic<int>& counter) {
        int current = counter.load(std::memory_order_relaxed);
        
        // ARM上的LL/SC指令可能自然失败，weak版本直接映射
        while (!counter.compare_exchange_weak(
            current, current + 1,
            std::memory_order_relaxed)) {
            // 在ARM上，这个循环可能因为中断或其他线程的写入而重试
        }
    }
    
    // 在x86架构上，strong和weak的性能差异较小
    void x86_increment(std::atomic<int>& counter) {
        int current = counter.load(std::memory_order_relaxed);
        
        // x86上的CMPXCHG指令，strong和weak性能相近
        while (!counter.compare_exchange_strong(
            current, current + 1,
            std::memory_order_relaxed)) {
            // x86上很少出现伪失败
        }
    }
};
```

## 4. atomic_fetch_sub_explicit

### 基本用法

`atomic_fetch_sub_explicit` 原子地从变量中减去一个值，并返回操作前的值。

```cpp
#include <atomic>
#include <thread>
#include <vector>
#include <iostream>

std::atomic<int> counter{1000};

void fetch_sub_example() {
    // 原子地减去5，返回操作前的值
    int old_value = std::atomic_fetch_sub_explicit(
        &counter, 
        5, 
        std::memory_order_acq_rel
    );
    
    std::cout << "操作前的值: " << old_value << std::endl;
    std::cout << "操作后的值: " << counter.load() << std::endl;
}
```

### 实际应用：资源计数器

```cpp
#include <atomic>
#include <thread>
#include <vector>
#include <chrono>
#include <iostream>

class ResourcePool {
private:
    std::atomic<int> available_resources_{100};
    
public:
    bool acquire_resource() {
        int current = available_resources_.load(std::memory_order_relaxed);
        
        while (current > 0) {
            // 尝试原子地减少资源计数
            if (available_resources_.compare_exchange_strong(
                current,
                current - 1,
                std::memory_order_acq_rel,
                std::memory_order_relaxed)) {
                return true;  // 成功获取资源
            }
            // 如果失败，current已经被更新，继续循环
        }
        
        return false;  // 没有可用资源
    }
    
    void release_resource() {
        available_resources_.fetch_add(1, std::memory_order_acq_rel);
    }
    
    int get_available_count() const {
        return available_resources_.load(std::memory_order_relaxed);
    }
};

// 使用示例
void worker(ResourcePool& pool, int worker_id) {
    for (int i = 0; i < 10; ++i) {
        if (pool.acquire_resource()) {
            std::cout << "Worker " << worker_id << " 获取了资源" << std::endl;
            
            // 模拟工作
            std::this_thread::sleep_for(std::chrono::milliseconds(100));
            
            pool.release_resource();
            std::cout << "Worker " << worker_id << " 释放了资源" << std::endl;
        } else {
            std::cout << "Worker " << worker_id << " 无法获取资源" << std::endl;
        }
        
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
    }
}
```

## 综合应用：线程安全的引用计数

```cpp
#include <atomic>
#include <memory>
#include <iostream>

template<typename T>
class AtomicSharedPtr {
private:
    struct ControlBlock {
        T* ptr;
        std::atomic<int> ref_count;
        
        ControlBlock(T* p) : ptr(p), ref_count(1) {}
    };
    
    ControlBlock* control_block_;

public:
    explicit AtomicSharedPtr(T* ptr = nullptr) 
        : control_block_(ptr ? new ControlBlock(ptr) : nullptr) {}
    
    AtomicSharedPtr(const AtomicSharedPtr& other) : control_block_(other.control_block_) {
        if (control_block_) {
            // 原子地增加引用计数
            control_block_->ref_count.fetch_add(1, std::memory_order_relaxed);
        }
    }
    
    AtomicSharedPtr& operator=(const AtomicSharedPtr& other) {
        if (this != &other) {
            reset();
            control_block_ = other.control_block_;
            if (control_block_) {
                control_block_->ref_count.fetch_add(1, std::memory_order_relaxed);
            }
        }
        return *this;
    }
    
    ~AtomicSharedPtr() {
        reset();
    }
    
    void reset() {
        if (control_block_) {
            // 原子地减少引用计数
            int old_count = control_block_->ref_count.fetch_sub(1, std::memory_order_acq_rel);
            
            if (old_count == 1) {
                // 最后一个引用，安全删除
                delete control_block_->ptr;
                delete control_block_;
            }
            
            control_block_ = nullptr;
        }
    }
    
    T* get() const {
        return control_block_ ? control_block_->ptr : nullptr;
    }
    
    int use_count() const {
        return control_block_ ? control_block_->ref_count.load(std::memory_order_relaxed) : 0;
    }
};
```

## 性能考虑和最佳实践

### 1. 选择合适的内存序

```cpp
// 对于简单的计数器，relaxed通常足够
std::atomic<int> counter{0};
counter.fetch_add(1, std::memory_order_relaxed);

// 对于同步操作，使用acquire-release
std::atomic<bool> ready{false};
ready.store(true, std::memory_order_release);  // 生产者
while (!ready.load(std::memory_order_acquire)); // 消费者
```

### 2. 避免伪共享

```cpp
// 不好的做法：可能导致伪共享
struct BadCounters {
    std::atomic<int> counter1;
    std::atomic<int> counter2;
};

// 好的做法：使用对齐避免伪共享
struct alignas(64) GoodCounters {
    std::atomic<int> counter1;
    char padding[60];  // 填充到缓存行大小
    std::atomic<int> counter2;
};
```

### 3. 使用合适的原子类型

```cpp
// 对于标志位，使用atomic<bool>
std::atomic<bool> stop_flag{false};

// 对于计数器，使用atomic<int>或atomic<size_t>
std::atomic<size_t> request_count{0};

// 对于指针，使用atomic<T*>
std::atomic<Node*> head{nullptr};
```

## 总结

原子操作是多线程编程中的重要工具，正确使用这些函数可以帮助我们：

1. **避免数据竞争**：原子操作保证操作的不可分割性
2. **提供同步机制**：通过内存序控制操作的可见性顺序
3. **实现无锁数据结构**：提高程序的并发性能
4. **简化线程间通信**：减少对互斥锁的依赖

记住以下关键点：

- **选择合适的内存序**以平衡性能和正确性
- **理解每个操作的语义和返回值**，特别是compare_exchange的expected参数行为
- **在循环中优先使用weak版本**，单次操作使用strong版本
- **根据目标硬件架构选择**：ARM等LL/SC架构上weak版本性能更好
- **在设计无锁算法时要特别小心ABA问题**
- **考虑使用更高级的同步原语**（如`std::atomic<std::shared_ptr<T>>`）

### compare_exchange使用建议总结

| 场景 | 推荐版本 | 原因 |
|------|----------|------|
| 循环重试 | weak | 性能更好，伪失败无影响 |
| 单次尝试 | strong | 避免不必要的伪失败 |
| 复杂失败处理 | strong | 需要明确的失败原因 |
| ARM/PowerPC等架构 | weak | 直接映射LL/SC指令 |
| x86架构 | 两者皆可 | 性能差异很小 |

通过掌握这些原子操作函数，特别是compare_exchange的strong和weak版本的区别，你将能够编写出更加高效和安全的多线程程序。 