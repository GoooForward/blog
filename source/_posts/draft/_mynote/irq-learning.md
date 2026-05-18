# irq子系统学习文档

## 0x00 背景

### 0. 前置知识

在看 `irq` 子系统之前，先把几个概念区分清楚：

1. `hwirq`
   硬件中断号，是某个中断控制器内部看到的中断号。
2. `virq`
   Linux 内核分配出来的逻辑中断号，也就是平时驱动里传给 `request_irq()` 的 `irq`。
3. `irq chip`
   一个中断控制器驱动提供的底层操作集合，例如 `ack/mask/unmask/eoi/set_type`。
4. `irq domain`
   用来完成 `hwirq -> virq` 映射的对象。
5. `irq desc`
   每一个 Linux IRQ 在内核里的总控对象。
6. `irq action`
   某个具体驱动注册上来的中断处理动作，也就是 `request_irq()` 对应的一条处理链节点。
7. `flow handler`
   中断流控处理函数，例如 `handle_level_irq()`、`handle_edge_irq()`，它负责通用中断时序控制。

理解 `irq` 子系统时，最重要的一点是：

`irq` 子系统不是单个 API，而是一整套“中断号映射 + 中断控制器抽象 + 中断分发执行”的框架。

### 1. 该子系统是什么

Linux 内核里的 `irq` 子系统，核心就是 generic irq framework，主要代码在：

- `kernel/irq/irqdesc.c`
- `kernel/irq/manage.c`
- `kernel/irq/handle.c`
- `kernel/irq/chip.c`
- `kernel/irq/irqdomain.c`
- `include/linux/interrupt.h`
- `include/linux/irq.h`
- `include/linux/irqdesc.h`
- `include/linux/irqdomain.h`

它位于：

1. 上层设备驱动 `request_irq()/free_irq()`
2. 下层中断控制器驱动 `irq_chip + irq_domain`

之间，负责把设备驱动、中断控制器、设备树/ACPI 这几部分连起来。

### 2. 这个子系统的作用是什么

`irq` 子系统的作用可以概括为 6 点：

1. 管理 Linux 逻辑中断号 `virq` 的分配和生命周期。
2. 抽象各种中断控制器的底层操作。
3. 建立 `hwirq -> virq` 映射。
4. 管理驱动注册的中断处理函数。
5. 在中断到来时按类型正确分发和执行处理流程。
6. 与设备树、ACPI、GPIO 中断控制器、MSI 等机制集成。

### 3. 这个子系统的架构是怎么样的

从职责上看，generic irq 可以拆成 6 层：

1. 驱动接口层
   `request_irq()`、`request_threaded_irq()`、`free_irq()` 等 API，供普通设备驱动使用。
2. 描述符管理层
   `irq_desc`、`irq_data`、`irq_common_data`，负责描述每个 Linux IRQ 的状态。
3. 控制器抽象层
   `irq_chip`，负责封装具体中断控制器的 `ack/mask/unmask/eoi/set_type` 等操作。
4. 中断流控层
   `handle_level_irq()`、`handle_edge_irq()`、`handle_fasteoi_irq()` 等 flow handler。
5. 域映射层
   `irq_domain`，负责把 `hwirq` 转成 `virq`。
6. 控制器驱动层
   具体 irqchip 驱动，例如 GIC、AVIC、GPIO 中断控制器、级联中断控制器等。

### 4. 大体架构图

```text
                +--------------------------------------+
                |        普通设备驱动 / consumer        |
                | request_irq()/free_irq()             |
                +-------------------+------------------+
                                    |
                                    v
                +--------------------------------------+
                |          generic irq core            |
                | irq_desc / irq_data / irqaction      |
                | manage.c / handle.c / chip.c         |
                +-------------------+------------------+
                                    |
                    +---------------+---------------+
                    |                               |
                    v                               v
        +---------------------------+    +-----------------------------+
        |       irq_domain          |    |         irq_chip            |
        | hwirq <-> virq 映射       |    | ack/mask/unmask/eoi 等操作 |
        +-------------+-------------+    +-------------+---------------+
                      |                                  |
                      +---------------+------------------+
                                      |
                                      v
                         +-------------------------------+
                         |      具体中断控制器驱动        |
                         | GIC / AVIC / GPIO IRQCHIP     |
                         +-------------------------------+
                                      |
                                      v
                                   中断硬件
```

### 5. 三条最重要的主线

#### 主线一：驱动申请中断

```text
request_irq()
  -> request_threaded_irq()
     -> __setup_irq()
        -> irq_request_resources()
        -> __irq_set_trigger()
        -> irq_activate()
        -> irq_startup()
```

#### 主线二：中断到来时执行

```text
generic_handle_irq()
  -> handle_irq_desc()
     -> desc->handle_irq()
        -> handle_level_irq() / handle_edge_irq() / handle_fasteoi_irq()
           -> handle_irq_event()
              -> action->handler()
              -> 或唤醒 thread_fn
```

#### 主线三：控制器建立映射

```text
irq_domain_add_simple()/irq_domain_add_legacy()
  -> 注册 irq_domain

irq_create_mapping()
  -> irq_domain_alloc_descs()
  -> irq_domain_associate()
     -> domain->ops->map()
        -> irq_set_chip_and_handler()
```

## 0x01 主要结构体

这一节只挑最核心的几个结构体。

### 1. `struct irqaction`

源码位置：`include/linux/interrupt.h`

