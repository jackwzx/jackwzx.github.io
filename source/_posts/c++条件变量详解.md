---
title: std::condition_variable使用介绍
date: 2025-11-30 13:54:27
published: true
tags:
---

C++11 引入的 `std::condition_variable`（条件变量）是多线程编程中用于**线程间同步**和**通信**的重要机制。它允许一个线程挂起（阻塞），直到另一个线程通知它某个特定的条件已经满足。

相比于“忙等待”（Busy Waiting，即在一个循环里不停地检查变量），条件变量能节省 CPU 资源，因为线程在等待时会真正进入休眠状态。

下面我将从**基本概念、核心机制、虚假唤醒、应用场景**以及**代码示例**五个方面详细讲解。

---

### 1. 基本概念与头文件

要使用条件变量，需要包含头文件：
```cpp
#include <condition_variable>
```

通常，条件变量需要配合以下两个组件一起工作：
1.  **`std::mutex`**：用于保护共享数据。
2.  **`std::unique_lock<std::mutex>`**：用于在等待期间自动解锁和重新加锁（注意：必须是 `unique_lock`，不能是 `lock_guard`，原因后面会讲）。

### 2. 核心操作

`std::condition_variable` 主要有三个核心动作：

*   **`wait(lock, predicate)`**：
    *   **阻塞**：当前线程释放锁，并进入休眠状态（不占用 CPU）。
    *   **唤醒**：当收到通知或系统虚假唤醒时，线程解除阻塞。
    *   **重获锁**：线程重新获取互斥锁。
    *   **检查条件**：如果有 `predicate`（一个返回 bool 的函数或 lambda），它会检查条件是否满足。如果不满足，再次挂起。
*   **`notify_one()`**：唤醒**一个**正在等待该条件变量的线程。
*   **`notify_all()`**：唤醒**所有**正在等待该条件变量的线程。

---

### 3. 为什么需要 `std::unique_lock`？

`std::lock_guard` 是 RAII 风格的锁，一旦创建就锁住，直到销毁才释放。
而条件变量在调用 `wait()` 时，**必须由库内部先解锁**（让其他线程能获取锁并修改共享数据），然后在**唤醒时重新加锁**。`std::unique_lock` 提供了这种灵活的 `lock()` 和 `unlock()` 能力，而 `lock_guard` 不行。

---

### 4. 关键陷阱：虚假唤醒 (Spurious Wakeup)

这是一个面试常考点。线程在没有收到 `notify` 的情况下，也可能被操作系统唤醒。这被称为“虚假唤醒”。

**错误写法（使用 `if`）：**
```cpp
if (queue.empty()) {
    cv.wait(lock); // 如果发生虚假唤醒，线程醒来往下执行，但队列其实还是空的 -> 崩溃
}
data = queue.front();
```

**正确写法（使用 `while`）：**
```cpp
while (queue.empty()) {
    cv.wait(lock); // 醒来后再次检查条件，如果还是空的，继续睡
}
data = queue.front();
```

**C++11 简化写法（推荐）：**
`wait` 函数支持第二个参数（谓词），自动帮我们处理 `while` 循环：
```cpp
// 意思是：直到 lambda 返回 true 时，才停止等待
cv.wait(lock, []{ return !queue.empty(); });
```

---

### 5. 应用场景

1.  **生产者-消费者模型（Producer-Consumer）**：最经典场景。生产者往队列塞数据，通知消费者；消费者取数据，如果队列空则等待。
2.  **线程池（Thread Pool）**：工作线程在没有任务时挂起，主线程添加任务后通知工作线程“来活了”。
3.  **读写锁的实现**或**屏障（Barrier）**：等待所有线程到达某个同步点。

---

### 6. 代码示例：生产者-消费者模型

这个例子展示了一个生产者线程生产数据，一个消费者线程处理数据。

```cpp
#include <iostream>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <queue>
#include <chrono>

// 共享资源
std::queue<int> dataQueue;
std::mutex mtx;
std::condition_variable cv;
bool finished = false; // 标记生产是否结束

// 生产者线程函数
void producer(int count) {
    for (int i = 1; i <= count; ++i) {
        std::this_thread::sleep_for(std::chrono::milliseconds(100)); // 模拟生产耗时
        
        {
            // 加锁保护共享队列
            std::unique_lock<std::mutex> lock(mtx);
            dataQueue.push(i);
            std::cout << "[Producer] Produced: " << i << std::endl;
        } // 离开作用域，自动解锁
        
        // 通知一个等待的消费者（先解锁再通知通常效率更高，避免消费者醒来立刻撞上锁）
        cv.notify_one();
    }

    // 标记生产结束
    {
        std::unique_lock<std::mutex> lock(mtx);
        finished = true;
    }
    cv.notify_all(); // 通知所有消费者（如果有多给消费者）该下班了
}

// 消费者线程函数
void consumer() {
    while (true) {
        std::unique_lock<std::mutex> lock(mtx);
        
        // 核心逻辑：等待数据 OR 结束信号
        // 使用 lambda 表达式作为谓词，防止虚假唤醒
        // 含义：当“队列不为空”或者“生产已结束”时，停止等待，继续往下执行
        cv.wait(lock, []{ return !dataQueue.empty() || finished; });

        // 如果队列有数据，取出处理
        while (!dataQueue.empty()) {
            int val = dataQueue.front();
            dataQueue.pop();
            std::cout << "[Consumer] Processed: " << val << std::endl;
        }

        // 如果队列空了且生产结束，退出循环
        if (finished) {
            break;
        }
    }
    std::cout << "[Consumer] Done." << std::endl;
}

int main() {
    std::thread t1(producer, 10); // 生产10个数据
    std::thread t2(consumer);

    t1.join();
    t2.join();

    return 0;
}
```

#### 代码解析：

1.  **Consumer 的 `cv.wait`**：
    *   它首先持有了 `mtx`。
    *   然后检查 lambda `!dataQueue.empty() || finished`。
    *   如果为 `false`（没数据且没结束）：它**释放锁** `mtx` 并进入休眠。
    *   如果为 `true`：它继续持有锁往下执行。
2.  **Producer 的 `cv.notify_one`**：
    *   生产者放入数据后调用 `notify_one`。
    *   操作系统唤醒 Consumer 线程。
    *   Consumer 醒来后，尝试**重新获取锁** `mtx`。
    *   拿到锁后，再次执行 lambda 检查，发现队列不为空，于是往下执行取数据逻辑。

### 7. 总结

*   **`std::condition_variable`** 用于线程因等待某个条件而挂起。
*   必须配合 **`std::unique_lock<std::mutex>`** 使用。
*   使用 **`wait`** 时必须防范**虚假唤醒**（建议使用带谓词的 `wait` 版本）。
*   **`notify_one`** 唤醒一个，**`notify_all`** 唤醒所有。
*   它是构建复杂并发模式（如线程池、任务队列）的基石。
