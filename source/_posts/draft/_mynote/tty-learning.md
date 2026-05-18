# tty子系统学习文档

## 0x00 背景

### 0. 前置知识

在看 `tty` 子系统之前，建议先把下面几个概念分清楚：

1. `TTY`
   最初是 teletype 的缩写，在 Linux 里泛指终端/串口这一类字符设备抽象。
2. `tty core`
   就是 `drivers/tty/tty_io.c` 为核心的一层，负责把 VFS、line discipline、底层驱动串起来。
3. `line discipline`
   行规程层，位于用户读写和底层驱动之间。默认是 `N_TTY`，负责 canonical/raw 模式、回显、特殊字符处理等。
4. `tty driver`
   底层 tty 设备驱动，比如 `pty`、虚拟终端、串口驱动、某些 USB/平台 tty 驱动。
5. `tty_port`
   比 `tty_struct` 生命周期更长的“端口级”对象，底层串口驱动很常用。
6. `flip buffer`
   接收路径里的缓存层。底层驱动先把收到的字符塞进 flip buffer，再异步推给 line discipline。
7. `serial core`
   串口类 tty 驱动常见的中间层，位于 `tty core` 和具体 UART 驱动之间，例如 `drivers/tty/serial/serial_core.c`。

理解 `tty` 子系统时，最重要的一点是：

`tty` 子系统不是“某个串口驱动”的同义词，它是一套“用户空间终端语义 + line discipline + 底层设备驱动”共同组成的通用字符终端框架。

### 1. 该子系统是什么

Linux 的 `tty` 子系统核心代码主要在：

- `drivers/tty/tty_io.c`
- `drivers/tty/tty_ldisc.c`
- `drivers/tty/n_tty.c`
- `drivers/tty/tty_buffer.c`
- `drivers/tty/tty_port.c`
- `include/linux/tty.h`
- `include/linux/tty_driver.h`
- `include/linux/tty_ldisc.h`
- `include/linux/tty_port.h`
- `include/linux/tty_buffer.h`

它位于：

1. 上层 VFS / 用户空间 `open/read/write/ioctl/poll`
2. 下层具体终端设备驱动

之间，负责把终端语义、设备访问、行规程处理、输入输出缓存整合起来。

### 2. 这个子系统的作用是什么

`tty` 子系统的作用可以概括成 6 点：

1. 向用户空间提供统一的终端字符设备接口。
2. 管理 `tty_struct`、`tty_driver`、`tty_port` 等核心对象的生命周期。
3. 通过 `line discipline` 处理 canonical/raw 模式、回显、特殊字符等终端语义。
4. 给底层驱动提供统一的注册和打开/关闭/写入接口。
5. 通过 flip buffer 把中断上下文收到的数据异步、安全地送到上层。
6. 与串口框架、虚拟终端、PTY、控制台等多种设备类型集成。

### 3. 这个子系统的架构是怎么样的

从职责上看，`tty` 可以拆成 6 层：

1. 用户接口层
   `open/read/write/ioctl/poll`，由 VFS 进入 tty 文件操作。
2. TTY core 层
   `tty_open()`、`tty_write()`、`tty_release()` 等，负责设备实例管理。
3. line discipline 层
   默认 `N_TTY`，负责输入输出语义处理。
4. tty driver 抽象层
   `struct tty_driver` + `struct tty_operations`。
5. port / buffer 层
   `tty_port` + flip buffer，用于底层驱动和上层之间的中转。
6. 具体设备驱动层
   例如 `serial_core` + `imx_uart`，或者 `pty`、`vt` 等实现。

### 4. 大体架构图

```text
            +----------------------------------------+
            |     用户空间 /dev/tty* /dev/ttymxc*    |
            |  open / read / write / ioctl / poll    |
            +-------------------+--------------------+
                                |
                                v
            +----------------------------------------+
            |             tty core                   |
            | tty_open / tty_write / tty_release     |
            | tty_struct / tty_driver                |
            +-------------------+--------------------+
                                |
                                v
            +----------------------------------------+
            |          line discipline               |
            | N_TTY / N_HDLC / N_GSM ...             |
            | read/write/receive_buf                 |
            +-------------------+--------------------+
                                |
                +---------------+---------------+
                |                               |
                v                               v
     +--------------------------+   +----------------------------+
     |        tty_port          |   |       tty_operations       |
     | open/activate/buffers    |   | open/write/close/...       |
     +-------------+------------+   +-------------+--------------+
                   |                              |
                   +--------------+---------------+
                                  |
                                  v
                 +--------------------------------------+
                 |     具体 tty 驱动 / serial core      |
                 | uart_open / uart_add_one_port        |
                 | imx_uart / 8250 / pty / vt ...       |
                 +--------------------------------------+
```

### 5. 四条最重要的主线

#### 主线一：驱动注册

```text
tty_alloc_driver()
  -> tty_set_operations()
  -> tty_register_driver()
     -> register_chrdev_region()
     -> tty_cdev_add()
     -> list_add(&tty_drivers)
     -> tty_register_device()
```

#### 主线二：用户打开 `/dev/tty*`

```text
tty_open()
  -> tty_open_current_tty() / tty_open_by_driver()
     -> tty_init_dev()
        -> tty_driver_install_tty()
        -> tty_ldisc_setup()
     -> tty->ops->open()
```

#### 主线三：用户写数据

```text
tty_write()
  -> file_tty_write()
     -> tty_ldisc_ref_wait()
     -> do_tty_write(ld->ops->write)
        -> n_tty_write()
           -> tty->ops->write()
```

#### 主线四：底层驱动接收数据

```text
IRQ handler
  -> tty_insert_flip_char()/tty_insert_flip_string_fixed_flag()
  -> tty_flip_buffer_push()
     -> flush_to_ldisc(workqueue)
        -> tty_port_default_receive_buf()
           -> tty_ldisc_receive_buf()
              -> n_tty_receive_buf_common()
```

## 0x01 主要结构体

这一节挑最关键的结构体来分析。

### 1. `struct tty_struct`

源码位置：`include/linux/tty.h`

这是“一个打开中的 tty 实例”的核心对象。

