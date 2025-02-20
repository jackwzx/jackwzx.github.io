---
title: c++模版函数delete防止隐士类型转换.md
date: 2024-09-26 14:29:27
tags:
---
```c++
struct Person {
    int a = 0;
    operator int&() { return a; }
    operator const int&() const { return a; }
};

template <typename T>
void testFunc(T arg) = delete;

void testFunc(int arg)
{
    printf("called testFunc int\n");
}

int main() {
    
    Person a;
    testFunc(a); //报错
    return 0;
}
```
