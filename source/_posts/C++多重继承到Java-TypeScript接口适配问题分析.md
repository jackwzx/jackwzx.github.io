---
title: C++多重继承到Java/TypeScript接口适配问题分析
date: 2025-06-30 10:00:00
tags:
  - C++
  - Java
  - TypeScript
  - 设计模式
  - 接口适配
categories:
  - 编程技术
---

## 引言

在跨语言开发中，经常需要将C++的多重继承类转换为Java或TypeScript对象。这种转换过程中，接口适配是一个关键问题，特别是当使用`void*`存储指针并进行强制类型转换时，可能会遇到一些陷阱。本文将从技术角度深入分析这个问题。

## C++多重继承的内存布局

### 基本概念

C++的多重继承允许一个类同时继承多个基类，这带来了复杂的内存布局问题：

```cpp
class Base1 {
public:
    virtual void method1() = 0;
    int data1;
};

class Base2 {
public:
    virtual void method2() = 0;
    int data2;
};

class Derived : public Base1, public Base2 {
public:
    void method1() override { /* 实现 */ }
    void method2() override { /* 实现 */ }
    int derivedData;
};
```

### 内存布局分析

在C++中，多重继承的对象内存布局如下：

```
Derived对象内存布局：
+------------------+
| Base1 vtable ptr |  <- 对象起始地址
+------------------+
| data1            |
+------------------+
| Base2 vtable ptr |  <- 偏移量
+------------------+
| data2            |
+------------------+
| derivedData      |
+------------------+
```

## 虚继承与非虚继承的区别

### 菱形继承问题

当存在菱形继承时，虚继承与非虚继承的内存布局差异变得明显：

```cpp
// 非虚继承 - 存在数据重复
class Base {
public:
    virtual void method() = 0;
    int baseData;
};

class Derived1 : public Base {
public:
    void method() override { /* 实现 */ }
    int derived1Data;
};

class Derived2 : public Base {
public:
    void method() override { /* 实现 */ }
    int derived2Data;
};

class Final : public Derived1, public Derived2 {
public:
    void method() override { /* 实现 */ }
    int finalData;
};
```

### 非虚继承的内存布局

```
Final对象内存布局（非虚继承）：
+------------------+
| Derived1 vtable  |  <- 对象起始地址
+------------------+
| baseData         |  <- Base数据副本1
+------------------+
| derived1Data     |
+------------------+
| Derived2 vtable  |  <- 偏移量
+------------------+
| baseData         |  <- Base数据副本2（重复！）
+------------------+
| derived2Data     |
+------------------+
| finalData        |
+------------------+
```

### 虚继承的内存布局

```cpp
// 虚继承 - 解决数据重复
class Base {
public:
    virtual void method() = 0;
    int baseData;
};

class Derived1 : virtual public Base {
public:
    void method() override { /* 实现 */ }
    int derived1Data;
};

class Derived2 : virtual public Base {
public:
    void method() override { /* 实现 */ }
    int derived2Data;
};

class Final : public Derived1, public Derived2 {
public:
    void method() override { /* 实现 */ }
    int finalData;
};
```

```
Final对象内存布局（虚继承）：
+------------------+
| Derived1 vtable  |  <- 对象起始地址
+------------------+
| derived1Data     |
+------------------+
| Derived2 vtable  |  <- 偏移量
+------------------+
| derived2Data     |
+------------------+
| finalData        |
+------------------+
| Base vtable      |  <- 共享的Base部分
+------------------+
| baseData         |  <- 只有一份Base数据
+------------------+
```

### 虚继承的指针偏移复杂性

虚继承引入了更复杂的指针偏移机制：

```cpp
// 虚继承的指针偏移示例
Final* final = new Final();

// 获取Base指针需要特殊处理
Base* base = final;  // 编译器自动计算到共享Base部分的偏移

// 手动计算偏移（危险！）
void* voidPtr = final;
Base* base2 = static_cast<Base*>(voidPtr);  // 错误！无法正确计算偏移
```

## 虚继承对接口适配的影响

### 1. 更复杂的指针偏移计算

```cpp
// 虚继承情况下的错误包装
class VirtualWrapper {
private:
    void* ptr;
    
public:
    VirtualWrapper(void* p) : ptr(p) {}
    
    template<typename T>
    T* get() {
        // 对于虚继承，这种转换是危险的
        return static_cast<T*>(ptr);
    }
};

// 使用示例 - 存在问题
Final* final = new Final();
VirtualWrapper wrapper(final);

// 这些转换可能失败或指向错误位置
Base* base = wrapper.get<Base>();        // 可能错误
Derived1* d1 = wrapper.get<Derived1>();  // 可能错误
Derived2* d2 = wrapper.get<Derived2>();  // 可能错误
```

### 2. 虚函数表访问的复杂性

```cpp
// 虚继承的虚函数表结构
class VirtualBase {
public:
    virtual void method() = 0;
    virtual ~VirtualBase() = default;
};

class VirtualDerived : virtual public VirtualBase {
public:
    void method() override { /* 实现 */ }
    virtual void derivedMethod() { /* 实现 */ }
};

// 虚函数表访问问题
void* ptr = new VirtualDerived();
VirtualBase* base = static_cast<VirtualBase*>(ptr);
base->method();  // 可能访问错误的虚函数表
```

## 针对虚继承的解决方案

### 1. 使用dynamic_cast进行安全转换

```cpp
// 安全的虚继承包装器
template<typename T>
class VirtualSafeWrapper {
private:
    T* ptr;
    
public:
    VirtualSafeWrapper(T* p) : ptr(p) {}
    
    template<typename U>
    U* safeCast() {
        // 使用dynamic_cast处理虚继承
        return dynamic_cast<U*>(ptr);
    }
    
    template<typename U>
    bool canCast() const {
        return dynamic_cast<U*>(ptr) != nullptr;
    }
};

// 使用示例
Final* final = new Final();
VirtualSafeWrapper<Final> wrapper(final);

// 安全的类型转换
if (wrapper.canCast<Base>()) {
    Base* base = wrapper.safeCast<Base>();
    base->method();
}
```

### 2. 虚继承感知的工厂模式

```cpp
class VirtualInterfaceFactory {
public:
    template<typename Target, typename Source>
    static Target* createInterface(Source* ptr) {
        // 检查是否存在虚继承关系
        if constexpr (std::is_base_of_v<Target, Source>) {
            if constexpr (std::is_virtual_base_of_v<Target, Source>) {
                // 虚继承：使用dynamic_cast
                return dynamic_cast<Target*>(ptr);
            } else {
                // 非虚继承：可以使用static_cast
                return static_cast<Target*>(ptr);
            }
        }
        return nullptr;
    }
};
```