```c
struct tty_struct {
	int	magic;                  /* 魔数 */
	struct kref kref;               /* 引用计数 */
	struct device *dev;             /* 对应的 device */
	struct tty_driver *driver;      /* 所属 tty_driver */
	const struct tty_operations *ops; /* 底层操作集 */
	int index;                      /* 在线路中的索引，例如 ttyS0 的 0 */

	struct ld_semaphore ldisc_sem;  /* 保护 ldisc 切换 */
	struct tty_ldisc *ldisc;        /* 当前 line discipline */

	struct mutex atomic_write_lock; /* 串行化 write 路径 */
	struct mutex legacy_mutex;      /* 兼容老路径的 mutex */
	struct mutex throttle_mutex;    /* 节流相关锁 */
	struct rw_semaphore termios_rwsem; /* termios 读写锁 */
	struct mutex winsize_mutex;     /* 窗口大小锁 */
	struct ktermios termios, termios_locked; /* 当前与锁定的 termios */
	char name[64];                  /* 设备名字 */
	unsigned long flags;            /* TTY_* 状态位 */
	int count;                      /* 打开引用计数 */
	struct winsize winsize;         /* 窗口大小 */

	struct {
		spinlock_t lock;
		bool stopped;              /* 被 tty_stop/tty_start 控制 */
		bool tco_stopped;          /* 被 TCOON/TCOOFF 控制 */
	} flow;

	struct {
		spinlock_t lock;
		struct pid *pgrp;          /* 前台进程组 */
		struct pid *session;       /* 控制终端会话 */
		unsigned char pktstatus;   /* packet mode 状态 */
		bool packet;               /* packet mode 开关 */
	} ctrl;

	int hw_stopped;                 /* 硬件是否已停 */
	unsigned int receive_room;      /* ldisc 当前还能接收多少字节 */
	int flow_change;                /* 节流状态变化 */

	struct tty_struct *link;        /* pty 配对端 */
	struct fasync_struct *fasync;   /* SIGIO 异步通知 */
	wait_queue_head_t write_wait;   /* 写等待队列 */
	wait_queue_head_t read_wait;    /* 读等待队列 */
	struct work_struct hangup_work; /* hangup 工作 */
	void *disc_data;                /* ldisc 私有数据，N_TTY 时指向 n_tty_data */
	void *driver_data;              /* 底层驱动私有数据 */
	spinlock_t files_lock;          /* 保护 tty_files 链表 */
	struct list_head tty_files;     /* 所有关联文件 */
	int closing;                    /* 是否正在关闭 */
	unsigned char *write_buf;       /* tty core 的临时写缓存 */
	int write_cnt;                  /* 写缓存大小 */
	struct work_struct SAK_work;    /* 安全注意键相关工作 */
	struct tty_port *port;          /* 关联 tty_port */
};
```

作用说明：

1. `tty_struct` 代表“打开后的会话对象”，而不是永久存在的硬件端口。
2. 用户空间对某个 tty 的大部分操作最终都围绕它展开。
3. 它关联了 `driver`、`ldisc`、`port`、`termios`、等待队列等全部运行时状态。

### 2. `struct tty_driver`

源码位置：`include/linux/tty_driver.h`

这是一个 tty 驱动在 tty core 中的注册对象。

```c
struct tty_driver {
	int	magic;                  /* 魔数 */
	struct kref kref;               /* 引用计数 */
	struct cdev **cdevs;            /* cdev 数组 */
	struct module *owner;           /* 所属模块 */
	const char *driver_name;        /* 驱动名，例如 "IMX-UART" */
	const char *name;               /* 设备名前缀，例如 "ttymxc" */
	int	name_base;               /* 打印时的编号基值 */
	int	major;                   /* 主设备号 */
	int	minor_start;             /* 起始次设备号 */
	unsigned int num;               /* 支持的设备数量 */
	short	type;                    /* 驱动类型 */
	short	subtype;                 /* 驱动子类型 */
	struct ktermios init_termios;   /* 默认 termios */
	unsigned long flags;            /* TTY_DRIVER_* 标志 */
	struct proc_dir_entry *proc_entry; /* /proc 入口 */
	struct tty_driver *other;       /* pty 成对驱动时使用 */

	struct tty_struct **ttys;       /* 每条线对应的 tty_struct */
	struct tty_port **ports;        /* 每条线对应的 tty_port */
	struct ktermios **termios;      /* 保存每条线的 termios */
	void *driver_state;             /* 驱动私有数据 */

	const struct tty_operations *ops; /* 底层操作集 */
	struct list_head tty_drivers;   /* 挂到全局 tty_drivers 链表 */
};
```

作用说明：

1. `tty_driver` 代表一整个驱动类型，比如一组 UART 设备。
2. 它描述了这个驱动可以提供多少个 tty、名字是什么、操作集合是什么。

### 3. `struct tty_operations`

源码位置：`include/linux/tty_driver.h`

这是底层 tty 驱动提供给 tty core 的操作回调表。

```c
struct tty_operations {
	struct tty_struct * (*lookup)(struct tty_driver *driver,
			struct file *filp, int idx); /* 查找已有 tty */
	int  (*install)(struct tty_driver *driver, struct tty_struct *tty); /* 安装 tty */
	void (*remove)(struct tty_driver *driver, struct tty_struct *tty);  /* 移除 tty */
	int  (*open)(struct tty_struct *tty, struct file *filp);            /* 打开设备 */
	void (*close)(struct tty_struct *tty, struct file *filp);           /* 关闭设备 */
	void (*shutdown)(struct tty_struct *tty);                           /* 最后关闭时停机 */
	void (*cleanup)(struct tty_struct *tty);                            /* 清理资源 */
	int  (*write)(struct tty_struct *tty,
		      const unsigned char *buf, int count);               /* 发送数据 */
	int  (*put_char)(struct tty_struct *tty, unsigned char ch);         /* 写单字符 */
	void (*flush_chars)(struct tty_struct *tty);                        /* 刷发送缓存 */
	unsigned int (*write_room)(struct tty_struct *tty);                 /* 还能写多少 */
	unsigned int (*chars_in_buffer)(struct tty_struct *tty);            /* 缓冲中剩余 */
	int  (*ioctl)(struct tty_struct *tty,
		      unsigned int cmd, unsigned long arg);              /* 驱动私有 ioctl */
	long (*compat_ioctl)(struct tty_struct *tty,
			     unsigned int cmd, unsigned long arg);        /* compat ioctl */
	void (*set_termios)(struct tty_struct *tty, struct ktermios *old);  /* termios 更新 */
	void (*throttle)(struct tty_struct *tty);                           /* 节流 */
	void (*unthrottle)(struct tty_struct *tty);                         /* 取消节流 */
	void (*stop)(struct tty_struct *tty);                               /* 停止输出 */
	void (*start)(struct tty_struct *tty);                              /* 恢复输出 */
	void (*hangup)(struct tty_struct *tty);                             /* 挂断 */
	int (*break_ctl)(struct tty_struct *tty, int state);                /* BREAK 控制 */
	void (*flush_buffer)(struct tty_struct *tty);                       /* 清空发送缓存 */
	void (*set_ldisc)(struct tty_struct *tty);                          /* 切换 ldisc 通知 */
	void (*wait_until_sent)(struct tty_struct *tty, int timeout);       /* 等待发送完 */
	void (*send_xchar)(struct tty_struct *tty, char ch);                /* 发送高优先级字符 */
	int (*tiocmget)(struct tty_struct *tty);                            /* modem line 读取 */
	int (*tiocmset)(struct tty_struct *tty,
			unsigned int set, unsigned int clear);             /* modem line 设置 */
	int (*resize)(struct tty_struct *tty, struct winsize *ws);          /* 窗口变化 */
	int (*get_icount)(struct tty_struct *tty,
			  struct serial_icounter_struct *icount);        /* 统计信息 */
};
```

