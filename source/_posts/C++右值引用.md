---
title: c++ 右值引用
date: 2022-09-18 16:15:56
tags:
	- C++11
---

### 1. 什么是右值？
有名称，可以取地址的值，是左值。
没有名称，不能取地址的值，就是右值，另外类似函数返回值这种临时变量，定义为将亡值，也是右值。
c++11中，所有的值，必属于左值，将亡值，和纯右值。



### 2. 左值引用，右值引用

```
int main() {
    
    int a = 0; //ok
    
    int& b = a; //ok,左值引用
    int& c = 0; // not ok,左值引用无法引用右值
    
    const int& d = 0; // ok，常左值引用，可以绑定右值
    const int& e = a; // ok，常左值引用，可以绑定左值
    
    int&& f = 0;//ok 右值引用绑定右值
    const int && g = 0; // ok,常右值引用可以绑定右值
    //但是实际上没有意义，因为绑定的右值无法修改，一般右值引用是为了实现移动语义，降低copy消耗
    
    int&& h = a;//not ok，右值引用无法绑定左值
    
    return 0;
}
```
左值引用，只能绑定左值
常左值引用，可以绑定常量左值，右值，非常量左值和右值
右值引用，只能绑定非常量右值
常右值引用，可以绑定常量右值，非常量右值


### 3. 讨论右值引用，要注意排除返回值优化
如果关闭返回值优化，可以参考
<https://www.yhspy.com/2019/09/01/C-%E7%BC%96%E8%AF%91%E5%99%A8%E4%BC%98%E5%8C%96%E4%B9%8B-RVO-%E4%B8%8E-NRVO>

```
Person GetPerson(){
    return Person();
}

int main()
{
    Person person = GetPerson();
    person.print();
    
    /*
     一共执行三次构造
    1 Person()默认构造函数
    2 GetPerson函数返回时，生成临时对象，调用移动构造函数
    3 使用临时对象，构造person，调用移动构造函数
     */
    return 0;
}
```


```
Person&& GetPerson(){
    return Person();
}

int main()
{
    Person person = GetPerson();
    person.print();
    
    /*
     一共执行两次次构造，这种写法是错的，会有warnning
     Returning reference to local temporary object
    1 Person()默认构造函数
    2 右值引用，引用了已经析构的临时对象
    3 使用临时对象，构造person，调用移动构造函数
     */
    return 0;
}
```

### 4. 函数返回值，如果没有写左值引用，就是临时变量属于右值

```
Person GetPerson(){
    return Person();
}

int main() {
    
    Person person1 = GetPerson(); //调用一次构造，两次次移动构造
    
    Person&& person2 = GetPerson(); //调用一次构造，一次移动构造
    
    return 0;
}
```
理解上面person1和person2的区别，person1是根据临时变量构造了一个新的对象
person2是直接对临时变量的右值引用

#### 注意
```
const Person& GetPerson1(){
    return Person();
}

Person&& GetPerson2(){
    return Person();
}
```
上面两种写法都是错误的，返回的是临时变量的引用，可以编译通过，但是有警告

`Returning reference to local temporary object`





