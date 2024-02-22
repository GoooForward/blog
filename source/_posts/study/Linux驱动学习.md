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



# 0x02 LED灯驱动开发实验



## -1- 地址映射

Linux使用的是虚拟内存,MMU可以将512MB的物理内存映射为2^32=4GB的内存

在`arch/arm/include/asm/io.h`中

```c
#define ioremap(cookie,size) __arm_ioremap((cookie), (size), MT_DEVICE)

void __iomem * __arm_ioremap(phys_addr_t phys_addr, size_t size, unsigned int mtype)
{
	return arch_ioremap_caller(phys_addr, size, mtype,__builtin_return_address(0));
}
```

ioremap 是个宏，有两个参数：cookie 和 size，真正起作用的是函数__arm_ioremap

**phys_addr**：要映射的物理起始地址。

**size**：要映射的内存空间大小。

**mtype**：ioremap 的类型，可以选择 MT_DEVICE、MT_DEVICE_NONSHARED、MT_DEVICE_CACHED 和 MT_DEVICE_WC，ioremap 函数选择 MT_DEVICE。



```c
void iounmap (volatile void __iomem *addr)
```

iounmap 只有一个参数 addr，此参数就是要取消映射的虚拟地址空间首地址



## -2- IO内存访问

同样在在`arch/arm/include/asm/io.h`中

* **读操作函数**

```c
u8 	readb(const volatile void __iomem *addr)
u16 readw(const volatile void __iomem *addr)
u32 readl(const volatile void __iomem *addr)
```

readb、readw 和 readl 这三个函数分别对应 8bit、16bit 和 32bit 读操作，参数 addr 就是要读取写内存地址，返回值就是读取到的数据。

* **写操作函数**

```c
void writeb(u8 value, volatile void __iomem *addr)
void writew(u16 value, volatile void __iomem *addr)
void writel(u32 value, volatile void __iomem *addr)
```

writeb、writew 和 writel 这三个函数分别对应 8bit、16bit 和 32bit 写操作，参数 value 是要写入的数值，addr 是要写入的地址。



# 0x03 新字符设备驱动



## -1- 分配和释放设备号

老版本的设备号需要先确认主设备号然后再注册,这就带来了两个问题:

1. 需要事先确认哪些设备号未被使用
2. 占用一个主设备号之后其所有的次设备号就都被使用掉了



因此Linux在内核中提供了管理设备号的接口,使用设备号之前先向内核申请,让内核来管理设备号

包含在`linux/fs.h`中

```c
int alloc_chrdev_region(dev_t *dev,
                        unsigned baseminor,
                        unsigned count,
                        const char *name)
```

* **dev**：是用于返回的设备号,由操作系统分配
* **baseminor**：是次设备号的基准,指定从第几个次设备号开始分配
* **count**:分配的次设备号的个数
* **name**:设备名称



如果确定了主设备号,可以使用下面的函数来注册设备号

```c
int register_chrdev_region(dev_t from, unsigned count, const char *name)
```

* **from**:起始设备号,也就是给定的设备号
* **count**:申请的设备号个数
* **name**:设备名称



注销设备号

```c
void unregister_chrdev_region(dev_t from, unsigned count)
```

* **from**:起始设备号,也就是给定的设备号
* **count**:注销的设备号个数



## -2- 新的字符设备注册方法

### 1.字符设备结构体

定义在`include/linux/cdev.h `中

```c
struct cdev {
	struct kobject kobj;
	struct module *owner;
	const struct file_operations *ops;
	struct list_head list;
	dev_t dev;
	unsigned int count;
};
```

在 Linux 中使用 cdev 结构体表示一个字符设备,编写字符设备驱动之前要先定义一个cdev结构体变量



### 2.cdev_init函数

使用cdev_init函数对cdev结构体进行初始化

```c
void cdev_init(struct cdev *cdev, const struct file_operations *fops)
```

示例:

```c
struct cdev testcdev;

/* 设备操作函数 */
static struct file_operations test_fops = {
	.owner = THIS_MODULE,
	/* 其他具体的初始项 */
};
 
testcdev.owner = THIS_MODULE;
cdev_init(&testcdev, &test_fops); /* 初始化 cdev 结构体变量 */
```



### 3.cdev_add函数

使用cdev_add函数向linux系统添加一个字符设备

