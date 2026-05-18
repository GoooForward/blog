# 0clk子系统学习文档

## 0x00 背景

### 0. 前置知识

在看 `clk` 子系统之前，建议先把下面几个概念分清楚：

1. `CCF`
   即 Common Clock Framework，Linux 统一的时钟框架。
2. `clock provider`
   提供时钟的一方，通常是 SoC 的时钟控制器驱动，比如 i.MX 的 `CCM` 驱动。
3. `clock consumer`
   使用时钟的一方，通常是 UART、I2C、SPI、MMC 等外设驱动。
4. `struct clk`
   面向消费者的“句柄”，驱动平时拿到的就是它。
5. `struct clk_hw`
   面向 provider 的硬件抽象，具体时钟硬件实现通常把它嵌进自己的私有结构体里。
6. `prepare / enable`
   `prepare` 允许睡眠，适合慢速总线/I2C/SPI 访问寄存器的场景；
   `enable` 不能睡眠，适合原子上下文快速开关门控。
7. `rate / parent`
   `rate` 是频率；
   `parent` 是父时钟；
   CCF 管理的其实是一整棵时钟树。

理解 `clk` 子系统时，最重要的一点是：

`clk` 子系统不是单个“开关时钟”的 API，而是一套“时钟树建模 + provider 注册 + consumer 获取 + 频率传播”的统一框架。

### 1. 该子系统是什么

Linux 的 `clk` 子系统核心就是 `Common Clock Framework`，主要代码在：

- `drivers/clk/clk.c`
- `drivers/clk/clkdev.c`
- `include/linux/clk.h`
- `include/linux/clk-provider.h`
- `include/linux/of_clk.h`

它位于：

1. 下层 SoC 时钟控制器驱动
2. 上层设备驱动

之间，负责把“具体时钟硬件”和“驱动对时钟的使用”隔离开来。

### 2. 这个子系统的作用是什么

`clk` 子系统的作用可以概括成 6 点：

1. 用统一数据结构描述整棵时钟树。
2. 抽象不同硬件时钟的操作方法，比如 `enable/disable/set_rate/set_parent`。
3. 管理 provider 注册的各类时钟节点。
4. 让 consumer 通过 `clk_get()` / `of_clk_get()` 获得时钟。
5. 负责时钟频率变化时的父子传播、通知和边界检查。
6. 和设备树集成，让 `clocks = <...>` / `clock-names = "..."` 能自动对上真正的时钟对象。

### 3. 这个子系统的架构是怎么样的

从职责划分上，CCF 可以拆成 6 层：

1. 消费者接口层
   `clk_get()`、`clk_prepare_enable()`、`clk_set_rate()`、`clk_put()`。
2. 查找层
   `clkdev` + OF 解析逻辑，负责把设备和 `con_id` 转成具体时钟。
3. 核心管理层
   `struct clk_core`，维护整棵时钟树、计数、父子关系、当前 rate。
4. provider 抽象层
   `struct clk_hw` + `struct clk_ops`，用回调封装具体硬件行为。
5. provider 发布层
   `clk_hw_register()` / `clk_register()`、`of_clk_add_provider()` / `of_clk_add_hw_provider()`。
6. DTS/早期初始化层
   `of_clk_init()` + `CLK_OF_DECLARE()`，负责在系统早期把时钟控制器建起来。

### 4. 大体架构图

```text
                  +----------------------------------+
                  |         设备驱动 / consumer       |
                  | clk_get / clk_prepare_enable     |
                  | clk_set_rate / clk_put           |
                  +----------------+-----------------+
                                   |
                                   v
                  +----------------------------------+
                  |      clkdev + OF 解析查找层       |
                  | clk_get() / of_clk_get()         |
                  +----------------+-----------------+
                                   |
                                   v
                  +----------------------------------+
                  |        Common Clock Framework    |
                  | struct clk / struct clk_core     |
                  | rate tree / parent tree / refcnt |
                  +-----------+-------------+--------+
                              |             |
                              v             v
                   +----------------+   +------------------+
                   | struct clk_hw  |   | struct clk_ops   |
                   | 硬件抽象对象    |   | enable/set_rate  |
                   +--------+-------+   +---------+--------+
                            |                     |
                            +----------+----------+
                                       |
                                       v
                         +-------------------------------+
                         |      具体时钟控制器驱动        |
                         | mux / divider / gate / pll    |
                         +---------------+---------------+
                                         |
                                         v
                                      时钟硬件
```

### 5. 三条最重要的主线

#### 主线一：消费者获取时钟

```text
clk_get(dev, "per")
  -> 如果设备有 of_node:
     of_clk_get_hw(dev->of_node, 0, "per")
       -> of_parse_clkspec()
       -> of_clk_get_hw_from_clkspec()
          -> provider->get_hw()/get()
          -> clk_hw_create_clk()
  -> 否则退化到 clkdev lookup
```

#### 主线二：消费者使能时钟

```text
clk_prepare_enable(clk)
  -> clk_prepare()
     -> clk_core_prepare()
        -> 先 prepare 父时钟
        -> 再调用本时钟 ops->prepare()
  -> clk_enable()
     -> clk_core_enable()
        -> 先 enable 父时钟
        -> 再调用本时钟 ops->enable()
```

#### 主线三：provider 注册并发布时钟

```text
CLK_OF_DECLARE(...)
  -> of_clk_init(NULL)
     -> 调用 provider init 回调
        -> clk_hw_register()/clk_register_xxx()
        -> of_clk_add_provider()/of_clk_add_hw_provider()
```

## 0x01 主要结构体

这一节挑最关键的结构体来分析。

### 1. `struct clk_core`

源码位置：`drivers/clk/clk.c`

这是 CCF 内部最核心的对象，整棵时钟树就是围绕它组织起来的。

