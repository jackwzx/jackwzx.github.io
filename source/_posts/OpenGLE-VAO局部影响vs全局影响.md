---
title: OpenGLE_VAO局部影响vs全局影响
date: 2024-07-28 16:57:48
tags:
---


### 全局顶点属性数组使能状态

`glEnableVertexAttribArray` 和 `glDisableVertexAttribArray` 确实是全局状态。这意味着在不使用 VAO 的情况下，启用或禁用特定的顶点属性数组会影响所有后续的绘制调用，直到该状态被改变。例如：

```c
// 启用顶点属性数组索引 0
glEnableVertexAttribArray(0);

// 进行绘制调用，使用索引 0 的顶点属性数组
glDrawArrays(GL_TRIANGLES, 0, 3);

// 禁用顶点属性数组索引 0
glDisableVertexAttribArray(0);

// 再次进行绘制调用，此时索引 0 的顶点属性数组将不会被使用
glDrawArrays(GL_TRIANGLES, 0, 3);
```

### 顶点数组对象（VAO）

当使用 VAO 时，`glEnableVertexAttribArray` 和 `glVertexAttribPointer` 等顶点属性相关的状态是存储在 VAO 中的。这意味着当你绑定一个 VAO 时，它会恢复之前存储的所有顶点属性状态，包括哪些属性数组是启用的。这样，每个 VAO 可以拥有自己独立的顶点属性配置。例如：

```c
// 创建并绑定第一个 VAO
GLuint vao1;
glGenVertexArrays(1, &vao1);
glBindVertexArray(vao1);

// 设置顶点属性指针和启用顶点属性数组
glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, 3 * sizeof(GLfloat), (void*)0);
glEnableVertexAttribArray(0);

// 解绑 VAO
glBindVertexArray(0);

// 创建并绑定第二个 VAO
GLuint vao2;
glGenVertexArrays(1, &vao2);
glBindVertexArray(vao2);

// 设置不同的顶点属性指针和启用顶点属性数组
glVertexAttribPointer(1, 2, GL_FLOAT, GL_FALSE, 2 * sizeof(GLfloat), (void*)0);
glEnableVertexAttribArray(1);

// 解绑 VAO
glBindVertexArray(0);

// 使用第一个 VAO 进行绘制
glBindVertexArray(vao1);
glDrawArrays(GL_TRIANGLES, 0, 3);

// 使用第二个 VAO 进行绘制
glBindVertexArray(vao2);
glDrawArrays(GL_TRIANGLES, 0, 3);
```

在这个例子中：

- `vao1` 存储了顶点属性索引 0 的配置和使能状态。
- `vao2` 存储了顶点属性索引 1 的配置和使能状态。

绑定 `vao1` 会恢复其配置和状态，绑定 `vao2` 则会恢复其自身的配置和状态。

### 总结

- **全局顶点属性数组使能状态**：在不使用 VAO 时，`glEnableVertexAttribArray` 和 `glDisableVertexAttribArray` 对所有后续绘制调用生效，直到状态被改变。
  
- **顶点数组对象（VAO）**：存储了顶点属性相关的所有状态，包括使能状态。当绑定 VAO 时，会恢复之前存储的顶点属性配置和使能状态，使得每个 VAO 拥有独立的顶点属性配置。

使用 VAO 是管理复杂场景和多个对象的最佳实践，因为它简化了状态管理，并且可以提高渲染性能。