作用说明：

1. tty core 不直接碰底层硬件，而是统一通过这张回调表工作。
2. `open`、`write`、`close`、`set_termios` 是最常见的几类入口。

### 4. `struct tty_port`

源码位置：`include/linux/tty_port.h`

`tty_port` 是端口级对象，生命周期通常比 `tty_struct` 更长。

```c
struct tty_port {
	struct tty_bufhead	buf;           /* flip buffer 头 */
	struct tty_struct	*tty;           /* 回指 tty */
	struct tty_struct	*itty;          /* 内部回指 */
	const struct tty_port_operations *ops; /* activate/shutdown 等 */
	const struct tty_port_client_operations *client_ops; /* 默认把数据送给 ldisc */
	spinlock_t		lock;           /* 保护 tty 字段 */
	int			blocked_open;   /* 阻塞打开计数 */
	int			count;          /* 用户计数 */
	wait_queue_head_t	open_wait;      /* open 等待队列 */
	wait_queue_head_t	delta_msr_wait; /* modem 状态变化等待 */
	unsigned long		flags;          /* 用户标志 */
	unsigned long		iflags;         /* 内部状态标志 */
	unsigned char		console:1;      /* 是否为 console */
	struct mutex		mutex;          /* open/shutdown 串行化 */
	struct mutex		buf_mutex;      /* xmit_buf 分配锁 */
	unsigned char		*xmit_buf;      /* 发送缓冲 */
	unsigned int		close_delay;    /* close 延迟 */
	unsigned int		closing_wait;   /* drain 等待 */
	int			drain_delay;    /* FIFO drain 时间参数 */
	struct kref		kref;           /* 引用计数 */
	void 			*client_data;   /* 驱动私有数据 */
};
```

作用说明：

1. 对串口类驱动来说，`tty_port` 是非常核心的中间层。
2. 它负责 open/close 生命周期管理和 flip buffer 管理。

### 5. `struct tty_ldisc_ops`

源码位置：`include/linux/tty_ldisc.h`

这是 line discipline 的操作集合。

```c
struct tty_ldisc_ops {
	char	*name;                      /* ldisc 名字 */
	int	num;                        /* ldisc 编号，例如 N_TTY */
	int	flags;                      /* 标志位 */

	int	(*open)(struct tty_struct *); /* ldisc 被附着时打开 */
	void	(*close)(struct tty_struct *); /* 关闭 */
	void	(*flush_buffer)(struct tty_struct *tty); /* 清空输入缓存 */
	ssize_t	(*read)(struct tty_struct *tty, struct file *file,
			unsigned char *buf, size_t nr,
			void **cookie, unsigned long offset); /* 用户 read */
	ssize_t	(*write)(struct tty_struct *tty, struct file *file,
			 const unsigned char *buf, size_t nr); /* 用户 write */
	int	(*ioctl)(struct tty_struct *tty, struct file *file,
			 unsigned int cmd, unsigned long arg); /* ldisc ioctl */
	int	(*compat_ioctl)(struct tty_struct *tty, struct file *file,
				unsigned int cmd, unsigned long arg);
	void	(*set_termios)(struct tty_struct *tty, struct ktermios *old);
	__poll_t (*poll)(struct tty_struct *, struct file *,
			 struct poll_table_struct *);
	int	(*hangup)(struct tty_struct *tty);

	void	(*receive_buf)(struct tty_struct *, const unsigned char *cp,
			       const char *fp, int count); /* 底层往上送数据 */
	void	(*write_wakeup)(struct tty_struct *); /* 可继续写时回调 */
	void	(*dcd_change)(struct tty_struct *, unsigned int);
	int	(*receive_buf2)(struct tty_struct *, const unsigned char *cp,
				const char *fp, int count); /* 支持自动流控的接收回调 */

	struct module *owner;
};
```

作用说明：

1. line discipline 就是夹在 tty core 和底层驱动中间的一层语义处理。
2. 默认的 `N_TTY` 主要实现终端行为，比如回显、特殊键、规范模式读取等。

### 6. `struct tty_ldisc`

源码位置：`include/linux/tty_ldisc.h`

```c
struct tty_ldisc {
	struct tty_ldisc_ops *ops; /* 当前 ldisc 的操作集 */
	struct tty_struct *tty;    /* 所属 tty */
};
```

作用说明：

1. 这是运行时挂在 `tty_struct` 上的 line discipline 实例。
2. `tty->ldisc` 就是它。

### 7. `struct tty_buffer` / `struct tty_bufhead`

源码位置：`include/linux/tty_buffer.h`

flip buffer 用这两个结构体管理。

```c
struct tty_buffer {
	union {
		struct tty_buffer *next;   /* buffer 链表 */
		struct llist_node free;    /* 空闲链表节点 */
	};
	int used;                      /* 已使用字节数 */
	int size;                      /* buffer 大小 */
	int commit;                    /* 已提交给消费者的边界 */
	int read;                      /* 已读位置 */
	int flags;                     /* TTYB_NORMAL 等标志 */
	unsigned long data[];          /* 数据区，后面拼接 char/flag buffer */
};

struct tty_bufhead {
	struct tty_buffer *head;       /* 当前消费者处理的头 */
	struct work_struct work;       /* flush_to_ldisc 工作队列 */
	struct mutex lock;             /* 保护消费过程 */
	atomic_t priority;             /* 高优先级独占 */
	struct tty_buffer sentinel;    /* 哨兵节点 */
	struct llist_head free;        /* 空闲 buffer 链表 */
	atomic_t mem_used;             /* 当前已用内存 */
	int mem_limit;                 /* 内存限制 */
	struct tty_buffer *tail;       /* 当前生产者写入的尾 */
};
```

作用说明：

1. 底层驱动在中断或软中断里先把接收到的数据塞进这里。
2. 再由 `flush_to_ldisc()` 在工作队列上下文里推给 line discipline。

### 8. `struct n_tty_data`

源码位置：`drivers/tty/n_tty.c`

这是默认 line discipline `N_TTY` 的私有数据。