```c
struct clk_core {
	const char		*name;          /* 时钟名字 */
	const struct clk_ops	*ops;           /* 该时钟支持的硬件操作 */
	struct clk_hw		*hw;            /* 回指 provider 的硬件抽象对象 */
	struct module		*owner;         /* 所属模块 */
	struct device		*dev;           /* provider 对应的设备 */
	struct device_node	*of_node;       /* provider 的 DT 节点 */
	struct clk_core		*parent;        /* 当前父时钟 */
	struct clk_parent_map	*parents;       /* 所有候选父时钟映射表 */
	u8			num_parents;    /* 候选父时钟数量 */
	u8			new_parent_index; /* 速率/父切换过程中的新父索引 */
	unsigned long		rate;           /* 当前缓存的时钟频率 */
	unsigned long		req_rate;       /* 最近一次请求频率 */
	unsigned long		new_rate;       /* 切换过程中计算出的新频率 */
	struct clk_core		*new_parent;    /* 切换过程中的新父时钟 */
	struct clk_core		*new_child;     /* 变更传播过程中关联的新子节点 */
	unsigned long		flags;          /* CLK_SET_RATE_PARENT 等框架标志 */
	bool			orphan;         /* 父时钟尚未注册时，自己是否是孤儿节点 */
	bool			rpm_enabled;    /* provider 是否启用了 runtime PM */
	unsigned int		enable_count;   /* enable 引用计数 */
	unsigned int		prepare_count;  /* prepare 引用计数 */
	unsigned int		protect_count;  /* 频率保护计数 */
	unsigned long		min_rate;       /* 允许的最小频率 */
	unsigned long		max_rate;       /* 允许的最大频率 */
	unsigned long		accuracy;       /* 当前精度 */
	int			phase;          /* 当前相位 */
	struct clk_duty		duty;           /* 占空比 */
	struct hlist_head	children;       /* 子时钟链表 */
	struct hlist_node	child_node;     /* 挂到父时钟 children 上 */
	struct hlist_head	clks;           /* 所有消费者 struct clk 链表 */
	unsigned int		notifier_count; /* notifier 数量 */
	struct kref		ref;            /* 核心对象引用计数 */
};
```

作用说明：

1. 它是 CCF 的“内部真身”。
2. 一个时钟节点真正的父子关系、频率、计数，都在这里维护。
3. `struct clk` 和 `struct clk_hw` 最终都会关联到同一个 `struct clk_core`。

### 2. `struct clk`

源码位置：`drivers/clk/clk.c`

这是面向 consumer 的时钟句柄。

```c
struct clk {
	struct clk_core	*core;           /* 指向真正的 clk_core */
	struct device	*dev;            /* 使用这个时钟的设备 */
	const char	*dev_id;         /* 设备标识 */
	const char	*con_id;         /* 连接 ID，例如 "ipg"、"per" */
	unsigned long	min_rate;        /* 消费者施加的最小频率约束 */
	unsigned long	max_rate;        /* 消费者施加的最大频率约束 */
	unsigned int	exclusive_count; /* 独占改频计数 */
	struct hlist_node clks_node;    /* 挂到 clk_core->clks 上 */
};
```

作用说明：

1. 驱动平时拿到的是 `struct clk *`。
2. 同一个硬件时钟可以被多个 consumer 获取，因此可能有多个 `struct clk` 指向同一个 `struct clk_core`。

### 3. `struct clk_ops`

源码位置：`include/linux/clk-provider.h`

这是 provider 必须实现的操作集合。

```c
struct clk_ops {
	int		(*prepare)(struct clk_hw *hw);      /* 睡眠上下文的准备动作 */
	void		(*unprepare)(struct clk_hw *hw);    /* 取消准备 */
	int		(*is_prepared)(struct clk_hw *hw);  /* 是否已 prepare */
	void		(*unprepare_unused)(struct clk_hw *hw); /* 回收未使用 prepare */
	int		(*enable)(struct clk_hw *hw);       /* 原子上下文使能 */
	void		(*disable)(struct clk_hw *hw);      /* 原子上下文关闭 */
	int		(*is_enabled)(struct clk_hw *hw);   /* 是否已 enable */
	void		(*disable_unused)(struct clk_hw *hw); /* 回收未使用 enable */
	int		(*save_context)(struct clk_hw *hw); /* 低功耗前保存上下文 */
	void		(*restore_context)(struct clk_hw *hw); /* 恢复上下文 */
	unsigned long	(*recalc_rate)(struct clk_hw *hw,
					unsigned long parent_rate); /* 重新计算频率 */
	long		(*round_rate)(struct clk_hw *hw, unsigned long rate,
					unsigned long *parent_rate); /* 频率取整 */
	int		(*determine_rate)(struct clk_hw *hw,
					  struct clk_rate_request *req); /* 选最佳频率/父 */
	int		(*set_parent)(struct clk_hw *hw, u8 index); /* 切父时钟 */
	u8		(*get_parent)(struct clk_hw *hw);   /* 读当前父时钟 */
	int		(*set_rate)(struct clk_hw *hw, unsigned long rate,
				    unsigned long parent_rate); /* 设置频率 */
	int		(*set_rate_and_parent)(struct clk_hw *hw,
				    unsigned long rate,
				    unsigned long parent_rate, u8 index); /* 同时改频+改父 */
	unsigned long	(*recalc_accuracy)(struct clk_hw *hw,
					   unsigned long parent_accuracy); /* 重新计算精度 */
	int		(*get_phase)(struct clk_hw *hw);    /* 获取相位 */
	int		(*set_phase)(struct clk_hw *hw, int degrees); /* 设置相位 */
	int		(*get_duty_cycle)(struct clk_hw *hw,
					  struct clk_duty *duty); /* 读占空比 */
	int		(*set_duty_cycle)(struct clk_hw *hw,
					  struct clk_duty *duty); /* 设置占空比 */
	int		(*init)(struct clk_hw *hw);         /* provider 私有初始化 */
	void		(*terminate)(struct clk_hw *hw);    /* 释放 init 资源 */
	void		(*debug_init)(struct clk_hw *hw, struct dentry *dentry); /* debugfs */
};
```

作用说明：

1. `clk_ops` 定义了时钟硬件怎么被操作。
2. CCF 不直接碰寄存器，它只调用这里的回调。

### 4. `struct clk_hw`

源码位置：`include/linux/clk-provider.h`

这是 provider 侧最重要的桥梁对象。

