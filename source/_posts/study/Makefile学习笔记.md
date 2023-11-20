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

学习Makefile，我选择的教材是我之前就学习过的陈皓大佬的[《跟我一起写Makefile》](https://seisman.github.io/how-to-write-makefile/overview.html)。

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



## -10- 环境变量MAKEFILES

如果当前的环境中定义了`MAKEFILES`，那么make会把这个变量中的值作为一个类似于`include`的操作。这个变量的值是其他的makefile，用空格隔开。它与用`include`引入的其他makefile不同的是，从这个环境变量中引入的Makefile的“目标”不会起作用，如果环境变量中定义的文件发现错误，make也会不理。

使用这个环境变量会对所有的Makefile起作用，这显然是我们不希望看到的，因此不推荐使用这个环境变量



## -11- make的工作方式

GNU的make工作时的执行步骤如下：（想来其它的make也是类似）

1. 读入所有的Makefile。
2. 读入被include的其它Makefile。
3. 初始化文件中的变量。
4. 推导隐式规则，并分析所有规则。
5. 为所有的目标文件创建依赖关系链。
6. 根据依赖关系，决定哪些目标要重新生成。
7. 执行生成命令。

1-5步为第一个阶段，6-7为第二个阶段。第一个阶段中，如果定义的变量被使用了，那么，make会把其展开在使用的位置。但make并不会完全马上展开，make使用的是拖延战术，如果变量出现在依赖关系的规则中，那么仅当这条依赖被决定要使用了，变量才会在其内部展开。



# 0x03 书写规则

规则包含两个部分，一个是**依赖关系**，一个是**生成目标的方法**。

在Makefile中，规则的顺序是很重要的，因为，Makefile中只应该有一个最终目标，其它的目标都是被这个目标所连带出来的，所以一定要让make知道你的最终目标是什么。一般来说，定义在Makefile中的目标可能会有很多，但是第一条规则中的目标将被确立为最终的目标。如果第一条规则中的目标有很多个，那么，第一个目标会成为最终的目标。make所完成的也就是这个目标。



## -1- 规则的语法

```makefile
targets : prerequisites
    command
    ...
```

或是这样：

```makefile
targets : prerequisites ; command
    command
    ...
```

targets是文件名，以空格分开，可以使用通配符。一般来说，我们的目标基本上是一个文件，但也有可能是多个文件。

command是命令行，如果其不与“target:prerequisites”在一行，那么，必须以 `Tab` 键开头，如果和prerequisites在一行，那么可以用分号做为分隔。

prerequisites也就是目标所依赖的文件（或依赖目标）。如果其中的某个文件要比目标文件要新，那么，目标就被认为是“过时的”，被认为是需要重生成的。

如果命令太长，你可以使用反斜杠（ `\` ）作为换行符。make对一行上有多少个字符没有限制。规则告诉make两件事，文件的依赖关系和如何生成目标文件。

一般来说，make会以UNIX的标准Shell，也就是 `/bin/sh` 来执行命令。



## -2- 在规则中使用通配符

make支持三个通配符`*`,`?`和`~`。

* `*`号代表任意个字符，这与正则表达式中的`*`号不同
* `?`号代表任意单个字符，但是此字符必须存在。这与正则表达式中的`?`号也不同
* `~`号代表`home`目录，在Unix环境下表示的就是当前用户的家目录路径， `~hchen/test` 则表示用户hchen的宿主目录下的test 目录。在Windows的下视`$HOME`的环境变量定义而定。

这些通配符在变量中依然也是可以使用的，因为makefile的变量和宏定义一样，只做字符替换。

当然和正则表达式中的元字符一样，如果想要表示这些字符本身的意思，需要使用转义字符`\`来转义。



## -3- 文件搜索

在大型工程中，通常有许许多多的源文件，为了管理这些源文件，通常会将其分类存放在不同的路径中，但是在描述文件依赖关系时，就需要带上这些目录路径，这会导致Makefile臃肿，且难以阅读。一个更好的解决方法是给出一个路径，让make自己去路径下寻找，而非总是指明文件的路径。

Makefile中的`VPATH`特殊变量就是用于完成这个功能的，在未定义此变量的情况下，Makefile默认只会在当前目录下寻找依赖文件和目标文件。而定义了`VPATH`变量之后，make就会在当前目录没有找到的情况下，继续去`VPATH`所定义的路径下继续寻找。这里给出一个例子

```makefile
VPATH = src:../headers
```

上面的定义指定了两个目录，“src”和“../headers”，make会按照这个顺序进行搜索。目录由“冒号:”分隔。（当然，当前目录永远是最高优先搜索的地方）

另一个用于定义文件搜索路径的方法是使用关键字vpath（全小写），与前面提到的`VPATH`不同的是，`vpath`不是一个变量，而是一个make定义的关键字，它的使用方法更加灵活，它可以指定不同类型的文件在不同的路径下搜索。它主要有以下三种用法：

* ```makefile
  vpath <pattern> <directories>
  ```

  为符合\<pattern\>模式的文件指定搜索目录

* ```makefile
  vpath <pattern>
  ```

  清除符合\<pattern\>模式的文件的搜索目录

* ```makefile
  vpath
  ```

  清除所有设置好的文件的搜索目录



vpath使用方法中的\<pattern\>需要包含 `%` 字符。 `%` 的意思是匹配零或若干字符，（需引用 `%` ，使用 `\` ）例如， `%.h` 表示所有以 `.h` 结尾的文件。\<pattern\>指定了要搜索的文件集，而\<directories\>则指定了\<pattern\>的文件集的搜索的目录。例如：

```
vpath %.h ../headers
```

该语句表示，要求make在“../headers”目录下搜索所有以 `.h` 结尾的文件。（如果某文件在当前目录没有找到的话）

---

可以连续地使用vpath语句，以指定不同搜索策略。如果连续的vpath语句中出现了相同的\<pattern\> ，或是被重复了的\<pattern\>，那么，make会按照vpath语句的先后顺序来执行搜索。如：

```makefile
vpath %.c foo
vpath %   blish
vpath %.c bar
```

其表示 `.c` 结尾的文件，先在“foo”目录，然后是“blish”，最后是“bar”目录。

```makefile
vpath %.c foo:bar
vpath %   blish
```

而上面的语句则表示 `.c` 结尾的文件，先在“foo”目录，然后是“bar”目录，最后才是“blish”目录。



## -4- 伪目标

前面有提到过，通常在makefile中会定义一个用于清除编译生成结果的目标clean，例如

```makefile
clean:
    rm *.o temp
```

伪目标并不表示一个文件，它只是一个标签，就如同这里的clean一样，我们并不生成一个名为clean的文件。由于“伪目标”不是文件，所以make无法生成它的依赖关系和决定它是否要执行。我们只有通过显式地指明这个“目标”才能让其生效，也就是必须输入`make clean`才能执行后面定义的命令。伪目标不能和文件名同名，否则make就会错把伪目标当作一个文件，这样伪目标就失去意义了。

这里举个例子，如果能当前文件夹中存在一个名为clean的文件，此时执行`make clean`会发生什么呢？

![](https://gcore.jsdelivr.net/gh/GoooForward/picture@main/note-image/202311171723215.png)

答案是什么都不会发生，因为make把clean当作了一个文件，而当前文件夹下已经存在了一个名为clean的文件，make就会认为它的任务已经完成了，输出了一个 **make: “clean”已是最新** 就退出了，这显然与我们设定的清除编译文件的目地不符。

那遇到这种情况我们难道除了修改伪目标名称之外就没有别的办法了吗？非也，我们可以显式的指定伪目标clean，这样的话，make就不会去管是否存在一个名为make的文件了，而是把clean当作一个完完全全的伪目标来对待

![](https://gcore.jsdelivr.net/gh/GoooForward/picture@main/note-image/202311171729951.png)

特殊的标记`.PHONY`用来显式地指明一个目标是“伪目标”，向make说明，不管是否有这个文件，这个目标就是“伪目标”。

```
.PHONY : clean
```

伪目标一般没有依赖的文件。但是，我们也可以为伪目标指定所依赖的文件。伪目标同样可以作为“最终目标”，只要将其放在第一个。一个示例就是，如果你的Makefile需要一口气生成若干个可执行文件，但你只想简单地敲一个make完事，并且，所有的目标文件都写在一个Makefile中，那么你可以使用“伪目标”这个特性：

```makefile
all : prog1 prog2 prog3
.PHONY : all

prog1 : prog1.o utils.o
    cc -o prog1 prog1.o utils.o

prog2 : prog2.o
    cc -o prog2 prog2.o

prog3 : prog3.o sort.o utils.o
    cc -o prog3 prog3.o sort.o utils.o
```

我们知道，Makefile中的第一个目标会被作为其默认目标。我们声明了一个“all”的伪目标，其依赖于其它三个目标。由于默认目标的特性是，总是被执行的，但由于“all”又是一个伪目标，伪目标只是一个标签不会生成文件，所以不会有“all”文件产生。于是，其它三个目标的规则总是会被决议。也就达到了我们一口气生成多个目标的目的。 `.PHONY : all` 声明了“all”这个目标为“伪目标”。（注：这里的显式“.PHONY : all” 不写的话一般情况也可以正确的执行，这样make可通过隐式规则推导出， “all” 是一个伪目标，执行make不会生成“all”文件，而执行后面的多个目标。建议：显式写出是一个好习惯。）

随便提一句，从上面的例子我们可以看出，目标也可以成为依赖。所以，伪目标同样也可成为依赖。看下面的例子：

```makefile
.PHONY : cleanall cleanobj cleandiff

cleanall : cleanobj cleandiff
    rm program

cleanobj :
    rm *.o

cleandiff :
    rm *.diff
```

`make cleanall`将清除所有要被清除的文件。`cleanobj`和`cleandiff`这两个伪目标有点像“子程序”的意思。我们可以输入`make cleanall` 和 `make cleanobj` 和 `make cleandiff`命令来达到清除不同种类文件的目的。



## -5- 多目标

Makefile的规则中的目标可以不止一个，其支持多目标，有可能我们的多个目标同时依赖于一个文件，并且其生成的命令大体类似。于是我们就能把其合并起来。当然，多个目标的生成规则的执行命令不是同一个，这可能会给我们带来麻烦，不过好在我们可以使用一个自动化变量 `$@` （关于自动化变量，将在后面讲述），这个变量表示着目前规则中所有的目标的集合，这样说可能很抽象，还是看一个例子吧。

```
bigoutput littleoutput : text.g
    generate text.g -$(subst output,,$@) > $@
```

上述规则等价于：

```
bigoutput : text.g
    generate text.g -big > bigoutput
littleoutput : text.g
    generate text.g -little > littleoutput
```

其中， `-$(subst output,,$@)` 中的 `$` 表示执行一个Makefile的函数，函数名为subst，后面的为参数。关于函数，将在后面讲述。这里的这个函数是替换字符串的意思， `$@` 表示目标的集合，就像一个数组， `$@` 依次取出目标，并执于命令。



## -6- 静态模式

静态模式可以更加容易地定义多目标的规则，可以让我们的规则变得更加的有弹性和灵活。我们还是先来看一下语法：

```
<targets ...> : <target-pattern> : <prereq-patterns ...>
    <commands>
    ...
```

targets定义了一系列的目标文件，可以有通配符。是目标的一个集合。

target-pattern是指明了targets的模式，也就是的目标集模式。

prereq-patterns是目标的依赖模式，它对target-pattern形成的模式再进行一次依赖目标的定义。

这样描述这三个东西，可能还是没有说清楚，还是举个例子来说明一下吧。如果我们的\<target-pattern\>定义成 `%.o` ，意思是我们的\<target\>;集合中都是以 `.o` 结尾的，而如果我们的\<prereq-patterns\>定义成 `%.c` ，意思是对\<target-pattern\>所形成的目标集进行二次定义，其计算方法是，取\<target-pattern\>模式中的 `%` （也就是去掉了 `.o` 这个结尾），并为其加上 `.c` 这个结尾，形成的新集合。

所以，我们的“目标模式”或是“依赖模式”中都应该有 `%` 这个字符，如果你的文件名中有 `%` 那么你可以使用反斜杠 `\` 进行转义，来标明真实的 `%` 字符。

看一个例子：

```
objects = foo.o bar.o

all: $(objects)

$(objects): %.o: %.c
    $(CC) -c $(CFLAGS) $< -o $@
```

上面的例子中，指明了我们的目标从$object中获取， `%.o` 表明要所有以 `.o` 结尾的目标，也就是 `foo.o bar.o` ，也就是变量 `$object` 集合的模式，而依赖模式 `%.c` 则取模式 `%.o` 的 `%` ，也就是 `foo bar` ，并为其加下 `.c` 的后缀，于是，我们的依赖目标就是 `foo.c bar.c` 。而命令中的 `$<` 和 `$@` 则是自动化变量， `$<` 表示第一个依赖文件， `$@` 表示目标集（也就是“foo.o bar.o”）。于是，上面的规则展开后等价于下面的规则：

```
foo.o : foo.c
    $(CC) -c $(CFLAGS) foo.c -o foo.o
bar.o : bar.c
    $(CC) -c $(CFLAGS) bar.c -o bar.o
```

试想，如果我们的 `%.o` 有几百个，那么我们只要用这种很简单的“静态模式规则”就可以写完一堆规则，实在是太有效率了。“静态模式规则”的用法很灵活，如果用得好，那会是一个很强大的功能。再看一个例子：

```
files = foo.elc bar.o lose.o

$(filter %.o,$(files)): %.o: %.c
    $(CC) -c $(CFLAGS) $< -o $@
$(filter %.elc,$(files)): %.elc: %.el
    emacs -f batch-byte-compile $<
```

$(filter %.o,$(files))表示调用Makefile的filter函数，过滤“$files”集，只要其中模式为“%.o”的内容。其它的内容，我就不用多说了吧。这个例子展示了Makefile中更大的弹性。



## -7- 自动生成依赖

在使用大型项目时，一个源文件通常会包含很多头文件，在编写Makefile时，人工手动维护这种依赖关系是一件很容易出错的事。而C/C++编译器提供的一项功能可以很好的解决这个问题。

```
cc -M main.c
```

其输出是：

```
main.o : main.c defs.h
```

编译器会自动生成的依赖关系，这样一来，就不必再手动书写若干文件的依赖关系，而由编译器自动生成了。需要提醒一句的是，如果使用GNU的C/C++编译器，你得用 `-MM` 参数，不然， `-M` 参数会把一些标准库的头文件也包含进来。

gcc -M main.c的输出是:

```
main.o: main.c defs.h /usr/include/stdio.h /usr/include/features.h \
    /usr/include/sys/cdefs.h /usr/include/gnu/stubs.h \
    /usr/lib/gcc-lib/i486-suse-linux/2.95.3/include/stddef.h \
    /usr/include/bits/types.h /usr/include/bits/pthreadtypes.h \
    /usr/include/bits/sched.h /usr/include/libio.h \
    /usr/include/_G_config.h /usr/include/wchar.h \
    /usr/include/bits/wchar.h /usr/include/gconv.h \
    /usr/lib/gcc-lib/i486-suse-linux/2.95.3/include/stdarg.h \
    /usr/include/bits/stdio_lim.h
```

gcc -MM main.c的输出则是:

```makefile
main.o: main.c defs.h
```



下面的问题是如何将此功能与Makefile结合起来呢，不可能让makefile本身也依赖于`%.c`，GNU组织建议把编译器为每一个源文件的自动生成的依赖关系放到一个文件中，为每一个 `name.c` 的文件都生成一个 `name.d` 的Makefile文件， `.d` 文件中就存放对应 `.c` 文件的依赖关系。

于是，我们可以写出 `.c` 文件和 `.d` 文件的依赖关系，并让make自动更新或生成 `.d` 文件，并把其包含在我们的主Makefile中，这样，我们就可以自动化地生成每个文件的依赖关系了。

这里，我们给出了一个模式规则来产生 `.d` 文件：

```
%.d: %.c
    @set -e; rm -f $@; \
    $(CC) -M $(CPPFLAGS) $< > $@.$$$$; \
    sed 's,\($*\)\.o[ :]*,\1.o $@ : ,g' < $@.$$$$ > $@; \
    rm -f $@.$$$$
```

这个规则的意思是，所有的 `.d` 文件依赖于 `.c` 文件， `rm -f $@` 的意思是删除所有的目标，也就是 `.d` 文件，第二行的意思是，为每个依赖文件 `$<` ，也就是 `.c` 文件生成依赖文件， `$@` 表示模式 `%.d` 文件，如果有一个C文件是name.c，那么 `%` 就是 `name` ， `$$$$` 意为一个随机编号，第二行生成的文件有可能是“name.d.12345”，第三行使用sed命令做了一个替换，也就是将`name.c :`替换为`name.c name.d :`。第四行就是删除临时文件。

这个模式要做的事就是在编译器生成的依赖关系中加入 `.d` 文件的依赖，即把依赖关系：

```
main.o : main.c defs.h
```

转成：

```
main.o main.d : main.c defs.h
```

这样`.d`文件也会自动更新并且生成了



# 0x04 书写命令

每条规则中的命令和操作系统Shell的命令行是一致的。make会一按顺序一条一条的执行命令，每条命令的开头必须以 `Tab` 键开头，除非，命令是紧跟在依赖规则后面的分号后的。在命令行之间中的空格或是空行会被忽略，但是如果该空格或空行是以Tab键开头的，那么make会认为其是一个空命令。

我们在UNIX下可能会使用不同的Shell，但是make的命令默认是被 `/bin/sh` ——UNIX的标准Shell 解释执行的。除非你特别指定一个其它的Shell。Makefile中， `#` 是注释符，很像C/C++中的 `//` ，其后的本行字符都被注释。



## -1- 显示命令

通常，make会把其要执行的命令行在命令执行前输出到屏幕上。当我们用 `@` 字符在命令行前，那么，这个命令将不被make显示出来，最具代表性的例子是，我们用这个功能来向屏幕显示一些信息。如:

```
@echo 正在编译XXX模块......
```

当make执行时，会输出“正在编译XXX模块……”字串，但不会输出命令，如果没有“@”，那么，make将输出:

```
echo 正在编译XXX模块......
正在编译XXX模块......
```

如果make执行时，带入make参数 `-n` 或 `--just-print` ，那么其只是显示命令，但不会执行命令，这个功能很有利于我们调试我们的Makefile，看看我们书写的命令是执行起来是什么样子的或是什么顺序的。

而make参数 `-s` 或 `--silent` 或 `--quiet` 则是全面禁止命令的显示。



## -2- 命令执行

如果需要让上一行的命令结果作用于下一行，就需要将这两个命令用分号隔开，而非将这两条命令放在两行。如：

- 示例一：

```
exec:
    cd /home/hchen
    pwd
```

- 示例二：

```
exec:
    cd /home/hchen; pwd
```

当我们执行 `make exec` 时，第一个例子中的cd没有作用，pwd会打印出当前的Makefile目录，而第二个例子中，cd就起作用了，pwd会打印出“/home/hchen”。



## -3- 命令出错

每当命令运行完后，make会检测每个命令的返回码，如果命令返回成功，那么make会执行下一条命令，当规则中所有的命令成功返回后，这个规则就算是成功完成了。如果一个规则中的某个命令出错了（命令退出码非零），那么make就会终止执行当前规则，这将有可能终止所有规则的执行。

有些时候，命令的出错并不表示就是错误的。例如mkdir命令，我们一定需要建立一个目录，如果目录不存在，那么mkdir就成功执行，万事大吉，如果目录存在，那么就出错了。我们之所以使用mkdir的意思就是一定要有这样的一个目录，于是我们就不希望mkdir出错而终止规则的运行。

为了做到这一点，忽略命令的出错，我们可以在Makefile的命令行前加一个减号 `-` （在Tab键之后），标记为不管命令出不出错都认为是成功的。如：

```
clean:
    -rm -f *.o
```

如果在执行make时加上 `-i` 或是 `--ignore-errors` 参数，那么make将会被设定为全局忽略错误，也就是make会忽略掉makefile中全部的错误。

此外，和伪目标一样，我们可以用特殊标记`.IGNORE`将目标设定为忽略错误。例如

```
.IGNORE: clean
clean:
    rm -f *.o
```

这样，无论rm的执行正确与否，make都会忽略掉返回结果，认为是正确的。

还有一个要提一下的make的参数的是 `-k` 或是 `--keep-going` ，这个参数的意思是，如果某规则中的命令出错了，那么就终止该规则的执行，但继续执行其它规则。



## -4- 嵌套执行make

在大型项目中，不同的功能、模块的源文件都被分类放在不同的文件夹目录下，如果将整个工程的编译规则都写在一个makefile中，会导致不便于维护，也会显得makefile过于臃肿，使用起来也不够灵活。为了解决这些问题，可以嵌套使用make，在每个模块的目录下都编写一个对应模块的makefile文件，将该模块下的编译规则、依赖信息写入对应的makefile下，然后在总的makefile中调用这些子目录下的makefile就能做到编译整个项目了。

例如，我们有一个子目录叫subdir，这个目录下有个Makefile文件，来指明了这个目录下文件的编译规则。那么我们总控的Makefile可以这样书写：

```
subsystem:
    cd subdir && $(MAKE)
```

其等价于：

```
subsystem:
    $(MAKE) -C subdir
```

定义$(MAKE)宏变量的意思是，也许我们的make需要一些参数，所以定义成一个变量比较利于维护。这两个例子的意思都是先进入“subdir”目录，然后执行make命令。



总控Makefile的变量可以传递到下级的Makefile中（如果你显示的声明），但是**不会**覆盖下层的Makefile中所定义的变量，除非指定了 `-e` 参数。

如果你要传递变量到下级Makefile中，那么你可以使用这样的声明:

```
export <variable ...>;
```

如果你不想让某些变量传递到下级Makefile中，那么你可以这样声明:

```
unexport <variable ...>;
```

如果要传递所有的变量，那么，只要一个export就行了。后面什么也不用跟，表示传递所有的变量。

需要注意的是，有两个变量，一个是 `SHELL` ，一个是 `MAKEFLAGS` ，这两个变量不管你是否export，其总是要传递到下层 Makefile中，特别是 `MAKEFLAGS` 变量，其中包含了make的参数信息，如果我们执行“总控Makefile”时有make参数或是在上层 Makefile中定义了这个变量，那么 `MAKEFLAGS` 变量将会是这些参数，并会传递到下层Makefile中，这是一个系统级的环境变量。

但是make命令中的有几个参数并不往下传递，它们是 `-C` , `-f` , `-h`, `-o` 和 `-W` （-C 改变工作目录，-f 指定Makefile，-h 输出帮助信息，-o 指定文件不被更新，-W touch指定文件后执行），如果你不想往下层传递参数，那么，你可以这样来：

```
subsystem:
    cd subdir && $(MAKE) MAKEFLAGS=
```

---

还有一个在“嵌套执行”中比较有用的参数， `-w` 或是 `--print-directory` 会在make的过程中输出一些信息，让你看到目前的工作目录。比如，如果我们的下级make目录是“/home/hchen/gnu/make”，如果我们使用 `make -w` 来执行，那么当进入该目录时，我们会看到:

```
make: Entering directory `/home/hchen/gnu/make'.
```

而在完成下层make后离开目录时，我们会看到:

```
make: Leaving directory `/home/hchen/gnu/make'
```

当你使用 `-C` 参数来指定make下层Makefile时， `-w` 会被自动打开的。如果参数中有 `-s` （ `--slient` ）或是 `--no-print-directory` ，那么， `-w` 总是失效的。



## -5- 对应命令包

如果Makefile中出现一些相同命令序列，那么我们可以为这些相同的命令序列定义一个变量。定义这种命令序列的语法以 `define` 开始，以 `endef` 结束，如:

```
define run-yacc
yacc $(firstword $^)
mv y.tab.c $@
endef
```

这里，“run-yacc”是这个命令包的名字，其不要和Makefile中的变量重名。在 `define` 和 `endef` 中的两行就是命令序列。这个命令包中的第一个命令是运行Yacc程序，因为Yacc程序总是生成“y.tab.c”的文件，所以第二行的命令就是把这个文件改改名字。还是把这个命令包放到一个示例中来看看吧。

```
foo.c : foo.y
    $(run-yacc)
```

我们可以看见，要使用这个命令包，我们就好像使用变量一样。在这个命令包的使用中，命令包“run-yacc”中的 `$^` 就是 `foo.y` ， `$@` 就是 `foo.c` ，make在执行命令包时，命令包中的每个命令会被依次独立执行。





# 0x05 使用变量

这一部分，陈皓大佬写得有些冗杂，所以参考了[makefile简明教程](https://www.zhaixue.cc/makefile/makefile-val.html)的部分，





































# -END-

