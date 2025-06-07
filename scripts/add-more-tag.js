'use strict';

const fs = require('fs');
const path = require('path');

// 在文章渲染前执行
hexo.extend.filter.register('before_post_render', function(data){
  // 只处理文章类型
  if (data.layout !== 'post') return data;
  
  // 获取实际内容（去除空白字符）
  const actualContent = data.content.trim();
  
  // 如果文章内容为空或太短，不处理
  if (actualContent.length < 50) {
    return data;
  }
  
  // 如果文章内容没有 <!-- more --> 标记且内容较长
  if (!data.content.includes('<!-- more -->') && actualContent.length > 300) {
    // 寻找合适的插入位置
    let insertPosition;
    
    // 如果文章以代码块开头，在第一个代码块后插入
    const codeBlockRegex = /^```[\s\S]*?```\s*/;
    const codeBlockMatch = data.content.match(codeBlockRegex);
    
    if (codeBlockMatch) {
      // 在第一个代码块后插入
      insertPosition = codeBlockMatch.index + codeBlockMatch[0].length;
    } else {
      // 尝试找到第一个或第二个段落结束的位置
      const paragraphs = data.content.split('\n\n');
      if (paragraphs.length >= 2) {
        // 如果第一段很短，则在第二段后插入
        const firstParaLength = paragraphs[0].trim().length;
        if (firstParaLength < 100 && paragraphs.length > 1) {
          insertPosition = paragraphs[0].length + paragraphs[1].length + 4; // +4 是两个 \n\n
        } else {
          insertPosition = paragraphs[0].length + 2; // +2 是一个 \n\n
        }
      } else {
        // 如果找不到段落，则在300字符处截断
        insertPosition = Math.min(300, Math.floor(actualContent.length * 0.6));
        
        // 确保不会截断在单词中间或代码块中间
        while (insertPosition < data.content.length && 
               data.content.charAt(insertPosition) !== ' ' && 
               data.content.charAt(insertPosition) !== '\n') {
          insertPosition++;
        }
      }
    }
    
    // 确保插入位置不会超出内容长度
    if (insertPosition >= data.content.length) {
      insertPosition = Math.floor(data.content.length * 0.6);
    }
    
    // 插入 more 标记
    data.content = data.content.substring(0, insertPosition) + 
                   '\n\n<!-- more -->\n\n' + 
                   data.content.substring(insertPosition);
  }
  
  return data;
});