```c
struct clk_hw {
	struct clk_core *core;               /* 对应的 clk_core */
	struct clk *clk;                     /* 一个默认 struct clk 句柄 */
	const struct clk_init_data *init;    /* 注册前的初始化数据 */
};
```

作用说明：

1. provider 驱动通常会把 `struct clk_hw` 内嵌进自己的私有结构体。
2. 注册时，CCF 会根据 `hw->init` 创建 `clk_core`。

### 5. `struct clk_init_data`

源码位置：`include/linux/clk-provider.h`

这个结构体用来描述一个时钟节点注册时的静态信息。

```c
struct clk_init_data {
	const char		*name;          /* 时钟名字 */
	const struct clk_ops	*ops;           /* 这个时钟的操作集合 */
	const char * const	*parent_names;  /* 父时钟名字数组 */
	const struct clk_parent_data *parent_data; /* 父时钟描述数组 */
	const struct clk_hw	**parent_hws;   /* 父时钟 hw 数组 */
	u8			num_parents;    /* 父时钟数量 */
	unsigned long		flags;          /* CLK_* 标志 */
};
```

作用说明：

1. provider 注册一个时钟节点时，最核心的静态描述就在这里。
2. `__clk_register()` 会把这些信息搬进新的 `clk_core`。

### 6. `struct clk_parent_data`

源码位置：`include/linux/clk-provider.h`

```c
struct clk_parent_data {
	const struct clk_hw	*hw;     /* 直接指定父时钟 hw */
	const char		*fw_name;/* provider 内部使用的父名字 */
	const char		*name;   /* 全局唯一父时钟名字 */
	int			index;  /* provider 局部父索引 */
};
```

作用说明：

1. 用来更灵活地描述父时钟来源。
2. 在“部分父时钟在本 provider 内，部分在外部”的场景下很有用。

### 7. `struct clk_onecell_data` / `struct clk_hw_onecell_data`

源码位置：`include/linux/clk-provider.h`

这两个结构体常用于 OF provider 一次性导出多个时钟。

```c
struct clk_onecell_data {
	struct clk **clks;      /* struct clk* 数组 */
	unsigned int clk_num;   /* 数组中时钟数量 */
};

struct clk_hw_onecell_data {
	unsigned int num;       /* 数量 */
	struct clk_hw *hws[];   /* struct clk_hw* 数组 */
};
```

作用说明：

1. 设备树里 `#clock-cells = <1>` 时，经常会把“索引 -> 时钟对象”的映射放在这里。
2. `of_clk_src_onecell_get()` / `of_clk_hw_onecell_get()` 就是根据这个数组返回目标时钟。

### 8. `struct of_clk_provider`

源码位置：`drivers/clk/clk.c`

这个结构体是 OF 时钟 provider 注册到框架里的内部节点。

```c
struct of_clk_provider {
	struct list_head link;  /* 挂到全局 provider 链表 */
	struct device_node *node; /* provider 的 DT 节点 */
	struct clk *(*get)(struct of_phandle_args *clkspec, void *data);   /* 返回 struct clk */
	struct clk_hw *(*get_hw)(struct of_phandle_args *clkspec, void *data); /* 返回 struct clk_hw */
	void *data;             /* provider 私有数据，例如 onecell 数组 */
};
```

作用说明：

1. `of_clk_add_provider()` / `of_clk_add_hw_provider()` 最终就是创建它并挂到全局链表。
2. consumer 通过 OF 解析到 provider 节点后，最终会在这张链表里找到对应 provider。

### 9. 结构体之间的关系总结

最核心的关系可以这样理解：

1. provider 驱动先准备一个 `struct clk_hw` 和 `struct clk_init_data`。
2. 调用 `clk_hw_register()` 后，框架创建 `struct clk_core`。
3. consumer 调用 `clk_get()` 后，框架再为它创建一个 `struct clk`。
4. 如果是 OF 场景，provider 还会通过 `of_clk_add_provider()` 把自己发布出来。

关系图如下：

```text
               +----------------------+
               |   struct clk_ops     |
               | enable/set_rate/...  |
               +----------+-----------+
                          |
                          v
               +----------------------+
               |    struct clk_hw     |
               | provider 侧硬件抽象   |
               +----------+-----------+
                          |
                          v
               +----------------------+
               |   struct clk_core    |
               | 时钟树核心对象        |
               | parent/rate/count    |
               +----+-------------+---+
                    |             |
                    |             |
                    v             v
          +----------------+   +----------------------+
          | struct clk     |   | of_clk_provider      |
          | consumer 句柄   |   | OF provider 发布节点 |
          +----------------+   +----------------------+
```

## 0x02 主要API

这一节优先分析最能体现 CCF 主线的 API。

### 1. `clk_get()`

源码声明：`include/linux/clk.h`

```c
struct clk *clk_get(struct device *dev, const char *id);
```

真正实现：`drivers/clk/clkdev.c`

```c
struct clk *clk_get(struct device *dev, const char *con_id)
{
	const char *dev_id = dev ? dev_name(dev) : NULL;
	struct clk_hw *hw;

	if (dev && dev->of_node) {
		hw = of_clk_get_hw(dev->of_node, 0, con_id);
		if (!IS_ERR(hw) || PTR_ERR(hw) == -EPROBE_DEFER)
			return clk_hw_create_clk(dev, hw, dev_id, con_id);
	}

	return __clk_get_sys(dev, dev_id, con_id);
}
```

作用说明：

1. 对设备驱动来说，这是最常用的入口。
2. 如果设备节点有 DT 信息，优先走 OF 查找。
3. 如果 OF 查找失败，再退回老的 `clkdev` 名字匹配机制。

#### 递归调用逻辑

```text
clk_get()
  -> of_clk_get_hw()
     -> of_parse_clkspec()
     -> of_clk_get_hw_from_clkspec()
        -> __of_clk_get_hw_from_provider()
           -> provider->get_hw() / provider->get()
     -> clk_hw_create_clk()
  -> 或者 __clk_get_sys()
     -> clk_find_hw()
     -> clk_hw_create_clk()
```

