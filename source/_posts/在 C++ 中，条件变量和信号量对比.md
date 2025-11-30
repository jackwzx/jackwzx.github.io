---
title: 在 C++ 中，条件变量和信号量对比
date: 2025-11-30 14:03:07
published: true
tags:
---

在 C++ 中，**信号量（Semaphore）** 提供了一种基于“计数器”的同步机制。

需要注意的是，标准的信号量 `std::counting_semaphore` 和 `std::binary_semaphore` 是在 **C++20** 才正式引入的。如果你严格限制在 **C++11** 环境，通常需要自己封装 POSIX 信号量（`sem_t`）或 Windows 信号量，或者使用 Boost 库。

为了方便讲解原理，下面的代码使用 **C++20 标准** 的写法（逻辑在 C++11 下是一样的，只是 API 不同）。

---

### 1. 信号量的核心逻辑

信号量本质上是一个整数计数器，包含两个原子操作：
1.  **`acquire()` (P 操作 / Wait)**：计数器减 1。如果计数器为 0，线程阻塞，直到大于 0。
2.  **`release()` (V 操作 / Signal / Post)**：计数器加 1。如果有线程在阻塞，唤醒其中一个。

**与条件变量最大的区别：**
*   **条件变量是无状态的**：如果没有线程在 `wait`，你调用 `notify`，这个信号就**丢了**。
*   **信号量是有状态的**：如果没有线程在 `acquire`，你调用 `release`，计数器会**累加**，信号被**保存**下来，下一个线程来 `acquire` 时会直接通过，不用等待。

---

### 2. 代码实现：使用信号量的生产者-消费者

在这个方案中，我们使用两个核心组件：
1.  `std::mutex`：仅用于保护 `std::queue` 的数据完整性（防止 push/pop 冲突）。
2.  `std::counting_semaphore`：用来代表“队列中可用数据的数量”。

```cpp
#include <iostream>
#include <thread>
#include <vector>
#include <queue>
#include <mutex>
#include <semaphore> // C++20 需要此头文件
#include <chrono>

std::queue<int> dataQueue;
std::mutex mtx; // 仅保护队列操作

// 信号量：初始计数为0，代表队列一开始是空的
// 模板参数是最大计数值，通常设很大
std::counting_semaphore<1000> items_sem(0); 

void producer(int count) {
    for (int i = 1; i <= count; ++i) {
        std::this_thread::sleep_for(std::chrono::milliseconds(100));

        {
            std::lock_guard<std::mutex> lock(mtx);
            dataQueue.push(i);
            std::cout << "[Producer] Produced: " << i << std::endl;
        }
        
        // 生产了一个数据，信号量 +1
        // 如果有消费者在等，它会被唤醒；没人等，计数器保留为1
        items_sem.release(); 
    }
}

void consumer(int id) {
    while (true) {
        // 1. 等待信号量（计数器 -1）
        // 如果计数器为0，这里会阻塞。
        // 注意：这里不需要持有 mutex！这是和条件变量最大的区别。
        items_sem.acquire();

        int val = 0;
        {
            // 2. 只有在取数据的一瞬间才加锁
            std::lock_guard<std::mutex> lock(mtx);
            if (!dataQueue.empty()) {
                val = dataQueue.front();
                dataQueue.pop();
            }
        }
        
        // 模拟处理结束逻辑（简单处理：如果是 -1 就退出）
        if (val == -1) break; 

        std::cout << "[Consumer " << id << "] Processed: " << val << std::endl;
    }
}

int main() {
    std::thread p(producer, 10);
    std::thread c1(consumer, 1);
    
    p.join();
    
    // 毒药丸 (Poison Pill) 模式：
    // 信号量很难像条件变量那样通过一个 bool finished 变量来广播退出，
    // 因为消费者阻塞在 acquire() 上，看不到 bool 变量的变化。
    // 所以通常往队列里塞一个特殊值（比如 -1）来通知退出。
    {
        std::lock_guard<std::mutex> lock(mtx);
        dataQueue.push(-1); 
    }
    items_sem.release(); // 增加信号量让消费者醒来读到 -1

    c1.join();
    return 0;
}
```