### 3. 类型信息增强的包装器

```cpp
class VirtualTypeInfo {
public:
    enum class InheritanceType {
        NORMAL,
        VIRTUAL
    };
    
    template<typename T>
    static InheritanceType getInheritanceType() {
        // 检查T是否包含虚继承
        return std::is_virtual_base_of_v<T, T> ? 
               InheritanceType::VIRTUAL : InheritanceType::NORMAL;
    }
};

template<typename T>
class EnhancedWrapper {
private:
    T* ptr;
    VirtualTypeInfo::InheritanceType inheritanceType;
    
public:
    EnhancedWrapper(T* p) : ptr(p), 
        inheritanceType(VirtualTypeInfo::getInheritanceType<T>()) {}
    
    template<typename U>
    U* cast() {
        if (inheritanceType == VirtualTypeInfo::InheritanceType::VIRTUAL) {
            return dynamic_cast<U*>(ptr);
        } else {
            return static_cast<U*>(ptr);
        }
    }
};
```

## 虚继承与非虚继承的解决方案对比

### 非虚继承场景

```cpp
// 非虚继承：相对简单的指针偏移
class NonVirtualWrapper {
private:
    void* ptr;
    
public:
    template<typename T>
    T* get() {
        // 对于非虚继承，static_cast相对安全
        return static_cast<T*>(ptr);
    }
};
```

### 虚继承场景

```cpp
// 虚继承：需要更复杂的处理
class VirtualWrapper {
private:
    void* ptr;
    
public:
    template<typename T>
    T* get() {
        // 对于虚继承，必须使用dynamic_cast
        return dynamic_cast<T*>(ptr);
    }
};
```

### 混合场景的处理

```cpp
// 处理混合继承场景
class HybridWrapper {
private:
    void* ptr;
    std::type_info* originalType;
    
public:
    template<typename T>
    HybridWrapper(T* p) : ptr(p), type(&typeid(T)) {}
    
    template<typename U>
    U* cast() {
        // 检查是否为虚继承关系
        if (hasVirtualInheritance<U>()) {
            return dynamic_cast<U*>(ptr);
        } else {
            return static_cast<U*>(ptr);
        }
    }
    
private:
    template<typename U>
    bool hasVirtualInheritance() {
        // 实现虚继承检测逻辑
        return false; // 简化实现
    }
};
```

## 接口适配的常见方案

### 方案1：使用void*指针存储

```cpp
// C++ 包装层
class Wrapper {
private:
    void* ptr;
    
public:
    Wrapper(void* p) : ptr(p) {}
    
    template<typename T>
    T* get() {
        return static_cast<T*>(ptr);
    }
    
    void* getRaw() { return ptr; }
};

// 使用示例
Derived* derived = new Derived();
Wrapper wrapper(derived);

// 获取Base1接口
Base1* base1 = wrapper.get<Base1>();
// 获取Base2接口  
Base2* base2 = wrapper.get<Base2>();
```

### 方案2：类型安全的接口映射

```cpp
// 更安全的包装方案
class SafeWrapper {
private:
    void* ptr;
    std::type_info* type;
    
public:
    template<typename T>
    SafeWrapper(T* p) : ptr(p), type(&typeid(T)) {}
    
    template<typename T>
    T* get() {
        if (typeid(T) == *type) {
            return static_cast<T*>(ptr);
        }
        return nullptr;
    }
};
```

## 问题分析

### 1. 指针偏移问题

当使用`void*`存储多重继承对象时，直接强制转换可能导致指针偏移错误：

```cpp
Derived* derived = new Derived();
void* voidPtr = derived;  // 存储Derived*的地址

// 错误：直接转换到Base2
Base2* base2 = static_cast<Base2*>(voidPtr);  // 可能指向错误位置
```

**问题原因**：`void*`存储的是`Derived`对象的起始地址，但`Base2`的虚函数表在偏移位置，直接转换会得到错误的地址。

### 2. 虚函数表访问错误

```cpp
// 错误示例
void* ptr = new Derived();
Base2* base2 = static_cast<Base2*>(ptr);
base2->method2();  // 可能访问错误的虚函数表
```

### 3. 类型信息丢失

使用`void*`会丢失类型信息，无法进行运行时类型检查：

```cpp
void* ptr = new Derived();
// 无法知道ptr实际指向什么类型
// 无法进行安全的类型转换
```

## Java/TypeScript接口适配方案

### Java接口映射

```java
// Java接口定义
public interface Base1Interface {
    void method1();
}

public interface Base2Interface {
    void method2();
}

// 包装类
public class CppWrapper {
    private long nativePtr;  // 存储C++对象指针
    
    public CppWrapper(long ptr) {
        this.nativePtr = ptr;
    }
    
    // 通过JNI调用C++方法
    public native void method1();
    public native void method2();
    
    // 获取原始指针
    public long getNativePtr() {
        return nativePtr;
    }
}
```

### TypeScript接口映射

```typescript
// TypeScript接口定义
interface Base1Interface {
    method1(): void;
}

interface Base2Interface {
    method2(): void;
}

// 包装类
class CppWrapper implements Base1Interface, Base2Interface {
    private nativePtr: number;  // 存储C++对象指针
    
    constructor(ptr: number) {
        this.nativePtr = ptr;
    }
    
    // 通过FFI调用C++方法
    method1(): void {
        // 调用native方法
        this.callNativeMethod(this.nativePtr, 'method1');
    }
    
    method2(): void {
        this.callNativeMethod(this.nativePtr, 'method2');
    }
    
    private callNativeMethod(ptr: number, methodName: string): void {
        // 实现native调用
    }
}
```

## 正确的解决方案

### 1. 使用类型安全的包装器

```cpp
template<typename T>
class TypedWrapper {
private:
    T* ptr;
    
public:
    TypedWrapper(T* p) : ptr(p) {}
    
    T* get() { return ptr; }
    
    template<typename U>
    U* cast() {
        return dynamic_cast<U*>(ptr);
    }
};

// 使用示例
Derived* derived = new Derived();
TypedWrapper<Derived> wrapper(derived);

Base1* base1 = wrapper.cast<Base1>();
Base2* base2 = wrapper.cast<Base2>();
```

### 2. 接口分离原则