#### 关键实现 1：`of_clk_get_hw()`

源码位置：`drivers/clk/clk.c`

```c
struct clk_hw *of_clk_get_hw(struct device_node *np, int index,
			     const char *con_id)
{
	int ret;
	struct clk_hw *hw;
	struct of_phandle_args clkspec;

	ret = of_parse_clkspec(np, index, con_id, &clkspec);
	if (ret)
		return ERR_PTR(ret);                  /* 先解析 clocks / clock-names */

	hw = of_clk_get_hw_from_clkspec(&clkspec); /* 再按 phandle 找 provider */
	of_node_put(clkspec.np);

	return hw;
}
```

#### 关键实现 2：`of_parse_clkspec()`

源码位置：`drivers/clk/clk.c`

```c
static int of_parse_clkspec(const struct device_node *np, int index,
			    const char *name, struct of_phandle_args *out_args)
{
	int ret = -ENOENT;

	while (np) {
		if (name)
			index = of_property_match_string(np, "clock-names", name);

		ret = of_parse_phandle_with_args(np, "clocks", "#clock-cells",
						 index, out_args);
		if (!ret)
			break;                          /* 找到目标 clocks 条目就退出 */

		if (name && index >= 0)
			break;

		np = np->parent;                    /* 支持父节点 clock-ranges 继承 */
		if (np && !of_get_property(np, "clock-ranges", NULL))
			break;
		index = 0;
	}

	return ret;
}
```

#### 关键实现 3：`of_clk_get_hw_from_clkspec()`

源码位置：`drivers/clk/clk.c`

```c
static struct clk_hw *
of_clk_get_hw_from_clkspec(struct of_phandle_args *clkspec)
{
	struct of_clk_provider *provider;
	struct clk_hw *hw = ERR_PTR(-EPROBE_DEFER);

	if (!clkspec)
		return ERR_PTR(-EINVAL);

	mutex_lock(&of_clk_mutex);
	list_for_each_entry(provider, &of_clk_providers, link) {
		if (provider->node == clkspec->np) {
			hw = __of_clk_get_hw_from_provider(provider, clkspec);
			if (!IS_ERR(hw))
				break;                  /* 在 provider 链表里找到对应项 */
		}
	}
	mutex_unlock(&of_clk_mutex);

	return hw;
}
```

#### 关键实现 4：`__clk_get_sys()`

源码位置：`drivers/clk/clkdev.c`

```c
static struct clk *__clk_get_sys(struct device *dev, const char *dev_id,
				 const char *con_id)
{
	struct clk_hw *hw = clk_find_hw(dev_id, con_id);

	return clk_hw_create_clk(dev, hw, dev_id, con_id);
}
```

这里走的是非 OF 老式查找路径，本质上是：

1. 根据 `dev_id + con_id` 匹配 `clk_lookup`
2. 找到 `clk_hw`
3. 包装出一个新的 `struct clk`

### 2. `clk_prepare_enable()`

源码位置：`include/linux/clk.h`

```c
static inline int clk_prepare_enable(struct clk *clk)
{
	int ret;

	ret = clk_prepare(clk);
	if (ret)
		return ret;
	ret = clk_enable(clk);
	if (ret)
		clk_unprepare(clk);

	return ret;
}
```

作用说明：

1. 这是 consumer 最常用的时钟使能 API。
2. 它本身只是包装，真正逻辑在 `clk_prepare()` 和 `clk_enable()`。

#### 递归调用逻辑

```text
clk_prepare_enable()
  -> clk_prepare()
     -> clk_core_prepare_lock()
        -> clk_core_prepare()
           -> clk_pm_runtime_get()
           -> 先 clk_core_prepare(parent)
           -> core->ops->prepare()
  -> clk_enable()
     -> clk_core_enable_lock()
        -> clk_core_enable()
           -> 先 clk_core_enable(parent)
           -> core->ops->enable()
```

#### 关键实现 1：`clk_prepare()`

源码位置：`drivers/clk/clk.c`

```c
int clk_prepare(struct clk *clk)
{
	if (!clk)
		return 0;

	return clk_core_prepare_lock(clk->core);
}
```

#### 关键实现 2：`clk_core_prepare()`

源码位置：`drivers/clk/clk.c`

```c
static int clk_core_prepare(struct clk_core *core)
{
	int ret = 0;

	if (!core)
		return 0;

	if (core->prepare_count == 0) {
		ret = clk_pm_runtime_get(core);
		if (ret)
			return ret;

		ret = clk_core_prepare(core->parent); /* 先 prepare 父时钟 */
		if (ret)
			goto runtime_put;

		if (core->ops->prepare)
			ret = core->ops->prepare(core->hw); /* 再 prepare 自己 */

		if (ret)
			goto unprepare;
	}

	core->prepare_count++;

	if (core->flags & CLK_SET_RATE_GATE)
		clk_core_rate_protect(core);         /* prepare 后阻止改频 */

	return 0;
unprepare:
	clk_core_unprepare(core->parent);
runtime_put:
	clk_pm_runtime_put(core);
	return ret;
}
```

这个函数最重要的点有两个：

1. 递归先处理父时钟，再处理自己。
2. 用 `prepare_count` 做引用计数，避免重复开关。

#### 关键实现 3：`clk_enable()`

源码位置：`drivers/clk/clk.c`

```c
int clk_enable(struct clk *clk)
{
	if (!clk)
		return 0;

	return clk_core_enable_lock(clk->core);
}
```

#### 关键实现 4：`clk_core_enable()`

源码位置：`drivers/clk/clk.c`

```c
static int clk_core_enable(struct clk_core *core)
{
	int ret = 0;

	if (!core)
		return 0;

	if (core->prepare_count == 0)
		return -ESHUTDOWN;                  /* 没 prepare 不能直接 enable */

	if (core->enable_count == 0) {
		ret = clk_core_enable(core->parent); /* 先 enable 父时钟 */
		if (ret)
			return ret;

		if (core->ops->enable)
			ret = core->ops->enable(core->hw); /* 再 enable 自己 */

		if (ret) {
			clk_core_disable(core->parent);
			return ret;
		}
	}

	core->enable_count++;
	return 0;
}
```