```c
int cdev_add(struct cdev *p, dev_t dev, unsigned count)
```

其中p指向cdev结构体变量,dev是设备使用的设备号,count是要添加的设备数量



### 4.cdev_del函数

```c
void cdev_del(struct cdev *p)
```

`cdev_del` 和 `unregister_chrdev_region` 这两个函数合起来的功能相当于`unregister_chrdev` 函数



## -3- 自动创建设备节点

之前的老版本linux驱动实验中,加载完驱动之后还需要使用mknod命令手动创建设备节点

在 Linux 下通过 udev 来实现设备文件的创建与删除,udev 可以检测系统中硬件设备状态,可以根据系统中硬件设备状态来创建或者删除设备文件

busybox 会创建一个 udev 的简化版本—mdev,Linux 系统中的热插拔事件也由 mdev 管理

在`/etc/init.d/rcS `中添加如下语句来指定热插拔事件由mdev管理

```shell
echo /sbin/mdev > /proc/sys/kernel/hotplug
```



### 1.创建和删除类

自动创建设备节点的工作是在驱动程序的入口函数中完成的，一般在 cdev_add 函数后面添加自动创建设备节点相关代码。



类是一类设备的抽象,可以包含多个具体的设备对象



定义在`include/linux/device.h `中

使用宏函数class_create来创建一个类class,将其展开后

```c
struct class *class_create (struct module *owner, const char *name)
```

class_create 一共有两个参数，参数 owner 一般为 THIS_MODULE，参数 name 是类名字。返回值是个指向结构体 class 的指针，也就是创建的类。



卸载驱动程序的时候需要删除掉类，类删除函数为 class_destroy，函数原型如下：

```c
void class_destroy(struct class *cls);
```

参数 cls 就是要删除的类。



### 2.创建设备

前面说了类只是一类设备的抽象,还需要具体的设备实例

```c
struct device *device_create(struct class *class, 
                             struct device *parent,
                             dev_t devt, 
                             void *drvdata, 
                             const char *fmt, ...)
```

* device_create 是个可变参数函数，参数 class 就是设备要创建哪个类下面；

* 参数 parent 是父设备，一般为 NULL，也就是没有父设备；

* 参数 devt 是设备号；

* 参数 drvdata 是设备可能会使用的一些数据，一般为 NULL；

* 参数 fmt 是设备名字，如果设置 fmt=xxx 的话，就会生成/dev/xxx这个设备文件。

* 返回值就是创建好的设备。



删除设备

```c
void device_destroy(struct class *class, dev_t devt)
```

参数 class 是要删除的设备所处的类，参数 devt 是要删除的设备号。



## -4- 设置文件私有数据

对于一个设备,通常有如下的设备属性,一般会将这些属性变量封装成一个结构体

```c
struct test_dev{
	dev_t devid; /* 设备号 */
    struct cdev cdev; /* cdev */
    struct class *class; /* 类 */
    struct device *device; /* 设备 */
    int major; /* 主设备号 */
    int minor; /* 次设备号 */
}
```



编写驱动 open 函数的时候将设备结构体作为私有数据添加到设备文件中,在 open 函数里面设置好私有数据以后，在 write、read、close 等函数中直接读取 private_data即可得到设备结构体

```c
struct test_dev testdev;
 
/* open 函数 */
static int test_open(struct inode *inode, struct file *filp)
{
	filp->private_data = &testdev; /* 设置私有数据 */
	return 0;
}
```



# 0x04 Linux设备树



## -1- DTS DTB和DTC

DTS是设备树源文件,是开发人员直接编辑的文本文件,DTB是二进制的设备树文件,而将DTS编译为DTB的工具就是DTC

在Linux的源码根目录下使用`make dtbs`就可以编译设备树文件

对于一款soc来说,使用其做的板子有很多,如何确定使用哪一个dts文件呢?

在`arch/arm/boot/dts/Makefile`中,在dtb-$(CONFIG_SOC_型号)中被赋值的dtb都会被编译



## -2- DTS语法

### 1.头文件

`#include`可以来引用.h、.dtsi 和.dts 文件

### 2.设备节点

设备树是采用树形结构来描述板子上的设备信息的文件，每个设备都是一个节点，叫做设备节点，每个节点都通过一些属性信息来描述节点信息，属性就是键—值对。