```c
struct irqaction {
	irq_handler_t		handler;        /* 硬中断上下文里的 primary handler */
	void			*dev_id;        /* 设备私有指针，free_irq() 也靠它匹配 */
	void __percpu		*percpu_dev_id; /* percpu 中断用的 dev_id */
	struct irqaction	*next;          /* 共享中断时链接成链表 */
	irq_handler_t		thread_fn;      /* 线程化中断的线程函数 */
	struct task_struct	*thread;        /* 对应的中断线程 */
	struct irqaction	*secondary;     /* 强制线程化时的辅助 action */
	unsigned int		irq;            /* Linux 逻辑中断号 virq */
	unsigned int		flags;          /* IRQF_* 标志 */
	unsigned long		thread_flags;   /* 中断线程相关标志 */
	unsigned long		thread_mask;    /* oneshot 线程掩码 */
	const char		*name;          /* 设备名字，显示到 /proc/interrupts */
	struct proc_dir_entry	*dir;           /* procfs 入口 */
};
```

作用说明：

1. 一个 `request_irq()` 最终对应一个 `irqaction`。
2. 如果一个中断线被多个设备共享，那么 `irq_desc->action` 上会挂一条链表。

### 2. `struct irq_common_data`

源码位置：`include/linux/irq.h`

```c
struct irq_common_data {
	unsigned int		state_use_accessors; /* 所有 irqchip 共享的状态位 */
#ifdef CONFIG_NUMA
	unsigned int		node;                /* NUMA 节点 */
#endif
	void			*handler_data;       /* 供高层 handler 使用的数据 */
	struct msi_desc		*msi_desc;           /* MSI 描述符 */
	cpumask_var_t		affinity;            /* 期望的 CPU 亲和性 */
#ifdef CONFIG_GENERIC_IRQ_EFFECTIVE_AFF_MASK
	cpumask_var_t		effective_affinity;  /* 实际生效的 CPU 亲和性 */
#endif
};
```

作用说明：

1. 它保存的是所有层级 irqchip 都共享的公共状态。
2. `irq_data.common` 指向它。

### 3. `struct irq_data`

源码位置：`include/linux/irq.h`

```c
struct irq_data {
	u32			mask;         /* 预先计算好的寄存器 bit mask */
	unsigned int		irq;          /* Linux 逻辑中断号 virq */
	unsigned long		hwirq;        /* 该 domain 内的硬件中断号 hwirq */
	struct irq_common_data	*common;      /* 指向共享公共数据 */
	struct irq_chip		*chip;        /* 当前层对应的 irq_chip */
	struct irq_domain	*domain;      /* 当前层所在的 irq_domain */
#ifdef CONFIG_IRQ_DOMAIN_HIERARCHY
	struct irq_data		*parent_data; /* 层次化 domain 时的父 irq_data */
#endif
	void			*chip_data;   /* irqchip 私有数据 */
};
```

作用说明：

1. `irq_data` 是传给 `irq_chip` 回调的核心参数。
2. `irq_chip` 的所有底层操作基本都围绕它展开。

### 4. `struct irq_desc`

源码位置：`include/linux/irqdesc.h`

```c
struct irq_desc {
	struct irq_common_data	irq_common_data; /* 每个 irq 的公共数据 */
	struct irq_data		irq_data;        /* 每个 irq 的芯片/域数据 */
	unsigned int __percpu	*kstat_irqs;     /* 每 CPU 中断统计 */
	irq_flow_handler_t	handle_irq;       /* 高层 flow handler */
	struct irqaction	*action;          /* 注册到该 IRQ 上的 action 链 */
	unsigned int		status_use_accessors;
	unsigned int		core_internal_state__do_not_mess_with_it;
	unsigned int		depth;            /* disable_irq() 嵌套深度 */
	unsigned int		wake_depth;       /* wakeup enable 嵌套深度 */
	unsigned int		tot_count;        /* 中断统计 */
	unsigned int		irq_count;        /* 异常/坏中断检测用 */
	unsigned long		last_unhandled;   /* 最后一次未处理时间 */
	unsigned int		irqs_unhandled;   /* 未处理次数 */
	raw_spinlock_t		lock;             /* 描述符锁 */
	unsigned long		threads_oneshot;  /* oneshot 线程状态 */
	atomic_t		threads_active;   /* 当前活跃线程数 */
	wait_queue_head_t	wait_for_threads; /* 等待中断线程完成 */
	struct mutex		request_mutex;    /* request/free 串行化 */
	int			parent_irq;       /* 父中断号 */
	struct module		*owner;           /* 描述符所属模块 */
	const char		*name;            /* flow handler 名字 */
};
```

作用说明：

1. `irq_desc` 是 Linux 对“一个逻辑 IRQ”的总控对象。
2. 一切关于该 IRQ 的状态、处理函数、芯片、统计、线程都挂在这里。

### 5. `struct irq_chip`

源码位置：`include/linux/irq.h`

