---
title: Shell脚本学习
date: 2023-12-13 17:47:00
updated: {{ date }}
hide: true
tags: 
categories: 学习
---





## -1- shell脚本

大多数shell都有自己的脚本语言，课程中介绍的是以bash为例的，因为bash的应用较为广泛

### (1)shell变量

bash中变量赋值的语法是`foo=bar`，这里的等号两边是不能有空格的，在bash中，空格用于分隔参数。如果一定要将带空格的字符串赋值给变量，就要用引号`‘`或者`“`，又或者使用转义字符。变量的引用使用`$`，变量名外面的花括号是可选的，加不加都行，加花括号是为了帮助解释器识别变量的边界。

```shell
tangyuwei@Ubuntu:~$ foo=hello world
找不到命令 “world”，但可以通过以下软件包安装它：
sudo snap install world
tangyuwei@Ubuntu:~$ foo=hello\ world
tangyuwei@Ubuntu:~$ echo $foo
hello world
tangyuwei@Ubuntu:~$ foo='hello world'
tangyuwei@Ubuntu:~$ echo $foo
hello world
tangyuwei@Ubuntu:~$ foo="hello world"
tangyuwei@Ubuntu:~$ echo $foo
hello world
```

对于字符串，单引号和双引号的含义并不相同。以`'`定义的字符串为原义字符串，其中的变量不会被转义，而 `"`定义的字符串会将变量值进行替换。

```shell
tangyuwei@Ubuntu:~$ foo=bar
tangyuwei@Ubuntu:~$ echo '$foo'
$foo
tangyuwei@Ubuntu:~$ echo "$foo"
bar
```

shell中的变量名只能包含字母、数字和下划线。字母大小写敏感，不能包含其他特殊字符。不能以数字开头，但可以包含数字。



### (2)shell字符串