```c
struct n_tty_data {
	size_t read_head;              /* producer 写入位置 */
	size_t commit_head;            /* 已提交给 read 的边界 */
	size_t canon_head;             /* 规范模式下一行结束位置 */
	size_t echo_head;              /* echo buffer 写指针 */
	size_t echo_commit;            /* echo 提交边界 */
	size_t echo_mark;              /* echo 标记位置 */
	DECLARE_BITMAP(char_map, 256); /* 特殊字符位图 */

	unsigned long overrun_time;    /* overrun 统计时间 */
	int num_overrun;               /* overrun 次数 */

	bool no_room;                  /* 输入缓冲是否满 */

	unsigned char lnext:1, erasing:1, raw:1, real_raw:1, icanon:1;
	unsigned char push:1;          /* 规范模式/原始模式等状态 */

	char read_buf[N_TTY_BUF_SIZE]; /* N_TTY 的读缓冲 */
	DECLARE_BITMAP(read_flags, N_TTY_BUF_SIZE); /* 每个字符对应的 flag */
	unsigned char echo_buf[N_TTY_BUF_SIZE];     /* 回显缓冲 */

	size_t read_tail;              /* consumer 读取位置 */
	size_t line_start;             /* 当前行起点 */

	struct mutex atomic_read_lock; /* read 路径串行化 */
	struct mutex output_lock;      /* output 路径串行化 */
};
```

作用说明：

1. `N_TTY` 的大部分 canonical/raw 语义都围绕这个结构体实现。
2. `tty->disc_data` 在 `N_TTY` 模式下就指向它。

### 9. 结构体关系总结

最核心的关系可以这样理解：

1. `tty_driver` 描述一个驱动类型。
2. `tty_struct` 描述一个打开中的 tty 实例。
3. `tty_struct` 运行时会关联一个 `tty_ldisc`。
4. `tty_port` 负责端口生命周期和 flip buffer。
5. `tty_buffer` 是接收路径的中转缓存。

关系图如下：

```text
            +----------------------+
            |    tty_driver        |
            | ops / name / major   |
            +----------+-----------+
                       |
                       v
            +----------------------+
            |    tty_struct        |
            | driver / ldisc /port |
            +----+------------+----+
                 |            |
                 |            |
                 v            v
        +----------------+  +------------------+
        |    tty_ldisc   |  |    tty_port      |
        | ops / disc_data|  | open/buf/client  |
        +--------+-------+  +---------+--------+
                 |                    |
                 v                    v
         +---------------+    +------------------+
         |  n_tty_data   |    | tty_buffer/head  |
         | canon/echo... |    | flip buffer      |
         +---------------+    +------------------+
```

## 0x02 主要API

这一节挑最能体现 `tty` 主线的 API。

### 1. `tty_register_driver()`

源码位置：`drivers/tty/tty_io.c`

这是底层 tty 驱动注册自己的核心入口。

```c
int tty_register_driver(struct tty_driver *driver)
{
	int error;
	int i;
	dev_t dev;
	struct device *d;

	if (!driver->major) {
		error = alloc_chrdev_region(&dev, driver->minor_start,
						driver->num, driver->name);
		if (!error) {
			driver->major = MAJOR(dev);
			driver->minor_start = MINOR(dev);
		}
	} else {
		dev = MKDEV(driver->major, driver->minor_start);
		error = register_chrdev_region(dev, driver->num, driver->name);
	}
	if (error < 0)
		goto err;

	if (driver->flags & TTY_DRIVER_DYNAMIC_ALLOC) {
		error = tty_cdev_add(driver, dev, 0, driver->num);
		if (error)
			goto err_unreg_char;
	}

	mutex_lock(&tty_mutex);
	list_add(&driver->tty_drivers, &tty_drivers); /* 挂到全局 tty_drivers 链表 */
	mutex_unlock(&tty_mutex);

	if (!(driver->flags & TTY_DRIVER_DYNAMIC_DEV)) {
		for (i = 0; i < driver->num; i++) {
			d = tty_register_device(driver, i, NULL); /* 为每条线创建 /dev 节点 */
			if (IS_ERR(d)) {
				error = PTR_ERR(d);
				goto err_unreg_devs;
			}
		}
	}
	proc_tty_register_driver(driver);
	driver->flags |= TTY_DRIVER_INSTALLED;
	return 0;
...
}
```

#### 递归调用逻辑

```text
tty_alloc_driver()
  -> tty_set_operations()
  -> tty_register_driver()
     -> alloc_chrdev_region()/register_chrdev_region()
     -> tty_cdev_add()
     -> list_add(&tty_drivers)
     -> tty_register_device()
```

#### 一个真实的上层调用例子：`uart_register_driver()`

源码位置：`drivers/tty/serial/serial_core.c`

```c
int uart_register_driver(struct uart_driver *drv)
{
	...
	normal = tty_alloc_driver(drv->nr, TTY_DRIVER_REAL_RAW |
			TTY_DRIVER_DYNAMIC_DEV);
	...
	drv->tty_driver = normal;

	normal->driver_name	= drv->driver_name;
	normal->name		= drv->dev_name;
	normal->major		= drv->major;
	normal->minor_start	= drv->minor;
	normal->type		= TTY_DRIVER_TYPE_SERIAL;
	normal->subtype		= SERIAL_TYPE_NORMAL;
	normal->init_termios	= tty_std_termios;
	normal->driver_state    = drv;
	tty_set_operations(normal, &uart_ops);   /* 把 serial core 的 uart_ops 交给 tty core */

	for (i = 0; i < drv->nr; i++) {
		struct uart_state *state = drv->state + i;
		struct tty_port *port = &state->port;

		tty_port_init(port);            /* 初始化每个 uart_state 内的 tty_port */
		port->ops = &uart_port_ops;
	}

	retval = tty_register_driver(normal);  /* 最终仍然回到 tty core */
	...
}
```

这说明：

1. 很多串口驱动并不是直接和 tty core 对接。
2. 它们先经过 `serial_core`，再由 `serial_core` 调用 `tty_register_driver()`。

### 2. `tty_open()`

源码位置：`drivers/tty/tty_io.c`

用户 `open("/dev/ttymxc0")` 时最终会走到这里。

```c
static int tty_open(struct inode *inode, struct file *filp)
{
	struct tty_struct *tty;
	int noctty, retval;
	dev_t device = inode->i_rdev;
	unsigned saved_flags = filp->f_flags;

	nonseekable_open(inode, filp);

retry_open:
	retval = tty_alloc_file(filp);
	if (retval)
		return -ENOMEM;

	tty = tty_open_current_tty(device, filp);
	if (!tty)
		tty = tty_open_by_driver(device, filp);

	if (IS_ERR(tty)) {
		tty_free_file(filp);
		retval = PTR_ERR(tty);
		...
	}

	tty_add_file(tty, filp);

	if (tty->ops->open)
		retval = tty->ops->open(tty, filp); /* 调到底层驱动 open */
	else
		retval = -ENODEV;
	...
	if (!noctty)
		tty_open_proc_set_tty(filp, tty);
	tty_unlock(tty);
	return 0;
}
```

#### 递归调用逻辑