```dts
	cpus {
		#address-cells = <1>;
		#size-cells = <0>;

		cpu0: cpu@0 {
			compatible = "arm,cortex-a7";
			device_type = "cpu";
			reg = <0>;
		};
	};
	intc: interrupt-controller@00a01000 {
		compatible = "arm,cortex-a7-gic";
		#interrupt-cells = <3>;
		interrupt-controller;
		reg = <0x00a01000 0x1000>,
		      <0x00a02000 0x100>;
	};
```

设备节点的命名格式为`label:node-name@unit-address`

其中node-name是节点名称,为ASCII字符串

unit-address一般为设备的地址或者寄存器首地址,没有可以不要

label是该节点的标签,用于便捷访问该节点,通过&label可以直接来访问此节点

节点有不同的属性,几种常见的属性的数据形式为

1. 字符串

   `compatible = "arm,cortex-a7";`

2. 32位无符号整数

   `reg = <0>;`

   上述代码设置 reg 属性的值为 0，reg 的值也可以设置为一组值，比如：

   `reg = <0 0x123456 100>;`

3. 字符串列表

   属性值也可以为字符串列表，字符串和字符串之间采用“,”隔开，如下所示：

   `compatible = "fsl,imx6ull-gpmi-nand", "fsl, imx6ul-gpmi-nand";`

### 3.标准属性

1. compatible 属性

   兼容性属性,是一个字符串列表,用于绑定设备与驱动,通过兼容性属性可以选择设备要使用的驱动程序

   一般形式为

   ```
   "manufacturer,model"
   ```

   manufacture是厂商,model一般是对应的驱动名称

   例如imx6ull-alientek-emmc.dts 中的sound节点,其compatible属性为

   ```
   compatible = "fsl,imx6ul-evk-wm8960","fsl,imx-audio-wm8960";
   ```

   其有两个属性,就说明该设备兼容两个驱动

   此设备会先使用第一个兼容值在linux中查找,如果没找到就会使用第二个兼容值

   一般的驱动文件中都有一个OF匹配表,用来保存此驱动的compatible值,如果设备的compatible属性和OF匹配表中的任何一个值相等,那么就表示设备可以使用该驱动

2. model属性

   model属性是一个字符串,表示模块信息,比如名字之类的

   ```
   model = "wm8960-audio";
   ```

3. status属性

   状态属性,也是一个字符串,用来表示当前设备的状态,常用okay和disable,通过设置该值可以使能或失能设备

   - "okay"：表示设备正常运行；
   - "disabled"：表示设备不可操作，但后面可以恢复工作；
   - "fail"：表示发生了严重错误，需要修复；
   - "fail-sss"：表示发生了严重错误，需修复；sss表示错误信息

4. #address-cells和#size-cells属性

   用在任意拥有子节点的设备中,用于描述子节点的地址信息

   #address-cells决定了子节点中reg属性中地址信息所占的字长

   \#size-cells决定了子节点中reg属性中长度信息所占的字长

5. reg属性

   描述设备地址空间资源,一般是某个外设寄存器地址范围信息

   ```
   reg = <address1 length1 address2 length2 address3 length3……>
   ```

   每个“address length”组合表示一个地址范围，其中 address 是起始地址，length 是地址长度，#address-cells 表明 address 这个数据所占用的字长，#size-cells 表明 length 这个数据所占用的字长

6. ranges属性

   ranges是一个地址转换表,其格式为

   ```
   rangse = <child-bus-address,parent-bus-address,length>
   ```

   **child-bus-address** 子总线地址空间的物理地址，由父节点的#address-cells 确定此物理地址所占用的字长。

   **parent-bus-address** 父总线地址空间的物理地址，同样由父节点的#address-cells 确定此物理地址所占用的字长

   **length**：子地址空间的长度，由父节点的#size-cells 确定此地址长度所占用的字长

7. name属性

   name属性为字符串,用于记录节点名称,已弃用,不推荐使用

### 4.根节点compatible属性

Linux 内核会通过根节点的 compoatible 属性查看是否支持此设备，如果支持的话设备就会启动 Linux 内核

```
/ {
	model = "Freescale i.MX6 ULL 14x14 EVK Board";
	compatible = "fsl,imx6ull-14x14-evk", "fsl,imx6ull";
	...
}
```

