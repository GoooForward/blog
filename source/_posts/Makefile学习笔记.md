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



# 0x02 初识Makefile



## -1- makefile基本规则

```makefile
target ... : prerequisites ...
    command
    ...
    ...
```

* target

  可以是一个object file（目标文件），也可以是一个可执行文件，还可以是一个标签（label）。对于标签这种特性，在后续的“伪目标”章节中会有叙述。

* prerequisites

  生成该target所依赖的文件和/或target。

* command

  该target要执行的命令（任意的shell命令）。



这种格式描述了文件之间的依赖关系，也就是target依赖于prerequisites，且target这个文件的生成规则描述在recipe中。通俗来说就是：**prerequisites中如果有一个以上的文件比target文件要新的话，command所定义的命令就会被执行。**



### 一个示例

```makefile
edit : main.o kbd.o command.o display.o \
        insert.o search.o files.o utils.o
    cc -o edit main.o kbd.o command.o display.o \
        insert.o search.o files.o utils.o

main.o : main.c defs.h
    cc -c main.c
kbd.o : kbd.c defs.h command.h
    cc -c kbd.c
command.o : command.c defs.h command.h
    cc -c command.c
display.o : display.c defs.h buffer.h
    cc -c display.c
insert.o : insert.c defs.h buffer.h
    cc -c insert.c
search.o : search.c defs.h buffer.h
    cc -c search.c
files.o : files.c defs.h buffer.h command.h
    cc -c files.c
utils.o : utils.c defs.h
    cc -c utils.c
clean :
    rm edit main.o kbd.o command.o display.o \
        insert.o search.o files.o utils.o
```

