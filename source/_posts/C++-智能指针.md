---
title: c++ 11 智能指针
date: 2022-09-25 15:13:02
tags: C++11
---

## 智能指针


### share_ptr使用




#### sharet_ptr<T>构造函数和std::make_share<T> 的区别
1. 两个堆内存和一个堆内存，std::make_share效率更高
2. 



### weak_ptr使用
1. expired(),返回指向对堆对象是否释放
2. use_count,share_ptr的强引用计数
3. lock，返回share_ptr，如果释放，返回空
4. 



### share_ptr线程安全话题
1. share_ptr引用计数本身是线程安全的
2. 一个share_ptr对象，在多个线程操作，不能保证线程安全
3. share_ptr指向的对象本身，进行操作时，也无法保证线程安全，完全取决于指向对象是否线程安全



### stl容器多线程安全时的性能考虑


### code使用
```
int main()
{
    shared_ptr<Person> person1;
    
    shared_ptr<Person> person2(nullptr);
    
    shared_ptr<Person> person3(new Person(10));

    shared_ptr<Person> person4 = std::make_shared<Person>(5); //效率更高，内存分布在一起
    
    shared_ptr<Person> person5(std::move(person3)); // person3无法再使用
    
    shared_ptr<Person> arary(new Person[10], deletePersonArray);
    
    weak_ptr<Person> weak_Person = person5;
    
    cout << weak_Person.use_count() << endl;
    
    shared_ptr<Person> person6 = person5;
    
    cout << weak_Person.use_count() << endl;
    
    person5.reset();
    
    cout << weak_Person.use_count() << endl;
    
    person6.reset();
    
    if (weak_Person.expired()) {
        cout << weak_Person.use_count() << endl;
        
        auto shareptr = weak_Person.lock();
        
        cout << shareptr << endl;
    }
    
    return 0;
    
}

```