```c
struct irq_chip {
	struct device	*parent_device; /* 父设备 */
	const char	*name;          /* 芯片名字 */
	unsigned int	(*irq_startup)(struct irq_data *data); /* 启动中断 */
	void		(*irq_shutdown)(struct irq_data *data);/* 关闭中断 */
	void		(*irq_enable)(struct irq_data *data);  /* 使能中断 */
	void		(*irq_disable)(struct irq_data *data); /* 禁用中断 */
	void		(*irq_ack)(struct irq_data *data);     /* 应答中断 */
	void		(*irq_mask)(struct irq_data *data);    /* 屏蔽中断 */
	void		(*irq_mask_ack)(struct irq_data *data);/* mask + ack */
	void		(*irq_unmask)(struct irq_data *data);  /* 取消屏蔽 */
	void		(*irq_eoi)(struct irq_data *data);     /* end of interrupt */
	int		(*irq_set_affinity)(struct irq_data *data,
					    const struct cpumask *dest,
					    bool force);              /* 设置亲和性 */
	int		(*irq_retrigger)(struct irq_data *data); /* 重触发 */
	int		(*irq_set_type)(struct irq_data *data,
					unsigned int flow_type);   /* 设置边沿/电平 */
	int		(*irq_set_wake)(struct irq_data *data,
					unsigned int on);          /* 设置唤醒 */
	void		(*irq_bus_lock)(struct irq_data *data); /* 慢总线锁 */
	void		(*irq_bus_sync_unlock)(struct irq_data *data); /* 慢总线解锁 */
	int		(*irq_request_resources)(struct irq_data *data); /* 申请资源 */
	void		(*irq_release_resources)(struct irq_data *data); /* 释放资源 */
	unsigned long	flags;                              /* IRQCHIP_* 标志 */
};
```

作用说明：

1. `irq_chip` 就是具体中断控制器的底层操作抽象。
2. generic irq core 只认这些回调，不直接操作硬件寄存器。

### 6. `struct irq_domain_ops`

源码位置：`include/linux/irqdomain.h`

```c
struct irq_domain_ops {
	int (*match)(struct irq_domain *d, struct device_node *node,
		     enum irq_domain_bus_token bus_token); /* 域匹配 */
	int (*select)(struct irq_domain *d, struct irq_fwspec *fwspec,
		      enum irq_domain_bus_token bus_token); /* 域选择 */
	int (*map)(struct irq_domain *d, unsigned int virq,
		   irq_hw_number_t hw);                  /* 建立 virq <-> hwirq 映射 */
	void (*unmap)(struct irq_domain *d, unsigned int virq); /* 销毁映射 */
	int (*xlate)(struct irq_domain *d, struct device_node *node,
		     const u32 *intspec, unsigned int intsize,
		     unsigned long *out_hwirq,
		     unsigned int *out_type);            /* 把 DT 中断描述翻译成 hwirq/type */
#ifdef CONFIG_IRQ_DOMAIN_HIERARCHY
	int (*alloc)(struct irq_domain *d, unsigned int virq,
		     unsigned int nr_irqs, void *arg);
	void (*free)(struct irq_domain *d, unsigned int virq,
		     unsigned int nr_irqs);
	int (*activate)(struct irq_domain *d, struct irq_data *irqd, bool reserve);
	void (*deactivate)(struct irq_domain *d, struct irq_data *irq_data);
	int (*translate)(struct irq_domain *d, struct irq_fwspec *fwspec,
			 unsigned long *out_hwirq, unsigned int *out_type);
#endif
};
```

作用说明：

1. `irq_domain_ops` 决定这个 domain 如何把硬件中断映射到 Linux IRQ。
2. 最关键的是 `map()` 和 `xlate()`。

### 7. `struct irq_domain`

源码位置：`include/linux/irqdomain.h`

```c
struct irq_domain {
	struct list_head link;         /* 挂到全局 irq_domain 链表 */
	const char *name;              /* domain 名字 */
	const struct irq_domain_ops *ops; /* 域操作 */
	void *host_data;               /* 控制器私有数据 */
	unsigned int flags;            /* IRQ_DOMAIN_FLAG_* */
	unsigned int mapcount;         /* 当前已映射数量 */
	struct fwnode_handle *fwnode;  /* 固件节点 */
	enum irq_domain_bus_token bus_token;
	struct irq_domain_chip_generic *gc;
#ifdef CONFIG_IRQ_DOMAIN_HIERARCHY
	struct irq_domain *parent;     /* 父 domain */
#endif
	irq_hw_number_t hwirq_max;     /* 最大 hwirq */
	unsigned int revmap_size;      /* 线性反向映射表大小 */
	struct radix_tree_root revmap_tree; /* 稀疏 hwirq 时的 radix tree */
	struct mutex revmap_mutex;     /* revmap 锁 */
	struct irq_data __rcu *revmap[]; /* hwirq -> irq_data 反查表 */
};
```

作用说明：

1. `irq_domain` 负责解决 `hwirq != virq` 这个根本问题。
2. 设备树里的 `interrupts = <...>` 最终也要通过它变成 Linux IRQ。

### 8. 结构体之间的关系总结

最核心的关系可以概括为：

1. 一个 Linux IRQ 由一个 `irq_desc` 代表。
2. `irq_desc` 内部带着 `irq_data` 和 `irq_common_data`。
3. `irq_data` 指向具体的 `irq_chip` 和 `irq_domain`。
4. 驱动通过 `request_irq()` 注册一个 `irqaction` 到 `irq_desc->action` 链表上。
5. 中断到来时，由 `irq_desc->handle_irq` 调用合适的 flow handler，再去执行 `irqaction->handler`。

关系图如下：

```text
          +----------------------+
          |      irq_domain      |
          | hwirq <-> virq 映射  |
          +----------+-----------+
                     |
                     v
          +----------------------+
          |      irq_desc        |
          | handle_irq/action    |
          | irq_data/common_data |
          +----+------------+----+
               |            |
               |            |
               v            v
       +--------------+   +------------------+
       |   irq_chip   |   |    irqaction     |
       | ack/mask/... |   | handler/threadfn |
       +--------------+   +------------------+
```

