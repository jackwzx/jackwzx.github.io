---
title: tag dispatch
date: 2023-12-24 14:44:19
tags:
---

#### 对于short类型来说，会优先匹配通用引用版本的重载，导致无法构造string

```cpp
namespace TagDispatch {

template <typename T>
void fun(T&& params) {
    std::vector<std::string> temp;
    temp.emplace_back(std::forward<T>(params));
    std::cout << "called fun(T&& params)" << std::endl;
}

void fun(int a) {
    std::cout << "called fun(int a)" << std::endl;
}

template <typename T>
void fwd(T&& params) {
    fun(std::forward<T>(params));
}

void test()
{
    fwd("abc"); //suc
    int a = 0;
    fwd(a);     //suc
    
    short b = 10;
    //fwd(b);     //failed, 匹配到了通用引用函数
    
}

int main(int argc, const char * argv[]) {    
    TagDispatch::test();

    return 0;
}

}
```


#### 使用TagDispath，来解决匹配的问题

```cpp
namespace TagDispatch {

template <typename T>
void fun2(T&& params, std::false_type) {
    std::vector<std::string> temp;
    temp.emplace_back(std::forward<T>(params));
    std::cout << "called fun(T&& params)" << std::endl;
}

void fun2(int a, std::true_type) {
    std::cout << "called fun(int a)" << std::endl;
}

template <typename T>
void fwd(T&& params) {
    fun2(std::forward<T>(params), std::is_integral<typename std::remove_reference<T>::type>());
}

void test()
{
    fwd("abc"); //suc
    int a = 0;
    fwd(a);     //suc
    
    short b = 10;
    fwd(b);     //succeed, 匹配到了通用引用函数
}

}

```

#### 针对函数的构造函数，使用通用引用重载，主要解决思路是通过enable_if来限制模板的匹配

```cpp
class Person
{
public:
    template <
        typename T,
        typename = std::enable_if_t<
            !std::is_base_of<Person, std::decay_t<T>>::value    // 防止调用拷贝和移动构造函数，并且考虑了子类
            &&                                                  // decay,移除指针引用和cv修饰符
            !std::is_integral<std::remove_reference_t<T>>::value
        >
    >
    explicit Person(T&& params) {
        std::vector<std::string> temp;
        temp.emplace_back(std::forward<T>(params));
        std::cout << "Person(T&& params)" << std::endl;
    }
    
    explicit Person(int a) {
        std::cout << "Person(int a)" << std::endl;
    }
};

void testCtrOverload() {

    short b = 10;
    Person person(b);
    
}

}
```