---

### 3. 条件变量 vs. 信号量：详细对比

| 特性 | 条件变量 (Condition Variable) | 信号量 (Semaphore) |
| :--- | :--- | :--- |
| **核心逻辑** | **基于状态检查**。等待某个复杂的条件（谓词）成立。 | **基于计数**。等待资源的数量 > 0。 |
| **是否有记忆** | **无记忆**。如果在 `wait` 之前 `notify`，信号丢失。 | **有记忆**。`release` 会增加计数，后续的 `acquire` 会立即成功。 |
| **互斥锁依赖** | **必须配合** `unique_lock<mutex>`。等待时自动释放锁，醒来自动加锁。 | **独立**。信号量本身是原子的，不需要外部锁。但在操作共享容器时仍需锁。 |
| **灵活性** | **极高**。条件可以是 `!queue.empty() && x > 5 || stop` 等任意逻辑。 | **较低**。只能表达“有多少个资源可用”。 |
| **广播能力** | `notify_all()` 可以轻松唤醒所有线程。 | 没有直接的 `release_all`。通常需要循环调用 `release` 或者由被唤醒的线程级联唤醒。 |
| **典型场景** | 复杂的业务逻辑同步、状态机变化、一次性通知。 | 资源池限制（如连接池）、有界缓冲区的空槽/满槽计数。 |

### 4. 为什么 C++11 只有条件变量没有信号量？

这是一个有趣的设计哲学问题。C++ 标准委员会当时认为：
1.  **条件变量是更底层的原语**：你可以用“互斥锁 + 条件变量 + 计数器整数”轻松实现一个信号量。
2.  **表达能力**：条件变量能表达任意复杂的条件，而信号量只能表达计数。
3.  **易错性**：信号量在复杂的逻辑中容易导致死锁（比如忘记 release），或者是编程意图不清晰（只有数字，不知道代表什么）。

**如何用 C++11 的条件变量实现一个信号量？**
(这也是面试常考题)

```cpp
#include <mutex>
#include <condition_variable>

class Semaphore {
private:
    std::mutex mtx;
    std::condition_variable cv;
    int count;

public:
    Semaphore(int count_ = 0) : count(count_) {}

    void release() {
        std::unique_lock<std::mutex> lock(mtx);
        count++;
        cv.notify_one(); // 唤醒一个等待者
    }

    void acquire() {
        std::unique_lock<std::mutex> lock(mtx);
        // 使用条件变量实现信号量的等待逻辑
        cv.wait(lock, [this] { return count > 0; });
        count--;
    }
};
```

### 5. 什么时候该选哪一个？

*   **选条件变量**：
    *   你需要检查的条件**不仅仅是计数**（例如：队列不为空 **且** 生产未结束）。
    *   你需要**广播**（通知所有线程，例如“程序退出”信号）。
    *   你需要更严格的临界区控制（醒来时必须持有锁）。

*   **选信号量**：
    *   主要为了**限制并发数量**（例如：限制最多 5 个线程同时访问数据库连接池）。
    *   **有界缓冲区（Bounded Buffer）**：需要两个信号量，一个表示“空槽数量”，一个表示“数据数量”。这种场景下信号量代码非常优雅，不需要手动检查 `queue.size() < MAX`。
    *   轻量级的通知机制，且发送通知时并不持有锁。

### 总结

如果不使用条件变量，使用信号量实现生产者-消费者模型是完全可行的，甚至在“纯粹计数”的场景下代码更少。

但信号量的**局限性**在于处理“非计数类”的状态变化（比如程序停止标志 `finished`）时比较麻烦，通常需要特殊的“毒药丸”策略来唤醒阻塞的线程，而条件变量只需要修改判断谓词即可。
