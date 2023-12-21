---
layout: post
title: tweak环境搭建
date: 2017-03-07 08:43:58
tags: iOS
---

### 0 设置环境变量 export THEOS=/opt/theos

可以设置~/.zshrc中添加，修改后用source命令重新加载

### 1下载theos（~/jailbreak目录下已经下载过），放在/opt/theos下

### 2 下载ldid，放到/opt/theos/bin下

sudo chmod 777 /opt/theos/bin/ldid

### 3 配置CydiaSubstrate

在Cydia中安装CydiaSbustrate，然后scp 讲iPhone上的 /Library/Frameworks/CydiaSubstrate.framework/CydiaSubstrate 拷贝到Mac /opt/theos/lib/下，并重命名为libsubstrate.dylib

并将头文件substrate.h也scp 到/opt/theos/include下

sudo /opt/theos/bin/bootstrap.sh substrate

### 4 将dm.pl重命名为dpkg-deb，cp到/opt/bin/

suodo chmod 777 /opt/bin/dpkg-deb

基本就搭建完成，可以练习创建工程

/opt/theos/bin/nic.pl

然后进行make package 

make package install

