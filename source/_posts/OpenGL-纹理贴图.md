---
layout: post
title: 纹理贴图
date: 2017-01-03 11:11:26
tags: openGL
---

1 VertexShader

```
attribute vec2 TexCoordIn; // New
varying vec2 TexCoordOut; // New

void main(void) { 
    DestinationColor = SourceColor; 
    gl_Position = Projection * Modelview * Position;
    TexCoordOut = TexCoordIn; // New
}
```

2 FragmentShader

```
varying lowp vec4 DestinationColor;
varying lowp vec2 TexCoordOut; // New
uniform sampler2D Texture; // New

void main(void) {
    gl_FragColor = DestinationColor * texture2D(Texture, TexCoordOut); // New
}
```

3 将图片资源转换成位图数据，绑定到对应纹理ID中

```
+ (GLuint)createTextureWithImage:(UIImage *)image{
    
    //转换为CGImage，获取图片基本参数
    CGImageRef cgImageRef = [image CGImage];
    GLuint width = (GLuint)CGImageGetWidth(cgImageRef);
    GLuint height = (GLuint)CGImageGetHeight(cgImageRef);
    CGRect rect = CGRectMake(0, 0, width, height);
    
    //绘制图片
    CGColorSpaceRef colorSpace = CGColorSpaceCreateDeviceRGB();
    void *imageData = malloc(width * height * 4);
    CGContextRef context = CGBitmapContextCreate(imageData, width, height, 8, width * 4, colorSpace,kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big);
    CGContextTranslateCTM(context, 0, height);
    CGContextScaleCTM(context, 1.0f, -1.0f);
    CGColorSpaceRelease(colorSpace);
    CGContextClearRect(context, rect);
    CGContextDrawImage(context, rect, cgImageRef);
    
    GLuint textureID;
    glGenTextures(1, &textureID);
    glBindTexture(GL_TEXTURE_2D, textureID);
    
    //纹理一些设置，可有可无
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_LINEAR);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_LINEAR);
    
    glTexImage2D(GL_TEXTURE_2D, 0, GL_RGBA, width, height, 0, GL_RGBA, GL_UNSIGNED_BYTE, imageData);
    
    glBindTexture(GL_TEXTURE_2D, 0);
    
    //释放内存
    CGContextRelease(context);
    free(imageData);
    
    return textureID;
}
```

4 绘制时使用纹理

```
    glActiveTexture(GL_TEXTURE0);
    //载入纹理
    glBindTexture(GL_TEXTURE_2D, _textTureId);

    glUniform1i(_textureSlot, 0);
    
    const GLfloat texCoords[] = {
        0, 0,//左下
        1, 0,//右下
        0, 1,//左上
        1, 1,//右上
    };
    glVertexAttribPointer(_textureCoordsSlot, 2, GL_FLOAT, GL_FALSE, 0, texCoords);
    glEnableVertexAttribArray(_textureCoordsSlot);
```

5 关于纹理坐标
