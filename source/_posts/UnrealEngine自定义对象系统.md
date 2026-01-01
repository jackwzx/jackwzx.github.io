---
title: Unreal Engine (UE) 之所以强大，很大程度上归功于其构建在 C++ 之上的一套**自定义对象系统**。
date: 2025-12-16 13:10:33
published: true
tags:
---

Unreal Engine (UE) 之所以强大，很大程度上归功于其构建在 C++ 之上的一套**自定义对象系统**。C++ 标准本身缺乏运行时反射（Reflection）和自动内存管理（GC），因此 Epic Games 自己实现了一套名为 **Unreal Object Handling** 的系统。

这套系统的核心由 **Unreal Header Tool (UHT)**、**UObject**、**反射系统** 和 **序列化系统** 组成。

---

### 一、 核心机制：Unreal Header Tool (UHT)

在深入具体功能之前，必须理解 UE 是如何“扩展”C++ 的。

**实现原理：**
1.  **宏标记**：开发者在头文件（.h）中使用特定的宏，如 `UCLASS()`, `UPROPERTY()`, `UFUNCTION()`, `GENERATED_BODY()`。
2.  **预处理**：在标准 C++ 编译器（如 MSVC, Clang）运行之前，**UHT** 会先解析项目中的头文件。
3.  **代码生成**：UHT 识别出这些宏，并生成对应的 `.gen.cpp` 和 `.generated.h` 文件。这些文件包含了注册类型、获取偏移量、构建反射数据所需的“胶水代码”。
4.  **编译**：最后，C++ 编译器将用户写的代码和 UHT 生成的代码一起编译。

---

### 二、 类型系统 (Type System) & 反射 (Reflection)

UE 的反射系统允许在运行时查询类型信息（比如“这个对象有哪些变量？”“这个函数叫什么名字？”）。这是蓝图（Blueprints）、网络复制、编辑器属性面板和垃圾回收的基础。

#### 1. 基础能力
*   **运行时类型识别 (RTTI)**：比 C++ 标准的 RTTI 更强大，支持 `Cast<T>()`，`IsA()` 等。
*   **动态调用**：可以通过字符串名字调用函数（`ProcessEvent`）。
*   **属性访问**：可以通过字符串名字读写变量。
*   **蓝图集成**：将 C++ 暴露给脚本环境。

#### 2. 实现方式

**A. 类型层级 (UClass, UScriptStruct, UEnum)**
所有参与反射的类都继承自 `UObject`。每个类在运行时都有一个对应的 `UClass` 对象（元类），它描述了这个类的结构。
*   **`UClass`**：存储了类的名字、父类、函数列表（`UFunction`）、属性列表（`FProperty`）以及 CDO（类默认对象）。

**B. 属性描述 (FProperty)**
在 UE4.25 之前叫 `UProperty`，后优化为 `FProperty`（非 UObject，轻量级）。
*   每个被 `UPROPERTY()` 标记的变量，UHT 都会生成一个对应的 `FProperty` 实例（如 `FIntProperty`, `FObjectProperty`）。
*   **实现关键 - 内存偏移 (Offset)**：反射系统并不魔幻，它访问变量的核心原理是**指针 + 偏移量**。UHT 会计算出某个变量相对于对象 `this` 指针的内存偏移量。
    ```cpp
    // 伪代码概念
    void* ValueAddress = (uint8*)MyObjectInstance + Property->Offset_Internal;
    ```

**C. 注册机制 (StaticClass)**
`GENERATED_BODY()` 宏会注入一个静态函数 `StaticClass()`。在引擎启动时（`Main` 函数之前），通过 C++ 的静态初始化机制，系统会构建出所有的 `UClass` 树，并将生成的 `FProperty` 链表挂载到对应的 `UClass` 上。

**D. CDO (Class Default Object)**
每个 `UClass` 在内存中都维护一个**类默认对象 (CDO)**。这是一个完全初始化好的该类的实例。
*   **作用**：作为模板。当 `SpawnActor` 或 `NewObject` 时，系统会通过 `memcpy` 或序列化 CDO 来快速初始化新对象，而不是从零构造。

---

### 三、 序列化 (Serialization)

序列化是将对象的状态转换为字节流（用于存储到磁盘或网络传输），反之亦然。UE 的序列化高度依赖反射系统。