## 0x02 主要API

这一节优先挑最能体现 generic irq 主线的 API。

### 1. `request_irq()`

源码位置：`include/linux/interrupt.h`

```c
static inline int __must_check
request_irq(unsigned int irq, irq_handler_t handler, unsigned long flags,
	    const char *name, void *dev)
{
	return request_threaded_irq(irq, handler, NULL, flags, name, dev);
}
```

这只是一个轻量包装，真正的核心逻辑在 `request_threaded_irq()`。

#### 递归调用逻辑

```text
request_irq()
  -> request_threaded_irq()
     -> irq_chip_pm_get()
     -> __setup_irq()
        -> irq_request_resources()
        -> __irq_set_trigger()
        -> irq_activate()
        -> irq_startup()
```

#### 关键实现 1：`request_threaded_irq()`

源码位置：`kernel/irq/manage.c`

```c
int request_threaded_irq(unsigned int irq, irq_handler_t handler,
			 irq_handler_t thread_fn, unsigned long irqflags,
			 const char *devname, void *dev_id)
{
	struct irqaction *action;
	struct irq_desc *desc;
	int retval;

	if (irq == IRQ_NOTCONNECTED)
		return -ENOTCONN;

	if (((irqflags & IRQF_SHARED) && !dev_id) ||
	    ((irqflags & IRQF_SHARED) && (irqflags & IRQF_NO_AUTOEN)) ||
	    (!(irqflags & IRQF_SHARED) && (irqflags & IRQF_COND_SUSPEND)) ||
	    ((irqflags & IRQF_NO_SUSPEND) && (irqflags & IRQF_COND_SUSPEND)))
		return -EINVAL;                          /* 先做参数合法性检查 */

	desc = irq_to_desc(irq);
	if (!desc)
		return -EINVAL;

	if (!irq_settings_can_request(desc) ||
	    WARN_ON(irq_settings_is_per_cpu_devid(desc)))
		return -EINVAL;

	if (!handler) {
		if (!thread_fn)
			return -EINVAL;
		handler = irq_default_primary_handler; /* 只有 thread_fn 时，装默认 primary handler */
	}

	action = kzalloc(sizeof(struct irqaction), GFP_KERNEL);
	if (!action)
		return -ENOMEM;

	action->handler = handler;
	action->thread_fn = thread_fn;
	action->flags = irqflags;
	action->name = devname;
	action->dev_id = dev_id;

	retval = irq_chip_pm_get(&desc->irq_data);
	if (retval < 0) {
		kfree(action);
		return retval;
	}

	retval = __setup_irq(irq, desc, action);    /* 真正把 action 挂到 desc 上 */

	if (retval) {
		irq_chip_pm_put(&desc->irq_data);
		kfree(action->secondary);
		kfree(action);
	}

	return retval;
}
```

#### 关键实现 2：`__setup_irq()`

源码位置：`kernel/irq/manage.c`

```c
static int
__setup_irq(unsigned int irq, struct irq_desc *desc, struct irqaction *new)
{
	struct irqaction *old, **old_ptr;
	unsigned long flags, thread_mask = 0;
	int ret, nested, shared = 0;

	if (!desc)
		return -EINVAL;

	if (desc->irq_data.chip == &no_irq_chip)
		return -ENOSYS;
	if (!try_module_get(desc->owner))
		return -ENODEV;

	new->irq = irq;

	if (!(new->flags & IRQF_TRIGGER_MASK))
		new->flags |= irqd_get_trigger_type(&desc->irq_data); /* 未显式指定触发方式时，继承默认值 */

	nested = irq_settings_is_nested_thread(desc);
	...

	mutex_lock(&desc->request_mutex);            /* request/free_irq 串行化 */
	chip_bus_lock(desc);                         /* 慢总线 irqchip 上锁 */

	if (!desc->action) {
		ret = irq_request_resources(desc);      /* 第一个 action 要先申请资源 */
		if (ret)
			goto out_bus_unlock;
	}

	raw_spin_lock_irqsave(&desc->lock, flags);
	old_ptr = &desc->action;
	old = *old_ptr;
	if (old) {
		/* 已经有人挂在这条 IRQ 上，检查是否允许共享 */
		...
		shared = 1;
	}

	if (!shared) {
		if (new->flags & IRQF_TRIGGER_MASK) {
			ret = __irq_set_trigger(desc,
						new->flags & IRQF_TRIGGER_MASK);
			if (ret)
				goto out_unlock;
		}

		ret = irq_activate(desc);              /* 激活 IRQ */
		if (ret)
			goto out_unlock;

		if (!(new->flags & IRQF_NO_AUTOEN) &&
		    irq_settings_can_autoenable(desc)) {
			irq_startup(desc, IRQ_RESEND, IRQ_START_COND); /* 启动并使能 */
		} else {
			desc->depth = 1;
		}
	}

	*old_ptr = new;                              /* 挂到 action 链表 */
	irq_pm_install_action(desc, new);
	desc->irq_count = 0;
	desc->irqs_unhandled = 0;

	raw_spin_unlock_irqrestore(&desc->lock, flags);
	chip_bus_sync_unlock(desc);
	mutex_unlock(&desc->request_mutex);

	register_irq_proc(irq, desc);
	register_handler_proc(irq, new);
	return 0;
	...
}
```

可以把 `__setup_irq()` 理解成：

1. 检查是否允许共享。
2. 设置触发类型。
3. 激活和启动中断。
4. 把 `irqaction` 挂到 `irq_desc` 上。

