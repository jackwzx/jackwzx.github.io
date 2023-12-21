---
title: c++中operator的重载
date: 2022-09-18 15:10:20
tags: C++11
---

## 两种函数允许编译器进行隐士类型转换
1. 单一参数调用成功的constructors
2. 隐士转换操作符

```
class Ration {
public:
    //1 隐士构造函数
    Ration(int a) {
        
    }
    //2 隐士类型转换函数
    operator double() const {
        return 5.0f;
    }
};


int main()
{
    Ration ration(1);
    cout << ration << endl;
    return 0;
}
```

### 如何阻止构造函数发生不期望的隐士类型转换
```
class Ration {
public:
    explicit Ration(int a) {
        
    }
};

int main()
{
    Ration ration(1);
    
    //构造函数声明为explicit 阻止隐士类型转换 ration == 2 会编译报错
    if (ration == 2) {
        
    }
    return 0;
}
```

### 重载操作符可以在globe scope或者class scope中进行，但是切记不要重载 && || 操作符， 原因是改变了短路运算的语义，变成函数调用。

#### 这里还有一个细节，c++中并未明确定义函数调用动作中各参数的评估顺序，而短路运算是从左到右的。


###重载(),当重载 () 时，不是创造了一种新的调用函数的方式，相反地，这是创建一个可以传递任意数目参数的运算符函数
```
class Ration {
public:
    explicit Ration(int a) {
        
    }
    
    int operator() (int a , int b, int c)
    {
        return 10;
    }
    
    int operator() (int a , int b)
    {
        return 5;
    }
};

int main()
{
    Ration ration(1);
    ration(1, 2, 3);
    ration(1, 3);
    return 0;
}
```






























