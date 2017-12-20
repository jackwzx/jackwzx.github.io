---
layout: post
title: VBO
date: 2017-01-02 13:19:23
tags: openGL
---

### VBO的目的：

主要是为了提高效率，减少在CPU向GPU中传输数据，直接在GPU上申请内存空间

两种target分别是GL_ARRAY_BUFFER和GL_ELEMENT_ARRAY_BUFFER

分别对应顶点数据和索引

使用glVertexAttribPointer和glDrawElements的流程和以前大致保持一致，区别在于，最后一个参数不是传指针了，而是传bindBuffer的偏移量

### VBO使用的大概流程：

```
    //获取一个操作句柄
    glGenBuffers(1, &_vertexBuffer);
    //设置缓存对象类型，数据缓存对象，还是元素缓存对象，通俗的说就是数组还是索引
    glBindBuffer(GL_ARRAY_BUFFER, _vertexBuffer);
    //分配内存空间
    glBufferData(GL_ARRAY_BUFFER, 7*3*sizeof(GLfloat), vertices, GL_STATIC_DRAW);
    
    在绘制代码Draw时，可以使用，绘制代码与正常并无冥想差别
    glBindBuffer(GL_ARRAY_BUFFER, _vertexBuffer);
    glVertexAttribPointer(_positionSlot, 3, GL_FLOAT, GL_FALSE, 7*sizeof(float), 0);
    glEnableVertexAttribArray(_positionSlot);
    
    glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, _triangleIndexBuffer);
    glDrawElements(GL_TRIANGLES, 3, GL_UNSIGNED_BYTE, 0);
    
    //可以在清理时，释放VBO
    glDeleteBuffers(1, &_vertexBuffer);
    _vertexBuffer = 0;
    
    glDeleteBuffers(1, &_triangleIndexBuffer);
    _triangleIndexBuffer = 0;
    
```