### 2. `free_irq()`

源码位置：`kernel/irq/manage.c`

```c
const void *free_irq(unsigned int irq, void *dev_id)
{
	struct irq_desc *desc = irq_to_desc(irq);
	struct irqaction *action;
	const char *devname;

	if (!desc || WARN_ON(irq_settings_is_per_cpu_devid(desc)))
		return NULL;

	action = __free_irq(desc, dev_id);
	if (!action)
		return NULL;

	devname = action->name;
	kfree(action);
	return devname;
}
```

#### 递归调用逻辑

```text
free_irq()
  -> __free_irq()
     -> irq_shutdown()
     -> __synchronize_hardirq()
     -> irq_domain_deactivate_irq()
     -> irq_release_resources()
```

#### 关键实现：`__free_irq()`

源码位置：`kernel/irq/manage.c`

```c
static struct irqaction *__free_irq(struct irq_desc *desc, void *dev_id)
{
	unsigned irq = desc->irq_data.irq;
	struct irqaction *action, **action_ptr;
	unsigned long flags;

	mutex_lock(&desc->request_mutex);
	chip_bus_lock(desc);
	raw_spin_lock_irqsave(&desc->lock, flags);

	action_ptr = &desc->action;
	for (;;) {
		action = *action_ptr;
		if (!action) {
			raw_spin_unlock_irqrestore(&desc->lock, flags);
			chip_bus_sync_unlock(desc);
			mutex_unlock(&desc->request_mutex);
			return NULL;                      /* 找不到匹配 dev_id 的 action */
		}
		if (action->dev_id == dev_id)
			break;
		action_ptr = &action->next;
	}

	*action_ptr = action->next;                  /* 从 action 链表上摘下来 */
	irq_pm_remove_action(desc, action);

	if (!desc->action) {
		irq_settings_clr_disable_unlazy(desc);
		irq_shutdown(desc);                  /* 最后一个 action 被释放时，关闭中断线 */
	}

	raw_spin_unlock_irqrestore(&desc->lock, flags);
	chip_bus_sync_unlock(desc);

	unregister_handler_proc(irq, action);
	__synchronize_hardirq(desc, true);           /* 等待正在执行的 hardirq 完成 */

	if (action->thread) {
		kthread_stop(action->thread);         /* 停掉中断线程 */
		put_task_struct(action->thread);
	}

	if (!desc->action) {
		chip_bus_lock(desc);
		raw_spin_lock_irqsave(&desc->lock, flags);
		irq_domain_deactivate_irq(&desc->irq_data); /* 彻底解除 domain 激活状态 */
		raw_spin_unlock_irqrestore(&desc->lock, flags);

		irq_release_resources(desc);          /* 释放资源 */
		chip_bus_sync_unlock(desc);
		irq_remove_timings(desc);
	}

	mutex_unlock(&desc->request_mutex);
	irq_chip_pm_put(&desc->irq_data);
	module_put(desc->owner);
	kfree(action->secondary);
	return action;
}
```

### 3. `generic_handle_irq()`

源码位置：`kernel/irq/irqdesc.c`

```c
int generic_handle_irq(unsigned int irq)
{
	return handle_irq_desc(irq_to_desc(irq));     /* 先把 irq 号变成 irq_desc */
}
```

#### 递归调用逻辑

```text
generic_handle_irq()
  -> handle_irq_desc()
     -> generic_handle_irq_desc(desc)
        -> desc->handle_irq(desc)
           -> handle_level_irq() / handle_edge_irq() / handle_fasteoi_irq()
              -> handle_irq_event()
                 -> handle_irq_event_percpu()
                    -> action->handler()
```

#### 关键实现 1：`handle_irq_desc()`

源码位置：`kernel/irq/irqdesc.c`

```c
int handle_irq_desc(struct irq_desc *desc)
{
	struct irq_data *data;

	if (!desc)
		return -EINVAL;

	data = irq_desc_get_irq_data(desc);
	if (WARN_ON_ONCE(!in_irq() && handle_enforce_irqctx(data)))
		return -EPERM;

	generic_handle_irq_desc(desc);                /* 真正调用 desc->handle_irq */
	return 0;
}
```

#### 关键实现 2：`handle_level_irq()`

源码位置：`kernel/irq/chip.c`

```c
void handle_level_irq(struct irq_desc *desc)
{
	raw_spin_lock(&desc->lock);
	mask_ack_irq(desc);                           /* level irq 先 mask + ack */

	if (!irq_may_run(desc))
		goto out_unlock;

	desc->istate &= ~(IRQS_REPLAY | IRQS_WAITING);

	if (unlikely(!desc->action || irqd_irq_disabled(&desc->irq_data))) {
		desc->istate |= IRQS_PENDING;
		goto out_unlock;                        /* 没有 action 或 irq 被禁用，标记 pending */
	}

	kstat_incr_irqs_this_cpu(desc);
	handle_irq_event(desc);                       /* 执行真正的 handler 链 */

	cond_unmask_irq(desc);                        /* 条件满足时再 unmask */

out_unlock:
	raw_spin_unlock(&desc->lock);
}
```

#### 关键实现 3：`handle_irq_event()`

源码位置：`kernel/irq/handle.c`

