---
title: 'std::nth_element实现'
date: 2024-10-08 17:37:18
tags:
---

`std::nth_element` 是 C++ 标准库中的一个算法，用于在一个范围内重新排列元素，使得第 `n` 个元素位于其最终位置，并且该元素左侧的所有元素都小于或等于它，右侧的所有元素都大于或等于它。这个算法的时间复杂度为 O(n) 平均情况下，最坏情况下为 O(n^2)。

### 实现原理

`std::nth_element` 的实现通常基于快速选择算法（Quickselect），这是一个选择算法，类似于快速排序。其基本思路如下：

1. **选择一个基准元素**: 从数组中选择一个基准元素（pivot）。
2. **分区**: 将数组分为两部分：小于基准元素的部分和大于基准元素的部分。
3. **递归选择**: 根据基准元素的位置与 `n` 的关系，决定在左侧还是右侧继续查找。

### 代码实现

以下是一个简单的 `std::nth_element` 的实现示例：

```cpp
#include <iostream>
#include <vector>
#include <algorithm>
#include <cstdlib> // for std::rand

// Partition function for Quickselect
template <typename RandomIt>
RandomIt partition(RandomIt first, RandomIt last, RandomIt pivot) {
    std::iter_swap(pivot, last - 1); // Move pivot to end
    RandomIt storeIndex = first;

    for (RandomIt it = first; it < last - 1; ++it) {
        if (*it < *(last - 1)) {
            std::iter_swap(it, storeIndex);
            ++storeIndex;
        }
    }
    std::iter_swap(storeIndex, last - 1); // Move pivot to its final place
    return storeIndex;
}

// Quickselect function
template <typename RandomIt>
void quickselect(RandomIt first, RandomIt last, size_t n) {
    if (first < last) {
        RandomIt pivot = first + std::rand() % (last - first); // Random pivot
        pivot = partition(first, last, pivot);

        if (pivot - first == n) {
            return; // Found the nth element
        } else if (pivot - first > n) {
            quickselect(first, pivot, n); // Search in the left part
        } else {
            quickselect(pivot + 1, last, n - (pivot - first + 1)); // Search in the right part
        }
    }
}

// nth_element implementation
template <typename RandomIt>
void my_nth_element(RandomIt first, RandomIt nth, RandomIt last) {
    size_t n = nth - first;
    quickselect(first, last, n);
}

int main() {
    std::vector<int> vec = {3, 1, 4, 1, 5, 9, 2, 6, 5, 3, 5};
    size_t n = 5; // We want the 5th element (0-based index)

    my_nth_element(vec.begin(), vec.begin() + n, vec.end());

    std::cout << "The " << n << "th element is: " << vec[n] << std::endl;

    return 0;
}
```

### 代码解释

1. **Partition Function**: 
   - `partition` 函数将数组分为两部分，返回基准元素的最终位置。
   - 它将基准元素移动到数组的末尾，然后遍历数组，将小于基准的元素移动到左侧。

2. **Quickselect Function**:
   - `quickselect` 函数递归地选择基准元素并进行分区，直到找到第 `n` 个元素。

3. **My Nth Element Function**:
   - `my_nth_element` 是用户定义的函数，调用 `quickselect` 来找到第 `n` 个元素。

4. **Main Function**:
   - 在 `main` 函数中，创建一个整数向量，调用 `my_nth_element`，并输出第 `n` 个元素。

### 总结

`std::nth_element` 的实现基于快速选择算法，能够高效地找到数组中第 `n` 个元素。上述代码展示了如何实现这一算法，并提供了一个简单的示例来演示其用法。