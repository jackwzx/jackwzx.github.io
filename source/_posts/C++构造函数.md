---
title: C++ 构造函数
date: 2022-09-18 10:54:51
tags: C++11
---

## C++ 构造函数

1. 默认构造
2. copy构造
3. 移动构造
4. operator= 赋值函数


### 说明

1. 对于赋值函数和copy构造函数来说，直接实现实现const的版本即可，如果参数不是const，会调用const，只有实现了非const的参数，才会调用

```
class Person
{
public:
    Person() {
        cout << "Person()" << endl;
    };
    ~Person() {
        cout << "~Person()" << endl;
    };

    Person(const Person& Person) {
        cout << "Person(Person& Person)" << endl;
    }
    
    Person(Person&& Person) {
        cout << "Person(Person&& Person)" << endl;
    }
    
    Person& operator=(const Person&)
    {
        cout << "operator=(const Person&)" << endl;
        return *this;
    }
};

```

2. 对于构造函数，copy构造函数和移动构造函数来说，只要实现其中任何一个，剩余其他的，编译器就不会帮助生成。

```
class Person
{
public:
//    Person() {
//        cout << "Person()" << endl;
//    };
    ~Person() {
        cout << "~Person()" << endl;
    };

//    Person(const Person& Person) {
//        cout << "Person(Person& Person)" << endl;
//    }

    Person(Person&& Person) {
        cout << "Person(Person&& Person)" << endl;
    }

    Person& operator=(const Person&)
    {
        cout << "operator=(const Person&)" << endl;
        return *this;
    }
};

int main()
{
    Person person; //编译报错，找不到匹配的构造函数
    return 0;

}

```





















