---
layout: post
title: uniform和attribute区别
date: 2016-12-30 16:17:50
tags: openGL
---

#### 简单对比一下

attribute，可以理解为顶点的属性，表示顶点的输入数据，只在顶点着色器中使用

uniform，可以简单理解为向着色器中传递matrix等数据，这个是在着色器中是只读的，并且在两个着色器中都可以使用



使用上的区别：

1 获取指针，分别使用glGetAttribLocation和glGetUniformLocation方法

2 设置值时，分别使用glVertexAttribPointer和glUniformMatrix4fv，注意使用glVertexAttribPointer和glEnableVertexAttribArray需要配合使用，而glUniformMatrix4fv无此限制

3 使用矩阵时，一般先LoadIdentity，然后进行平移，旋转和缩放，glDrawElements与顶点着色器可以理解为一一对应，也就是说，可以设置matrix1，传入shader的modelView中，然后glDrawElements，接下来可以再设置matrix2，再传入modelView中，再进行glDrawElements