```c
irqreturn_t handle_irq_event(struct irq_desc *desc)
{
	irqreturn_t ret;

	desc->istate &= ~IRQS_PENDING;
	irqd_set(&desc->irq_data, IRQD_IRQ_INPROGRESS); /* 标记正在处理中 */
	raw_spin_unlock(&desc->lock);

	ret = handle_irq_event_percpu(desc);            /* 遍历 action 链并调用 handler */

	raw_spin_lock(&desc->lock);
	irqd_clear(&desc->irq_data, IRQD_IRQ_INPROGRESS);
	return ret;
}
```

也就是说，`generic_handle_irq()` 只是入口，真正做事的是：

1. 选中的 flow handler。
2. flow handler 再调用 `handle_irq_event()`。
3. 最后才执行驱动注册的 `action->handler()`。

### 4. `irq_domain_add_simple()`

源码位置：`include/linux/irqdomain.h`

```c
static inline struct irq_domain *irq_domain_add_simple(struct device_node *of_node,
						       unsigned int size,
						       unsigned int first_irq,
						       const struct irq_domain_ops *ops,
						       void *host_data)
{
	return irq_domain_create_simple(of_node_to_fwnode(of_node),
					size, first_irq, ops, host_data);
}
```

这个 API 常见于简单中断控制器或级联中断控制器驱动。

#### 递归调用逻辑

```text
irq_domain_add_simple()
  -> irq_domain_create_simple()
     -> __irq_domain_add()
```

它的作用是：

1. 为某个中断控制器创建并注册一个 `irq_domain`。
2. 后续这个控制器内的 `hwirq` 才能被映射成 Linux `virq`。

### 5. `irq_create_mapping()`

源码位置：`include/linux/irqdomain.h`

```c
static inline unsigned int irq_create_mapping(struct irq_domain *host,
					      irq_hw_number_t hwirq)
{
	return irq_create_mapping_affinity(host, hwirq, NULL);
}
```

真正的核心实现是 `irq_create_mapping_affinity()`。

#### 递归调用逻辑

```text
irq_create_mapping()
  -> irq_create_mapping_affinity()
     -> irq_find_mapping()
     -> irq_domain_alloc_descs()
     -> irq_domain_associate()
        -> domain->ops->map()
```

#### 关键实现：`irq_create_mapping_affinity()`

源码位置：`kernel/irq/irqdomain.c`

```c
unsigned int irq_create_mapping_affinity(struct irq_domain *domain,
					 irq_hw_number_t hwirq,
					 const struct irq_affinity_desc *affinity)
{
	struct device_node *of_node;
	int virq;

	if (domain == NULL)
		domain = irq_default_domain;            /* 没给 domain 时用默认 domain */
	if (domain == NULL)
		return 0;

	of_node = irq_domain_get_of_node(domain);

	virq = irq_find_mapping(domain, hwirq);      /* 如果映射已存在，直接返回 */
	if (virq)
		return virq;

	virq = irq_domain_alloc_descs(-1, 1, hwirq,
				      of_node_to_nid(of_node),
				      affinity); /* 先分配一个 Linux irq desc */
	if (virq <= 0)
		return 0;

	if (irq_domain_associate(domain, virq, hwirq)) {
		irq_free_desc(virq);
		return 0;
	}

	return virq;
}
```

这里最关键的一步是 `irq_domain_associate()`，因为它最终会调用 domain 的 `map()` 回调，让控制器驱动把这个 `virq` 初始化好。

## 0x03 初始化逻辑

这一节分成三块：

1. generic irq 框架自身初始化。
2. 架构层初始化中断控制器。
3. 控制器驱动建立 `irq_domain` 并挂上 flow handler。

### 1. generic irq 框架自身初始化

#### 调用逻辑栈

```text
start_kernel()
  -> early_irq_init()
     -> alloc_desc()/desc_set_defaults()
     -> arch_early_irq_init()
```

#### 代码 1：`start_kernel()` 里的调用位置

源码位置：`init/main.c`

```c
context_tracking_init();
early_irq_init();      /* 先把 irq 描述符体系搭起来 */
init_IRQ();            /* 再初始化具体中断控制器 */
tick_init();
```

#### 代码 2：`early_irq_init()`

源码位置：`kernel/irq/irqdesc.c`

```c
int __init early_irq_init(void)
{
	int i, initcnt, node = first_online_node;
	struct irq_desc *desc;

	init_irq_default_affinity();

	initcnt = arch_probe_nr_irqs();               /* 由架构决定需要多少个预分配 IRQ */
	...

	for (i = 0; i < initcnt; i++) {
		desc = alloc_desc(i, node, 0, NULL, NULL); /* 为每个 IRQ 分配 irq_desc */
		set_bit(i, allocated_irqs);
		irq_insert_desc(i, desc);
	}

	return arch_early_irq_init();
}
```

这一步的意义是：

1. 先把 generic irq 最基本的 `irq_desc` 体系建起来。
2. 这样后面中断控制器驱动建立映射时才有地方挂。

### 2. 架构层初始化中断控制器

以当前代码树里的 ARM 路径为例。

#### 调用逻辑栈

```text
start_kernel()
  -> init_IRQ()
     -> irqchip_init()
        -> of_irq_init(__irqchip_of_table)
           -> 各 irqchip 驱动的 init callback
```

#### 代码 1：`init_IRQ()`

源码位置：`arch/arm/kernel/irq.c`

```c
void __init init_IRQ(void)
{
	if (IS_ENABLED(CONFIG_OF) && !machine_desc->init_irq)
		irqchip_init();                         /* OF 场景走 irqchip_init() */
	else
		machine_desc->init_irq();
}
```

#### 代码 2：`irqchip_init()`