### 3. `clk_set_rate()`

源码声明：`include/linux/clk.h`

```c
int clk_set_rate(struct clk *clk, unsigned long rate);
```

实现入口：`drivers/clk/clk.c`

```c
int clk_set_rate(struct clk *clk, unsigned long rate)
{
	int ret;

	if (!clk)
		return 0;

	clk_prepare_lock();                     /* 防止并发修改拓扑 */

	if (clk->exclusive_count)
		clk_core_rate_unprotect(clk->core);

	ret = clk_core_set_rate_nolock(clk->core, rate);

	if (clk->exclusive_count)
		clk_core_rate_restore_protect(clk->core,
					      clk->exclusive_count);

	clk_prepare_unlock();
	return ret;
}
```

#### 递归调用逻辑

```text
clk_set_rate()
  -> clk_core_set_rate_nolock()
     -> clk_core_req_round_rate_nolock()
     -> clk_calc_new_rates()
     -> clk_pm_runtime_get()
     -> clk_propagate_rate_change(PRE_RATE_CHANGE)
     -> clk_change_rate()
```

#### 关键实现：`clk_core_set_rate_nolock()`

源码位置：`drivers/clk/clk.c`

```c
static int clk_core_set_rate_nolock(struct clk_core *core,
				    unsigned long req_rate)
{
	struct clk_core *top, *fail_clk;
	unsigned long rate;
	int ret = 0;

	if (!core)
		return 0;

	rate = clk_core_req_round_rate_nolock(core, req_rate);

	if (rate == clk_core_get_rate_nolock(core))
		return 0;                           /* 目标频率没变，直接返回 */

	if (clk_core_rate_is_protected(core))
		return -EBUSY;                      /* 被保护的 provider 不允许直接改频 */

	top = clk_calc_new_rates(core, req_rate); /* 先推导整棵子树的新频率 */
	if (!top)
		return -EINVAL;

	ret = clk_pm_runtime_get(core);
	if (ret)
		return ret;

	fail_clk = clk_propagate_rate_change(top, PRE_RATE_CHANGE); /* 通知 */
	if (fail_clk) {
		clk_propagate_rate_change(top, ABORT_RATE_CHANGE);
		ret = -EBUSY;
		goto err;
	}

	clk_change_rate(top);                  /* 真正写硬件、更新缓存 */
	core->req_rate = req_rate;
err:
	clk_pm_runtime_put(core);
	return ret;
}
```

这个函数体现了 CCF 改频的核心思想：

1. 不是只改一个节点，而是先计算整棵受影响子树。
2. 支持 `CLK_SET_RATE_PARENT` 这类向父传播的行为。
3. 会在改频前后触发 notifier。

### 4. `clk_hw_register()` / `clk_register_gate()`

这一组 API 站在 provider 侧。

#### 4.1 `clk_hw_register()`

源码位置：`drivers/clk/clk.c`

```c
int clk_hw_register(struct device *dev, struct clk_hw *hw)
{
	return PTR_ERR_OR_ZERO(__clk_register(dev, dev_or_parent_of_node(dev),
			       hw));
}
```

#### 递归调用逻辑

```text
clk_hw_register()
  -> __clk_register()
     -> clk_core_populate_parent_map()
     -> alloc_clk()
     -> clk_core_link_consumer()
     -> __clk_core_init()
```

#### 关键实现：`__clk_register()`

源码位置：`drivers/clk/clk.c`

```c
static struct clk *
__clk_register(struct device *dev, struct device_node *np, struct clk_hw *hw)
{
	int ret;
	struct clk_core *core;
	const struct clk_init_data *init = hw->init;

	hw->init = NULL;                      /* 注册后不再允许 provider 继续使用 init */

	core = kzalloc(sizeof(*core), GFP_KERNEL);
	if (!core)
		return ERR_PTR(-ENOMEM);

	core->name = kstrdup_const(init->name, GFP_KERNEL);
	core->ops = init->ops;
	core->dev = dev;
	core->of_node = np;
	core->hw = hw;
	core->flags = init->flags;
	core->num_parents = init->num_parents;
	core->min_rate = 0;
	core->max_rate = ULONG_MAX;

	ret = clk_core_populate_parent_map(core, init); /* 建父映射表 */
	if (ret)
		goto fail;

	INIT_HLIST_HEAD(&core->clks);

	hw->clk = alloc_clk(core, NULL, NULL);          /* 给 provider 自己建一个默认 clk 句柄 */
	if (IS_ERR(hw->clk)) {
		ret = PTR_ERR(hw->clk);
		goto fail;
	}

	clk_core_link_consumer(core, hw->clk);

	ret = __clk_core_init(core);                    /* 真正把节点挂进树里并初始化 */
	if (!ret)
		return hw->clk;

fail:
	return ERR_PTR(ret);
}
```

#### 4.2 `clk_register_gate()`

源码位置：`drivers/clk/clk-gate.c`

```c
struct clk *clk_register_gate(struct device *dev, const char *name,
		const char *parent_name, unsigned long flags,
		void __iomem *reg, u8 bit_idx,
		u8 clk_gate_flags, spinlock_t *lock)
{
	struct clk_hw *hw;

	hw = clk_hw_register_gate(dev, name, parent_name, flags, reg,
				  bit_idx, clk_gate_flags, lock);
	if (IS_ERR(hw))
		return ERR_CAST(hw);
	return hw->clk;
}
```

继续往下看：

