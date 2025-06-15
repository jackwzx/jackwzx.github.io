---
title: 高性能std::string实现分析
date: 2025-01-27 10:00:00
tags: [C++, 字符串, 性能优化]
categories: [编程技术]
---

# 高性能std::string实现分析

## 1. 字符串存储策略

### 1.1 小字符串优化（SSO）
```cpp
class string {
private:
    static const size_t SSO_SIZE = 15;  // 典型值
    union {
        struct {
            char* data;
            size_t size;
            size_t capacity;
        } heap;
        struct {
            char data[SSO_SIZE + 1];
            unsigned char size;
        } stack;
    } storage;
    bool is_sso() const { return storage.stack.size < SSO_SIZE; }
};
```

**优势**：
- 避免小字符串的堆分配
- 减少内存碎片
- 提高缓存局部性

### 1.2 中长字符串处理
```cpp
class string {
    // 堆分配策略
    void grow(size_t new_capacity) {
        size_t new_size = std::max(
            new_capacity,
            capacity() * 2  // 2倍增长策略
        );
        char* new_data = allocate(new_size);
        memcpy(new_data, data(), size());
        deallocate(data());
        storage.heap.data = new_data;
        storage.heap.capacity = new_size;
    }
};
```

## 2. 引用计数优化

### 2.1 共享字符串实现
```cpp
class string {
private:
    struct SharedData {
        std::atomic<size_t> ref_count;
        size_t size;
        size_t capacity;
        char data[1];  // 柔性数组
    };
    
    SharedData* shared;
    
    void add_ref() {
        if (shared) {
            shared->ref_count.fetch_add(1, std::memory_order_relaxed);
        }
    }
    
    void release() {
        if (shared && shared->ref_count.fetch_sub(1, std::memory_order_acq_rel) == 1) {
            deallocate(shared);
        }
    }
};
```

### 2.2 写时复制（COW）
```cpp
class string {
    void ensure_unique() {
        if (shared && shared->ref_count.load(std::memory_order_acquire) > 1) {
            SharedData* new_data = allocate(size());
            memcpy(new_data->data, shared->data, size());
            release();
            shared = new_data;
            shared->ref_count.store(1, std::memory_order_relaxed);
        }
    }
};
```

## 3. 字面量优化

### 3.1 字符串字面量处理
```cpp
class string {
    // 字面量优化
    template<size_t N>
    string(const char (&str)[N]) {
        if (N <= SSO_SIZE) {
            // 使用SSO
            memcpy(storage.stack.data, str, N);
            storage.stack.size = N;
        } else {
            // 堆分配
            storage.heap.data = allocate(N);
            memcpy(storage.heap.data, str, N);
            storage.heap.size = N;
            storage.heap.capacity = N;
        }
    }
};
```

### 3.2 字符串视图
```cpp
class string_view {
    const char* data_;
    size_t size_;
    
public:
    // 零拷贝构造
    string_view(const string& str) 
        : data_(str.data()), size_(str.size()) {}
};
```

## 4. 内存管理优化

### 4.1 内存池
```cpp
class StringPool {
    static const size_t BLOCK_SIZE = 4096;
    struct Block {
        char* data;
        size_t used;
        Block* next;
    };
    
    Block* current_block;
    
    char* allocate(size_t size) {
        if (current_block->used + size > BLOCK_SIZE) {
            allocate_new_block();
        }
        char* ptr = current_block->data + current_block->used;
        current_block->used += size;
        return ptr;
    }
};
```

### 4.2 对齐优化
```cpp
class string {
    static const size_t ALIGNMENT = 16;
    
    char* allocate(size_t size) {
        size_t aligned_size = (size + ALIGNMENT - 1) & ~(ALIGNMENT - 1);
        return static_cast<char*>(aligned_alloc(ALIGNMENT, aligned_size));
    }
};
```

## 5. 性能优化技巧

### 5.1 移动语义
```cpp
class string {
    string(string&& other) noexcept {
        if (other.is_sso()) {
            memcpy(storage.stack.data, other.storage.stack.data, other.size());
            storage.stack.size = other.storage.stack.size;
        } else {
            storage.heap = other.storage.heap;
            other.storage.heap.data = nullptr;
            other.storage.heap.size = 0;
            other.storage.heap.capacity = 0;
        }
    }
};
```

### 5.2 预留空间
```cpp
class string {
    void reserve(size_t new_capacity) {
        if (new_capacity > capacity()) {
            if (is_sso() && new_capacity <= SSO_SIZE) {
                return;  // 已经在栈上，且空间足够
            }
            grow(new_capacity);
        }
    }
};
```

## 6. 线程安全考虑

### 6.1 引用计数原子操作
```cpp
class string {
    struct SharedData {
        std::atomic<size_t> ref_count;
        // ...
    };
    
    void add_ref() {
        if (shared) {
            shared->ref_count.fetch_add(1, std::memory_order_relaxed);
        }
    }
};
```

### 6.2 写时复制线程安全
```cpp
class string {
    void ensure_unique() {
        if (shared) {
            size_t refs = shared->ref_count.load(std::memory_order_acquire);
            if (refs > 1) {
                // 创建新副本
                SharedData* new_data = allocate(size());
                memcpy(new_data->data, shared->data, size());
                release();
                shared = new_data;
                shared->ref_count.store(1, std::memory_order_relaxed);
            }
        }
    }
};
```

## 7. 性能测试指标

### 7.1 内存使用
- 小字符串（<16字节）：栈存储，零堆分配
- 中字符串（16-64字节）：单次堆分配
- 大字符串（>64字节）：多次堆分配

### 7.2 操作性能
- 构造/析构：O(1) 小字符串，O(n) 大字符串
- 复制：O(1) 引用计数，O(n) 写时复制
- 修改：O(1) 小字符串，O(n) 大字符串

## 8. 总结

高性能std::string实现需要综合考虑多个方面：
1. 小字符串优化（SSO）减少堆分配
2. 引用计数优化内存使用
3. 字面量处理提高构造效率
4. 内存管理优化减少碎片
5. 移动语义提升性能
6. 线程安全保证正确性

通过合理使用这些技术，可以在保证功能正确性的同时，显著提升字符串操作的性能。 