源码位置：`drivers/irqchip/irqchip.c`

```c
void __init irqchip_init(void)
{
	of_irq_init(__irqchip_of_table);             /* 从设备树扫描所有 interrupt-controller 节点 */
	acpi_probe_device_table(irqchip);
}
```

#### 代码 3：`of_irq_init()`

源码位置：`drivers/of/irq.c`

`of_irq_init()` 的核心流程是：

1. 先把设备树里匹配到的中断控制器节点收集起来。
2. 按父子层级顺序初始化。
3. 对每个节点调用对应 irqchip 驱动的 init callback。

关键代码主线如下：

```c
ret = desc->irq_init_cb(desc->dev, desc->interrupt_parent);
if (ret)
	continue;

list_add_tail(&desc->list, &intc_parent_list);
```

也就是说：

1. 设备树里的 `interrupt-controller;` 节点不是自动生效的。
2. 必须由对应 irqchip 驱动在 init callback 里真正创建 `irq_domain`、设置 `irq_chip` 等。

### 3. 控制器驱动建立 domain 的初始化例子

这里用本仓库里的 `drivers/mfd/fsl-imx25-tsadc.c` 做一个很好的级联中断控制器例子。

#### 调用逻辑栈

```text
mx25_tsadc_probe()
  -> mx25_tsadc_setup_irq()
     -> platform_get_irq()
     -> irq_domain_add_simple()
     -> irq_set_chained_handler_and_data()
```

#### 代码 1：建立 domain 并挂级联 handler

源码位置：`drivers/mfd/fsl-imx25-tsadc.c`

```c
static int mx25_tsadc_setup_irq(struct platform_device *pdev,
				struct mx25_tsadc *tsadc)
{
	struct device *dev = &pdev->dev;
	struct device_node *np = dev->of_node;
	int irq;

	irq = platform_get_irq(pdev, 0);             /* 先拿到父中断 */
	if (irq <= 0)
		return irq;

	tsadc->domain = irq_domain_add_simple(np, 2, 0,
					      &mx25_tsadc_domain_ops,
					      tsadc); /* 为子中断建立 domain */
	if (!tsadc->domain)
		return -ENOMEM;

	irq_set_chained_handler_and_data(irq,         /* 在父中断上挂级联处理函数 */
					 mx25_tsadc_irq_handler,
					 tsadc);
	return 0;
}
```

#### 代码 2：domain 的 `map()` 回调

```c
static int mx25_tsadc_domain_map(struct irq_domain *d, unsigned int irq,
				 irq_hw_number_t hwirq)
{
	struct mx25_tsadc *tsadc = d->host_data;

	irq_set_chip_data(irq, tsadc);
	irq_set_chip_and_handler(irq, &dummy_irq_chip,
				 handle_level_irq);    /* 给新映射的 virq 设置 flow handler */
	irq_modify_status(irq, IRQ_NOREQUEST, IRQ_NOPROBE);

	return 0;
}
```

#### 代码 3：级联 handler 收到父中断后再分发子中断

```c
static void mx25_tsadc_irq_handler(struct irq_desc *desc)
{
	struct mx25_tsadc *tsadc = irq_desc_get_handler_data(desc);
	struct irq_chip *chip = irq_desc_get_chip(desc);
	u32 status;

	chained_irq_enter(chip, desc);               /* 进入级联中断处理 */

	regmap_read(tsadc->regs, MX25_TSC_TGSR, &status);

	if (status & MX25_TGSR_GCQ_INT)
		generic_handle_domain_irq(tsadc->domain, 1); /* 把子 hwirq=1 交给 generic irq */

	if (status & MX25_TGSR_TCQ_INT)
		generic_handle_domain_irq(tsadc->domain, 0); /* 把子 hwirq=0 交给 generic irq */

	chained_irq_exit(chip, desc);
}
```

这个例子非常典型地展示了：

1. 父控制器先收到一个大中断。
2. 级联 handler 读状态寄存器判断是哪个子中断源触发。
3. 再调用 `generic_handle_domain_irq()` 把子 `hwirq` 交还给 generic irq 框架。

### 4. 初始化小结

把整个流程串起来就是：

```text
[阶段A] start_kernel() 调用 early_irq_init()，建立 irq_desc 基础框架
    |
    v
[阶段B] init_IRQ() 调用 irqchip_init() / 体系结构 init_irq()
    |
    v
[阶段C] 设备树 interrupt-controller 节点被 irqchip 驱动初始化
    |
    v
[阶段D] irqchip 驱动创建 irq_domain，设置 irq_chip 和 flow handler
    |
    v
[阶段E] 普通设备驱动调用 request_irq() 注册 irqaction
    |
    v
[阶段F] 中断到来时 generic_handle_irq()/handle_level_irq() 分发到驱动 handler
```

## 0x04 示例

这部分给出两个互相配套的例子：

1. 真实 DTS 中断控制器节点。
2. 真实 DTS 设备节点 + 驱动 `request_irq()` 示例。

### 1. DTS 中断控制器示例

本仓库里的 `arch/arm/boot/dts/imx25.dtsi` 里有一个根中断控制器节点：

```dts
asic: asic-interrupt-controller@68000000 {
	compatible = "fsl,imx25-asic", "fsl,avic";
	interrupt-controller;
	#interrupt-cells = <1>;
	reg = <0x68000000 0x8000000>;
};
```

并且整个 `soc` 总线默认指定了：

```dts
soc {
	interrupt-parent = <&asic>;
	...
};
```