```c
struct clk_hw *__clk_hw_register_gate(struct device *dev,
		struct device_node *np, const char *name,
		const char *parent_name, const struct clk_hw *parent_hw,
		const struct clk_parent_data *parent_data,
		unsigned long flags,
		void __iomem *reg, u8 bit_idx,
		u8 clk_gate_flags, spinlock_t *lock)
{
	struct clk_gate *gate;
	struct clk_hw *hw;
	struct clk_init_data init = {};

	gate = kzalloc(sizeof(*gate), GFP_KERNEL);
	if (!gate)
		return ERR_PTR(-ENOMEM);

	init.name = name;
	init.ops = &clk_gate_ops;
	init.flags = flags;
	init.parent_names = parent_name ? &parent_name : NULL;
	init.parent_hws = parent_hw ? &parent_hw : NULL;
	init.parent_data = parent_data;
	if (parent_name || parent_hw || parent_data)
		init.num_parents = 1;
	else
		init.num_parents = 0;

	gate->reg = reg;
	gate->bit_idx = bit_idx;
	gate->flags = clk_gate_flags;
	gate->lock = lock;
	gate->hw.init = &init;

	hw = &gate->hw;
	if (dev || !np)
		ret = clk_hw_register(dev, hw);      /* 最终还是回到通用注册入口 */
	else if (np)
		ret = of_clk_hw_register(np, hw);
	...
}
```

这说明很多“基础时钟类型”的注册流程本质都是：

1. 先组装一个具体类型对象，比如 `struct clk_gate`
2. 填好它的 `hw.init`
3. 再回到通用的 `clk_hw_register()`

### 5. `of_clk_add_provider()` / `of_clk_add_hw_provider()`

这组 API 负责把 provider 发布给 OF consumer 查找。

#### 5.1 `of_clk_add_provider()`

源码位置：`drivers/clk/clk.c`

```c
int of_clk_add_provider(struct device_node *np,
			struct clk *(*clk_src_get)(struct of_phandle_args *clkspec,
						   void *data),
			void *data)
{
	struct of_clk_provider *cp;
	int ret;

	if (!np)
		return 0;

	cp = kzalloc(sizeof(*cp), GFP_KERNEL);
	if (!cp)
		return -ENOMEM;

	cp->node = of_node_get(np);
	cp->data = data;
	cp->get = clk_src_get;

	mutex_lock(&of_clk_mutex);
	list_add(&cp->link, &of_clk_providers); /* 挂到全局 OF provider 链表 */
	mutex_unlock(&of_clk_mutex);

	clk_core_reparent_orphans();             /* 有些孤儿时钟此时能重新挂父 */

	ret = of_clk_set_defaults(np, true);
	if (ret < 0)
		of_clk_del_provider(np);

	fwnode_dev_initialized(&np->fwnode, true);

	return ret;
}
```

#### 5.2 `of_clk_add_hw_provider()`

源码位置：`drivers/clk/clk.c`

```c
int of_clk_add_hw_provider(struct device_node *np,
			   struct clk_hw *(*get)(struct of_phandle_args *clkspec,
						 void *data),
			   void *data)
{
	struct of_clk_provider *cp;
	int ret;

	if (!np)
		return 0;

	cp = kzalloc(sizeof(*cp), GFP_KERNEL);
	if (!cp)
		return -ENOMEM;

	cp->node = of_node_get(np);
	cp->data = data;
	cp->get_hw = get;

	mutex_lock(&of_clk_mutex);
	list_add(&cp->link, &of_clk_providers);
	mutex_unlock(&of_clk_mutex);

	clk_core_reparent_orphans();

	ret = of_clk_set_defaults(np, true);
	if (ret < 0)
		of_clk_del_provider(np);

	fwnode_dev_initialized(&np->fwnode, true);
	return ret;
}
```

#### 调用逻辑总结

```text
provider init
  -> 先注册各个 clk 节点
  -> 再调用 of_clk_add_provider()/of_clk_add_hw_provider()
     -> 构造 of_clk_provider
     -> 挂到全局 of_clk_providers 链表
  -> consumer 后面调用 clk_get()/of_clk_get() 时才能找到它
```

### 6. `clk_put()`

源码声明：`include/linux/clk.h`

```c
void clk_put(struct clk *clk);
```

实现：`drivers/clk/clkdev.c`

```c
void clk_put(struct clk *clk)
{
	__clk_put(clk);
}
```

它的意义很简单：

1. 和 `clk_get()` 配对使用。
2. 释放 consumer 这一侧的句柄引用。

## 0x03 初始化逻辑

这一节看两个层面：

1. 通用 CCF 的早期初始化
2. i.MX 时钟控制器 provider 的具体初始化

### 1. 通用初始化调用栈

以 ARM64 为例：

```text
time_init()
  -> of_clk_init(NULL)
     -> matches = __clk_of_table
     -> 扫描所有 CLK_OF_DECLARE 注册的 compatible
     -> 调用对应的 provider init 回调
```

对应代码：`arch/arm64/kernel/time.c`

```c
void __init time_init(void)
{
	u32 arch_timer_rate;

	of_clk_init(NULL);   /* 先初始化设备树里的时钟 provider */
	timer_probe();
	...
}
```

ARM 32 位里的调用位置也类似：`arch/arm/kernel/time.c`

```c
void __init time_init(void)
{
	if (machine_desc->init_time) {
		machine_desc->init_time();
	} else {
#ifdef CONFIG_COMMON_CLK
		of_clk_init(NULL);  /* 没有机器私有 init_time 时，走通用 CCF 初始化 */
#endif
		timer_probe();
		...
	}
}
```

### 2. `of_clk_init()` 的核心逻辑

源码位置：`drivers/clk/clk.c`

```c
void __init of_clk_init(const struct of_device_id *matches)
{
	const struct of_device_id *match;
	struct device_node *np;
	struct clock_provider *clk_provider, *next;
	bool is_init_done;
	bool force = false;
	LIST_HEAD(clk_provider_list);

	if (!matches)
		matches = &__clk_of_table; /* 默认用所有 CLK_OF_DECLARE 条目 */

	for_each_matching_node_and_match(np, matches, &match) {
		struct clock_provider *parent;

		if (!of_device_is_available(np))
			continue;

		parent = kzalloc(sizeof(*parent), GFP_KERNEL);
		parent->clk_init_cb = match->data; /* 这里就是 CLK_OF_DECLARE 里的 init 函数 */
		parent->np = of_node_get(np);
		list_add_tail(&parent->node, &clk_provider_list);
	}

	while (!list_empty(&clk_provider_list)) {
		is_init_done = false;
		list_for_each_entry_safe(clk_provider, next,
					&clk_provider_list, node) {
			if (force || parent_ready(clk_provider->np)) {
				of_node_set_flag(clk_provider->np, OF_POPULATED);
				clk_provider->clk_init_cb(clk_provider->np); /* 真正初始化 provider */
				of_clk_set_defaults(clk_provider->np, true);
				list_del(&clk_provider->node);
				of_node_put(clk_provider->np);
				kfree(clk_provider);
				is_init_done = true;
			}
		}

		if (!is_init_done)
			force = true; /* 如果依赖关系无法继续推进，就强制初始化剩余 provider */
	}
}
```

