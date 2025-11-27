---
layout:     post
title:      Java中的布尔类型
subtitle:   不可以与int进行类型转换
date:       2025-11-12
author:     jack
header-img: img/post-bg-ios9-web.jpg
catalog: true
tags:
    - iOS
---

          
Java 中的 `boolean` 与数值类型（`int` 等）是不同的原始类型，语言层面既不允许隐式转换，也不允许显式强制转换。

- 不允许的示例
  - `int i = true;`、`boolean b = 1;`、`b = (boolean) 1;` 都会编译报错
  - `if (1) {}` 在 Java 中非法（不同于 C/C++），只能 `if (b)` 或 `if (表达式为 boolean)`

- 设计原因
  - `boolean` 仅表示真假，不是 0/1；Java 强类型、拒绝将布尔视为数值，避免隐蔽错误

- 正确的转换方式
  - `boolean → int`：`int x = b ? 1 : 0;`
  - `int → boolean`：`boolean b = x != 0;`（或按语义 `x > 0`、`x == 1`）
  - `String → boolean`：`Boolean.parseBoolean(s)`（仅当 `s.equalsIgnoreCase("true")` 时为 `true`）

- 拓展说明
  - 包装类型也不互转：`Boolean` 与 `Integer` 之间无自动或显式转换
  - JVM 字节码层面布尔常以 `int` 形式参与计算栈，但这是实现细节，语言层面仍严格区分类型，不能依赖该细节进行数值运算

如果你在与数据库、NDK 或旧接口对接时需要 0/1 表示布尔，按上面的方式在边界处显式转换即可。
        