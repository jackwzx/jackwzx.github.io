---
title: c++ 可变参数模板
date: 2022-12-11 14:50:04
tags: c++11
---



### 可变模版参数(variadic templates)
可以对参数进行高度泛化，标识0到任意个数参数

#### 两种展开形式
1. 使用特化的终止函数结合递归

```
#include <iostream>
using namespace std;

//终止函数
int multiply()
{
    return 1;
}

//递归展开
template <typename T, typename ...Args>
int multiply(T&& t, Args&& ...arg)
{
    return t * multiply(arg...);
}

int main(int argc, const char * argv[]) {
    
    cout << multiply(3, 4, 5) << endl;
    
    cout << multiply() << endl;
    
    return 0;
}
```

2. 使用逗号表达式
初始化列表，通过初始化列表来初始化一个变长数组, {(printarg(args), 0)...}将会展开成((printarg(arg1),0), (printarg(arg2),0), (printarg(arg3),0),  etc... )，最终会创建一个元素值都为0的数组int arr[sizeof...(Args)]


```
template<class F, class... Args>void expand(const F& f, Args&&...args)
{
  //这里用到了完美转发，关于完美转发，读者可以参考笔者在上一期程序员中的文章《通过4行代码看右值引用》
  initializer_list<int>{(f(std::forward< Args>(args)),0)...};
}

int main(int argc, const char * argv[]) {
    
    expand([](int i) {
        cout<<i<<endl;
    }, 1,2,3);
    return 0;
}

```

### initializer_list
为了编写处理不同数量实参的函数，如果参数类型相同，可以使用initializer_list， 如果实参类型不同，使用可变参数模板

```
struct myclass {
    myclass(int,int)
    {
        cout << "myclass constructor" << endl;
    }
    myclass(initializer_list<int>)
    {
        cout << "myclass initializer_list constructor" << endl;
    }
};


int main(int argc, const char * argv[]) {
    
    auto il = {10, 20, 30};
    
    myclass foo {10,20};  // calls initializer_list constructor
    myclass bar (10,20);  // calls first constructo
    
    return 0;
}
```