```text
tty_open()
  -> tty_open_current_tty() / tty_open_by_driver()
     -> tty_lookup_driver()
     -> tty_driver_lookup_tty()
     -> 若不存在:
        tty_init_dev()
          -> alloc_tty_struct()
          -> tty_driver_install_tty()
          -> tty_ldisc_lock()
          -> tty_ldisc_setup()
             -> tty_ldisc_open()
  -> tty->ops->open()
     -> 对串口类驱动通常是 uart_open()
        -> tty_port_open()
           -> port->ops->activate()
```

#### 关键实现 1：`tty_open_by_driver()`

源码位置：`drivers/tty/tty_io.c`

```c
static struct tty_struct *tty_open_by_driver(dev_t device,
					     struct file *filp)
{
	struct tty_struct *tty;
	struct tty_driver *driver = NULL;
	int index = -1;
	int retval;

	mutex_lock(&tty_mutex);
	driver = tty_lookup_driver(device, filp, &index); /* 根据设备号找 tty_driver */
	...

	tty = tty_driver_lookup_tty(driver, filp, index); /* 查是否已有实例 */
	...

	if (tty) {
		...
		retval = tty_reopen(tty); /* 已存在就 reopen */
		...
	} else {
		tty = tty_init_dev(driver, index); /* 首次打开时创建 tty_struct */
		mutex_unlock(&tty_mutex);
	}
out:
	tty_driver_kref_put(driver);
	return tty;
}
```

#### 关键实现 2：`tty_init_dev()`

源码位置：`drivers/tty/tty_io.c`

```c
struct tty_struct *tty_init_dev(struct tty_driver *driver, int idx)
{
	struct tty_struct *tty;
	int retval;

	if (!try_module_get(driver->owner))
		return ERR_PTR(-ENODEV);

	tty = alloc_tty_struct(driver, idx);   /* 分配 tty_struct */
	if (!tty) {
		retval = -ENOMEM;
		goto err_module_put;
	}

	tty_lock(tty);
	retval = tty_driver_install_tty(driver, tty); /* 安装到 driver 的表里 */
	if (retval < 0)
		goto err_free_tty;

	if (!tty->port)
		tty->port = driver->ports[idx];     /* 关联 tty_port */

	retval = tty_ldisc_lock(tty, 5 * HZ);
	if (retval)
		goto err_release_lock;
	tty->port->itty = tty;

	retval = tty_ldisc_setup(tty, tty->link); /* 默认附着 N_TTY */
	if (retval)
		goto err_release_tty;
	tty_ldisc_unlock(tty);
	return tty;
...
}
```

#### 关键实现 3：`tty_ldisc_setup()`

源码位置：`drivers/tty/tty_ldisc.c`

```c
int tty_ldisc_setup(struct tty_struct *tty, struct tty_struct *o_tty)
{
	int retval = tty_ldisc_open(tty, tty->ldisc); /* 调当前 ldisc 的 open */

	if (retval)
		return retval;

	if (o_tty) {
		retval = tty_ldisc_open(o_tty, o_tty->ldisc);
		if (retval) {
			tty_ldisc_close(tty, tty->ldisc);
			return retval;
		}
	}
	return 0;
}
```

#### 串口类驱动的真实 open 例子：`uart_open()`

源码位置：`drivers/tty/serial/serial_core.c`

```c
static int uart_open(struct tty_struct *tty, struct file *filp)
{
	struct uart_state *state = tty->driver_data;
	int retval;

	retval = tty_port_open(&state->port, tty, filp);
	if (retval > 0)
		retval = 0;

	return retval;
}
```

再往下看 `tty_port_open()`：

源码位置：`drivers/tty/tty_port.c`

```c
int tty_port_open(struct tty_port *port, struct tty_struct *tty,
							struct file *filp)
{
	spin_lock_irq(&port->lock);
	++port->count;
	spin_unlock_irq(&port->lock);
	tty_port_tty_set(port, tty);

	mutex_lock(&port->mutex);

	if (!tty_port_initialized(port)) {
		clear_bit(TTY_IO_ERROR, &tty->flags);
		if (port->ops->activate) {
			int retval = port->ops->activate(port, tty); /* 真正打开硬件 */
			if (retval) {
				mutex_unlock(&port->mutex);
				return retval;
			}
		}
		tty_port_set_initialized(port, 1);
	}
	mutex_unlock(&port->mutex);
	return tty_port_block_til_ready(port, tty, filp);
}
```

### 3. `tty_write()`

源码位置：`drivers/tty/tty_io.c`

用户空间 `write()` 最终走到这里。

```c
static ssize_t tty_write(struct kiocb *iocb, struct iov_iter *from)
{
	return file_tty_write(iocb->ki_filp, iocb, from);
}
```

真正的关键逻辑在 `file_tty_write()`：

```c
static ssize_t file_tty_write(struct file *file, struct kiocb *iocb,
			      struct iov_iter *from)
{
	struct tty_struct *tty = file_tty(file);
	struct tty_ldisc *ld;
	ssize_t ret;

	if (!tty || !tty->ops->write || tty_io_error(tty))
		return -EIO;

	ld = tty_ldisc_ref_wait(tty);         /* 先拿当前 ldisc */
	if (!ld)
		return hung_up_tty_write(iocb, from);
	if (!ld->ops->write)
		ret = -EIO;
	else
		ret = do_tty_write(ld->ops->write, tty, file, from); /* 再调 ldisc->write */
	tty_ldisc_deref(ld);
	return ret;
}
```

#### 递归调用逻辑

```text
tty_write()
  -> file_tty_write()
     -> tty_ldisc_ref_wait()
     -> do_tty_write(ld->ops->write)
        -> n_tty_write()
           -> process_echoes()
           -> process_output_block()/process_output()
           -> tty->ops->write()
```

#### 关键实现 1：`do_tty_write()`

源码位置：`drivers/tty/tty_io.c`

```c
static inline ssize_t do_tty_write(
	ssize_t (*write)(struct tty_struct *, struct file *,
			 const unsigned char *, size_t),
	struct tty_struct *tty,
	struct file *file,
	struct iov_iter *from)
{
	size_t count = iov_iter_count(from);
	ssize_t ret, written = 0;
	unsigned int chunk;

	ret = tty_write_lock(tty, file->f_flags & O_NDELAY);
	if (ret < 0)
		return ret;

	chunk = 2048;                         /* tty core 先把用户数据切块 */
	if (test_bit(TTY_NO_WRITE_SPLIT, &tty->flags))
		chunk = 65536;
	...

	for (;;) {
		size_t size = count;
		if (size > chunk)
			size = chunk;

		if (copy_from_iter(tty->write_buf, size, from) != size)
			break;

		ret = write(tty, file, tty->write_buf, size); /* 调 ldisc->write */
		if (ret <= 0)
			break;
		...
	}
	...
}
```

这个函数体现了 tty core 的一个重要职责：

1. 它先把用户空间的 `iov_iter` 复制到内核临时缓冲区。
2. 然后再一块块交给 line discipline。

#### 关键实现 2：`n_tty_write()`

