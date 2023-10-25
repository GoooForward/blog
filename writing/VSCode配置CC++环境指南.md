---
title: VSCode配置CC++环境指南
date: 2023-10-23
tags: vscode
categories: 
---

# 0x00 引言

众所周知，VScode是个好编辑器，拥有丰富的插件，现代化的UI设计，高度的可定制性，几乎可以用来写所有的主流编程语言。但是伴随着高度可定制而来的是它是高使用门槛，它不像传统的针对某一语言的IDE那样，它的配置项非常多，这些配置项都写在json文件中，并且很多设置找不到对应的UI设置界面。我估计包括我在内的很多人都不知道如何正确的配置VSCode，在应对一些大型的多文件的项目时就会出现无法的正确跳转、找不到宏定义的情况，虽然有时可能不影响最终的编译运行，但是还是会阻碍效率的提高。因此，今天就来学习一下如何配置VSCode（针对C/C++项目）。



学习的教材使用的是[VScode官方文档](https://code.visualstudio.com/docs/cpp/config-linux)，在网上逛了一圈，没有找到特别满意的教程，所以还是回归文档吧



# 0x01 安装扩展及编译器



## -1- 安装扩展

VScode的本质是个单纯的文本编辑器，对于不同的编程语言的支持是通过编辑器插件来实现的，这一点和Vim很像。因此为了让VScode支持C/C++，需要安装一个C/C++扩展

![C/C++ 扩展](https://cdn.jsdelivr.net/gh/GoooForward/picture@main/note-image/cpp-extension.png)



## -2- 安装编译器

VScode本质是个文本编辑器，它本身并不会编译代码，实施上其他的IDE也不会编译代码，编译的工作都是通过编译器来实现的，只是调用的过程被隐藏起来了。为了能够在VScode中运行代码，我们需要安装编译器。我使用的Linux平台，最常用的编译器是GCC，在windows平台下可以使用GCC的移植版本MinGW。Clang目前也被广泛使用，只是我还没尝试过。

VScode的IntelliSense支持的编译器如下

![](https://cdn.jsdelivr.net/gh/GoooForward/picture@main/note-image/image-20231023210921602.png)



# 0x02 C/C++项目的三个配置文件



VScode打开的文件夹会成为VScode的工作区，工作区内包含一个名为`.vscode`的文件夹，里面包含三个配置文件

- `tasks.json`（编译器构建设置）
- `launch.json`（调试器设置）
- `c_cpp_properties.json`（编译器路径和 IntelliSense 设置）

下面一个一个介绍

> PS: JSON是由美国程序员道格拉斯·克罗克福特构想和设计的一种轻量级资料交换格式。其内容由属性和值所组成，因此也有易于阅读和处理的优势。JSON是独立于编程语言的资料格式，其不仅是JavaScript的子集，也采用了C语言家族的习惯用法，目前也有许多编程语言都能够将其解析和字符串化，其广泛使用的程度也使其成为通用的资料格式。



## -1- tasks.json

当你打开一个文件夹时，本身是不包含`.vscode`文件夹的，因为此时还不需要生成对应的json文件，也就是说，如果坚持不用VScode构建调试的话，你的工作区内不包含`.vscode`文件夹也是可以的。

当你对一个c文件进行运行（F5）时，会弹出对话框，此时会要求选择使用的编译器，一旦选择了编译器，就会自动生成`.vscode`文件夹以及`tasks.json`文件。

![](https://cdn.jsdelivr.net/gh/GoooForward/picture@main/note-image/image-20231023212644106.png)

























# -END-