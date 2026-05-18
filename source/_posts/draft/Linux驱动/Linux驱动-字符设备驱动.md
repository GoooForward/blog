![image-20251202234007233](https://cdn.jsdelivr.net/gh/GoooForward/picture@main/note-image/image-20251202234007233.png)

![image-20251202234134074](https://cdn.jsdelivr.net/gh/GoooForward/picture@main/note-image/image-20251202234134074.png)



# 0x00 设备号

在 Linux 内核中，**设备号（Device Number）** 是用于唯一标识一个设备的内核数据结构。每个设备文件（通常位于 `/dev` 目录下）都关联一个设备号，该设备号由两部分组成：

- **主设备号（Major Number）**
- **次设备号（Minor Number）**

## -1- 主设备号（Major Number）

- 用于标识**设备驱动程序**。
- 同一类型的设备（例如所有 IDE 硬盘、所有串口等）通常共享同一个主设备号。
- 内核通过主设备号将设备操作（如 `open`, `read`, `write` 等）路由到对应的驱动程序。

> 举例：
> 主设备号 4 通常分配给 TTY（终端）设备；
> 主设备号 1 分配给内存设备（如 `/dev/null`, `/dev/zero`）。

------

## -2- 次设备号（Minor Number）

- 用于标识**具体的硬件实例或子设备**。
- 同一驱动程序可以管理多个设备，这些设备具有相同的主设备号，但次设备号不同。
- 次设备号由驱动程序自己解释，内核不关心其具体含义。

> 举例：
> `/dev/ttyS0` 和 `/dev/ttyS1` 都是串口设备，主设备号为 4，次设备号分别为 64 和 65。

------

## -3- 设备号的表示与操作

在内核中，设备号用 `dev_t` 类型表示（通常是 32 位或 64 位整数）。Linux 提供了宏来操作主/次设备号：

```c
#include <linux/types.h>

// 从 dev_t 提取主/次设备号
unsigned int major = MAJOR(dev);
unsigned int minor = MINOR(dev);

// 由主/次设备号合成 dev_t
dev_t dev = MKDEV(major, minor);
```

------

## -4- 动态 vs 静态分配设备号

- **静态分配**：开发者在编写驱动时指定固定的主设备号（不推荐，容易冲突）。
- **动态分配**：使用 `alloc_chrdev_region()`（字符设备）或 `register_blkdev()`（块设备）让内核自动分配未使用的主设备号。

------

## -5- 查看系统中的设备号

在用户空间，可以通过 `ls -l /dev/xxx` 查看设备文件的主/次设备号：

```bash
$ ls -l /dev/null
crw-rw-rw- 1 root root 1, 3 Nov 27 10:00 /dev/null
```

其中 `1, 3` 表示主设备号为 1，次设备号为 3。

也可以查看 `/proc/devices` 获取已注册的字符和块设备的主设备号列表：

```bash
$ cat /proc/devices
Character devices:
  1 mem
  4 /dev/vc/0
  4 tty
...

Block devices:
  8 sd
  9 md
...
```



# 0x01 设备号的动态分配与释放

> 静态分配就是手动指定设备号，非系统分配，当指定的主设备号已被占用时，会导致注册失败，通常不推荐使用。

## alloc_chrdev_region()

- **功能简述**：
      在 Linux 内核中动态分配一个字符设备号范围（包含主设备号和一组连续的次设备号），用于后续注册字符设备驱动。

- **头文件**：  

    ```c
    #include <linux/fs.h>
    ```

- **函数原型**：  

    ```c
    int alloc_chrdev_region(
        dev_t *dev,
        unsigned int firstminor,
        unsigned int count,
        const char *name
    );
    ```

- **参数说明**：

    - `dev`：指向 `dev_t` 类型的指针，用于接收内核分配的起始设备号（成功时写入主设备号和起始次设备号）。
    - `firstminor`：请求分配的起始次设备号，通常为 `0`。
    - `count`：需要连续分配的次设备号数量（必须 ≥ 1）。
    - `name`：设备驱动的名称字符串，将显示在 `/proc/devices` 的字符设备列表中，用于标识该设备。

- **返回值**：  

    - 成功时返回 `0`；
    - 失败时返回负的错误码（如 `-ENOMEM` 表示内存不足，`-EINVAL` 表示参数无效等），此时 `*dev` 的内容未定义。

- **注意事项**：

    1. 该函数仅可在内核空间（如内核模块或内置驱动）中使用，属于 Linux 内核 API，不能在用户空间程序中调用。
    2. 必须与 `unregister_chrdev_region()` 配对使用，在驱动卸载时释放已分配的设备号，防止资源泄漏。
    3. 主设备号由内核自动选择，避免了静态分配（如硬编码主设备号）可能引发的冲突，是现代驱动开发的标准做法。
    4. 此函数仅分配设备号，**不会自动在 `/dev` 目录下创建设备节点**；需配合 `class_create()` 和 `device_create()` 等接口，或依赖用户空间的 `udev` 机制创建设备文件。
    5. 常与 `cdev_init()`、`cdev_add()` 联合使用，完成完整的字符设备注册流程。
    6. 该接口为 Linux 内核特有，不属于 POSIX 或通用 C 标准，仅适用于 Linux 内核模块开发。



## unregister_chrdev_region()

- **功能简述**：
      释放先前通过 `alloc_chrdev_region()` 动态分配的字符设备号范围，注销该设备号以供系统重新使用。

- **头文件**：  

    ```c
    #include <linux/fs.h>
    ```

- **函数原型**：  

    ```c
    void unregister_chrdev_region(dev_t from, unsigned int count);
    ```

- **参数说明**：

    - `from`：要释放的设备号范围的起始设备号（即 `alloc_chrdev_region()` 成功时写入 `dev` 的值）。
    - `count`：要释放的连续次设备号数量，必须与当初调用 `alloc_chrdev_region()` 时传入的 `count` 值一致。

- **返回值**：  

    - 无返回值（`void`）。

- **注意事项**：

    1. 该函数仅在内核空间使用，是 Linux 内核驱动开发的一部分，不能在用户空间程序中调用。
    2. 必须与 `alloc_chrdev_region()` 配对使用；若未分配设备号而调用此函数，可能导致内核不稳定或错误。
    3. 通常在模块退出函数（如 `__exit` 函数）中调用，确保驱动卸载时正确释放资源。
    4. 即使驱动初始化失败（例如 `cdev_add()` 失败），只要 `alloc_chrdev_region()` 成功，仍需调用此函数释放设备号。
    5. 释放设备号不会自动删除 `/dev` 下已创建的设备节点；若使用了 `device_create()` 创建设备文件，应先调用 `device_destroy()` 和 `class_destroy()` 清理设备类和节点，再释放设备号。
    6. 该接口为 Linux 内核特有，不属于 POSIX 或标准 C 库，仅适用于内核模块或内置驱动开发。



# 0x02 字符设备 `cdev`

在 Linux 内核中，**字符设备驱动（Character Device Driver）** 是最常见的一类设备驱动，用于管理以**字节流方式**访问的硬件或虚拟设备（如串口、LED、按键、framebuffer 等）。
`cdev`（character device 的缩写）是内核提供的核心数据结构，用于将设备号（dev_t）与文件操作接口（file_operations）关联起来。

## -1- 什么是 `cdev`？

`cdev` 是 `struct cdev` 类型的结构体，定义在 `<linux/cdev.h>` 中。它代表一个字符设备，并负责：

- 将设备号（主/次）映射到对应的 `file_operations`
- 管理设备的生命周期
- 与 VFS（虚拟文件系统）交互

> 每个字符设备在内核中通常对应一个 `cdev` 实例。

------

## -2- 关键数据结构

### 1. `struct cdev`

```c
struct cdev {
    struct kobject kobj;          // 内嵌 kobject，用于 sysfs
    struct module *owner;         // 指向所属模块（通常设为 THIS_MODULE）
    const struct file_operations *ops;  // 设备的操作方法集合
    struct list_head list;        // 用于链接到同一主设备号下的其他 cdev
    dev_t dev;                    // 起始设备号
    unsigned int count;           // 管理的连续次设备数量
};
```

### 2. `struct file_operations`

这是驱动的核心，定义在`<linux/fs.h>`。定义了用户空间对设备文件（如 `/dev/mydev`）进行 `open`、`read`、`write` 等操作时内核调用的函数：

```c
struct file_operations {
	struct module *owner;
	loff_t (*llseek) (struct file *, loff_t, int);
	ssize_t (*read) (struct file *, char __user *, size_t, loff_t *);
	ssize_t (*write) (struct file *, const char __user *, size_t, loff_t *);
	int (*open) (struct inode *, struct file *);
	int (*release) (struct inode *, struct file *);
    ...
};
```



# 0x03 字符设备的注册



## cdev_init()

- **功能简述**：
      初始化一个 `cdev`（字符设备）结构体，将其与一组文件操作函数（`file_operations`）关联，为后续将该字符设备注册到内核做准备。

- **头文件**：  

    ```c
    #include <linux/cdev.h>
    ```

- **函数原型**：  

    ```c
    void cdev_init(struct cdev *cdev, const struct file_operations *fops);
    ```

- **参数说明**：

    - `cdev`：指向待初始化的 `struct cdev` 结构体的指针。通常该结构体是驱动程序中定义的静态变量或动态分配的内存。
    - `fops`：指向 `struct file_operations` 结构体的指针，包含设备支持的系统调用操作（如 `open`、`read`、`write`、`ioctl` 等）。

- **返回值**：  

    - 无返回值（`void`）。

- **注意事项**：

    1. 该函数仅在内核空间使用，属于 Linux 内核 API，不能在用户空间程序中调用。
    2. `cdev_init()` 会将 `cdev->ops` 设置为传入的 `fops`，并将 `cdev->kobj` 初始化为默认状态；**不会分配内存**，因此 `cdev` 结构体必须由调用者预先分配（静态或动态）。
    3. 初始化后的 `cdev` 必须通过 `cdev_add()` 注册到内核设备号系统中，用户空间才能通过 `/dev` 节点访问该设备。
    4. 若使用动态分配的 `cdev`（如 `kmalloc()`），需在设备移除时手动释放内存（通常在 `cdev_del()` 之后）。
    5. 该接口为 Linux 内核特有，是现代字符设备驱动开发的标准组成部分，常与 `alloc_chrdev_region()` 和 `cdev_add()` 配合使用。



## cdev_add()

- **功能简述**：
      将已初始化的 `cdev`（字符设备）结构体注册到 Linux 内核的设备号系统中，使其对用户空间可见并可被访问（例如通过 `/dev` 下的设备节点）。

- **头文件**：  

    ```c
    #include <linux/cdev.h>
    ```

- **函数原型**：  

    ```c
    int cdev_add(struct cdev *p, dev_t dev, unsigned int count);
    ```

- **参数说明**：

    - `p`：指向已通过 `cdev_init()` 初始化的 `struct cdev` 结构体的指针。
    - `dev`：要关联的起始设备号（由 `alloc_chrdev_region()` 或 `MKDEV()` 获得），包含主设备号和起始次设备号。
    - `count`：该 `cdev` 所管理的连续次设备号数量（必须 ≥ 1），应与分配设备号时的 `count` 一致。

- **返回值**：  

    - 成功时返回 `0`；
    - 失败时返回负的错误码（如 `-EBUSY` 表示设备号已被占用，`-EINVAL` 表示参数无效等）。

- **注意事项**：

    1. 该函数仅在内核空间使用，是 Linux 字符设备驱动注册流程的关键步骤。
    2. **调用 `cdev_add()` 后，设备立即对内核“激活”** —— 即用户空间可以立即 `open()` 对应的设备节点，因此必须确保此时驱动的所有资源（如内存、硬件状态、锁等）已准备就绪。
    3. 通常在 `alloc_chrdev_region()` 分配设备号、`cdev_init()` 初始化 `cdev` 之后调用。
    4. 若 `cdev_add()` 失败，应释放已分配的设备号（调用 `unregister_chrdev_region()`）并清理其他资源。
    5. 与 `cdev_add()` 配对的是 `cdev_del()`，用于在驱动卸载时从内核移除设备（但注意：`cdev_del()` 不会释放设备号，仍需调用 `unregister_chrdev_region()`）。
    6. 该函数不会创建 `/dev` 下的设备文件；需配合 `class_create()` 和 `device_create()`（或用户空间 `udev`/`mknod`）才能让用户通过路径访问设备。
    7. 一个 `cdev` 可以管理多个次设备号（如 `count=4`），驱动需在 `file_operations` 的回调函数（如 `.open`）中通过 `inode->i_rdev` 或 `iminor(file_inode(file))` 区分具体是哪个次设备被访问



## cdev_del()

- **功能简述**：
      从 Linux 内核的设备管理系统中移除一个已注册的字符设备（`cdev`），使其不再可被用户空间访问。

- **头文件**：  

    ```c
    #include <linux/cdev.h>
    ```

- **函数原型**：  

    ```c
    void cdev_del(struct cdev *p);
    ```

- **参数说明**：

    - `p`：指向之前通过 `cdev_add()` 成功注册的 `struct cdev` 结构体的指针。

- **返回值**：  

    - 无返回值（`void`）。

- **注意事项**：

    1. 该函数仅在内核空间使用，属于 Linux 内核驱动 API，不能在用户空间调用。
    2. **必须与 `cdev_add()` 配对使用**：每个成功调用 `cdev_add()` 的 `cdev`，都应在驱动卸载或出错路径中调用一次 `cdev_del()`。
    3. 调用 `cdev_del()` 后，内核将不再接受对该设备的新系统调用（如 `open`、`read` 等），但**不会立即释放 `cdev` 结构体内存**——若 `cdev` 是动态分配的（如 `kmalloc()`），需在 `cdev_del()` 之后手动 `kfree()`。
    4. **`cdev_del()` 不会释放设备号**！设备号（由 `alloc_chrdev_region()` 分配）必须通过 `unregister_chrdev_region()` 单独释放。
    5. 在调用`cdev_del()` 之前，应确保：
        - 已调用 `device_destroy()` 删除 `/dev` 下的设备节点；
        - 已调用 `class_destroy()` 销毁设备类（如果使用了）；
        - 没有正在进行的 I/O 操作（通常由 `.release` 回调保证资源最终释放）。
    6. 该函数是安全的：即使传入 `NULL` 指针，现代内核通常会做空指针检查（但良好实践仍应避免传入无效指针）。
    7. 此接口为 Linux 内核特有，用于字符设备驱动的清理阶段，常出现在模块的 `__exit` 函数中。

# 0x04 自动创建设备节点

在 Linux 内核驱动开发中，**自动创建设备节点**（如 `/dev/my_device`）是现代驱动的标准做法。过去需要用户手动执行 `mknod /dev/xxx c major minor`，现在内核可通过 **`class_create()` + `device_create()`** 自动通知 **udev**（或 **mdev**）在 `/dev/` 下创建设备文件

## -1- 原理

1. 驱动调用 `class_create()` 创建一个 **设备类（class）**；
2. 调用 `device_create()` 向该类注册一个设备；
3. 内核通过 **uevent 机制** 向用户空间发送事件；
4. **udev daemon**（systemd-udevd）监听到事件后，自动在 `/dev/` 下创建设备节点。

> 📌 **无需手动 mknod！也无需 init 脚本！**
>
> 创建最后创建文件实际是个用户空间的行为

## -2- 创建方法

### class_create()

- **功能简述**：
    创建并初始化一个设备类（`struct class`），用于在 `/sys/class/` 目录下建立对应的 sysfs 类入口，并为后续通过 `device_create()` 自动创建 `/dev` 节点提供基础。该类可被用户空间的设备管理器（如 udev 或 mdev）识别，从而实现设备节点的自动创建与管理。

- **头文件**：  

    ```c
    #include <linux/device.h>
    ```

- **函数原型**：  

    ```c
    struct class *class_create(struct module *owner, const char *name);
    ```

- **参数说明**：

    - `owner`：指向所属内核模块的指针，通常传入 `THIS_MODULE`。用于内核跟踪模块引用关系，防止在设备类仍在使用时卸载模块。
    - `name`：设备类的名称（字符串），该名称将作为目录名出现在 `/sys/class/` 下（例如，若 `name` 为 `"my_class"`，则生成 `/sys/class/my_class/`）。

- **返回值**：  

    - 成功时返回指向新创建的 `struct class` 的指针；
    - 失败时返回一个错误指针（可通过 `IS_ERR()` 判断），具体错误码可通过 `PTR_ERR()` 获取（如 `-ENOMEM` 表示内存不足）。

- **注意事项**：

    1. 创建的 `class` 对象由内核内部管理，**调用者不应手动释放其内存**；应通过配对的 `class_destroy()` 安全销毁。
    2. 必须在调用 `device_create()` 之前成功创建设备类，否则无法触发 udev/mdev 自动创建 `/dev` 节点。
    3. 设备类名称应具有唯一性，避免与其他驱动冲突；建议使用驱动或子系统特有的命名。
    4. 在模块卸载时，必须调用 `class_destroy()` 释放该类，否则会导致内核资源泄漏和 sysfs 残留。
    5. 该接口是现代 Linux 字符/块设备驱动中实现 **自动设备节点管理** 的关键组成部分，通常与 `alloc_chrdev_region()`、`cdev_add()` 和 `device_create()` 配合使用。



### class_destroy()

- **功能简述**：
     销毁一个通过 `class_create()` 创建的设备类（`struct class`）。该函数会从 sysfs 的 `/sys/class/` 目录下移除对应的类目录，并释放内核中与该类相关的所有资源。通常在模块卸载时调用，以完成设备类的清理工作。

- **头文件**：  

    ```c
    #include <linux/device.h>
    ```

- **函数原型**：  

    ```c
    void class_destroy(struct class *cls);
    ```

- **参数说明**：

    - `cls`：指向要销毁的设备类（`struct class`）的指针，该指针应为之前成功调用 `class_create()` 所返回的值。若传入 `NULL`，函数将直接返回，不会执行任何操作。

- **返回值**：
      无返回值（`void`）。该函数不报告错误，但要求调用者确保传入的 `cls` 是有效的且不再被其他设备引用。

- **注意事项**：

    - 在调用 `class_destroy()` 之前，必须确保该类下所有通过 `device_create()` 创建的设备均已通过 `device_destroy()` 销毁。否则可能导致内核警告、资源泄漏或系统不稳定。
    - 该函数通常在内核模块的退出函数（如 `module_exit`）中调用，作为设备模型资源释放的一部分。
    - `class_destroy()` 是 `class_create()` 的配对清理函数，二者应成对使用，以保证资源的正确分配与释放。
    - 若模块未成功创建类（例如 `class_create()` 返回错误），则不应调用 `class_destroy()`，以免传入无效指针。



### device_create()

- **功能简述**：
    在指定的设备类（`struct class`）下创建一个设备对象，并在 `/sys/class/<class_name>/` 目录中生成对应的 sysfs 设备条目。同时，内核会向用户空间发送 uevent 事件，触发 udev 或 mdev 等设备管理器在 `/dev/` 目录下自动创建相应的设备节点（如 `/dev/my_device`），从而实现设备文件的自动化管理。

- **头文件**：  

    ```c
    #include <linux/device.h>
    ```

- **函数原型**：  

    ```c
    struct device *device_create(
        struct class *cls,
        struct device *parent,
        dev_t devt,
        void *drvdata,
        const char *fmt,
        ...
    );
    ```

- **参数说明**：

    - `cls`：指向已通过 `class_create()` 创建的设备类的指针，新设备将归属该类。
    - `parent`：父设备指针（通常为 `NULL`），用于构建设备拓扑层次；若无明确父子关系，可设为 `NULL`。
    - `devt`：设备号（`dev_t` 类型），由主设备号和次设备号组成，通常通过 `alloc_chrdev_region()` 或 `MKDEV()` 获得。
    - `drvdata`：驱动私有数据指针，可传入设备上下文结构体等，后续可通过 `dev_get_drvdata()` 获取；若无需传递，可设为 `NULL`。
    - `fmt` 及可变参数：用于格式化设备节点名称（类似 `printf`），最终作为 `/dev/` 下的文件名及 sysfs 中的设备名（例如 `"my_dev%d", minor` 可生成 `my_dev0`）。

- **返回值**：  

    - 成功时返回指向新创建的 `struct device` 的指针；
    - 失败时返回一个错误指针（可通过 `IS_ERR()` 判断），具体错误码可通过 `PTR_ERR()` 获取（如 `-ENOMEM` 表示内存不足，`-EINVAL` 表示无效参数）。

- **注意事项**：

    1. 必须在成功调用 `class_create()` 之后使用，否则无法正确关联设备类，导致 sysfs 条目缺失或 uevent 无法触发。
    2. 设备节点的实际创建由用户空间的 **udev**（systemd 系统）或 **mdev**（BusyBox 系统）完成，因此系统必须运行相应的设备管理服务。
    3. 返回的 `struct device*` 由内核管理，**不应手动释放内存**；应通过配对的 `device_destroy()` 安全移除设备。
    4. 在模块卸载时，必须先调用 `device_destroy()` 销毁设备，再调用 `class_destroy()` 销毁类，顺序不可颠倒。
    5. 设备名称（`fmt` 参数）应避免包含路径分隔符（如 `/`）或非法字符，且需保证在同一类中唯一，以防命名冲突。
    6. 若未调用 `device_create()`，即使 `cdev_add()` 成功注册了字符设备，用户空间也无法通过标准 `/dev/` 路径访问设备（除非手动 `mknod`）。



### device_destroy()

- **功能简述**：
      销毁（注销）一个通过 `device_create()` 创建的设备对象。该函数会从 sysfs 中移除对应的设备目录，并通知用户空间的设备管理器（如 udev 或 mdev）删除相应的 `/dev` 节点，从而完成设备的清理工作。

- **头文件**：  

    ```c
    #include <linux/device.h>
    ```

- **函数原型**：  

    ```c
    void device_destroy(struct class *cls, dev_t devt);
    ```

- **参数说明**：

    - `cls`：指向此前通过 `class_create()` 创建的设备类（`struct class`）的指针。该类必须与创建设备时所用的类一致。
    - `devt`：设备的设备号（`dev_t` 类型），即在调用 `device_create()` 时传入的设备号。内核通过该设备号唯一标识要销毁的设备实例。

- **返回值**：
      无返回值（`void`）。该函数内部会处理设备是否存在等异常情况，但不会向调用者返回错误码。

- **注意事项**：

    - 必须确保传入的 `cls` 和 `devt` 与之前调用 `device_create()` 时使用的参数匹配，否则可能导致未定义行为或无法正确删除设备节点。
    - 通常应在模块退出函数（如 `module_exit`）中调用此函数，以确保设备在模块卸载前被正确注销。
    - 在调用 `device_destroy()` 之后，应紧接着调用 `class_destroy()` 来销毁设备类本身（如果该类不再被其他设备使用）。
    - 此函数是 `device_create()` 的配对清理函数，二者应成对使用以避免资源泄漏或残留的 sysfs 条目。



## -3- 示例

**自动创建 /dev/my_char_dev**

```c
#include <linux/module.h>
#include <linux/fs.h>
#include <linux/cdev.h>
#include <linux/device.h>
#include <linux/uaccess.h>

#define DEVICE_NAME "my_char_dev"
#define CLASS_NAME  "my_class"

static dev_t dev_num;
static struct cdev my_cdev;
static struct class *my_class = NULL;

static int my_open(struct inode *inode, struct file *file) {
    printk(KERN_INFO "Device opened\n");
    return 0;
}

static int my_release(struct inode *inode, struct file *file) {
    printk(KERN_INFO "Device closed\n");
    return 0;
}

static ssize_t my_read(struct file *file, char __user *buf, size_t count, loff_t *ppos) {
    const char *msg = "Hello from kernel!\n";
    size_t len = strlen(msg);
    if (*ppos >= len) return 0;
    if (copy_to_user(buf, msg + *ppos, min(count, len - (size_t)*ppos)))
        return -EFAULT;
    *ppos += min(count, len - (size_t)*ppos);
    return min(count, len - (size_t)*ppos);
}

static const struct file_operations fops = {
    .owner = THIS_MODULE,
    .read = my_read,
    .open = my_open,
    .release = my_release,
};

static int __init init_module(void)
{
    int ret;

    // 1. 动态分配设备号（推荐）
    ret = alloc_chrdev_region(&dev_num, 0, 1, DEVICE_NAME);
    if (ret < 0) {
        printk(KERN_ERR "Failed to allocate chrdev region\n");
        return ret;
    }

    // 2. 初始化并添加 cdev
    cdev_init(&my_cdev, &fops);
    my_cdev.owner = THIS_MODULE;
    ret = cdev_add(&my_cdev, dev_num, 1);
    if (ret < 0) {
        printk(KERN_ERR "Failed to add cdev\n");
        unregister_chrdev_region(dev_num, 1);
        return ret;
    }

    // 3. 创建设备类（出现在 /sys/class/my_class/）
    my_class = class_create(THIS_MODULE, CLASS_NAME);
    if (IS_ERR(my_class)) {
        printk(KERN_ERR "Failed to create device class\n");
        cdev_del(&my_cdev);
        unregister_chrdev_region(dev_num, 1);
        return PTR_ERR(my_class);
    }

    // 4. 自动创建 /dev/my_char_dev
    if (IS_ERR(device_create(my_class, NULL, dev_num, NULL, DEVICE_NAME))) {
        printk(KERN_ERR "Failed to create device\n");
        class_destroy(my_class);
        cdev_del(&my_cdev);
        unregister_chrdev_region(dev_num, 1);
        return PTR_ERR(my_class); // 注意：这里应返回 device_create 的错误
    }

    printk(KERN_INFO "Device /dev/%s created (major %d)\n", 
           DEVICE_NAME, MAJOR(dev_num));
    return 0;
}

static void __exit cleanup_module(void)
{
    // 1. 销毁 /dev 节点（触发 udev 删除）
    device_destroy(my_class, dev_num);

    // 2. 销毁 class
    class_destroy(my_class);

    // 3. 删除 cdev
    cdev_del(&my_cdev);

    // 4. 释放设备号
    unregister_chrdev_region(dev_num, 1);

    printk(KERN_INFO "Device removed\n");
}

MODULE_LICENSE("GPL");
MODULE_DESCRIPTION("Auto-create /dev node example");
```





# 0x05 字符设备使用流程

## 步骤 1：分配并初始化 `cdev`

```c
struct cdev my_cdev;

// 方法1：静态定义 + cdev_init()
cdev_init(&my_cdev, &fops);
my_cdev.owner = THIS_MODULE;
```

> 也可以动态分配：`struct cdev *my_cdev = cdev_alloc();`，但较少用。

------

## 步骤 2：分配设备号

```c
dev_t dev_num;
int ret = alloc_chrdev_region(&dev_num, 0, 1, "mydev");
if (ret < 0) {
    // 错误处理
}
```

> 若需多个设备（如 4 个 LED），可将 `count` 设为 4。

------

## 步骤 3：将 `cdev` 添加到内核

```c
ret = cdev_add(&my_cdev, dev_num, 1);  // 1 表示管理 1 个次设备
if (ret < 0) {
    // 添加失败，需清理
}
```

> ⚠️ **注意**：一旦 `cdev_add()` 成功，设备就“在线”了！必须确保 `fops` 中的函数已准备就绪。

------

## 步骤 4：创建 `/dev` 设备节点

仅靠 `cdev_add()` 不会自动创建 `/dev/xxx` 文件。需借助 **设备类（class）** 和 **device_create()**：

```c
struct class *my_class;

// 创建类（出现在 /sys/class/ 下）
my_class = class_create(THIS_MODULE, "mydev_class");
if (IS_ERR(my_class)) { /* 错误处理 */ }

// 创建设备节点（udev 会自动在 /dev 下生成）
device_create(my_class, NULL, dev_num, NULL, "mydev");
```

这样，用户空间就能通过 `/dev/mydev` 访问设备。

------

## 步骤 5：卸载时清理资源

```c
// 1. 删除 cdev
cdev_del(&my_cdev);

// 2. 销毁设备节点
device_destroy(my_class, dev_num);

// 3. 销毁类
class_destroy(my_class);

// 4. 释放设备号
unregister_chrdev_region(dev_num, 1);
```

顺序很重要：先删设备，再释放号。





# 0x06 私有数据

内核通过 `struct device` 的 `driver_data` 字段存储私有指针。当有多个子设备时，它们共用同一个驱动，可以利用私有数据来区分。

## -1- 实现方法

首先要将设备私有的数据打包起来

```c
struct my_device {
    dev_t dev_num;               // 设备号
    struct cdev my_cdev;         // cdev 结构，非指针，通过cdev指针，可以定位到my_device的位置
    struct device *my_device;
    char msg[BUF_SIZE];
    size_t msg_len;
};
```

通过 drvdata 传递私有数据

```c
static struct class *my_class;
static struct my_device *my_dev;

static int __init my_init(void)
{
    int ret;

    // 分配私有数据结构
    my_dev = kzalloc(sizeof(*my_dev), GFP_KERNEL);
    if (!my_dev)
        return -ENOMEM;

    // 初始化内容
    my_dev->id = 0;
    snprintf(my_dev->name, sizeof(my_dev->name), "my_dev0");
    spin_lock_init(&my_dev->lock);

    // 分配设备号
    ret = alloc_chrdev_region(&my_dev->dev_num, 0, 1, my_dev->name);
    if (ret < 0)
        goto err_free;

    // 创建设备类
    my_class = class_create(THIS_MODULE, "my_class");
    if (IS_ERR(my_class)) {
        ret = PTR_ERR(my_class);
        goto err_unregister;
    }

    // 👇 关键：通过 drvdata 传递私有数据
    struct device *dev = device_create(my_class, NULL, my_dev->dev_num, my_dev, "my_dev%d", 0);
    if (IS_ERR(dev)) {
        ret = PTR_ERR(dev);
        goto err_class;
    }

    // 初始化并注册 cdev（注意：将 my_dev 传给 file_operations）
    cdev_init(&my_dev->cdev, &my_fops);
    my_dev->cdev.owner = THIS_MODULE;
    ret = cdev_add(&my_dev->cdev, my_dev->dev_num, 1);
    if (ret < 0)
        goto err_device;

    return 0;

err_device:
    device_destroy(my_class, my_dev->dev_num);
err_class:
    class_destroy(my_class);
err_unregister:
    unregister_chrdev_region(my_dev->dev_num, 1);
err_free:
    kfree(my_dev);
    return ret;
}
```

在 file_operations 中获取私有数据

由于 `open` 是第一个被调用的操作，通常在此处将私有数据保存到 `file->private_data`

```c
static int my_open(struct inode *inode, struct file *file)
{
    // 从 inode 获取设备号，再通过设备号找到 device？
    // ❌ 不推荐！更可靠的方式：利用已注册的 device 实例

    // ✅ 正确做法：在 device_create 时已绑定 drvdata，
    // 但 open 无法直接访问 struct device。
    // 替代方案：在 init 时将 my_dev 作为全局变量，或通过 container_of（若 cdev 嵌入在 my_device 中）

    // 推荐设计：将 cdev 嵌入在 my_device 结构体中（见下方“最佳实践”）
    struct my_device *dev = container_of(inode->i_cdev, struct my_device, cdev);
    file->private_data = dev;
    return 0;
}

static ssize_t my_read(struct file *file, char __user *buf, size_t count, loff_t *ppos)
{
    struct my_device *dev = file->private_data;  // ✅ 直接获取
    printk("Reading from device %s (id=%d)\n", dev->name, dev->id);
    // ... 使用 dev->base_addr, dev->lock 等
    return 0;
}
```