这个函数有两个关键点：

1. 它不是简单地“遍历全部节点然后直接初始化”。
2. 它会尝试按父 provider 已就绪的顺序初始化，尽量让时钟树顺着依赖关系建立起来。

### 3. `CLK_OF_DECLARE()` 是怎么接进来的

源码位置：`include/linux/clk-provider.h`

```c
#define CLK_OF_DECLARE(name, compat, fn) OF_DECLARE_1(clk, name, compat, fn)
```

在 i.MX53 时钟驱动里可以看到：

```c
CLK_OF_DECLARE(imx53_ccm, "fsl,imx53-ccm", mx53_clocks_init);
```

它的含义是：

1. 设备树里遇到 `compatible = "fsl,imx53-ccm"` 的节点
2. `of_clk_init()` 扫描到后
3. 就会调用 `mx53_clocks_init(np)`

### 4. i.MX53 时钟 provider 初始化调用栈

```text
time_init()
  -> of_clk_init(NULL)
     -> 扫描到 compatible = "fsl,imx53-ccm"
        -> mx53_clocks_init(np)
           -> 逐个创建 mux/divider/gate/pll 等 clk 节点
           -> of_clk_add_provider(np, of_clk_src_onecell_get, &clk_data)
           -> 设置部分默认 parent/rate
```

### 5. i.MX53 provider 初始化代码

源码位置：`drivers/clk/imx/clk-imx5.c`

```c
clk[IMX5_CLK_UART4_IPG_GATE]	= imx_clk_gate2("uart4_ipg_gate", "ipg",
					MXC_CCM_CCGR7, 8);
clk[IMX5_CLK_UART4_PER_GATE]	= imx_clk_gate2("uart4_per_gate", "uart_root",
					MXC_CCM_CCGR7, 10);
clk[IMX5_CLK_UART5_IPG_GATE]	= imx_clk_gate2("uart5_ipg_gate", "ipg",
					MXC_CCM_CCGR7, 12);
clk[IMX5_CLK_UART5_PER_GATE]	= imx_clk_gate2("uart5_per_gate", "uart_root",
					MXC_CCM_CCGR7, 14);

...

imx_check_clocks(clk, ARRAY_SIZE(clk));     /* 检查关键时钟是否注册成功 */

clk_data.clks = clk;
clk_data.clk_num = ARRAY_SIZE(clk);
of_clk_add_provider(np, of_clk_src_onecell_get, &clk_data); /* 对外发布 provider */

clk_set_parent(clk[IMX5_CLK_ESDHC_A_SEL], clk[IMX5_CLK_PLL2_SW]);
clk_set_parent(clk[IMX5_CLK_ESDHC_B_SEL], clk[IMX5_CLK_PLL2_SW]);

clk_set_rate(clk[IMX5_CLK_ESDHC_A_PODF], 200000000);
clk_set_rate(clk[IMX5_CLK_ESDHC_B_PODF], 200000000);

clk_prepare_enable(clk[IMX5_CLK_IIM_GATE]);
imx_print_silicon_rev("i.MX53", mx53_revision());
clk_disable_unprepare(clk[IMX5_CLK_IIM_GATE]);

r = clk_round_rate(clk[IMX5_CLK_USBOH3_PER_GATE], 54000000);
clk_set_rate(clk[IMX5_CLK_USBOH3_PER_GATE], r);

imx_register_uart_clocks(5);
}
CLK_OF_DECLARE(imx53_ccm, "fsl,imx53-ccm", mx53_clocks_init);
```

这段代码很有代表性，能看到 provider 初始化通常要做 4 件事：

1. 先注册一大批时钟节点。
2. 再把整组节点通过 `of_clk_add_provider()` 发布出去。
3. 然后按 SoC 要求设置少量默认 parent / rate。
4. 最后让 consumer 以后能通过 `clocks = <&clks ...>` 找到它们。

### 6. consumer 侧获取时钟的初始化调用栈

以设备驱动 probe 为例：

```text
driver probe
  -> clk_get()/devm_clk_get()
     -> of_clk_get_hw()
        -> of_parse_clkspec()
        -> provider->get()/get_hw()
  -> clk_prepare_enable()
  -> clk_get_rate()/clk_set_rate()
```

对 i.MX UART 来说，当前仓库里的真实代码是 `devm_clk_get()`，但底层路径仍然是同一套 CCF。

## 0x04 示例

这一节给一个“DTS + provider + consumer”的完整学习示例。

### 1. DTS 里的 clock provider 节点

来自：`arch/arm/boot/dts/imx53.dtsi`

```dts
clks: ccm@53fd4000{
	compatible = "fsl,imx53-ccm";
	reg = <0x53fd4000 0x4000>;
	interrupts = <0 71 0x04 0 72 0x04>;
	#clock-cells = <1>;
};
```

这说明：

1. `clks` 是一个 clock provider。
2. `#clock-cells = <1>` 表示 consumer 引用它时，要再附带一个时钟索引。
3. `compatible = "fsl,imx53-ccm"` 会在早期匹配到 `CLK_OF_DECLARE(imx53_ccm, ...)`。

### 2. DTS 里的 clock consumer 节点

同样来自：`arch/arm/boot/dts/imx53.dtsi`

```dts
uart4: serial@53ff0000 {
	compatible = "fsl,imx53-uart", "fsl,imx21-uart";
	reg = <0x53ff0000 0x4000>;
	interrupts = <13>;
	clocks = <&clks IMX5_CLK_UART4_IPG_GATE>,
		 <&clks IMX5_CLK_UART4_PER_GATE>;
	clock-names = "ipg", "per";
	dmas = <&sdma 2 4 0>, <&sdma 3 4 0>;
	dma-names = "rx", "tx";
	status = "disabled";
};
```