源码位置：`drivers/tty/n_tty.c`

```c
static ssize_t n_tty_write(struct tty_struct *tty, struct file *file,
			   const unsigned char *buf, size_t nr)
{
	const unsigned char *b = buf;
	DEFINE_WAIT_FUNC(wait, woken_wake_function);
	int c;
	ssize_t retval = 0;

	if (L_TOSTOP(tty) && file->f_op->write_iter != redirected_tty_write) {
		retval = tty_check_change(tty);
		if (retval)
			return retval;
	}

	down_read(&tty->termios_rwsem);

	process_echoes(tty);                 /* 先处理待输出的 echo */

	add_wait_queue(&tty->write_wait, &wait);
	while (1) {
		if (signal_pending(current)) {
			retval = -ERESTARTSYS;
			break;
		}
		if (tty_hung_up_p(file) || (tty->link && !tty->link->count)) {
			retval = -EIO;
			break;
		}
		if (O_OPOST(tty)) {             /* 开启 OPOST 时做输出后处理 */
			while (nr > 0) {
				ssize_t num = process_output_block(tty, b, nr);
				...
				c = *b;
				if (process_output(c, tty) < 0)
					break;
				b++; nr--;
			}
			if (tty->ops->flush_chars)
				tty->ops->flush_chars(tty);
		} else {
			struct n_tty_data *ldata = tty->disc_data;

			while (nr > 0) {
				mutex_lock(&ldata->output_lock);
				c = tty->ops->write(tty, b, nr); /* 真正交给底层驱动发送 */
				mutex_unlock(&ldata->output_lock);
				...
			}
		}
		...
	}
	...
	return (b - buf) ? b - buf : retval;
}
```

这里可以看出：

1. 用户写并不是直接交给底层驱动。
2. 默认 `N_TTY` 会先处理终端输出语义，比如 `OPOST`、回车换行变换等。
3. 最终才通过 `tty->ops->write()` 下沉到底层驱动。

### 4. `tty_insert_flip_string_fixed_flag()` + `tty_flip_buffer_push()`

这一组 API 是底层驱动“接收到数据后往上送”的主线。

#### 4.1 `tty_insert_flip_string_fixed_flag()`

源码位置：`drivers/tty/tty_buffer.c`

```c
int tty_insert_flip_string_fixed_flag(struct tty_port *port,
		const unsigned char *chars, char flag, size_t size)
{
	int copied = 0;

	do {
		int goal = min_t(size_t, size - copied, TTY_BUFFER_PAGE);
		int flags = (flag == TTY_NORMAL) ? TTYB_NORMAL : 0;
		int space = __tty_buffer_request_room(port, goal, flags);
		struct tty_buffer *tb = port->buf.tail;

		if (unlikely(space == 0))
			break;
		memcpy(char_buf_ptr(tb, tb->used), chars, space); /* 填字符区 */
		if (~tb->flags & TTYB_NORMAL)
			memset(flag_buf_ptr(tb, tb->used), flag, space); /* 填 flag 区 */
		tb->used += space;
		copied += space;
		chars += space;
	} while (unlikely(size > copied));
	return copied;
}
```

#### 4.2 `tty_flip_buffer_push()`

源码位置：`drivers/tty/tty_buffer.c`

```c
void tty_flip_buffer_push(struct tty_port *port)
{
	struct tty_bufhead *buf = &port->buf;

	tty_flip_buffer_commit(buf->tail);          /* 把 used 提交到 commit */
	queue_work(system_unbound_wq, &buf->work);  /* 异步丢到工作队列 */
}
```

#### 4.3 `flush_to_ldisc()`

源码位置：`drivers/tty/tty_buffer.c`

```c
static void flush_to_ldisc(struct work_struct *work)
{
	struct tty_port *port = container_of(work, struct tty_port, buf.work);
	struct tty_bufhead *buf = &port->buf;

	mutex_lock(&buf->lock);

	while (1) {
		struct tty_buffer *head = buf->head;
		struct tty_buffer *next;
		int count;

		if (atomic_read(&buf->priority))
			break;

		next = smp_load_acquire(&head->next);
		count = smp_load_acquire(&head->commit) - head->read;
		if (!count) {
			if (next == NULL)
				break;
			buf->head = next;
			tty_buffer_free(port, head);
			continue;
		}

		count = receive_buf(port, head, count); /* 往 ldisc 送 */
		if (!count)
			break;
		head->read += count;
		...
	}

	mutex_unlock(&buf->lock);
}
```

#### 4.4 `tty_port_default_receive_buf()`

源码位置：`drivers/tty/tty_port.c`

```c
static int tty_port_default_receive_buf(struct tty_port *port,
					const unsigned char *p,
					const unsigned char *f, size_t count)
{
	int ret;
	struct tty_struct *tty;
	struct tty_ldisc *disc;

	tty = READ_ONCE(port->itty);
	if (!tty)
		return 0;

	disc = tty_ldisc_ref(tty);                 /* 找到当前 ldisc */
	if (!disc)
		return 0;

	ret = tty_ldisc_receive_buf(disc, p, (char *)f, count); /* 调 ldisc 接收 */

	tty_ldisc_deref(disc);
	return ret;
}
```

#### 4.5 `tty_ldisc_receive_buf()`

源码位置：`drivers/tty/tty_buffer.c`

```c
int tty_ldisc_receive_buf(struct tty_ldisc *ld, const unsigned char *p,
			  const char *f, int count)
{
	if (ld->ops->receive_buf2)
		count = ld->ops->receive_buf2(ld->tty, p, f, count);
	else {
		count = min_t(int, count, ld->tty->receive_room);
		if (count && ld->ops->receive_buf)
			ld->ops->receive_buf(ld->tty, p, f, count);
	}
	return count;
}
```

#### 4.6 `n_tty_receive_buf_common()`

源码位置：`drivers/tty/n_tty.c`

```c
static int
n_tty_receive_buf_common(struct tty_struct *tty, const unsigned char *cp,
			 const char *fp, int count, int flow)
{
	struct n_tty_data *ldata = tty->disc_data;
	int room, n, rcvd = 0, overflow;

	down_read(&tty->termios_rwsem);

	do {
		size_t tail = smp_load_acquire(&ldata->read_tail);

		room = N_TTY_BUF_SIZE - (ldata->read_head - tail); /* 算剩余空间 */
		...
		n = min(count, room);
		if (!n)
			break;

		if (!overflow || !fp || *fp != TTY_PARITY)
			__receive_buf(tty, cp, fp, n);  /* 真正写入 N_TTY 读缓冲 */

		cp += n;
		if (fp)
			fp += n;
		count -= n;
		rcvd += n;
	} while (!test_bit(TTY_LDISC_CHANGING, &tty->flags));

	tty->receive_room = room;               /* 更新还能收多少 */
	...
	up_read(&tty->termios_rwsem);

	return rcvd;
}
```