```cpp
// 为每个接口创建独立的包装器
class Base1Wrapper {
private:
    Base1* ptr;
    
public:
    Base1Wrapper(Base1* p) : ptr(p) {}
    void method1() { ptr->method1(); }
};

class Base2Wrapper {
private:
    Base2* ptr;
    
public:
    Base2Wrapper(Base2* p) : ptr(p) {}
    void method2() { ptr->method2(); }
};
```

### 3. 工厂模式创建接口

```cpp
class InterfaceFactory {
public:
    template<typename T>
    static T* createInterface(void* ptr) {
        // 根据类型信息正确计算偏移量
        if constexpr (std::is_base_of_v<T, Derived>) {
            return static_cast<T*>(ptr);
        }
        return nullptr;
    }
};
```

## 最佳实践建议

### 1. 避免使用void*进行类型转换

```cpp
// 不推荐
void* ptr = new Derived();
Base2* base2 = static_cast<Base2*>(ptr);

// 推荐
Derived* derived = new Derived();
Base2* base2 = derived;  // 编译器自动处理偏移
```

### 2. 使用智能指针管理生命周期

```cpp
std::unique_ptr<Derived> derived = std::make_unique<Derived>();
std::unique_ptr<Base1> base1 = std::move(derived);
```

### 3. 提供类型安全的接口

```cpp
class SafeInterface {
public:
    virtual ~SafeInterface() = default;
    
    template<typename T>
    T* as() {
        return dynamic_cast<T*>(this);
    }
    
    template<typename T>
    bool is() const {
        return dynamic_cast<const T*>(this) != nullptr;
    }
};
```

## 总结

C++多重继承转换为Java/TypeScript时，使用`void*`存储指针并进行强制类型转换确实存在严重问题：

1. **指针偏移错误**：直接转换会忽略多重继承的内存布局
2. **虚函数表访问错误**：可能导致调用错误的虚函数
3. **类型安全缺失**：无法进行运行时类型检查

**推荐解决方案**：
- 使用类型安全的包装器
- 实现接口分离
- 采用工厂模式创建接口
- 避免直接使用`void*`进行类型转换

通过这些方案，可以确保C++多重继承类在转换为Java/TypeScript时能够正确适配接口，避免运行时错误。

## 虚继承与非虚继承的关键差异总结

### 内存布局差异

| 特性 | 非虚继承 | 虚继承 |
|------|----------|--------|
| 数据重复 | 存在重复的基类数据 | 共享基类数据 |
| 内存布局 | 相对简单，线性排列 | 复杂，包含虚基类指针 |
| 指针偏移 | 固定偏移量 | 动态计算的偏移量 |

### 接口适配策略差异

| 转换方式 | 非虚继承 | 虚继承 |
|----------|----------|--------|
| static_cast | 相对安全 | 危险，可能导致错误偏移 |
| dynamic_cast | 可选，但开销较大 | 必需，保证类型安全 |
| void*转换 | 可能工作，但不推荐 | 几乎总是失败 |

### 解决方案选择

**非虚继承场景**：
- 可以使用`static_cast`进行类型转换
- 指针偏移计算相对简单
- 包装器实现相对直接

**虚继承场景**：
- 必须使用`dynamic_cast`进行类型转换
- 需要复杂的指针偏移计算
- 包装器需要特殊处理虚基类

**混合场景**：
- 需要检测继承类型
- 根据继承类型选择不同的转换策略
- 实现更复杂的包装器逻辑

### 性能考虑

1. **非虚继承**：`static_cast`开销小，适合性能敏感场景
2. **虚继承**：`dynamic_cast`开销大，但保证类型安全
3. **混合场景**：需要运行时类型检查，性能开销最大

### 最佳实践建议

1. **设计阶段**：尽量避免复杂的多重继承，特别是虚继承
2. **接口设计**：为每个接口创建独立的包装器
3. **类型安全**：优先使用`dynamic_cast`而非`static_cast`
4. **错误处理**：始终检查类型转换的返回值
5. **文档化**：明确记录继承关系和转换策略

通过这些差异化的处理策略，可以确保C++多重继承类在跨语言接口适配中既保证类型安全，又兼顾性能需求。

## SWIG解决方案分析

### SWIG简介

SWIG（Simplified Wrapper and Interface Generator）是一个强大的跨语言接口生成工具，能够自动为C++代码生成多种语言的绑定，包括Java、Python、C#等。SWIG通过分析C++代码的语法结构，自动处理复杂的类型转换和内存管理问题。

### SWIG处理多重继承的机制

#### 1. 自动类型映射

SWIG使用类型映射（Type Mapping）机制来处理C++类型到目标语言的转换：

```cpp
// C++ 多重继承类定义
class Base1 {
public:
    virtual void method1() = 0;
    virtual ~Base1() = default;
};

class Base2 {
public:
    virtual void method2() = 0;
    virtual ~Base2() = default;
};

class Derived : public Base1, public Base2 {
public:
    void method1() override { /* 实现 */ }
    void method2() override { /* 实现 */ }
};
```

```swig
// SWIG接口文件 (.i)
%module example

%{
#include "example.h"
%}

%include "example.h"

// 类型映射配置
%typemap(javabase) Base1 "java.lang.Object"
%typemap(javabase) Base2 "java.lang.Object"
%typemap(javabase) Derived "Base1, Base2"
```

#### 2. 自动生成包装类

SWIG会自动为每个C++类生成对应的包装类：

```java
// SWIG自动生成的Java包装类
public class Derived extends Base1 implements Base2 {
    private long swigCPtr;
    private boolean swigCMemOwn;
    
    public Derived() {
        this(exampleJNI.new_Derived(), true);
    }
    
    protected Derived(long cPtr, boolean cMemoryOwn) {
        super(exampleJNI.Derived_SWIGUpcast(cPtr), cMemoryOwn);
        swigCPtr = cPtr;
        swigCMemOwn = cMemoryOwn;
    }
    
    public void method1() {
        exampleJNI.Derived_method1(swigCPtr, this);
    }
    
    public void method2() {
        exampleJNI.Derived_method2(swigCPtr, this);
    }
}
```

### SWIG的解决方案策略

#### 1. 类型安全的包装器（Type-Safe Wrapper）

SWIG采用类型安全的包装器策略，而不是使用`void*`：

```cpp
// SWIG内部生成的C++包装代码
class SWIG_Derived : public Derived {
private:
    void* swig_self;
    
public:
    SWIG_Derived() : swig_self(nullptr) {}
    
    // 类型安全的指针获取
    template<typename T>
    T* get_interface() {
        return static_cast<T*>(this);
    }
    
    // 安全的类型转换
    Base1* as_Base1() {
        return static_cast<Base1*>(this);
    }
    
    Base2* as_Base2() {
        return static_cast<Base2*>(this);
    }
};
```

