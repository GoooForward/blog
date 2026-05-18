![image-20251202231908001](https://cdn.jsdelivr.net/gh/GoooForward/picture@main/note-image/image-20251202231908001.png)



# 0x00 如何编译Linux驱动程序

有两种方法

1. 将驱动文件编译进内核，成为内核的一部分
2. 将驱动文件编译成模块（.ko文件），如何安装到内核中



>  **编译成模块的优势**
>
> 如果将所有驱动都编译进内核，会导致内核体积较大 ，并且会拖慢linux的启动速度
> 而内核模块是独立于内核之外的，并且可以在要使用时插入，不用时卸载，更加灵活



# 0x01 把驱动编译为内核模块

## -1- Makefile

```makefile
# 1. 指定内核源码目录（优先使用当前系统内核头文件目录）
KERNELDIR ?= /lib/modules/$(shell uname -r)/build
# 2. 指定当前驱动源码目录（即Makefile所在目录）
PWD := $(shell pwd)
# 3. 指定要编译的模块名称（多个模块用空格分隔，如 obj-m := hello_drv test_drv）
obj-m := hello_drv.o

# 4. 编译规则：调用内核Kbuild系统编译模块
all:
	$(MAKE) -C $(KERNELDIR) M=$(PWD) modules

# 5. 清理规则：删除编译生成的中间文件和模块
clean:
	$(MAKE) -C $(KERNELDIR) M=$(PWD) clean
	rm -rf .cache .tmp_versions Module.symvers modules.order
```

> `$(MAKE) -C $(KERNELDIR) M=$(PWD) modules`
>
> 特别解释下这个编译命令（豆包解释如下）
>
> 1. `make`（即 `$(MAKE)`）
>
> 触发构建系统的入口命令，这里是调用「内核的 Kbuild 系统」，而不是直接编译驱动（普通应用才会用 `make` 直接调用 `gcc`）。
>
> 2. `-C $(KERNELDIR)`：切换到内核构建目录，加载 Kbuild 主规则
>
> - `-C` 是 `make` 命令的参数，含义是「进入指定目录后，再执行后续操作」；
> - `$(KERNELDIR)` 是内核的「构建目录」（不是内核运行目录，是编译相关的规则 / 头文件目录）；
> - 核心目的：让 `make` 先进入内核目录，读取内核自带的 **Kbuild 主规则**（内核源码中的 `Makefile`、`scripts/Kbuild.include` 等），初始化编译环境 —— 比如确定编译器（`gcc`）、编译选项（如 `-DMODULE` 标记内核模块）、内核配置（`.config` 文件中的功能开关）。
>
> 简单说：这一步是「找内核要编译规则」，告诉系统 “按内核的标准来编译”。
>
> 3. `M=$(PWD)`：指定模块源码目录，返回编译
>
> - `M` 是 Kbuild 系统的专属参数（不是 `make` 的参数），含义是「Module（模块）的源码目录」；
> - `$(PWD)` 是驱动源码所在目录（开发者写的 `hello_drv.c` 和 Makefile 在这里）；
> - 核心目的：Kbuild 读取完内核规则后，会**回到 `M` 指定的目录**，加载开发者编写的 Makefile（比如其中的 `obj-m := hello_drv.o`），确定要编译的模块；同时，编译生成的 `.ko` 文件、中间文件（`.o`、`.mod.c`）都会留在这个目录（不会跑到内核目录里）。
>
> 简单说：这一步是「告诉内核我的驱动在哪」，让内核的编译系统 “上门服务”，在驱动目录完成编译。
>
> 4. `modules`：指定 Kbuild 的编译目标
>
> Kbuild 支持多种编译目标（比如编译内核镜像、清理产物等），`modules` 是最常用的目标，含义是「编译指定的可加载内核模块」（即 `obj-m` 标记的文件）。
>
> 其他常见目标（了解即可）：
>
> - `modules_install`：编译后安装模块到系统默认模块目录（`/lib/modules/$(uname -r)/kernel/drivers/`）；
> - `clean`：清理编译生成的中间文件和 `.ko` 模块；
> - `all`：编译内核镜像 + 所有模块（通常用于编译内核本身，不用于驱动）。
>
> ps: modules这个目标的定义在最顶层的Makefile中



## -2- 加载Linux内核模块

### 1. `insmod` - 基础模块加载器

`insmod` 是 "install module" 的缩写。

#### 核心功能

- **功能简单**：它的唯一任务就是将指定的 `.ko` (Kernel Object) 文件加载到内核中。
- **不解决依赖**：`insmod` **不会**检查或自动加载该模块所依赖的其他模块。如果模块 A 依赖模块 B，你必须先手动 `insmod B.ko`，然后才能成功 `insmod A.ko`。
- **路径要求**：你必须提供模块文件的**完整路径**，或者该文件必须在当前工作目录下。

#### 示例

```bash
# 加载当前目录下的 hello_drv.ko 模块
sudo insmod hello_drv.ko

# 加载 /lib/modules/$(uname -r)/kernel/drivers/net/e1000e.ko 模块
sudo insmod /lib/modules/$(uname -r)/kernel/drivers/net/e1000e.ko
```

#### 优缺点

- **优点**：简单直接，只做一件事。
- **缺点**：
    - **依赖处理繁琐**：在加载一个有复杂依赖关系的模块时，你需要手动理清并加载所有依赖，非常容易出错。
    - **路径管理不便**：每次都要输入完整路径，或者切换到模块所在目录。

------

### 2. `modprobe` - 智能模块加载器

`modprobe` 是 "module probe" 的缩写。它是 Linux 系统中加载模块的**首选命令**。

#### 核心功能

- **自动解决依赖**：`modprobe` 会查看 `/lib/modules/$(uname -r)/modules.dep` 文件（这个文件记录了所有模块的依赖关系）。当你加载一个模块时，它会自动加载所有必需的依赖模块。
- **搜索模块路径**：你**不需要**提供完整路径。`modprobe` 会在默认的模块搜索路径（主要是 `/lib/modules/$(uname -r)/`）中查找你指定的模块名。
- **支持模块别名**：很多模块都有别名。例如，`e1000e` 模块可能有个别名 `eth0`。你可以直接使用别名来加载模块，如 `sudo modprobe eth0`。
- **加载和卸载一体化**：虽然 `rmmod` 是专门的卸载命令，但 `modprobe -r` 也可以用来卸载模块，并且同样会处理依赖关系（卸载时会检查并尝试卸载不再被使用的依赖模块）。

#### 示例

```bash
# 加载 e1000e 模块。modprobe 会自动查找并加载它及其所有依赖。
sudo modprobe e1000e

# 卸载 e1000e 模块
sudo modprobe -r e1000e
# 或者使用 rmmod
sudo rmmod e1000e
```

#### 优缺点

- 优点：

    - **自动依赖管理**：这是它最大的优势，极大地简化了模块加载过程。
    - **使用方便**：只需提供模块名，无需关心路径和别名。
    - **功能更全面**：支持卸载、黑名单等高级功能。
    
- 缺点：

    - 对于刚刚编译好、还未安装到系统目录（`/lib/modules/...`）的模块，`modprobe` 默认找不到。你需要先使用 `sudo make modules_install` 安装它，或者手动指定路径（但这会丧失其优势）。

------

### 3. 关键区别对比

| 特性         | `insmod`                         | `modprobe`                           |
| ------------ | -------------------------------- | ------------------------------------ |
| **依赖处理** | **不处理**，需手动加载所有依赖   | **自动处理**，加载模块时自动加载依赖 |
| **模块路径** | **必须**提供完整路径或在当前目录 | 可在默认路径中搜索，无需完整路径     |
| **模块别名** | **不支持**                       | **支持**，可通过别名加载模块         |
| **推荐程度** | 较低，主要用于调试或特殊场景     | **高**，日常和生产环境的首选         |
| **卸载功能** | 无                               | 有 (`modprobe -r`)                   |

### 4. 实际使用建议

1. **日常使用**：**始终优先使用 `modprobe`**。它能为你处理大部分复杂工作，避免因依赖问题导致的加载失败。

    ```bash
    # 编译并安装一个驱动模块后，使用 modprobe 加载它
    make
    sudo make modules_install  # 将模块复制到系统标准路径
    sudo depmod -a             # 强制更新模块依赖关系数据库 (通常 install 会自动触发)
    sudo modprobe hello_drv    # modprobe 可以在标准路径下找到 hello_drv
    ```

    

2. **开发调试**：当你正在开发一个驱动，并且频繁地编译和测试时，使用 `insmod` 会更快捷，因为它不需要你每次都执行 `make modules_install`。

    ```bash
    # 在驱动源码目录下
    make
    sudo insmod hello_drv.ko   # 直接加载当前目录下刚编译好的模块
    dmesg | tail               # 查看模块输出
    sudo rmmod hello_drv       # 卸载模块
    ```

    

    在这种情况下，你的模块通常很简单，没有复杂的外部依赖，`insmod` 的缺点就不那么明显了。

# 0x02 把驱动编译进内核

要将驱动编译进内核，首先要知道内核如何判断一个文件是否需要被编译进内核。Linux内核的编译依赖一个Kbuild的编译系统。在Kbuild中有四个重要文件，`.config`、`Kconfig`、`defconfig`、`Makefile`。

如果把编译内核比作去餐厅吃饭，`Kconfig`就是餐厅的菜单，它表示有哪些东西可选。`.config`表示你点的菜。`defconfig`表示餐厅推出的套餐，里面包含了餐厅预先帮你选好的菜。最后`Makefile`是菜谱，记录了做菜的方法。

## -1- menuconfig

![image-20251201225306867](https://cdn.jsdelivr.net/gh/GoooForward/picture@main/note-image/image-20251201225306867.png)

## -2- Kconfig

图形化配置界面中的每一个选项都会对应一个 Kconfig 文件。所以图形化配置界面的每一级菜单是由 Kconfig 文件来决定的。

<img src="https://cdn.jsdelivr.net/gh/GoooForward/picture@main/note-image/image-20251201230357782.png" alt="image-20251201230357782" style="zoom:80%;" />

## -3- config

config文件就是选择好的配置，Makefile会根据这个配置文件来决定哪些编译、哪些不编译

<img src="https://cdn.jsdelivr.net/gh/GoooForward/picture@main/note-image/image-20251201225917934.png" alt="image-20251201225917934" style="zoom: 80%;" />

## -4- defconfig

defconfig就是字面意思，默认的配置，部分芯片原厂or开发板厂商会提供默认的配置，这样用户可以直接使用，而不用手动重新配置了

![image-20251201230650042](https://cdn.jsdelivr.net/gh/GoooForward/picture@main/note-image/image-20251201230650042.png)

# 0x03 驱动模块传参

**驱动模块传参（Module Parameters）** 是一种在**加载模块时**向内核模块传递配置参数的机制。它允许用户在 `insmod` 或 `modprobe` 时指定参数值（如设备数量、缓冲区大小、调试级别等），而无需重新编译驱动。



## -1- 定义模块参数的方法

内核提供了`module_param()`、`module_param_array()` 和 `module_param_string()` 三个宏用于**从用户空间向内核模块传递参数**

### module_param()

#### **功能**

定义一个**单值**模块参数。

#### **原型**

```c
module_param(name, type, perm);
```

#### **参数说明**

| 参数   | 说明                                                         |
| ------ | ------------------------------------------------------------ |
| `name` | 模块中已声明的**全局变量名**（必须是静态或全局）             |
| `type` | 参数类型（见下表）                                           |
| `perm` | sysfs 中 `/sys/module/<mod>/parameters/name` 的文件权限（如 `S_IRUGO`） |

**支持的 `type` 类型**

| 类型     | C 变量类型       | 示例值                              |
| -------- | ---------------- | ----------------------------------- |
| `bool`   | `bool` / `int`   | `y`, `n`, `1`, `0`, `true`, `false` |
| `int`    | `int`            | `-10`, `42`                         |
| `uint`   | `unsigned int`   | `100`                               |
| `short`  | `short`          | `32767`                             |
| `ushort` | `unsigned short` | `65535`                             |
| `long`   | `long`           | `123456789L`                        |
| `ulong`  | `unsigned long`  | `123456789UL`                       |
| `byte`   | `char`（无符号） | `255`                               |
| `charp`  | `char *`         | `"hello"`（字符串指针）             |

> ⚠️ 注意：**不能使用浮点类型**（内核不支持浮点运算）

**支持的 `perm` 类型**

```c
#define S_IRUSR 00400 /*文件所有者可读*/
#define S_IWUSR 00200 /*文件所有者可写*/
#define S_IXUSR 00100 /*文件所有者可执行*/
#define S_IRGRP 00040 /*与文件所有者同组的用户可读*/
#define S_IWGRP 00020 /*与文件所有者同组的用户可写*/
#define S_IXGRP 00010 /*与文件所有者同组的用户可执行*/
#define S_IROTH 00004 /*与文件所有者不同组的用户可读*/
#define S_IWOTH 00002 /*与文件所有者不同组的用户可写*/
#define S_IXOTH 00001 /*与文件所有者不同组的用户可可执行*/
```



#### 示例

```c
#define MAX_GPIOS 8
static int gpios[MAX_GPIOS] = { -1, -1, -1, -1 }; // 默认无效
static int gpio_count; // 实际传入数量

module_param_array(gpios, int, &gpio_count, S_IRUGO);
MODULE_PARM_DESC(gpios, "List of GPIO numbers (e.g., gpios=18,19,20)");
```

加载时：

```bash
insmod mymod.ko gpios=18,19,20
```

- `gpios[0] = 18`, `gpios[1] = 19`, `gpios[2] = 20`
- `gpio_count = 3`

> 🔔 注意：数组必须预先分配足够空间，否则会越界！

### module_param_array()

#### **功能**

定义一个**数组型**模块参数，支持传入多个值。

#### **原型**

```c
module_param_array(name, type, num, perm);
```

#### **参数说明**

| 参数   | 说明                                            |
| ------ | ----------------------------------------------- |
| `name` | 已声明的**数组变量名**（如 `int arr[10]`）      |
| `type` | 数组元素类型（同 `module_param`）               |
| `num`  | **指向 int 的指针**，用于返回实际传入的元素个数 |
| `perm` | sysfs 权限                                      |

#### **示例**

```c
#define MAX_GPIOS 8
static int gpios[MAX_GPIOS] = { -1, -1, -1, -1 }; // 默认无效
static int gpio_count; // 实际传入数量

module_param_array(gpios, int, &gpio_count, S_IRUGO);
MODULE_PARM_DESC(gpios, "List of GPIO numbers (e.g., gpios=18,19,20)");
```

加载时：

```bash
insmod mymod.ko gpios=18,19,20
```

- `gpios[0] = 18`, `gpios[1] = 19`, `gpios[2] = 20`
- `gpio_count = 3`

### module_param_string()

#### 功能

专门用于定义**固定长度字符数组**（非指针）的字符串参数。

#### 原型

```c
module_param_string(name, string, len, perm);
```

#### 参数说明

| 参数     | 说明                                      |
| -------- | ----------------------------------------- |
| `name`   | 参数名（命令行使用的名字）                |
| `string` | **字符数组变量名**（如 `char mystr[32]`） |
| `len`    | 数组总长度（通常用 `sizeof(mystr)`）      |
| `perm`   | sysfs 权限                                |

#### 示例

```c
static char dev_name[32] = "default_dev"; // 固定缓冲区

module_param_string(devname, dev_name, sizeof(dev_name), S_IRUGO);
MODULE_PARM_DESC(devname, "Device name (max 31 chars)");
```

加载时：

```bash
insmod mymod.ko devname=my_custom_device
```

- `dev_name` 将被复制为 `"my_custom_device"`（自动 null-terminated）
- 若超长，会被截断（保证安全）

> ✅ 优点：避免动态内存分配，适合嵌入式或确定长度的场景。



# 0x04 模块符号导出

一个内核模块（或内核本身）将函数或变量的符号暴露出来，供其他内核模块在运行时动态链接使用。

## -1- 为什么需要符号导出

内核模块是**独立编译**的 `.ko` 文件，默认情况下，**模块内的函数/变量对外不可见**，如果模块 B 想调用模块 A 中的函数 `foo()`，模块 A 必须**主动导出 `foo`**，否则会报错：`Unknown symbol foo (err -2)`



## -2- 符号导出方法

Linux提供了两个宏，`EXPORT_SYMBOL(sym)`和`EXPORT_SYMBOL_GPL(sym)`，二者的区别在于`EXPORT_SYMBOL_GPL(sym)`**仅限 GPL 兼容模块**使用。

### 示例

模块 A：导出函数

```c
// my_module_a.c
#include <linux/module.h>
#include <linux/kernel.h>

// 被导出的函数
int my_shared_function(int x) {
    printk(KERN_INFO "my_shared_function called with %d\n", x);
    return x * 2;
}

// 导出符号（允许其他模块调用）
EXPORT_SYMBOL_GPL(my_shared_function);

static int __init init_mod(void) {
    printk(KERN_INFO "Module A loaded\n");
    return 0;
}

static void __exit cleanup_mod(void) {
    printk(KERN_INFO "Module A unloaded\n");
}

module_init(init_mod);
module_exit(cleanup_mod);
MODULE_LICENSE("GPL");
```

模块 B：使用导出的符号

```c
// my_module_b.c
#include <linux/module.h>
#include <linux/kernel.h>

// 声明外部函数（必须与定义一致）
extern int my_shared_function(int x);

static int __init init_mod(void) {
    int result = my_shared_function(10);
    printk(KERN_INFO "Got result: %d\n", result);
    return 0;
}

static void __exit cleanup_mod(void) {
    printk(KERN_INFO "Module B unloaded\n");
}

module_init(init_mod);
module_exit(cleanup_mod);
MODULE_LICENSE("GPL");  // 必须是 GPL 才能使用 EXPORT_SYMBOL_GPL
```

### 注意事项

1. 必须先加载 **导出符号的模块（A）**，再加载 **使用符号的模块（B）**，否则 `insmod module_b.ko` 会失败
2. **不能导出 static 函数**

3. **查看已导出符号**

    ```bash
    # 查看所有内核导出符号（包括模块）
    cat /proc/kallsyms | grep my_shared_function
    
    # 或使用 nm（需 root）
    sudo nm /sys/module/my_module_a/sections/.text
    ```

    