通常根节点的compatible属性第一个值描述设备(imx6ull-14x14-evk),第二个值描述该设备使用的soc(imx6ull)



### 5.向节点追加或修改内容

开发过程中,有些dtsi文件会被很多其他dts引用,直接修改这些dtsi文件会直接影响到其他的项目的dts,为了隔离这些不同项目之间的差异,使用追加修改的方式,

追加修改的方法就是使用label标签来引用想要修改或追加的节点

```
&i2c1 {
/* 要追加或修改的内容 */
};
```



## -3- 设备树在系统中的体现

Linux 内核启动的时候会解析设备树中各个节点的信息，并且在根文件系统的/proc/devic-tree目录下根据节点名称创建不同的文件夹



## -4- 特殊节点

在根节点“/”中有两个特殊的子节点：aliases 和 chosen

### 1.aliases子节点

```
aliases {
		can0 = &flexcan1;
		can1 = &flexcan2;
		ethernet0 = &fec1;
		ethernet1 = &fec2;
		...
		spi0 = &ecspi1;
		spi1 = &ecspi2;
		spi2 = &ecspi3;
		spi3 = &ecspi4;
		usbphy0 = &usbphy1;
		usbphy1 = &usbphy2;
	};
```

单词 aliases 的意思是“别名”，因此 aliases 节点的主要功能就是定义别名，定义别名的目的就是为了方便访问节点。不过我们一般会在节点命名的时候会加上 label，然后通过&label来访问节点，这样也很方便，而且设备树里面大量的使用&label 的形式来访问节点



### 2.chosen子节点

chosen 并不是一个真实的设备，chosen 节点主要是为了 uboot 向 Linux 内核传递数据，重点是 bootargs 参数,一般.dts 文件中 chosen 节点通常为空或者内容很少

```
	chosen {
		stdout-path = &uart1;
	};
```

但是当我们进入到/proc/device-tree/chosen 目录里面，会发现多了 bootargs 这个属性,这个属性是由U-boot添加的



## -5- 设备树常用的OF操作函数

### 1.查找节点的OF函数

Linux 内核使用 device_node 结构体来描述一个节点，此结构体定义在文件 include/linux/of.h 中

```c
struct device_node {
	const char *name;
	const char *type;
	phandle phandle;
	const char *full_name;
	struct fwnode_handle fwnode;

	struct	property *properties;
	struct	property *deadprops;	/* removed properties */
	struct	device_node *parent;
	struct	device_node *child;
	struct	device_node *sibling;
	struct	kobject kobj;
	unsigned long _flags;
	void	*data;
#if defined(CONFIG_SPARC)
	const char *path_component_name;
	unsigned int unique_id;
	struct of_irq_controller *irq_trans;
#endif
};
```

与查找节点有关的 OF 函数有 5 个

```c
struct device_node *of_find_node_by_name(struct device_node *from,
										 const char *name);
```

**from**：开始查找的节点，如果为 NULL 表示从根节点开始查找整个设备树。

**name**：要查找的节点名字。

**返回值：**找到的节点，如果为 NULL 表示查找失败



```c
struct device_node *of_find_node_by_type(struct device_node *from, const char *type)
```

**from**：开始查找的节点，如果为 NULL 表示从根节点开始查找整个设备树。

**type**：要查找的节点对应的 type 字符串，也就是 device_type 属性值。

**返回值：**找到的节点，如果为 NULL 表示查找失败。



```c
struct device_node *of_find_compatible_node(struct device_node *from,
											const char *type, 
											const char *compatible)
```

**from**：开始查找的节点，如果为 NULL 表示从根节点开始查找整个设备树。

**type**：要查找的节点对应的 type 字符串，也就是 device_type 属性值，可以为 NULL，表示忽略掉 device_type 属性。

**compatible**：要查找的节点所对应的 compatible 属性列表。

**返回值：**找到的节点，如果为 NULL 表示查找失败



```c
struct device_node *of_find_matching_node_and_match(struct device_node *from,
 													const struct of_device_id *matches,
													const struct of_device_id **match)
```

**from**：开始查找的节点，如果为 NULL 表示从根节点开始查找整个设备树。

**matches**：of_device_id 匹配表，也就是在此匹配表里面查找节点。

**match**：找到的匹配的 of_device_id。

**返回值：**找到的节点，如果为 NULL 表示查找失败