#### 2. 接口分离原则（Interface Segregation）

SWIG为每个基类接口生成独立的包装：

```java
// SWIG生成的接口分离
public abstract class Base1 extends java.lang.Object {
    protected long swigCPtr;
    protected boolean swigCMemOwn;
    
    protected Base1(long cPtr, boolean cMemoryOwn) {
        swigCPtr = cPtr;
        swigCMemOwn = cMemoryOwn;
    }
    
    public void method1() {
        exampleJNI.Base1_method1(swigCPtr, this);
    }
}

public abstract class Base2 extends java.lang.Object {
    protected long swigCPtr;
    protected boolean swigCMemOwn;
    
    protected Base2(long cPtr, boolean cMemoryOwn) {
        swigCPtr = cPtr;
        swigCMemOwn = cMemoryOwn;
    }
    
    public void method2() {
        exampleJNI.Base2_method2(swigCPtr, this);
    }
}
```

#### 3. 工厂模式创建接口

SWIG使用工厂模式来创建和管理接口实例：

```cpp
// SWIG内部工厂实现
class SWIG_InterfaceFactory {
public:
    template<typename T>
    static T* create_interface(void* ptr, const std::type_info& type) {
        // 根据类型信息创建正确的接口
        if (type == typeid(Derived)) {
            Derived* derived = static_cast<Derived*>(ptr);
            return static_cast<T*>(derived);
        }
        return nullptr;
    }
    
    static Base1* create_Base1_interface(void* ptr) {
        return create_interface<Base1>(ptr, typeid(*static_cast<Derived*>(ptr)));
    }
    
    static Base2* create_Base2_interface(void* ptr) {
        return create_interface<Base2>(ptr, typeid(*static_cast<Derived*>(ptr)));
    }
};
```

### SWIG处理虚继承的特殊机制

#### 1. 虚继承感知的类型转换

```cpp
// 虚继承场景
class VirtualBase {
public:
    virtual void method() = 0;
    virtual ~VirtualBase() = default;
};

class VirtualDerived1 : virtual public VirtualBase {
public:
    void method() override { /* 实现 */ }
};

class VirtualDerived2 : virtual public VirtualBase {
public:
    void method() override { /* 实现 */ }
};

class Final : public VirtualDerived1, public VirtualDerived2 {
public:
    void method() override { /* 实现 */ }
};
```

```swig
// SWIG虚继承处理
%module virtual_example

%{
#include "virtual_example.h"
%}

// 虚继承特殊处理
%feature("director") VirtualBase;
%feature("director") VirtualDerived1;
%feature("director") VirtualDerived2;

%include "virtual_example.h"
```

#### 2. 动态类型检查

SWIG为虚继承提供动态类型检查：

```java
// SWIG生成的虚继承安全代码
public class Final extends VirtualDerived1 implements VirtualDerived2 {
    private long swigCPtr;
    private boolean swigCMemOwn;
    
    protected Final(long cPtr, boolean cMemoryOwn) {
        super(exampleJNI.Final_SWIGUpcast(cPtr), cMemoryOwn);
        swigCPtr = cPtr;
        swigCMemOwn = cMemoryOwn;
    }
    
    // 安全的虚基类访问
    public VirtualBase as_VirtualBase() {
        long cPtr = exampleJNI.Final_as_VirtualBase(swigCPtr, this);
        return (cPtr == 0) ? null : new VirtualBase(cPtr, false);
    }
    
    public void method() {
        exampleJNI.Final_method(swigCPtr, this);
    }
}
```

### SWIG的JNI层实现

#### 1. 自动生成的JNI代码

```cpp
// SWIG生成的JNI代码
SWIGEXPORT jlong JNICALL Java_exampleJNI_new_1Derived(JNIEnv *jenv, jclass jcls) {
    jlong jresult = 0;
    Derived *result = 0;
    
    (void)jenv;
    (void)jcls;
    result = (Derived *)new Derived();
    *(Derived **)&jresult = result;
    return jresult;
}

SWIGEXPORT jlong JNICALL Java_exampleJNI_Derived_1SWIGUpcast(JNIEnv *jenv, jclass jcls, jlong jarg1) {
    jlong jresult = 0;
    Derived *arg1 = (Derived *) 0;
    Base1 *result = 0;
    
    (void)jenv;
    (void)jcls;
    arg1 = *(Derived **)&jarg1;
    result = (Base1 *)arg1;
    *(Base1 **)&jresult = result;
    return jresult;
}
```

#### 2. 类型安全的指针管理

```cpp
// SWIG的智能指针管理
class SWIG_PointerManager {
private:
    std::map<void*, int> reference_count;
    
public:
    template<typename T>
    T* add_reference(T* ptr) {
        if (ptr) {
            reference_count[ptr]++;
        }
        return ptr;
    }
    
    template<typename T>
    void remove_reference(T* ptr) {
        if (ptr && --reference_count[ptr] == 0) {
            delete ptr;
            reference_count.erase(ptr);
        }
    }
};
```

### SWIG的优势与局限性

#### 优势

1. **自动化程度高**：自动处理复杂的类型转换和内存管理
2. **类型安全**：使用类型安全的包装器而非`void*`
3. **多语言支持**：支持Java、Python、C#等多种语言
4. **虚继承支持**：能够正确处理虚继承的复杂情况
5. **性能优化**：生成的代码经过优化，性能较好

#### 局限性

1. **学习曲线**：需要学习SWIG的语法和配置
2. **调试困难**：生成的代码复杂，调试相对困难
3. **定制化限制**：某些特殊需求可能需要复杂的配置
4. **编译依赖**：需要额外的编译步骤和依赖

### SWIG配置最佳实践

#### 1. 接口文件配置

```swig
%module mymodule

// 启用异常处理
%exception {
    try {
        $action
    } catch (const std::exception& e) {
        SWIG_exception(SWIG_RuntimeError, e.what());
    }
}

// 类型映射配置
%typemap(javacode) Derived %{
    // 自定义Java代码
    public void customMethod() {
        // 实现自定义方法
    }
%}

%include "mymodule.h"
```

#### 2. 内存管理配置