#### 1. 基础能力
*   **Asset 存储**：将资源保存为 `.uasset` / `.umap`。
*   **SaveGame**：保存游戏进度。
*   **网络复制**：将变量同步到客户端。
*   **版本控制**：支持向后兼容（加载旧版本的资源）。

#### 2. 实现方式

**A. FArchive**
`FArchive` 是核心基类，重载了 `<<` 操作符。它既可以代表读取（Loading），也可以代表写入（Saving）。
```cpp
// 典型的序列化代码
void MyClass::Serialize(FArchive& Ar) {
    Super::Serialize(Ar);
    Ar << MyIntVariable;
    Ar << MyStringVariable;
}
```

**B. 结构化序列化 (Tagged Property Serialization)**
这是 `.uasset` 的主要存储方式。UE 不只是简单地转储二进制块，而是**基于反射**进行保存。
*   **流程**：
    1.  遍历对象的所有 `UPROPERTY`。
    2.  对比当前值与 CDO（默认值）是否一致。
    3.  **只保存与默认值不同的变量**（Delta Serialization）。这极大地节省了空间。
    4.  保存格式为：`[属性名] [类型] [大小] [值]`。
*   **优势**：因为保存了属性名，即使你后来在 C++ 中删除了中间某个变量，或者打乱了变量顺序，加载时依然能通过名字匹配正确恢复数据，不会导致错位。

**C. 链接器 (LinkerLoad / LinkerSave)**
对于复杂的资源加载（如加载一个引用了贴图、材质、声音的关卡），UE 使用 Linker 表。
*   **Import Table**：记录此包依赖的外部资源。
*   **Export Table**：记录此包内部定义的资源。
*   加载时，Linker 会先加载依赖项（Import），然后通过反射构建对象并反序列化数据。

---

### 四、 垃圾回收 (Garbage Collection)

UE 使用追踪式 GC，而不是 C++ 的 RAII 或智能指针（尽管现在也有 `TSharedPtr`，但 `UObject` 依然归 GC 管）。

#### 1. 基础能力
*   自动管理 `UObject` 生命周期。
*   处理循环引用。
*   防止野指针（通过 `IsValid` 或 `TWeakObjectPtr`）。

#### 2. 实现方式

**A. 标记-清除 (Mark-and-Sweep)**
1.  **Root Set (根集合)**：GC 从一组根对象开始（例如被添加到 Root 的对象、当前关卡、玩家控制器）。
2.  **Reachability Analysis (可达性分析)**：
    *   利用**反射系统**。GC 遍历根对象的 `UPROPERTY`（必须是 `UObject*` 类型），找到引用的子对象。
    *   递归重复此过程，标记所有“可达”的对象。
3.  **Sweep (清除)**：遍历全局 `UObject` 列表（`GUObjectArray`），销毁那些**未被标记**的对象（即不可达对象）。

**B. 增量与集群 (Incremental & Clustering)**
为了避免 GC 导致游戏卡顿（Stop-the-world）：
*   **增量 GC**：将标记过程分摊到多帧进行。
*   **GC Cluster**：将粒子系统或材质实例等大量生命周期绑定的小对象视为一个簇，要么一起活，要么一起死，减少遍历开销。

---

### 总结：数据流向图

为了把这些串起来，想象创建并保存一个 Actor 的过程：

1.  **编写代码**：你写了 `AMyActor`，里面有个 `UPROPERTY() int32 Health;`。
2.  **编译时**：**UHT** 分析代码，生成反射数据（记录 `Health` 叫什么，偏移量是多少，类型是 Int）。
3.  **运行时启动**：引擎利用反射数据构建 `UClass`，并实例化一个 `CDO`。
4.  **生成对象**：`SpawnActor` 复制 CDO 的内存来创建 `MyActorInstance`。
5.  **修改属性**：你在蓝图中修改 `Health` 为 100。蓝图虚拟机通过反射找到 `Health` 的内存地址并写入值。
6.  **垃圾回收**：GC 扫描发现这个 Actor 被关卡引用（通过反射指针），标记为存活。
7.  **保存游戏**：
    *   创建 `FArchive`。
    *   序列化系统遍历 `MyActorInstance` 的所有属性。
    *   发现 `Health` (100) 与 CDO 的 `Health` (默认值) 不同。
    *   将 `"Health": 100` 写入磁盘。

这就是 UE 能够实现如此高度动态化、既像 C++ 又像脚本语言特性的底层奥秘。
