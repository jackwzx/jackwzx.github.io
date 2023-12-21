---
layout:     post
title:      Mac环境下安装Ruby
subtitle:   ruby2.2
date:       2017-09-19
author:     jack
catalog: true
tags:
    - iOS
    - ruby
---

## 使用rvm来安装ruby

### step1
```
	$ curl -L get.rvm.io | bash -s stable  
```
### step2  
```
	$ source ~/.bashrc $ source ~/.bash_profile$ rvm -v  
	$ source ~/.bash_profile  
	$ rvm -v  
```	
### step3  
```	
	$ rvm list known  
```	
### step4
```    
	$ rvm install 2.2.0  
```

### 如果Step4失败，可以进行如下尝试
```
	sudo chown -R $(whoami):admin /usr/local
	cd /usr/local
	git remote set-url origin git://mirrors.ustc.edu.cn/brew.git
	brew update
	sudo chown root:wheel /usr/local
	rvm install 2.2.0
```
