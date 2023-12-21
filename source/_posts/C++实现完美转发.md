---
title: 实现完美转发
date: 2022-10-23 20:36:59
tags: C++11
---


### 什么是完美转发？

#### 在理解什么是完美转发之前，需要知道什么是万能引用?
在模板推导过程中，使用T&& a,这时候，并不是类型T的右值引用，而是万能引用，如果a是左值，这时候，就是一个左值引用，如果a是右值，这时候就是一个右值引用，具体原理是发生引用折叠。

```
template <typename T>
void Add(T&& a, T&& b) {
    cout << a << endl;
    cout << b << endl;
}

int main() {
    
    Add(4, 5); // a，b的类型会被推导成int&&
    int a = 0;
    int b = 0;
    Add(a, b); // a，b的类型会被推导成int&
    
    return 0;
}
```
根据参数的具体类型，来实例化模板，准确的生成左值引用和右值引用的实例，这就是万能引用


#### 万能引用遇到的问题？
上面的例子中，Add函数参数虽然是类型是右值引用，但是值确实左值，导致函数内继续使用调用其他函数时，参数类型由右值变成左值，也就是无法将右值引用这个类型继续转发.
```
template <typename T>
void AddImp(T&& a, T&& b) {
    cout << a << endl;
    cout << b << endl;
}

template <typename T>
void Add(T&& a, T&& b) {
    AddImp(a, b);
}

int main() {
    
    Add(4, 5);
    int a = 0;
    int b = 0;
    Add(a, b);
    
    return 0;
}
```

#### 解决方案: std::forward<T>
```
template <typename T>
void Add(T&& a, T&& b) {
    AddImp(std::forward<T>(a), std::forward<T>(b));
}

```
std::forward的具体实现
```
template <class _Tp>
_Tp&& forward(typename remove_reference<_Tp>::type& __t) 
{
  return static_cast<_Tp&&>(__t);
}
```

具体分析一下，也是通过引用折叠来实现
1. 如果_Tp的类型是int&， 通过引用折叠 int& && 折叠后是左值引用int&
2. 如果_Tp的类型是int&&， 通过引用折叠 int&& && 折叠后是int&&

















