---
layout: post
title: tweak心得
date: 2017-03-07 09:20:39
tags: iOS
---

### 1 关于ssh

一般形式 ssh root@192.168.2.17或者ssh mobile@192.168.2.17

root和mobile分别为iOS上默认用户，alpine是默认密码

可以通过ssh-gen 分别在Mac和iOS上生成密钥对，然后将Mac上的公钥拷贝到手机上，这样配之后，每次ssh不会再提示输入密码

### 2 scp source dest

一般为

scp ~/123.txt mobile@192.168.2.17:/usr/bin

### 3 Makefile

可以配置手机的IP，framework，arch等参数

THEOS_DEVICE_IP = 192.168.31.202
ARCHS = armv7 arm64
TARGET = iphone:latest:8.0

iOSREGreetings_FRAMEWORKS = UIKit 

### 4 关于bundleID

.plist中的bundle就是你想hook的程序的bundleID