> **关于CC与GCC**
>
> CC就是是C compiler，即C编译器，而GCC是GNU CC，也就是GNU C编译器，在linux中，cc实际上就是指向gcc，这是因为cc是Unix的软件，是要收费的，因此GNU组织就编写了免费开源的gcc来取代cc。
>
> [Linux下的cc与gcc](https://www.cnblogs.com/zhouyinhui/archive/2010/02/01/1661078.html)



在这个makefile中，目标文件（target）包含：可执行文件edit和中间目标文件（ `*.o` ），依赖文件（prerequisites）就是冒号后面的那些 `.c` 文件和 `.h` 文件。每一个 `.o` 文件都有一组依赖文件，而这些 `.o` 文件又是可执行文件 `edit` 的依赖文件。依赖关系的实质就是说明了目标文件是由哪些文件生成的，换言之，目标文件是哪些文件更新的。

以上的两个部分其实已经定义好了文件之间的依赖关系，但是在目标文件与依赖文件之间还缺少一个转化的桥梁，也就是我们还不知道如何将依赖文件转变为目标文件，所以其后的recipe就定义了如何将依赖文件变为目标文件的系统命令。但是值得注意的是，recipe中的命令完全是自定义的，make并不会去解读你的命令，它只会执行你所定义的命令。格式上，recipe一定要以指标符tab开头。

在给出的例子中，作为目标`target`的`clean`并不是一个文件，而是一个标签`label`，就和C语言中goto跳转的标签类似，它没有依赖文件，因此在执行make时不会自动执行，只有在显式的指出目标为clean时（`make clean`）才会执行其定义的recipe命令。借助这个特性，我们可以在makefile中定义很多非编译的但是能提高工作效率的命令，例如帮助我们清理构建文件 、程序打包、备份等等。



## -2- make是如何工作的

在默认情况下，当我们在命令行中输入`make`时，make将会照如下的顺序执行

1. make首先会在当前目录寻找`Makefile`或者`makefile`
2. 如果找到，就会自动读取到第一个目标（这个目标可以是目标文件，也可以是label，make不做判断），这个目标就是make的最终目标，在前面的例子中，就是edit这个文件
3. 如果edit这个文件不存在，或者是edit后面所依赖的文件（包括依赖文件的依赖文件）的修改时间要比edit更新，那么make就会自动执行command中所定义的命令来生成edit这个文件
4. 如果edit的依赖文件中也有不存在的，或者不是最新的，那么make就会去寻找以该依赖文件为目标的规则，然后按照相同的过程去执行command命令生成这个依赖文件（就是一种递归）
5. 最后edit的所有依赖文件都集齐了，就会执行edit对应的command命令，最后生成edit这个文件



在make的工作流程中，首先在读取最终目标时，make只会把一个target作为它的最终目标，只要此target规则中的依赖文件都集齐了，就会自动执行其后的shell命令，如果将clean的规则放在文件最开头，那么执行make也只会自动执行清除的命令，而后面的编译部分就全部不执行了。

其次，在检测依赖文件的修改时间时，要注意依赖文件的依赖也是当前目标文件的依赖，也是会检测的。举个例子，当已经执行了一次编译，此时所有的目标文件都已经生成了，然后修改其中的一个源文件`files.c`，然后执行make，按照执行流程，会选择edit作为最终目标，然后检测edit是否比它的依赖更新，`files.c`不是edit的依赖，但是却是`files.o`的依赖，而`files.o`是edit的依赖，因此`files.c`也可以视为edit的依赖，执行时会先重新生成`files.o`然后生成最终目标`edit`。



## -3- makefile 中使用变量

在编写makefile时，特别是大型的makefile时，可能会遇到同一段字符串被反复使用，例如

```makefile
edit : main.o kbd.o command.o display.o insert.o search.o files.o utils.o
    cc -o edit main.o kbd.o command.o display.o insert.o search.o files.o utils.o
```

这里的依赖`.o`文件和后面command命令中所指明的`.o`文件都是一样的，当我们想要添加新的`.o`文件时，就需要在不同的地方手动添加，makefile足够大时，手动添加很难保证不出错，这极大地增加了makefile的维护成本。所以我们可以使用变量来代替原本的一连串`.o`文件，makefile中变量的本质类似于C语言中的宏定义，只做文本替换。我们用`object`来代替原本的一连串`.o`文件，原本的makefile就改进为

```makefile
objects = main.o kbd.o command.o display.o \
    insert.o search.o files.o utils.o

edit : $(objects)
    cc -o edit $(objects)
main.o : main.c defs.h
    cc -c main.c
kbd.o : kbd.c defs.h command.h
    cc -c kbd.c
command.o : command.c defs.h command.h
    cc -c command.c
display.o : display.c defs.h buffer.h
    cc -c display.c
insert.o : insert.c defs.h buffer.h
    cc -c insert.c
search.o : search.c defs.h buffer.h
    cc -c search.c
files.o : files.c defs.h buffer.h command.h
    cc -c files.c
utils.o : utils.c defs.h
    cc -c utils.c
clean :
    rm edit $(objects)
```



## -4- makefile 的自动推导机制

make可以自动推导出目标文件以及其依赖文件后面的命令，当make找到一个`xxx.o`文件，它就会自动把`xxx.c`加入到其依赖中，并且自动脑补出`cc -c xxx.c`的命令，因此，借助这个机制，makefile又可以被简化为

```makefile
objects = main.o kbd.o command.o display.o \
    insert.o search.o files.o utils.o

edit : $(objects)
    cc -o edit $(objects)

main.o : defs.h
kbd.o : defs.h command.h
command.o : defs.h command.h
display.o : defs.h buffer.h
insert.o : defs.h buffer.h
search.o : defs.h buffer.h
files.o : defs.h buffer.h command.h
utils.o : defs.h

.PHONY : clean
clean :
    rm edit $(objects)
```

这种书写方法属于make的**隐式规则**。`.PHONY : clean`表示clean是一个伪目标。



## -5- 以源文件为中心的makefile风格

前面借助make的自动推导机制已经实现了省略了各`.c`文件，只留下了各自依赖的`.h`头文件，经过观察，可以发现这些不同的目标文件都依赖于几个相同的`.h`头文件。前面给出的makefile都是以不同的目标文件为中心编写的，其本质是列举出每个目标文件受哪些依赖文件的影响，那么是否可以反过来，以源文件（依赖文件）为中心，列举出不同源文件能影响哪些目标文件，答案自然是肯定的。新风格的makefile如下：

```makefile
objects = main.o kbd.o command.o display.o \
    insert.o search.o files.o utils.o

edit : $(objects)
    cc -o edit $(objects)

$(objects) : defs.h
kbd.o command.o files.o : command.h
display.o insert.o search.o files.o : buffer.h

.PHONY : clean
clean :
    rm edit $(objects)
```

`defs.h`会影响全部`.o`文件，`command.h`会影响`kbd.o` `command.o` `files.o`，`buffer.h`会影响`display.o` `insert.o` `search.o` `files.o ` 。同时make的自动推导机制依然生效，每个`.o`文件依旧依赖于对应的`.c`文件。使用这种书写风格可以进一步简化makefile，同时也能表明文件之间的依赖关系。只不过采用这种风格会显得文件的依赖关系没那么清晰，需要阅读者在看的同时分析。



## -6- 清空目录的规则

每个Makefile中都应该写一个清空目标文件（ `.o` ）和可执行文件的规则，这不仅便于重编译，也很利于保持文件的清洁。这是一个“修养”，通常的写法是

```makefile
clean:
    rm edit $(objects)
```

而更为标准的写法应该是

```makefile
.PHONY : clean
clean :
    -rm edit $(objects)
```

这里的`.PHONY`表明`clean`是一个伪目标。而在`rm`前面添加一个减号`-`表示当出现问题时，忽略错误，继续执行后面的内容。

`clean` 的规则不要放在文件的开头，不然，这就会变成make的默认目标，相信谁也不愿意这样。不成文的规矩是——“clean从来都是放在文件的最后”。



## -7- makefile里有什么

Makefile里主要包含了五个东西：显式规则、隐式规则、变量定义、指令和注释。

1. 显式规则。显式规则说明了如何生成一个或多个目标文件。这是由Makefile的书写者明显指出要生成的文件、文件的依赖文件和生成的命令。
2. 隐式规则。由于我们的make有自动推导的功能，所以隐式规则可以让我们比较简略地书写Makefile，这是由make所支持的。
3. 变量的定义。在Makefile中我们要定义一系列的变量，变量一般都是字符串，这个有点像你C语言中的宏，当Makefile被执行时，其中的变量都会被扩展到相应的引用位置上。
4. 指令。其包括了三个部分：
   1. 一个是在一个Makefile中引用另一个Makefile，就像C语言中的include一样；
   2. 另一个是指根据某些情况指定Makefile中的有效部分，就像C语言中的预编译#if一样；
   3. 还有就是定义一个多行的命令。有关这一部分的内容，我会在后续的部分中讲述。
5. 注释。Makefile中只有行注释，和UNIX的Shell脚本一样，其注释是用 `#` 字符，这个就像C/C++中的 `//` 一样。如果你要在你的Makefile中使用 `#` 字符，可以用反斜杠进行转义，如： `\#` 。



## -8- Makefile文件名

默认的情况下，make命令会在当前目录下按顺序寻找文件名为 `GNUmakefile` 、 `makefile` 和 `Makefile` 的文件。在这三个文件名中，最好使用 `Makefile` 这个文件名，因为这个文件名在排序上靠近其它比较重要的文件，比如 `README`。最好不要用 `GNUmakefile`，因为这个文件名只能由GNU `make` ，其它版本的 `make` 无法识别，但是基本上来说，大多数的 `make` 都支持 `makefile` 和 `Makefile` 这两种默认文件名。

当然，也可以使用别的文件名来书写Makefile，比如：“Make.Solaris”，“Make.Linux”等，如果要指定特定的Makefile，你可以使用make的 `-f` 或 `--file` 参数，如： `make -f Make.Solaris` 或 `make --file Make.Linux` 。如果你使用多条 `-f` 或 `--file` 参数，可以指定多个makefile。



## -9- 包含其他的Makefile

在Makefile使用 `include` 指令可以把别的Makefile包含进来，这很像C语言的 `#include` ，被包含的文件会原模原样的放在当前文件的包含位置。

```
include <filenames>...
```

`<filenames>` 可以是当前操作系统Shell的文件模式（可以包含路径和通配符）。

在 `include` 前面可以有一些空字符，但是绝不能是 `Tab` 键开始。 `include` 和 `<filenames>` 可以用一个或多个空格隔开。举个例子，你有这样几个Makefile： `a.mk` 、 `b.mk` 、 `c.mk` ，还有一个文件叫 `foo.make` ，以及一个变量 `$(bar)` ，其包含了 `bish` 和 `bash` ，那么，下面的语句：

```
include foo.make *.mk $(bar)
```

等价于：

```makefile
include foo.make a.mk b.mk c.mk bish bash
```

make命令开始时，会找寻 `include` 所指出的其它Makefile，并把其内容安置在当前的位置。就好像C/C++的 `#include` 指令一样。如果文件都没有指定绝对路径或是相对路径的话，make会在当前目录下首先寻找，如果当前目录下没有找到，那么，make还会在下面的几个目录下找：

1. 如果make执行时，有 `-I` 或 `--include-dir` 参数，那么make就会在这个参数所指定的目录下去寻找。
2. 接下来按顺序寻找目录 `<prefix>/include` （一般是 `/usr/local/bin` ）、 `/usr/gnu/include` 、 `/usr/local/include` 、 `/usr/include` 。

环境变量 `.INCLUDE_DIRS` 包含当前 make 会寻找的目录列表。你应当避免使用命令行参数 `-I` 来寻找以上这些默认目录，否则会使得 `make` “忘掉”所有已经设定的包含目录，包括默认目录。也就是说，使用了`-I`参数指定了include目录之后，make就只会在指定的目录下寻找，并且不再去默认的目录中寻找

如果有文件没有找到的话，make会生成一条警告信息，但不会马上出现致命错误。它会继续载入其它的文件，一旦完成makefile的读取，make会再重试这些没有找到，或是不能读取的文件，如果还是不行，make才会出现一条致命信息。如果你想让make不理那些无法读取的文件，而继续执行，你可以在include前加一个减号“-”。如：

```
-include <filenames>...
```

其表示，无论include过程中出现什么错误，都不要报错继续执行。如果要和其它版本 `make` 兼容，可以使用 `sinclude` 代替 `-include` 。





























# -END-

