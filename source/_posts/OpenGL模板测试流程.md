---
title: OpenGL模板测试流程
date: 2022-11-08 11:51:27
tags: openGL
---


### 模板测试流程

不考虑earlyZ的情况下，fragment执行后，进行模板测试，通过后，进入深度测试

#### 模板测试一般使用流程：
	1. 启用模板缓冲写入
	2. 渲染物体，更新模板缓冲
	3. 禁用模板缓冲写入
	4. 渲染其他物体，根据模板缓冲内容决定是否丢弃片段


##### 使用模板测试绘制物体轮廓的例子

	```
	glStencilMask();
	glStencilFunc(GLenum func, GLint ref, GLuint mask);
	glStencilOp(GLenum sfail, GLenum dpfail, GLenum dppass);
	```

	1. 开启模板测试和深度测试
	2. 第一次render pass，主要是绘制，并写入模板
		1. 开启模板测试和深度测试
		2. glStencilMask(0xFF);
		3. glStencilOp(keep, keep, replace);
		4. glStencilFunc(always, 1, 0xFF);
		5. 绘制物体
	3. 第二次render pass, 放大物体，通过模板测试剔除非边缘像素
		1. 将物体缩放变大
		2. 关闭深度测试 //因为这里的边缘不需要有拓扑关系
		3. 关闭模板写入glStencilMask(0x00);
		4. glStencilFunc(not_equal, 1, 0xFF);
		5. 绘制物体


### 关于OpenGL里面的Mask
	1. 写入颜色是，r，g，b，a 分别与对应的mask，进行&运算后写入
	2. depth也是同样道理，如果设置成true，就是允许写入，设置成false，不允许写入
	3. stencil的Mask，是0xFF~0x00，之间的256个数，一般设置是0xFF，允许任意值写入，0x00是不允许写入