```swig
// 智能指针支持
%include <std_shared_ptr.i>
%shared_ptr(Derived)

// 自定义内存管理
%typemap(javafinalize) Derived ""
%typemap(javadestruct) Derived {
    if (swigCPtr != 0) {
        if (swigCMemOwn) {
            swigCMemOwn = false;
            exampleJNI.delete_Derived(swigCPtr);
        }
        swigCPtr = 0;
    }
}
```

### 总结

SWIG采用了**综合策略**来解决C++多重继承的接口适配问题：

1. **类型安全的包装器**：避免使用`void*`，使用类型安全的模板包装器
2. **接口分离原则**：为每个基类生成独立的包装类
3. **工厂模式**：使用工厂模式创建和管理接口实例
4. **动态类型检查**：为虚继承提供运行时类型检查
5. **智能内存管理**：自动处理对象生命周期和引用计数

SWIG的解决方案相比手动实现具有以下优势：
- **自动化程度高**：减少手动编写包装代码的工作量
- **类型安全性好**：自动处理复杂的类型转换
- **维护成本低**：接口变更时自动更新绑定代码
- **多语言支持**：一套配置支持多种目标语言

对于复杂的C++多重继承项目，SWIG是一个值得考虑的解决方案，特别是当需要支持多种目标语言时。

## 实际案例：基于void*的改进方案

### 问题代码分析

以下是一个实际使用`void*`存储指针的代码示例：

```cpp
template<typename OBJ_WRAP>
class CODE_GEN_BASE_OBJ : public Djsi::ObjectWrap<OBJ_WRAP>,
                          public std::enable_shared_from_this<CODE_GEN_BASE_OBJ<OBJ_WRAP>> {
public:
    void *self;  // 问题：使用void*存储指针
    bool owned;
    Code_gen_type_info *info;
    
    CODE_GEN_BASE_OBJ(const Djsi::CallbackInfo &info);
    void AttachClientData(const Djsi::CallbackInfo &info);
    void Then(const Djsi::CallbackInfo &info);
    void Cast(const Djsi::CallbackInfo &info);
    void Owned(const Djsi::CallbackInfo &info);
    Djsi::Value Equal(const Djsi::CallbackInfo &info);
    virtual ~CODE_GEN_BASE_OBJ() = default;
    
    std::shared_ptr<CODE_GEN_BASE_OBJ> ObjSharedPtr() {
        return std::enable_shared_from_this<CODE_GEN_BASE_OBJ<OBJ_WRAP>>::shared_from_this();
    }
    
public:
    void * client_data_ = nullptr;
    Djsi::Value then_;
    std::atomic<bool> ready = false;
    
public:
    static void GetMembers(std::vector<Djsi::PropertyDescriptor<OBJ_WRAP>> &symbolTable);
};
```

### 最小改动解决方案

#### 方案1：类型信息增强（推荐）

在保持`void* self`的基础上，添加类型信息来支持安全的类型转换：

```cpp
template<typename OBJ_WRAP>
class CODE_GEN_BASE_OBJ : public Djsi::ObjectWrap<OBJ_WRAP>,
                          public std::enable_shared_from_this<CODE_GEN_BASE_OBJ<OBJ_WRAP>> {
public:
    void *self;  // 保持原有接口
    bool owned;
    Code_gen_type_info *info;
    
    // 新增：类型信息存储
    std::type_info* original_type;
    
    CODE_GEN_BASE_OBJ(const Djsi::CallbackInfo &info);
    virtual ~CODE_GEN_BASE_OBJ() = default;
    
    // 新增：安全的类型转换方法
    template<typename T>
    T* safe_cast() {
        if (original_type && *original_type == typeid(T)) {
            return static_cast<T*>(self);
        }
        return nullptr;
    }
    
    template<typename T>
    bool can_cast() const {
        return original_type && *original_type == typeid(T);
    }
    
    // 新增：类型安全的接口获取
    template<typename T>
    T* get_interface() {
        if (can_cast<T>()) {
            return safe_cast<T>();
        }
        // 尝试dynamic_cast（如果支持RTTI）
        return dynamic_cast<T*>(static_cast<void*>(self));
    }
    
    // 原有方法保持不变
    void AttachClientData(const Djsi::CallbackInfo &info);
    void Then(const Djsi::CallbackInfo &info);
    void Cast(const Djsi::CallbackInfo &info);
    void Owned(const Djsi::CallbackInfo &info);
    Djsi::Value Equal(const Djsi::CallbackInfo &info);
    
    std::shared_ptr<CODE_GEN_BASE_OBJ> ObjSharedPtr() {
        return std::enable_shared_from_this<CODE_GEN_BASE_OBJ<OBJ_WRAP>>::shared_from_this();
    }
    
public:
    void * client_data_ = nullptr;
    Djsi::Value then_;
    std::atomic<bool> ready = false;
    
public:
    static void GetMembers(std::vector<Djsi::PropertyDescriptor<OBJ_WRAP>> &symbolTable);
};
```

#### 方案2：模板化存储（改动稍大但更安全）

```cpp
template<typename OBJ_WRAP, typename STORED_TYPE = void>
class CODE_GEN_BASE_OBJ : public Djsi::ObjectWrap<OBJ_WRAP>,
                          public std::enable_shared_from_this<CODE_GEN_BASE_OBJ<OBJ_WRAP, STORED_TYPE>> {
public:
    // 使用模板化存储替代void*
    STORED_TYPE* self;
    bool owned;
    Code_gen_type_info *info;
    
    CODE_GEN_BASE_OBJ(const Djsi::CallbackInfo &info);
    virtual ~CODE_GEN_BASE_OBJ() = default;
    
    // 类型安全的转换
    template<typename T>
    T* cast() {
        if constexpr (std::is_base_of_v<T, STORED_TYPE>) {
            return static_cast<T*>(self);
        } else {
            return dynamic_cast<T*>(self);
        }
    }
    
    // 兼容原有void*接口
    void* get_raw_ptr() { return static_cast<void*>(self); }
    
    // 原有方法保持不变
    void AttachClientData(const Djsi::CallbackInfo &info);
    void Then(const Djsi::CallbackInfo &info);
    void Cast(const Djsi::CallbackInfo &info);
    void Owned(const Djsi::CallbackInfo &info);
    Djsi::Value Equal(const Djsi::CallbackInfo &info);
    
    std::shared_ptr<CODE_GEN_BASE_OBJ> ObjSharedPtr() {
        return std::enable_shared_from_this<CODE_GEN_BASE_OBJ<OBJ_WRAP, STORED_TYPE>>::shared_from_this();
    }
    
public:
    void * client_data_ = nullptr;
    Djsi::Value then_;
    std::atomic<bool> ready = false;
    
public:
    static void GetMembers(std::vector<Djsi::PropertyDescriptor<OBJ_WRAP>> &symbolTable);
};
```

