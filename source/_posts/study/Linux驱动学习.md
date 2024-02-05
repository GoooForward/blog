---
title: Linux驱动学习笔记
date: 2024-02-04 10:59:00
updated: {{ date }}
#hide: true
tags: 
categories: 学习
---



# 0x01 **字符设备驱动开发**



## -1- 应用层到驱动层的流程

1. 应用程序调用`fopen()`函数
2. C库中的fopen()函数借助linux系统调用陷入内核
3. 内核找到对应驱动的open()函数
4. 调用驱动的open()函数完成操作



## -2- 驱动工作流程

驱动有入口和出口两个函数

```c
static int __init xxx_init(void)
{
	/* 入口函数具体内容 */
	return 0;
}

static void __exit xxx_exit(void)
 
 	/* 出口函数具体内容 */
}
```

这里的`__init`和`__exit`是一个宏(定义在`<linux/init.h>`中),被封装为`__attribute__`,是给编译器的建议,使用这种方法,编译器会将所有的驱动的入口(出口)函数放在同一个段中

```c
#include <linux/init.h>
module_init(xxx_init);
module_exit(xxx_exit);
```

分别用来指定驱动的入口和出口函数。

在加载驱动时会调用入口函数，通常用来做初始化；在卸载时会调用出口函数，通常用来做注销工作



驱动文件编译成模块后,会生成`.ko`文件

```bash
insmod xxx.ko	#安装驱动
rmmod xxx.ko	#卸载驱动
```

这组命令无法处理驱动之间的依赖问题

```SHELL
modprobe xxx.ko
modprobe -r xxx.ko	#卸载对应的驱动
```

`modprobe` 命令默认会去`/lib/modules/$(uname -r)`目录中查找模块,一般自己制作的根文件系统中是不会有这个目录的,所以需要自己手动创建

`modprobe`依赖`/lib/modules/$(uname -r)/modules.dep`文件来存储模块之间的依赖关系

```shell
depmod	#生成/更新模块之间的依赖关系,生成modules.dep文件
```

```shell
lsmod	#查看已安装驱动
```



## -3- 字符设备的注册与注销

```c
#include <linux/fs.h>
static inline int register_chrdev(unsigned int major,	\
                                  const char *name,		\
                                  const struct file_operations *fops)
static inline void unregister_chrdev(unsigned int major, const char *name)
```

register_chrdev 函数用于注册字符设备，此函数一共有三个参数，这三个参数的含义如下：

* **major**：主设备号，Linux 下每个设备都有一个设备号，设备号分为主设备号和次设备号两部分，关于设备号后面会详细讲解。
* **name**：设备名字，指向一串字符串。
* **fops**：结构体 file_operations 类型指针，指向设备的操作函数集合变量。

unregister_chrdev 函数用户注销字符设备，此函数有两个参数，这两个参数含义如下：

* **major**：要注销的设备对应的主设备号。

* **name**：要注销的设备对应的设备名



```c
#include <linux/module.h>
MODULE_LICENSE("");
MODULE_AUTHOR("");
```

添加许可证和作者信息,否则编译不通过

## -4- 定义设备操作函数

由于linux把设备抽象成了文件,所以对文件的操作就是对设备进行操作,在`<linux/fs.h>`中定义了对文件的基本操作

```c
struct file_operations {
	struct module *owner;
	loff_t (*llseek) (struct file *, loff_t, int);
	ssize_t (*read) (struct file *, char __user *, size_t, loff_t *);
	ssize_t (*write) (struct file *, const char __user *, size_t, loff_t *);
	ssize_t (*read_iter) (struct kiocb *, struct iov_iter *);
	ssize_t (*write_iter) (struct kiocb *, struct iov_iter *);
	int (*iterate) (struct file *, struct dir_context *);
	unsigned int (*poll) (struct file *, struct poll_table_struct *);
	long (*unlocked_ioctl) (struct file *, unsigned int, unsigned long);
	long (*compat_ioctl) (struct file *, unsigned int, unsigned long);
	int (*mmap) (struct file *, struct vm_area_struct *);
	int (*mremap)(struct file *, struct vm_area_struct *);
	int (*open) (struct inode *, struct file *);
	int (*flush) (struct file *, fl_owner_t id);
	int (*release) (struct inode *, struct file *);
	int (*fsync) (struct file *, loff_t, loff_t, int datasync);
	int (*aio_fsync) (struct kiocb *, int datasync);
	int (*fasync) (int, struct file *, int);
	int (*lock) (struct file *, int, struct file_lock *);
	ssize_t (*sendpage) (struct file *, struct page *, int, size_t, loff_t *, int);
	unsigned long (*get_unmapped_area)(struct file *, unsigned long, unsigned long, unsigned long, unsigned long);
	int (*check_flags)(int);
	int (*flock) (struct file *, int, struct file_lock *);
	ssize_t (*splice_write)(struct pipe_inode_info *, struct file *, loff_t *, size_t, unsigned int);
	ssize_t (*splice_read)(struct file *, loff_t *, struct pipe_inode_info *, size_t, unsigned int);
	int (*setlease)(struct file *, long, struct file_lock **, void **);
	long (*fallocate)(struct file *file, int mode, loff_t offset,
			  loff_t len);
	void (*show_fdinfo)(struct seq_file *m, struct file *f);
#ifndef CONFIG_MMU
	unsigned (*mmap_capabilities)(struct file *);
#endif
};
```



## -5- Linux设备号

在`include/linux/types.h`中定义了`dev_t`的数据类型,这是一个32位的数据,用来表示设备号

高12位表示主设备号,低20位表示次设备号

在`include/linux/kdev_t.h`中提供了几个设备号操作函数(宏)

```c
#define MINORBITS	20
#define MINORMASK	((1U << MINORBITS) - 1)

#define MAJOR(dev)	((unsigned int) ((dev) >> MINORBITS))
#define MINOR(dev)	((unsigned int) ((dev) & MINORMASK))
#define MKDEV(ma,mi)	(((ma) << MINORBITS) | (mi))
```



## -6- 老版字符驱动注册流程

1. 编写驱动操作函数open	read	write	release等等
2. 构造文件操作结构体file_operations,并将对应的操作函数复制给对应的函数指针
3. 确定未使用的主设备号,编写入口函数,在入口函数中注册字符驱动
4. 在出口函数中注销字符驱动
5. 指定入口函数和出口函数
6. 添加LICENSE和AUTHOR



# 0x02 LED灯驱动开发实验c d



## -1- 地址映射

Linux使用的是虚拟内存,MMU可以将512MB的物理内存映射为2^32=4GB的内存

在`arch/arm/include/asm/io.h`中

```c

    
```

c dc d
