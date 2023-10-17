---
babatitle: 记录利用GitHub+Hexo搭建博客
data: {{ data }}
updated: {{ date }}
tags: 
categories: 记录
---

# 0x00 起因

之前在Internet冲浪时经常会搜到一些别人写的博客，通常大家写博客往往是通过某乎、某某DN这样的平台，在平台之上创作。但是有时也能搜到一些个人博客，这些博客往往网页清爽，纯净无广告，有些博客还有些不错特效，抛开文章内容不谈，仅仅是如此清爽的页面就给了人良好的阅读体验。所以我便也想着整一个，这样就可以把自己写的一些垃圾扔在上面了，咱说整就整。

搭建一个博客的方法有很多，但是对于我这种纯小白来说，使用现成的方案显然是最方便滴。

首先，搭建博客需要肯定需要一个服务器，当然最好的办法就是自己物理上组一台主机当服务器，然后在搞到一个公网IP，这样整个服务器都完全掌握在自己手里。但是这样的服务器需要大把的“米”，而且在2023年的今天，获取一个私人的公网的IPv4地址也是十分困难滴，因此PlanA PASS。

随着云服务的发展，现如今通过租的方式来获取一个云服务器也是很容易的。但是云服务终究还是收费的，虽然各家云服务商都有新人优惠，但是小钱也是钱啊，咱这种玩玩而已的blog那自然是能省就省，等以后有钱有闲了再来研究研究这个方案。PlanB暂时放弃。

那最后咱们选择的方案是啥呢？嘿嘿，就是利用GitHub提供的免费pages功能来搭建这个blog。GitHub给每个人的每个仓库都提供了这个page功能，我认为GitHub的原意应该是方便用户给每个项目搭建一个介绍页面，但是我们正好就可以利用这个功能来搭建一个人博客。

OK，下面就记录一下我搭建这个blog的过程以及踩过的坑。



# 0x01 环境准备

##  -1- 创建仓库

创建仓库没什么好说的（~~应该不会有人建仓库都不会吧，如果不会就STFW吧~~），但唯一要注意的是必须要创建公共仓库
![image-20231017214652171](https://raw.githubusercontent.com/GoooForward/picture/main/note-image/image-20231017214652171.png)



## -2- 安装Node.js环境

什么是Node.js？咱也不知道啊，不知道就STFW呗。wiki上是这样说的：

> *"Node.js 是能够在服务器端运行 JavaScript 的开放源代码、跨平台执行环境。"*

在[Node.js的官网](https://nodejs.org/zh-cn)上也有这样一句话：

> *"Node.js® is an open-source, cross-platform JavaScript runtime environment."*

![image-20231017215911515](https://raw.githubusercontent.com/GoooForward/picture/main/note-image/image-20231017215911515.png)

在Internet搜了一圈，大概了解了一下，浅显的理解为开源的JavaScript这个语言的运行环境，应该包括一些基本的运行库之类的。

在[官网](https://nodejs.org/zh-cn)上下载一下安装包，LTS是长期维护版，理论上更稳定；Current就是当前最新版。我这里就下载LTS版本了，因为我也用不上新特性。

下载下来是一个tar.xz格式的压缩包，使用如下目录进行解压

```bash
tar -Jxf node-v18.18.1-linux-x64.tar.xz 		#-J 指定xz压缩格式（必须大写J）-x 解压操作 -f 指定要解压的文件
#or
tar --xz -xf node-v18.18.1-linux-x64.tar.xz		#我觉得这个更好记，就是不够优雅
```

解压之后就得到了Node.js的二进制可执行文件了，这就相当于windows下的portable版本的软件，解压即用，不用注册表等信息。

现在进入bin文件夹下就可以看到npm包管理软件的可执行文件了，接下来将该路径添加到系统的环境变量中，这样在其他的路径下也可以直接通过软件名来调用npm等软件了。在bin文件夹中执行如下命令

```bash
echo "export PATH=$(pwd):$PATH" >> ~/.bashrc
#or
echo "export PATH=(your-nodejs-bin-path):$PATH" >> ~/.bashrc
```

然后加载一下bash配置文件

```bash
source ~/.bashrc
```

这样就将该路径添加到了环境变量中了，下面安装Hexo。



## -3- 安装Hexo

执行如下命令安装Hexo

```bash
npm install hexo -g 		#-g 全局安装
```





> To be continueba