#### 方案3：智能指针包装（最安全但改动最大）

```cpp
template<typename OBJ_WRAP>
class CODE_GEN_BASE_OBJ : public Djsi::ObjectWrap<OBJ_WRAP>,
                          public std::enable_shared_from_this<CODE_GEN_BASE_OBJ<OBJ_WRAP>> {
public:
    // 使用智能指针管理
    std::shared_ptr<void> self_ptr;
    bool owned;
    Code_gen_type_info *info;
    
    CODE_GEN_BASE_OBJ(const Djsi::CallbackInfo &info);
    virtual ~CODE_GEN_BASE_OBJ() = default;
    
    // 兼容原有void*接口
    void* get_self() { return self_ptr.get(); }
    
    // 类型安全的访问
    template<typename T>
    std::shared_ptr<T> get_typed_ptr() {
        return std::static_pointer_cast<T>(self_ptr);
    }
    
    template<typename T>
    T* cast() {
        return static_cast<T*>(self_ptr.get());
    }
    
    // 原有方法保持不变
    void AttachClientData(const Djsi::CallbackInfo &info);
    void Then(const Djsi::CallbackInfo &info);
    void Cast(const Djsi::CallbackInfo &info);
    void Owned(const Djsi::CallbackInfo &info);
    Djsi::Value Equal(const Djsi::CallbackInfo &info);
    
    std::shared_ptr<CODE_GEN_BASE_OBJ> ObjSharedPtr() {
        return std::enable_shared_from_this<CODE_GEN_BASE_OBJ<OBJ_WRAP>>::shared_from_this();
    }
    
public:
    void * client_data_ = nullptr;
    Djsi::Value then_;
    std::atomic<bool> ready = false;
    
public:
    static void GetMembers(std::vector<Djsi::PropertyDescriptor<OBJ_WRAP>> &symbolTable);
};
```

### 改进后的Cast方法实现

```cpp
template<typename OBJ_WRAP>
void CODE_GEN_BASE_OBJ<OBJ_WRAP>::Cast(const Djsi::CallbackInfo &info) {
    if (info.Length() < 1) {
        info.GetReturnValue().Set(Djsi::Value::Undefined());
        return;
    }
    
    // 获取目标类型名称
    std::string target_type = info[0].As<Djsi::String>();
    
    // 使用类型安全的转换
    if (target_type == "Base1") {
        if (auto* base1 = get_interface<Base1>()) {
            // 创建新的包装对象
            auto wrapper = std::make_shared<CODE_GEN_BASE_OBJ<OBJ_WRAP>>(info);
            wrapper->self = base1;
            wrapper->owned = false;  // 不拥有对象
            wrapper->info = get_type_info<Base1>();
            info.GetReturnValue().Set(wrapper->ObjSharedPtr());
            return;
        }
    }
    else if (target_type == "Base2") {
        if (auto* base2 = get_interface<Base2>()) {
            auto wrapper = std::make_shared<CODE_GEN_BASE_OBJ<OBJ_WRAP>>(info);
            wrapper->self = base2;
            wrapper->owned = false;
            wrapper->info = get_type_info<Base2>();
            info.GetReturnValue().Set(wrapper->ObjSharedPtr());
            return;
        }
    }
    
    // 转换失败
    info.GetReturnValue().Set(Djsi::Value::Undefined());
}
```

### 构造函数改进

```cpp
template<typename OBJ_WRAP>
CODE_GEN_BASE_OBJ<OBJ_WRAP>::CODE_GEN_BASE_OBJ(const Djsi::CallbackInfo &info) {
    // 存储原始类型信息
    if (self) {
        original_type = &typeid(*static_cast<void*>(self));
    }
    
    // 其他初始化代码...
}
```

### 使用示例

```cpp
// 使用改进后的类型安全接口
auto obj = std::make_shared<CODE_GEN_BASE_OBJ<MyWrapper>>(info);

// 安全的类型转换
if (auto* base1 = obj->get_interface<Base1>()) {
    base1->method1();
}

if (auto* base2 = obj->get_interface<Base2>()) {
    base2->method2();
}

// 检查类型转换是否可能
if (obj->can_cast<Base1>()) {
    // 安全的转换
    auto* base1 = obj->safe_cast<Base1>();
    // 使用base1...
}
```

### 方案对比

| 方案 | 改动程度 | 类型安全性 | 性能影响 | 兼容性 |
|------|----------|------------|----------|--------|
| 方案1（类型信息增强） | 最小 | 中等 | 低 | 高 |
| 方案2（模板化存储） | 中等 | 高 | 低 | 中等 |
| 方案3（智能指针包装） | 最大 | 最高 | 中等 | 低 |

### 推荐方案

**推荐使用方案1（类型信息增强）**，原因如下：

1. **改动最小**：保持原有的`void* self`接口
2. **向后兼容**：现有代码无需大幅修改
3. **渐进式改进**：可以逐步替换不安全的类型转换
4. **性能影响小**：只增加类型信息存储的开销

### 实施步骤

1. **第一步**：添加类型信息存储和安全的转换方法
2. **第二步**：逐步替换现有的不安全的`static_cast`调用
3. **第三步**：在Cast方法中使用类型安全的转换
4. **第四步**：添加运行时类型检查

这种方案既解决了类型安全问题，又保持了代码的兼容性，是一个相对改动较小的改进方案。

## 无RTTI环境下的方案重新分析

### RTTI限制的影响

在不开启RTTI（Runtime Type Information）的环境下，`std::type_info`、`typeid`、`dynamic_cast`等特性都无法使用，这会对我们的解决方案产生重要影响。

#### 方案1在无RTTI环境下的问题

```cpp
// 方案1在无RTTI环境下无法工作
template<typename OBJ_WRAP>
class CODE_GEN_BASE_OBJ : public Djsi::ObjectWrap<OBJ_WRAP>,
                          public std::enable_shared_from_this<CODE_GEN_BASE_OBJ<OBJ_WRAP>> {
public:
    void *self;
    bool owned;
    Code_gen_type_info *info;
    
    // 问题：在无RTTI环境下，这些都无法使用
    std::type_info* original_type;  // ❌ 无法获取
    
    template<typename T>
    T* safe_cast() {
        // ❌ typeid无法使用
        if (original_type && *original_type == typeid(T)) {
            return static_cast<T*>(self);
        }
        return nullptr;
    }
    
    template<typename T>
    T* get_interface() {
        if (can_cast<T>()) {
            return safe_cast<T>();
        }
        // ❌ dynamic_cast无法使用
        return dynamic_cast<T*>(static_cast<void*>(self));
    }
};
```