这表示：

1. `&asic` 是根中断控制器。
2. `soc` 下面的大部分设备如果没有单独指定 `interrupt-parent`，默认都从它取中断。

### 2. DTS 普通设备示例

同一个 `imx25.dtsi` 里有一个普通设备节点：

```dts
uart5: serial@5002c000 {
	compatible = "fsl,imx25-uart", "fsl,imx21-uart";
	reg = <0x5002c000 0x4000>;
	interrupts = <40>;
	clocks = <&clks 124>, <&clks 57>;
	clock-names = "ipg", "per";
	status = "disabled";
};
```

这段 DTS 的含义是：

1. 这个 UART 的中断描述是 `<40>`。
2. 因为它继承了 `soc` 的 `interrupt-parent = <&asic>;`，所以这实际上表示：
   在 `&asic` 这个中断控制器里，`hwirq = 40`。

### 3. 驱动侧示例

下面给一个标准的普通设备驱动写法，使用非 `devm` 版本：

```c
struct demo_priv {
	int irq;
};

static irqreturn_t demo_irq_handler(int irq, void *dev_id)
{
	struct demo_priv *priv = dev_id;

	/* 这里读取设备状态寄存器并清中断 */
	return IRQ_HANDLED;
}

static int demo_probe(struct platform_device *pdev)
{
	struct demo_priv *priv;
	int ret;

	priv = kzalloc(sizeof(*priv), GFP_KERNEL);
	if (!priv)
		return -ENOMEM;

	priv->irq = platform_get_irq(pdev, 0);       /* 从 DT 的 interrupts 属性里取 virq */
	if (priv->irq < 0) {
		ret = priv->irq;
		goto err_free;
	}

	ret = request_irq(priv->irq, demo_irq_handler, 0,
			  dev_name(&pdev->dev), priv); /* 注册中断处理函数 */
	if (ret)
		goto err_free;

	platform_set_drvdata(pdev, priv);
	return 0;

err_free:
	kfree(priv);
	return ret;
}

static int demo_remove(struct platform_device *pdev)
{
	struct demo_priv *priv = platform_get_drvdata(pdev);

	free_irq(priv->irq, priv);                   /* 用相同 dev_id 释放 */
	kfree(priv);
	return 0;
}
```

这段代码背后的完整逻辑是：

```text
platform_get_irq()
  -> 从固件描述里得到 virq

request_irq()
  -> request_threaded_irq()
     -> __setup_irq()
        -> 把 demo_irq_handler 挂到 irq_desc->action 上

中断到来
  -> generic_handle_irq()
     -> desc->handle_irq()
        -> handle_level_irq()/...
           -> handle_irq_event()
              -> demo_irq_handler()
```

### 4. 级联中断控制器示例

再给一个更贴近 irq 框架本身的例子，也就是前面提到的 `tscadc`。

它在 DTS 里既是普通设备，又是子中断控制器：

```dts
tscadc: tscadc@50030000 {
	compatible = "fsl,imx25-tsadc";
	reg = <0x50030000 0xc>;
	interrupts = <46>;
	clocks = <&clks 119>;
	clock-names = "ipg";
	interrupt-controller;
	#interrupt-cells = <1>;
	#address-cells = <1>;
	#size-cells = <1>;
	status = "disabled";
	ranges;
};
```

这个节点说明：

1. 它自己通过父控制器拿到一个上级中断 `46`。
2. 但它自身又是一个 `interrupt-controller`。
3. 所以它会在驱动里创建自己的 `irq_domain`，把内部的子中断继续往下分发。

这正是 `irq_domain` 和级联 `irqchip` 最典型的使用场景。

### 5. 学习这个子系统时建议重点盯住的文件

如果你要继续往下深挖，建议按下面顺序读：

1. `include/linux/interrupt.h`
   先看驱动侧能用的 API 和 `irqaction`。
2. `include/linux/irq.h`
   再看 `irq_chip`、`irq_data`、`irq_common_data`。
3. `include/linux/irqdesc.h`
   理解 `irq_desc` 这个总控对象。
4. `include/linux/irqdomain.h`
   理解 `irq_domain` 的职责和操作集。
5. `kernel/irq/manage.c`
   看 `request_irq/free_irq` 的主流程。
6. `kernel/irq/chip.c`
   看各种 flow handler。
7. `kernel/irq/handle.c`
   看 action 链是怎么执行的。
8. `kernel/irq/irqdomain.c`
   看 `hwirq -> virq` 映射。
9. 具体 irqchip 驱动
   例如 `drivers/mfd/fsl-imx25-tsadc.c`、`drivers/irqchip/*`。

## 总结

`irq` 子系统最核心的理解方式，不是把它看成“驱动注册一个中断函数”这么简单，而是看成一条完整的数据流：

```text
设备树/固件里的 interrupts 描述
  -> irq_domain 把 hwirq 映射成 virq
  -> irq_desc 表示这个 virq 的全部运行时状态
  -> request_irq() 注册 irqaction
  -> 中断到来时由 flow handler 分发
  -> 最终执行驱动的 handler
```

只要把下面 4 个问题想明白，这个子系统就基本掌握了：

1. `hwirq` 是怎么映射成 `virq` 的？
2. `irq_desc`、`irq_data`、`irq_chip`、`irqaction` 之间是什么关系？
3. `request_irq()` 最终是怎么把 handler 挂到系统里的？
4. 中断到来时，generic irq core 是怎么一步步调用到驱动 handler 的？