#### 递归调用逻辑总结

```text
底层驱动 IRQ
  -> tty_insert_flip_char()/tty_insert_flip_string_fixed_flag()
  -> tty_flip_buffer_push()
     -> flush_to_ldisc()
        -> receive_buf()
           -> port->client_ops->receive_buf()
              -> tty_port_default_receive_buf()
                 -> tty_ldisc_receive_buf()
                    -> n_tty_receive_buf_common()
```

### 5. `tty_register_ldisc()`

这个 API 属于 line discipline 初始化主线。

源码位置：`drivers/tty/tty_ldisc.c`

```c
int tty_register_ldisc(struct tty_ldisc_ops *new_ldisc)
{
	unsigned long flags;
	int ret = 0;

	if (new_ldisc->num < N_TTY || new_ldisc->num >= NR_LDISCS)
		return -EINVAL;

	raw_spin_lock_irqsave(&tty_ldiscs_lock, flags);
	tty_ldiscs[new_ldisc->num] = new_ldisc; /* 放到全局 ldisc 表里 */
	raw_spin_unlock_irqrestore(&tty_ldiscs_lock, flags);

	return ret;
}
```

默认 `N_TTY` 的初始化就是：

```c
void __init n_tty_init(void)
{
	tty_register_ldisc(&n_tty_ops);
}
```

## 0x03 初始化逻辑

这一节分成 3 条线看：

1. 默认 line discipline 初始化
2. tty core 本身初始化
3. 一个真实 tty 驱动的注册和设备出现过程

### 1. 默认 N_TTY 初始化调用栈

```text
console_init()
  -> n_tty_init()
     -> tty_register_ldisc(&n_tty_ops)
```

源码位置：`kernel/printk/printk.c`

```c
void __init console_init(void)
{
	int ret;
	initcall_t call;
	initcall_entry_t *ce;

	/* Setup the default TTY line discipline. */
	n_tty_init();

	...
}
```

源码位置：`drivers/tty/n_tty.c`

```c
void __init n_tty_init(void)
{
	tty_register_ldisc(&n_tty_ops);
}
```

这条链说明：

1. 默认 line discipline 很早就注册好了。
2. 后续所有新建的 tty 在没有特殊要求时，默认都挂 `N_TTY`。

### 2. tty core 本身初始化调用栈

```text
fs_initcall(chr_dev_init)
  -> chr_dev_init()
     -> tty_init()
        -> cdev_init(/dev/tty)
        -> register_chrdev_region(/dev/tty)
        -> device_create("tty")
        -> cdev_init(/dev/console)
        -> register_chrdev_region(/dev/console)
        -> device_create_with_groups("console")
        -> vty_init()   [CONFIG_VT]
```

源码位置：`drivers/char/mem.c`

```c
static int __init chr_dev_init(void)
{
	...
	return tty_init();
}

fs_initcall(chr_dev_init);
```

源码位置：`drivers/tty/tty_io.c`

```c
int __init tty_init(void)
{
	tty_sysctl_init();
	cdev_init(&tty_cdev, &tty_fops);
	if (cdev_add(&tty_cdev, MKDEV(TTYAUX_MAJOR, 0), 1) ||
	    register_chrdev_region(MKDEV(TTYAUX_MAJOR, 0), 1, "/dev/tty") < 0)
		panic("Couldn't register /dev/tty driver\n");
	device_create(tty_class, NULL, MKDEV(TTYAUX_MAJOR, 0), NULL, "tty");

	cdev_init(&console_cdev, &console_fops);
	if (cdev_add(&console_cdev, MKDEV(TTYAUX_MAJOR, 1), 1) ||
	    register_chrdev_region(MKDEV(TTYAUX_MAJOR, 1), 1, "/dev/console") < 0)
		panic("Couldn't register /dev/console driver\n");
	consdev = device_create_with_groups(tty_class, NULL,
					    MKDEV(TTYAUX_MAJOR, 1), NULL,
					    cons_dev_groups, "console");
	...
#ifdef CONFIG_VT
	vty_init(&console_fops);
#endif
	return 0;
}
```

这条链的重点不是“注册某个具体串口”，而是：

1. 把 tty 这一类设备的基础字符设备和类设备建起来。
2. 让 `/dev/tty`、`/dev/console` 这些全局入口先可用。

### 3. 真实驱动初始化：以 i.MX UART 为例

这里用当前仓库里的 `drivers/tty/serial/imx.c` + `serial_core` 说明“一个具体 tty 驱动是怎么挂进 tty 子系统的”。

#### 3.1 驱动模块初始化调用栈

```text
module_init(imx_uart_init)
  -> uart_register_driver(&imx_uart_uart_driver)
     -> tty_alloc_driver()
     -> tty_set_operations(normal, &uart_ops)
     -> tty_port_init()
     -> tty_register_driver()
  -> platform_driver_register(&imx_uart_platform_driver)
```

源码位置：`drivers/tty/serial/imx.c`

```c
static int __init imx_uart_init(void)
{
	int ret = uart_register_driver(&imx_uart_uart_driver);

	if (ret)
		return ret;

	ret = platform_driver_register(&imx_uart_platform_driver);
	if (ret != 0)
		uart_unregister_driver(&imx_uart_uart_driver);

	return ret;
}

module_init(imx_uart_init);
```

#### 3.2 串口设备 probe 后出现 tty 节点

`serial_imx_probe()` 最终会调用：

```c
return uart_add_one_port(&imx_uart_uart_driver, &sport->port);
```

而 `uart_add_one_port()` 在 `serial_core` 中做了这些事：

源码位置：`drivers/tty/serial/serial_core.c`

```c
int uart_add_one_port(struct uart_driver *drv, struct uart_port *uport)
{
	struct uart_state *state;
	struct tty_port *port;
	struct device *tty_dev;
	...

	state = drv->state + uport->line;
	port = &state->port;

	...
	state->uart_port = uport;
	uport->state = state;

	...
	tty_port_link_device(port, drv->tty_driver, uport->line); /* 把 tty_port 绑定到 tty_driver */
	uart_configure_port(drv, state, uport);

	...
	tty_dev = tty_port_register_device_attr_serdev(port, drv->tty_driver,
			uport->line, uport->dev, port, uport->tty_groups); /* 真正注册设备节点 */
	...
}
```

这说明：

1. `uart_register_driver()` 只是先注册“驱动类型”。
2. 真正某个 `ttymxcX` 设备节点出现，是在每个 port probe 成功并 `uart_add_one_port()` 之后。

## 0x04 示例

这一节给一个“DTS + serial_core + tty core + 接收路径”的完整学习示例。

### 1. DTS 里的 UART 节点

来自：`arch/arm/boot/dts/imx53.dtsi`