### 无RTTI环境下的改进方案

#### 方案1改进：手动类型标识

```cpp
template<typename OBJ_WRAP>
class CODE_GEN_BASE_OBJ : public Djsi::ObjectWrap<OBJ_WRAP>,
                          public std::enable_shared_from_this<CODE_GEN_BASE_OBJ<OBJ_WRAP>> {
public:
    void *self;
    bool owned;
    Code_gen_type_info *info;
    
    // 使用枚举替代type_info
    enum class ObjectType {
        UNKNOWN,
        BASE1,
        BASE2,
        DERIVED,
        // 根据需要添加更多类型
    };
    
    ObjectType object_type;
    
    CODE_GEN_BASE_OBJ(const Djsi::CallbackInfo &info);
    virtual ~CODE_GEN_BASE_OBJ() = default;
    
    // 手动类型检查
    template<typename T>
    bool can_cast() const {
        if constexpr (std::is_same_v<T, Base1>) {
            return object_type == ObjectType::BASE1 || 
                   object_type == ObjectType::DERIVED;
        }
        else if constexpr (std::is_same_v<T, Base2>) {
            return object_type == ObjectType::BASE2 || 
                   object_type == ObjectType::DERIVED;
        }
        else if constexpr (std::is_same_v<T, Derived>) {
            return object_type == ObjectType::DERIVED;
        }
        return false;
    }
    
    // 安全的类型转换
    template<typename T>
    T* safe_cast() {
        if (can_cast<T>()) {
            return static_cast<T*>(self);
        }
        return nullptr;
    }
    
    // 类型安全的接口获取
    template<typename T>
    T* get_interface() {
        return safe_cast<T>();
    }
    
    // 设置对象类型
    void set_object_type(ObjectType type) {
        object_type = type;
    }
    
    // 原有方法保持不变
    void AttachClientData(const Djsi::CallbackInfo &info);
    void Then(const Djsi::CallbackInfo &info);
    void Cast(const Djsi::CallbackInfo &info);
    void Owned(const Djsi::CallbackInfo &info);
    Djsi::Value Equal(const Djsi::CallbackInfo &info);
    
    std::shared_ptr<CODE_GEN_BASE_OBJ> ObjSharedPtr() {
        return std::enable_shared_from_this<CODE_GEN_BASE_OBJ<OBJ_WRAP>>::shared_from_this();
    }
    
public:
    void * client_data_ = nullptr;
    Djsi::Value then_;
    std::atomic<bool> ready = false;
    
public:
    static void GetMembers(std::vector<Djsi::PropertyDescriptor<OBJ_WRAP>> &symbolTable);
};
```

#### 方案2改进：编译时类型检查

```cpp
template<typename OBJ_WRAP, typename STORED_TYPE = void>
class CODE_GEN_BASE_OBJ : public Djsi::ObjectWrap<OBJ_WRAP>,
                          public std::enable_shared_from_this<CODE_GEN_BASE_OBJ<OBJ_WRAP, STORED_TYPE>> {
public:
    STORED_TYPE* self;
    bool owned;
    Code_gen_type_info *info;
    
    CODE_GEN_BASE_OBJ(const Djsi::CallbackInfo &info);
    virtual ~CODE_GEN_BASE_OBJ() = default;
    
    // 编译时类型检查
    template<typename T>
    T* cast() {
        if constexpr (std::is_base_of_v<T, STORED_TYPE>) {
            return static_cast<T*>(self);
        } else {
            // 在无RTTI环境下，无法使用dynamic_cast
            // 返回nullptr或抛出异常
            return nullptr;
        }
    }
    
    // 编译时类型检查
    template<typename T>
    bool can_cast() const {
        return std::is_base_of_v<T, STORED_TYPE>;
    }
    
    // 兼容原有void*接口
    void* get_raw_ptr() { return static_cast<void*>(self); }
    
    // 原有方法保持不变
    void AttachClientData(const Djsi::CallbackInfo &info);
    void Then(const Djsi::CallbackInfo &info);
    void Cast(const Djsi::CallbackInfo &info);
    void Owned(const Djsi::CallbackInfo &info);
    Djsi::Value Equal(const Djsi::CallbackInfo &info);
    
    std::shared_ptr<CODE_GEN_BASE_OBJ> ObjSharedPtr() {
        return std::enable_shared_from_this<CODE_GEN_BASE_OBJ<OBJ_WRAP, STORED_TYPE>>::shared_from_this();
    }
    
public:
    void * client_data_ = nullptr;
    Djsi::Value then_;
    std::atomic<bool> ready = false;
    
public:
    static void GetMembers(std::vector<Djsi::PropertyDescriptor<OBJ_WRAP>> &symbolTable);
};
```

#### 方案3改进：类型擦除的智能指针

```cpp
template<typename OBJ_WRAP>
class CODE_GEN_BASE_OBJ : public Djsi::ObjectWrap<OBJ_WRAP>,
                          public std::enable_shared_from_this<CODE_GEN_BASE_OBJ<OBJ_WRAP>> {
public:
    // 类型擦除的智能指针
    struct TypeErasedPtr {
        void* ptr;
        void (*deleter)(void*);
        
        template<typename T>
        TypeErasedPtr(T* p) : ptr(p), deleter([](void* p) { delete static_cast<T*>(p); }) {}
        
        ~TypeErasedPtr() {
            if (ptr && deleter) {
                deleter(ptr);
            }
        }
    };
    
    std::shared_ptr<TypeErasedPtr> self_ptr;
    bool owned;
    Code_gen_type_info *info;
    
    CODE_GEN_BASE_OBJ(const Djsi::CallbackInfo &info);
    virtual ~CODE_GEN_BASE_OBJ() = default;
    
    // 兼容原有void*接口
    void* get_self() { return self_ptr ? self_ptr->ptr : nullptr; }
    
    // 类型安全的访问（需要手动指定类型）
    template<typename T>
    T* cast() {
        if (self_ptr) {
            return static_cast<T*>(self_ptr->ptr);
        }
        return nullptr;
    }
    
    // 原有方法保持不变
    void AttachClientData(const Djsi::CallbackInfo &info);
    void Then(const Djsi::CallbackInfo &info);
    void Cast(const Djsi::CallbackInfo &info);
    void Owned(const Djsi::CallbackInfo &info);
    Djsi::Value Equal(const Djsi::CallbackInfo &info);
    
    std::shared_ptr<CODE_GEN_BASE_OBJ> ObjSharedPtr() {
        return std::enable_shared_from_this<CODE_GEN_BASE_OBJ<OBJ_WRAP>>::shared_from_this();
    }
    
public:
    void * client_data_ = nullptr;
    Djsi::Value then_;
    std::atomic<bool> ready = false;
    
public:
    static void GetMembers(std::vector<Djsi::PropertyDescriptor<OBJ_WRAP>> &symbolTable);
};
```

