---
title: pthread_create设置栈size
date: 2024-07-28 10:44:09
tags:
---

本文演示如何在使用 `pthread_create` 创建线程时设置自定义的栈大小。通过 `pthread_attr_setstacksize` 函数可以控制线程的栈空间大小，这在需要大量栈空间或者优化内存使用时非常有用。

<!-- more -->

```cpp
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>

void* threadFunction(void* arg) {
    // 线程的执行代码
    printf("Thread is running\n");
    return NULL;
}

int main() {
    pthread_t thread;
    pthread_attr_t attr;
    size_t stackSize = 2 * 1024 * 1024; // 设置栈大小为2 MiB

    // 初始化线程属性
    if (pthread_attr_init(&attr) != 0) {
        perror("pthread_attr_init");
        return EXIT_FAILURE;
    }

    // 设置线程栈大小
    if (pthread_attr_setstacksize(&attr, stackSize) != 0) {
        perror("pthread_attr_setstacksize");
        return EXIT_FAILURE;
    }

    // 创建线程
    if (pthread_create(&thread, &attr, threadFunction, NULL) != 0) {
        perror("pthread_create");
        return EXIT_FAILURE;
    }

    // 等待线程结束
    if (pthread_join(thread, NULL) != 0) {
        perror("pthread_join");
        return EXIT_FAILURE;
    }

    // 销毁线程属性
    if (pthread_attr_destroy(&attr) != 0) {
        perror("pthread_attr_destroy");
        return EXIT_FAILURE;
    }

    return EXIT_SUCCESS;
}

```