```dts
uart1: serial@53fbc000 {
	compatible = "fsl,imx53-uart", "fsl,imx21-uart";
	reg = <0x53fbc000 0x4000>;
	interrupts = <31>;
	clocks = <&clks IMX5_CLK_UART1_IPG_GATE>,
		 <&clks IMX5_CLK_UART1_PER_GATE>;
	clock-names = "ipg", "per";
	dmas = <&sdma 18 4 0>, <&sdma 19 4 0>;
	dma-names = "rx", "tx";
	status = "disabled";
};
```

这段 DTS 对 `tty` 学习最重要的是：

1. 它本身是一个 UART 设备节点，不是 tty 节点。
2. 但这个 UART 驱动 probe 后，会注册成 tty 设备，例如 `ttymxc0` 之类。
3. 所以 `tty` 子系统经常是建立在串口/控制台等“下层设备节点”之上的。

### 2. 板级 DTS 使能 UART

来自：`arch/arm/boot/dts/imx53-m53evk.dts`

```dts
&uart1 {
	pinctrl-names = "default";
	pinctrl-0 = <&pinctrl_uart1>;
	status = "okay";
};
```

这表示：

1. 板级 DTS 把 `uart1` 这个 SoC 内定义的 UART 设备真正使能了。
2. 启动后平台总线就会匹配 `imx-uart` 驱动进行 probe。

### 3. 驱动 probe 中与 tty 相关的关键动作

当前仓库里 `drivers/tty/serial/imx.c` 在 probe 中做了这些关键事情：

```c
sport->port.dev = &pdev->dev;
sport->port.mapbase = res->start;
sport->port.membase = base;
sport->port.type = PORT_IMX;
sport->port.iotype = UPIO_MEM;
sport->port.irq = rxirq;
sport->port.fifosize = 32;
sport->port.ops = &imx_uart_pops;      /* 底层 UART 操作集 */
sport->port.flags = UPF_BOOT_AUTOCONF;

...

sport->clk_ipg = devm_clk_get(&pdev->dev, "ipg");
sport->clk_per = devm_clk_get(&pdev->dev, "per");

...

ret = clk_prepare_enable(sport->clk_ipg);
...

return uart_add_one_port(&imx_uart_uart_driver, &sport->port);
```

这一步的关键点是：

1. `imx_uart` 并不是直接调用 `tty_register_driver()`。
2. 它把自己包装成 `uart_port` 交给 `serial_core`。
3. `serial_core` 再把这个 UART 端口接入 tty 框架。

### 4. 用户打开这个串口时的路径

当用户空间执行：

```c
fd = open("/dev/ttymxc0", O_RDWR);
```

大致会走：

```text
VFS open
  -> tty_open()
     -> tty_open_by_driver()
        -> tty_init_dev()
           -> tty_ldisc_setup()    默认挂上 N_TTY
     -> uart_open()
        -> tty_port_open()
           -> port->ops->activate()
```

也就是说：

1. 用户看到的是 `/dev/ttymxc0`
2. 进入的是 tty core
3. 再经 `serial_core`
4. 最后才到 i.MX UART 的硬件激活逻辑

### 5. 底层接收中断到用户可读缓冲的路径

当前仓库里 `drivers/tty/serial/imx.c` 的接收中断核心逻辑如下：

```c
static irqreturn_t __imx_uart_rxint(int irq, void *dev_id)
{
	struct imx_port *sport = dev_id;
	unsigned int rx, flg, ignored = 0;
	struct tty_port *port = &sport->port.state->port;

	while (imx_uart_readl(sport, USR2) & USR2_RDR) {
		...
		if (tty_insert_flip_char(port, rx, flg) == 0)
			sport->port.icount.buf_overrun++;
	}

out:
	tty_flip_buffer_push(port);   /* 推给 tty core 的 flip buffer 处理链 */

	return IRQ_HANDLED;
}
```

后续就会进入：

```text
tty_flip_buffer_push()
  -> flush_to_ldisc()
     -> tty_port_default_receive_buf()
        -> tty_ldisc_receive_buf()
           -> n_tty_receive_buf_common()
```

所以从学习视角看，一条很重要的完整链是：

```text
UART 硬件收到字节
  -> imx_uart IRQ
  -> tty_insert_flip_char()
  -> tty_flip_buffer_push()
  -> N_TTY 收到并写入 read_buf
  -> 用户 read() 读到
```

### 6. 一个简化版低层 tty 驱动示例

下面给一个非 `devm` 风格、便于理解 tty 主线的简化示例。

```c
static struct tty_driver *demo_tty_driver;
static struct tty_port demo_port;

static int demo_open(struct tty_struct *tty, struct file *filp)
{
	return tty_port_open(&demo_port, tty, filp);
}

static void demo_close(struct tty_struct *tty, struct file *filp)
{
	tty_port_close(&demo_port, tty, filp);
}

static int demo_write(struct tty_struct *tty,
		      const unsigned char *buf, int count)
{
	/* 这里本应把 buf 写到硬件 FIFO */
	return count;
}

static const struct tty_operations demo_ops = {
	.open = demo_open,
	.close = demo_close,
	.write = demo_write,
};

static int __init demo_tty_init(void)
{
	int ret;

	tty_port_init(&demo_port);

	demo_tty_driver = tty_alloc_driver(1,
			TTY_DRIVER_REAL_RAW | TTY_DRIVER_DYNAMIC_DEV);
	if (IS_ERR(demo_tty_driver))
		return PTR_ERR(demo_tty_driver);

	demo_tty_driver->driver_name = "demo-tty";
	demo_tty_driver->name = "ttydemo";
	demo_tty_driver->type = TTY_DRIVER_TYPE_SERIAL;
	demo_tty_driver->subtype = SERIAL_TYPE_NORMAL;
	demo_tty_driver->init_termios = tty_std_termios;

	tty_set_operations(demo_tty_driver, &demo_ops);

	ret = tty_register_driver(demo_tty_driver);
	if (ret)
		return ret;

	tty_port_register_device(&demo_port, demo_tty_driver, 0, NULL);
	return 0;
}
```

这个例子对应的主线非常典型：

1. 先 `tty_alloc_driver()`
2. 再 `tty_set_operations()`
3. 再 `tty_register_driver()`
4. 最后 `tty_port_register_device()`

### 7. 学习这个子系统时建议重点抓什么

如果你准备继续顺着源码深挖，建议优先抓下面 4 条线：

1. `tty_open()` 这条线，搞清楚 `tty_struct` 是什么时候创建的、`N_TTY` 是什么时候挂上的。
2. `tty_write()` 这条线，搞清楚为什么用户写不是直接到驱动，而是要先过 line discipline。
3. `tty_flip_buffer_push()` 这条线，搞清楚为什么中断里先写 flip buffer，而不是直接操作 `N_TTY`。
4. `serial_core` 和 `tty core` 的边界，搞清楚 `uart_register_driver()`、`uart_add_one_port()` 和 `tty_register_driver()` 的关系。