### 无RTTI环境下的构造函数实现

#### 方案1的构造函数

```cpp
template<typename OBJ_WRAP>
CODE_GEN_BASE_OBJ<OBJ_WRAP>::CODE_GEN_BASE_OBJ(const Djsi::CallbackInfo &info) {
    // 需要手动设置对象类型
    object_type = ObjectType::UNKNOWN;
    
    // 根据实际创建的对象类型设置
    // 这需要在创建对象时明确指定
}

// 工厂方法
template<typename OBJ_WRAP>
std::shared_ptr<CODE_GEN_BASE_OBJ<OBJ_WRAP>> 
create_wrapper(Base1* obj, const Djsi::CallbackInfo &info) {
    auto wrapper = std::make_shared<CODE_GEN_BASE_OBJ<OBJ_WRAP>>(info);
    wrapper->self = obj;
    wrapper->set_object_type(CODE_GEN_BASE_OBJ<OBJ_WRAP>::ObjectType::BASE1);
    return wrapper;
}

template<typename OBJ_WRAP>
std::shared_ptr<CODE_GEN_BASE_OBJ<OBJ_WRAP>> 
create_wrapper(Base2* obj, const Djsi::CallbackInfo &info) {
    auto wrapper = std::make_shared<CODE_GEN_BASE_OBJ<OBJ_WRAP>>(info);
    wrapper->self = obj;
    wrapper->set_object_type(CODE_GEN_BASE_OBJ<OBJ_WRAP>::ObjectType::BASE2);
    return wrapper;
}
```

#### 方案2的构造函数

```cpp
template<typename OBJ_WRAP, typename STORED_TYPE>
CODE_GEN_BASE_OBJ<OBJ_WRAP, STORED_TYPE>::CODE_GEN_BASE_OBJ(const Djsi::CallbackInfo &info) {
    // 模板参数已经确定了存储类型
    // 编译时就能确定类型关系
}

// 使用示例
auto wrapper1 = std::make_shared<CODE_GEN_BASE_OBJ<MyWrapper, Base1>>(info);
auto wrapper2 = std::make_shared<CODE_GEN_BASE_OBJ<MyWrapper, Base2>>(info);
auto wrapper3 = std::make_shared<CODE_GEN_BASE_OBJ<MyWrapper, Derived>>(info);
```

### 无RTTI环境下的Cast方法实现

```cpp
template<typename OBJ_WRAP>
void CODE_GEN_BASE_OBJ<OBJ_WRAP>::Cast(const Djsi::CallbackInfo &info) {
    if (info.Length() < 1) {
        info.GetReturnValue().Set(Djsi::Value::Undefined());
        return;
    }
    
    std::string target_type = info[0].As<Djsi::String>();
    
    // 方案1：使用手动类型检查
    if (target_type == "Base1") {
        if (can_cast<Base1>()) {
            auto* base1 = safe_cast<Base1>();
            auto wrapper = std::make_shared<CODE_GEN_BASE_OBJ<OBJ_WRAP>>(info);
            wrapper->self = base1;
            wrapper->set_object_type(ObjectType::BASE1);
            wrapper->owned = false;
            info.GetReturnValue().Set(wrapper->ObjSharedPtr());
            return;
        }
    }
    else if (target_type == "Base2") {
        if (can_cast<Base2>()) {
            auto* base2 = safe_cast<Base2>();
            auto wrapper = std::make_shared<CODE_GEN_BASE_OBJ<OBJ_WRAP>>(info);
            wrapper->self = base2;
            wrapper->set_object_type(ObjectType::BASE2);
            wrapper->owned = false;
            info.GetReturnValue().Set(wrapper->ObjSharedPtr());
            return;
        }
    }
    
    info.GetReturnValue().Set(Djsi::Value::Undefined());
}
```

### 无RTTI环境下的方案对比

| 方案 | RTTI依赖 | 类型安全性 | 实现复杂度 | 性能 | 兼容性 |
|------|----------|------------|------------|------|--------|
| 方案1（手动类型标识） | 无 | 中等 | 中等 | 高 | 高 |
| 方案2（编译时检查） | 无 | 高 | 低 | 最高 | 中等 |
| 方案3（类型擦除） | 无 | 中等 | 高 | 中等 | 中等 |

### 无RTTI环境下的推荐方案

**在无RTTI环境下，推荐使用方案2（编译时类型检查）**，原因如下：

1. **无RTTI依赖**：完全基于编译时类型检查
2. **类型安全性高**：编译时就能发现类型错误
3. **性能最好**：无运行时开销
4. **实现简单**：利用C++模板特性

#### 方案2的使用示例

```cpp
// 为不同类型创建专门的包装器
using Base1Wrapper = CODE_GEN_BASE_OBJ<MyWrapper, Base1>;
using Base2Wrapper = CODE_GEN_BASE_OBJ<MyWrapper, Base2>;
using DerivedWrapper = CODE_GEN_BASE_OBJ<MyWrapper, Derived>;

// 使用示例
auto base1_obj = std::make_shared<Base1Wrapper>(info);
auto base2_obj = std::make_shared<Base2Wrapper>(info);
auto derived_obj = std::make_shared<DerivedWrapper>(info);

// 编译时类型检查
if (auto* base1 = base1_obj->cast<Base1>()) {
    base1->method1();  // 编译时确保类型正确
}
```

### 总结

在无RTTI环境下：

1. **方案1**需要手动管理类型信息，实现复杂度增加
2. **方案2**成为最佳选择，利用编译时类型检查
3. **方案3**仍然可行，但实现复杂度较高

**最终推荐**：如果项目不开启RTTI，建议使用**方案2（编译时类型检查）**，它提供了最好的类型安全性和性能。

---

*本文分析了C++多重继承在跨语言接口适配中的技术难点，希望对相关开发者有所帮助。* 
