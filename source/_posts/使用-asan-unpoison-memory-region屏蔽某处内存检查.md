---
title: 使用__asan_unpoison_memory_region屏蔽某处内存检查
date: 2024-07-22 08:45:16
tags:
---

`__asan_unpoison_memory_region` 是 AddressSanitizer (ASan) 库中的一个函数。ASan 是一个用于检测内存错误的工具，主要用于 C 和 C++ 程序开发者。`__asan_unpoison_memory_region` 的作用是标记一段内存区域为“未污染”状态，这意味着这段内存可以被访问且不会触发 ASan 的错误报告。

具体来说，这个函数通常用于以下场景：
1. 在内存被分配后但未初始化之前，标记该区域为未污染，以便在初始化期间可以安全访问。
2. 当程序知道某段内存区域将被合法访问时，预先标记该区域为未污染，以避免误报。

函数原型通常如下：
```c
void __asan_unpoison_memory_region(void *addr, size_t size);
```

参数解释：
- `addr`：内存区域的起始地址。
- `size`：内存区域的大小（以字节为单位）。

通过调用这个函数，开发者可以更精细地控制 ASan 的内存监控行为，减少误报，提高调试效率。