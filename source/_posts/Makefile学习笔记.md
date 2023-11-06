---
title: Makefile学习笔记
date: 2023-11-06 10:59:00
updated: {{ date }}
hide: true
tags: regex
categories: 学习
---



# 0x00 引言

从前的我并不知道什么是make，这主要有两个原因，一是从前学习编程都是使用的都是windows平台，二是早期学习编程大都是单个文件实现一个简单的功能，不涉及到多文件编译，也用不到make。在windows平台，大多数项目有完备的IDE可以使用，像Visual Studio，MDK之类的，对于多文件的项目，它们都会有一个项目文件，通过项目文件打开该项目就能很容易的实现多文件编译。然而，随着学习的深入，越来越多的时候都在使用Linux开发，对于那些没有完备IDE支持的项目，学习如何自动化编译多文件项目就变得越来越重要。

其实，在这次下定决心学习Makefile之前，我其实也学习了Makefile几次，但是都浅尝辄止，半途而废了，仅仅只是学习了一些最最基础的语法，然而实际工作中，发现我学习的那些最基础的东西连项目给出的Makefile都读不懂，这次我决定一口气认认真真地学完Makefile，至少做到能看懂项目的Makefile，对于自己的一些小项目的Makefile要能够写出来。

学习Makefile，我选择的教材是我之前就学习过的陈皓大佬的[《跟我一起写Makefile》](https://seisman.github.io/how-to-write-makefile/overview.html)，在这里悼念一下陈皓大佬，世事无常，感谢大佬的奉献。

其他资料：[GNU make手册](https://www.gnu.org/software/make/manual/make.html)

# 0x01 什么是Makefile

## -1- 编译过程

要了解Makefile首先要复习一下C文件的编译过程。这里要搬出一张经典的图片了。这里的预处理器，编译器，汇编器，连接器分别对应了不同的工具，这些工具共同组成了编译器。
![](https://gcore.jsdelivr.net/gh/GoooForward/picture@main/note-image/202311061550545.png)

对于多文件项目，首先会将不同的源文件编译为目标文件，在Windows下也就是 `.obj` 文件，UNIX下是 `.o` 文件，即Object File。然后再将大量的目标文件连接在一起成为可执行文件，这个动作被叫做连接。

> 链接时，主要是链接函数和全局变量。所以，我们可以使用这些中间目标文件（ `.o` 文件或 `.obj` 文件）来链接我们的应用程序。链接器并不管函数所在的源文件，只管函数的中间目标文件（Object File），在大多数时候，由于源文件太多，编译生成的中间目标文件太多，而在链接时需要明显地指出中间目标文件名，这对于编译很不方便。所以，我们要给中间目标文件打个包，在Windows下这种包叫“库文件”（Library File），也就是 `.lib` 文件，在UNIX下，是Archive File，也就是 `.a` 文件。
>
> [程序运行库文件链接原理](https://blog.csdn.net/ahelloyou/article/details/112620353)



## -2- make简介

make是Linux上最常用的项目管理工具，make命令可以帮助我们自动化完成上面提到的文件编译过程，并且帮助我们管理好源文件之间的依赖关系，当有源文件发生变化时，所有依赖于此源文件的源代码都会被重新编译。

make命令并不能凭空管理项目，它需要一个Makefile文件来描述项目中源文件的依赖关系，以及编译方法。所以学习使用make，就是学习如何编写Makefile。

makefile的文件名通常有三种格式：Makefile、makefile、GNUmakefile，make会在当前目录下自动寻找找三个文件名，如果没有找到的话，make就无法继续编译程序，产生一个错误并退出。





















# -END-