```c
inline struct device_node *of_find_node_by_path(const char *path)
```

**path**：带有全路径的节点名，可以使用节点的别名，比如“/backlight”就是 backlight 这个节点的全路径。

**返回值：**找到的节点，如果为 NULL 表示查找失败



### 2.查找父子节点的OF函数

```c
struct device_node *of_get_parent(const struct device_node *node)
```

**node**：要查找的父节点的节点。

**返回值：**找到的父节点。



```c
struct device_node *of_get_next_child(const struct device_node *node,
 									  struct device_node *prev)
```

**node**：父节点。

**prev**：前一个子节点，也就是从哪一个子节点开始迭代的查找下一个子节点。可以设置为NULL，表示从第一个子节点开始。

**返回值：**找到的下一个子节点。



### 3.提取属性值的OF函数

节点的属性信息里面保存了驱动所需要的内容，因此对于属性值的提取非常重要，Linux 内核中使用结构体 property 表示属性，此结构体同样定义在文件 include/linux/of.h 中

```c
struct property {
	char	*name;
	int	length;
	void	*value;
	struct property *next;
	unsigned long _flags;
	unsigned int unique_id;
	struct bin_attribute attr;
};
```



```c
property *of_find_property(const struct device_node *np,
 						   const char *name,
                           int *lenp)
```

**np**：设备节点。

**name**： 属性名字。

**lenp**：属性值的字节数

**返回值：**找到的属性。



```c
int of_property_count_elems_of_size(const struct device_node *np,
 									const char *propname,
                                    int elem_size)
```

**np**：设备节点。

**proname**： 需要统计元素数量的属性名字。

**elem_size**：元素长度。

**返回值：**得到的属性元素数量。



```c
int of_property_read_u32_index(const struct device_node *np,
                               const char *propname,
                               u32 index, 
                               u32 *out_value)
```

**np**：设备节点。

**proname**： 要读取的属性名字。

**index**：要读取的值标号。

**out_value**：读取到的值

**返回值：**0 读取成功，负值，读取失败，-EINVAL 表示属性不存在，-ENODATA 表示没有要读取的数据，-EOVERFLOW 表示属性值列表太小



```c
int of_property_read_u8_array(const struct device_node *np,
                              const char *propname, 
                              u8 *out_values, 
                              size_t sz)
int of_property_read_u16_array(const struct device_node *np,
                               const char *propname, 
                               u16 *out_values, 
                               size_t sz)
int of_property_read_u32_array(const struct device_node *np,
                               const char *propname, 
                               u32 *out_values,
                               size_t sz)
int of_property_read_u64_array(const struct device_node *np,
                               const char *propname, 
                               u64 *out_values,
                               size_t sz)
```

**np**：设备节点。

**proname**： 要读取的属性名字。

**out_value**：读取到的数组值，分别为 u8、u16、u32 和 u64。

**sz**：要读取的数组元素数量。

**返回值：**0，读取成功，负值，读取失败，-EINVAL 表示属性不存在，-ENODATA 表示没有要读取的数据，-EOVERFLOW 表示属性值列表太小。



```c
int of_property_read_u8(const struct device_node *np, 
                        const char *propname,
                        u8 *out_value)
int of_property_read_u16(const struct device_node *np, 
                         const char *propname,
                         u16 *out_value)
int of_property_read_u32(const struct device_node *np, 
                         const char *propname,
                         u32 *out_value)
int of_property_read_u64(const struct device_node *np, 
                         const char *propname,
                         u64 *out_value)
```

**np**：设备节点。

**proname**： 要读取的属性名字。

**out_value**：读取到的数组值。

**返回值：**0，读取成功，负值，读取失败，-EINVAL 表示属性不存在，-ENODATA 表示没有要读取的数据，-EOVERFLOW 表示属性值列表太小。



```c
int of_property_read_string(struct device_node *np, 
                            const char *propname,
                            const char **out_string)
```

**np**：设备节点。

**proname**： 要读取的属性名字。

**out_string**：读取到的字符串值。

**返回值：**0，读取成功，负值，读取失败



```c
int of_n_addr_cells(struct device_node *np)
```

**np**：设备节点。

**返回值：**获取到的#address-cells 属性值。



```c
int of_n_size_cells(struct device_node *np)
```

**np**：设备节点。

**返回值：**获取到的#size-cells 属性值。