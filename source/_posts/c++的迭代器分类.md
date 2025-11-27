---
title: c++迭代器
date: 2025-06-30 14:00:00
tags: 
---

C++ 中有 **5 种主要的迭代器类型**，它们形成一个**层次结构**，每种都有不同的功能和限制。

---

## C++ 迭代器的 5 种类型

### 1. **输入迭代器 (Input Iterator)**
- **只读**，**单向**，**一次性**
- 只能 `++it`，不能 `--it`
- 只能读取 `*it`，不能修改
- 典型例子：`std::istream_iterator`

```cpp
std::istream_iterator<int> it(std::cin);
int value = *it;  // 只读
++it;            // 只能前进
// --it;         // ❌ 不支持
```

### 2. **输出迭代器 (Output Iterator)**
- **只写**，**单向**，**一次性**
- 只能 `++it`，不能读取
- 典型例子：`std::ostream_iterator`

```cpp
std::ostream_iterator<int> it(std::cout, " ");
*it = 42;        // 只写
++it;            // 只能前进
// int x = *it;  // ❌ 不能读取
```

### 3. **前向迭代器 (Forward Iterator)** ⭐
- **读写**，**单向**，**可多次遍历**
- 支持 `++it`，不支持 `--it`
- 可以多次读写同一位置
- 典型例子：`std::forward_list<T>::iterator`

```cpp
std::forward_list<int> flist = {1, 2, 3, 4};
auto it = flist.begin();

*it = 10;        // ✅ 可读写
++it;            // ✅ 前进
// --it;         // ❌ 不能后退

// 可以多次遍历
auto it2 = flist.begin();  // 重新开始遍历
```

### 4. **双向迭代器 (Bidirectional Iterator)**
- **读写**，**双向**，**可多次遍历**
- 支持 `++it` 和 `--it`
- 典型例子：`std::list<T>::iterator`, `std::set<T>::iterator`

```cpp
std::list<int> lst = {1, 2, 3, 4};
auto it = lst.begin();

++it;            // ✅ 前进
--it;            // ✅ 后退
*it = 100;       // ✅ 读写
```

### 5. **随机访问迭代器 (Random Access Iterator)**
- **读写**，**随机访问**，**支持算术运算**
- 支持 `it + n`, `it - n`, `it[n]`, `it1 - it2`
- 典型例子：`std::vector<T>::iterator`, `std::array<T>::iterator`

```cpp
std::vector<int> vec = {1, 2, 3, 4, 5};
auto it = vec.begin();

it += 3;         // ✅ 跳跃访问
int val = it[1]; // ✅ 下标访问
auto dist = vec.end() - it;  // ✅ 距离计算
```

---

## 前向迭代器详解

### **什么是前向迭代器？**

前向迭代器是**最基础的"真正有用"的迭代器**，它具备：

1. **可读写**：`*it` 既可以读取也可以修改
2. **单向移动**：只支持 `++it`，不支持 `--it`
3. **多次遍历**：可以保存迭代器副本，重复访问同一元素
4. **相等比较**：支持 `==` 和 `!=`

### **前向迭代器的要求**

```cpp
template<typename ForwardIt>
void forward_iterator_example(ForwardIt first, ForwardIt last) {
    // ✅ 支持的操作
    ForwardIt it = first;     // 拷贝构造
    ForwardIt it2 = it;       // 可以保存副本
    
    if (it != last) {
        auto value = *it;     // 读取
        *it = value + 1;      // 修改
        ++it;                 // 前进
        
        // 可以重复访问
        if (it2 != last) {
            auto same_value = *it2;  // it2 还指向原位置
        }
    }
    
    // ❌ 不支持的操作
    // --it;                 // 不能后退
    // it += 5;              // 不支持随机访问
    // it[3];                // 不支持下标
}
```

### **典型容器和迭代器类型**

```cpp
// 前向迭代器
std::forward_list<int> flist;
auto fit = flist.begin();  // forward iterator

// 双向迭代器
std::list<int> list;
auto lit = list.begin();   // bidirectional iterator

// 随机访问迭代器
std::vector<int> vec;
auto vit = vec.begin();    // random access iterator

// 使用时的限制
++fit;  ✅
// --fit;  ❌ 前向迭代器不支持

++lit;  ✅
--lit;  ✅

++vit;  ✅
--vit;  ✅
vit += 3;  ✅
```

---

## 迭代器层次结构

```
输入迭代器 ←─┐
           ├─→ 前向迭代器 ─→ 双向迭代器 ─→ 随机访问迭代器
输出迭代器 ←─┘
```

**每个层次都包含下层的所有功能**：
- 随机访问迭代器可以用作双向迭代器
- 双向迭代器可以用作前向迭代器
- 等等...

---

## 实际应用

### **算法对迭代器类型的要求**

```cpp
// 不同算法需要不同类型的迭代器
std::find(first, last, value);        // 需要：输入迭代器
std::copy(first, last, output);       // 需要：输入 + 输出迭代器
std::reverse(first, last);            // 需要：双向迭代器
std::sort(first, last);               // 需要：随机访问迭代器

// 前向迭代器的典型用途
std::forward_list<int> flist = {1, 2, 3};
auto result = std::find(flist.begin(), flist.end(), 2);  // ✅ OK
// std::sort(flist.begin(), flist.end());  // ❌ 错误！需要随机访问
```

前向迭代器是**单链表等数据结构的自然选择**，提供了基本的遍历和修改能力，但不支持高效的反向遍历或随机访问。