这段 DTS 最关键的地方在于：

1. `clocks` 里引用了 `&clks` 这个 provider。
2. 两个索引分别表示 UART 需要的两个时钟。
3. `clock-names = "ipg", "per"` 让驱动可以通过名字拿时钟。

### 3. provider 端是怎么把索引导出的

还是看 `drivers/clk/imx/clk-imx5.c`：

```c
clk[IMX5_CLK_UART4_IPG_GATE] = imx_clk_gate2("uart4_ipg_gate", "ipg",
					     MXC_CCM_CCGR7, 8);
clk[IMX5_CLK_UART4_PER_GATE] = imx_clk_gate2("uart4_per_gate", "uart_root",
					     MXC_CCM_CCGR7, 10);

clk_data.clks = clk;
clk_data.clk_num = ARRAY_SIZE(clk);
of_clk_add_provider(np, of_clk_src_onecell_get, &clk_data);
```

所以 consumer 写的：

```dts
clocks = <&clks IMX5_CLK_UART4_IPG_GATE>,
	 <&clks IMX5_CLK_UART4_PER_GATE>;
```

最终会走到：

```text
of_parse_clkspec()
  -> 得到 phandle = &clks, args[0] = IMX5_CLK_UART4_IPG_GATE
  -> of_clk_get_hw_from_clkspec()
  -> provider = clks 节点对应的 of_clk_provider
  -> of_clk_src_onecell_get()
  -> clk_data.clks[IMX5_CLK_UART4_IPG_GATE]
```

### 4. 驱动侧示例

下面给一个“非 devm 版本”的 consumer 示例，便于学习 API 主线。

注意：当前仓库里的 `drivers/tty/serial/imx.c` 实际使用的是 `devm_clk_get()`；
这里为了符合模板要求，故意改写成非 `devm` 风格。

```c
struct demo_uart {
	void __iomem *base;
	struct clk *clk_ipg;
	struct clk *clk_per;
	unsigned long uartclk;
};

static int demo_uart_probe(struct platform_device *pdev)
{
	struct demo_uart *du;
	int ret;

	du = devm_kzalloc(&pdev->dev, sizeof(*du), GFP_KERNEL);
	if (!du)
		return -ENOMEM;

	du->clk_ipg = clk_get(&pdev->dev, "ipg");      /* 按 clock-names 找第一个时钟 */
	if (IS_ERR(du->clk_ipg))
		return PTR_ERR(du->clk_ipg);

	du->clk_per = clk_get(&pdev->dev, "per");      /* 找第二个时钟 */
	if (IS_ERR(du->clk_per)) {
		ret = PTR_ERR(du->clk_per);
		goto err_put_ipg;
	}

	du->uartclk = clk_get_rate(du->clk_per);       /* 读取当前串口工作时钟 */
	if (du->uartclk > 80000000) {
		ret = clk_set_rate(du->clk_per, 80000000); /* 如有需要，可尝试降频 */
		if (ret)
			goto err_put_per;
	}

	ret = clk_prepare_enable(du->clk_ipg);         /* 先开寄存器访问时钟 */
	if (ret)
		goto err_put_per;

	ret = clk_prepare_enable(du->clk_per);         /* 再开功能时钟 */
	if (ret)
		goto err_disable_ipg;

	platform_set_drvdata(pdev, du);
	return 0;

err_disable_ipg:
	clk_disable_unprepare(du->clk_ipg);
err_put_per:
	clk_put(du->clk_per);
err_put_ipg:
	clk_put(du->clk_ipg);
	return ret;
}

static int demo_uart_remove(struct platform_device *pdev)
{
	struct demo_uart *du = platform_get_drvdata(pdev);

	clk_disable_unprepare(du->clk_per);
	clk_disable_unprepare(du->clk_ipg);
	clk_put(du->clk_per);
	clk_put(du->clk_ipg);

	return 0;
}
```

### 5. 这个示例在源码里对应的真实路径

当前仓库中，`drivers/tty/serial/imx.c` 的真实 probe 代码如下：

```c
sport->clk_ipg = devm_clk_get(&pdev->dev, "ipg");
...
sport->clk_per = devm_clk_get(&pdev->dev, "per");
...
sport->port.uartclk = clk_get_rate(sport->clk_per);
...
ret = clk_prepare_enable(sport->clk_ipg);
```

可以看到它和上面的非 `devm` 示例在逻辑上是一致的，只是资源释放方式不同。

### 6. 从 DTS 到驱动拿到时钟的一条完整链路

```text
设备树：
uart4 {
  clocks = <&clks IMX5_CLK_UART4_IPG_GATE>,
           <&clks IMX5_CLK_UART4_PER_GATE>;
  clock-names = "ipg", "per";
}

系统启动：
time_init()
  -> of_clk_init()
     -> mx53_clocks_init()
        -> of_clk_add_provider(clks, ...)

驱动 probe：
clk_get(dev, "ipg")
  -> of_clk_get_hw(dev->of_node, 0, "ipg")
  -> of_parse_clkspec()
  -> of_clk_get_hw_from_clkspec()
  -> of_clk_provider.get()
  -> 返回 &clks[IMX5_CLK_UART4_IPG_GATE]

驱动使用：
clk_prepare_enable()
  -> clk_prepare()
  -> clk_enable()
```

### 7. 学习这个子系统时建议重点抓什么

如果你准备顺着源码继续深挖，建议重点抓下面 4 条线：

1. `clk_get()` 这条查找链，搞清楚 OF 和 clkdev 两条路径怎么汇合。
2. `clk_prepare_enable()` 这条计数链，搞清楚父时钟为什么总是先于子时钟。
3. `clk_set_rate()` 这条传播链，搞清楚为什么改一个节点会影响整棵子树。
4. `of_clk_init()` + `CLK_OF_DECLARE()` 这条早期初始化链，搞清楚 provider 为什么能在普通 platform probe 之前就工作。
