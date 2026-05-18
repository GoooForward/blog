# gpio子系统学习文档

## 0x00 背景

### 0. 前置知识

在看 `gpio` 子系统之前，建议先分清下面几个概念：

1. `GPIO line`
   一根具体的 GPIO 线。
2. `gpio_chip`
   一个 GPIO 控制器，负责管理一组 GPIO line。
3. `gpio_desc`
   GPIO 描述符，消费者侧通过它来操作 GPIO，当前内核主推 descriptor 接口，而不是旧的整数 GPIO 接口。
4. `consumer`
   GPIO 的使用者，通常是某个普通设备驱动。
5. `provider`
   GPIO 的提供者，也就是 GPIO 控制器驱动。
6. `lookup`
   GPIO 资源查找过程，可以来自 Device Tree、ACPI、板级 lookup table。
7. `can_sleep`
   表示该 GPIO 控制器的读写操作是否可能睡眠。I2C/SPI GPIO 扩展器通常要设置这个标志。

`gpio` 子系统本质上做了三件事：

1. 给消费者驱动提供统一的 `gpiod_*` 描述符接口。
2. 给 GPIO 控制器驱动提供统一的 `gpio_chip` 注册框架。
3. 把 DT/ACPI/lookup table 中的 GPIO 描述，翻译成可直接使用的 `gpio_desc`。

### 1. 该子系统是什么

`gpio` 子系统的核心实现就是 `gpiolib`，主要代码在：

- `drivers/gpio/gpiolib.c`
- `drivers/gpio/gpiolib.h`
- `drivers/gpio/gpiolib-of.c`
- `drivers/gpio/gpiolib-acpi.c`
- `include/linux/gpio/consumer.h`
- `include/linux/gpio/driver.h`
- `include/linux/gpio/machine.h`

它位于普通驱动和具体 GPIO 控制器驱动之间：

1. 向上提供 `gpiod_get()`、`gpiod_direction_output()`、`gpiod_set_value()` 等 API。
2. 向下调用 `struct gpio_chip` 中的 `request/get/set/direction_input/direction_output/to_irq/set_config` 等回调。

### 2. 这个子系统的作用是什么

`gpio` 子系统的作用可以概括为 6 点：

1. 管理 GPIO 控制器的注册和注销。
2. 管理每一根 GPIO line 的运行时状态。
3. 提供 descriptor 风格的 GPIO 获取、释放、方向配置、数值读写接口。
4. 屏蔽底层 GPIO 控制器差异，统一普通驱动的使用方式。
5. 处理 GPIO 与中断、pinctrl、DT/ACPI 的集成。
6. 兼容旧的全局 GPIO 编号空间，同时推动使用新的 descriptor 接口。

### 3. 这个子系统的架构是怎么样的

从职责上可以把 `gpio` 子系统拆成 6 层：

1. 消费者接口层
   头文件在 `include/linux/gpio/consumer.h`，典型 API 有 `gpiod_get()`、`gpiod_put()`、`gpiod_direction_input()`、`gpiod_direction_output()`、`gpiod_set_value()`。
2. 核心管理层
   实现在 `drivers/gpio/gpiolib.c`，负责注册 `gpio_chip`、分配 `gpio_device`、维护全局链表、管理 `gpio_desc`。
3. 固件解析层
   `gpiolib-of.c` 负责 DT，`gpiolib-acpi.c` 负责 ACPI，把固件描述转换成 `gpio_desc`。
4. 板级 lookup 层
   `include/linux/gpio/machine.h` + `gpiolib.c` 负责老式板级 lookup table。
5. 中断和 pinctrl 集成层
   `gpio_irq_chip` 负责 IRQ 集成，pin range / pinctrl 用于 SoC GPIO 与 pinctrl 联动。
6. GPIO 控制器驱动层
   例如 `drivers/gpio/gpio-mxc.c`、`drivers/gpio/gpio-sifive.c` 等，真正操作寄存器。

### 4. 大体架构图

```text
                  +--------------------------------------+
                  |         普通设备驱动 / consumer       |
                  | gpiod_get()/direction/set/get/put    |
                  +-------------------+------------------+
                                      |
                                      v
                  +--------------------------------------+
                  |             gpiolib core             |
                  |  gpiod_* / gpiochip_* / gpio_desc    |
                  |  gpio_devices / gpio_bus_type        |
                  +----------+---------------+-----------+
                             |               |
                             |               |
                             v               v
              +------------------------+   +------------------------+
              |  gpiolib-of/acpi       |   | machine lookup table   |
              | DT/ACPI -> gpio_desc   |   | gpiod_lookup_table     |
              +-----------+------------+   +-----------+------------+
                          |                            |
                          +------------+---------------+
                                       |
                                       v
                         +-------------------------------+
                         |         gpio_chip 驱动         |
                         | request/get/set/direction/to_irq|
                         +-------------------------------+
                                       |
                                       v
                                   硬件寄存器
```

### 5. 三条最重要的主线

#### 主线一：消费者获取 GPIO

```text
gpiod_get()
  -> gpiod_get_index()
     -> of_find_gpio() / acpi_find_gpio() / gpiod_find()
     -> gpiod_request()
     -> gpiod_configure_flags()
```

#### 主线二：消费者操作 GPIO

```text
gpiod_direction_input()
  -> gc->direction_input()

gpiod_direction_output()
  -> gpiod_direction_output_raw_commit()
     -> gc->direction_output() 或 gc->set()

gpiod_set_value()
  -> gpiod_set_value_nocheck()
     -> gpiod_set_raw_value_commit()
        -> gc->set()
```

#### 主线三：GPIO 控制器注册

```text
gpiochip_add_data()
  -> gpiochip_add_data_with_key()
     -> 分配 gpio_device
     -> 加入 gpio_devices 全局链表
     -> 初始化每个 gpio_desc
     -> of_gpiochip_add()
     -> gpiochip_add_pin_ranges()
     -> gpiochip_add_irqchip()
     -> gpiochip_setup_dev()
```

## 0x01 主要结构体

这一节只挑 `gpio` 子系统里最核心的结构体。

### 1. `struct gpio_chip`

源码位置：`include/linux/gpio/driver.h`

```c
struct gpio_chip {
	const char *label;                        /* GPIO 控制器名字 */
	struct gpio_device *gpiodev;              /* 运行时 gpio_device，内部状态容器 */
	struct device *parent;                    /* 父设备 */
	struct module *owner;                     /* 所属模块 */
	int (*request)(struct gpio_chip *gc, unsigned int offset);      /* 请求某根 GPIO */
	void (*free)(struct gpio_chip *gc, unsigned int offset);        /* 释放某根 GPIO */
	int (*get_direction)(struct gpio_chip *gc, unsigned int offset);/* 获取方向 */
	int (*direction_input)(struct gpio_chip *gc, unsigned int offset); /* 配成输入 */
	int (*direction_output)(struct gpio_chip *gc, unsigned int offset,
				int value);                        /* 配成输出并设置初值 */
	int (*get)(struct gpio_chip *gc, unsigned int offset);          /* 读取值 */
	void (*set)(struct gpio_chip *gc, unsigned int offset, int value); /* 写值 */
	int (*set_config)(struct gpio_chip *gc, unsigned int offset,
			  unsigned long config);              /* 设置 bias/debounce 等 */
	int (*to_irq)(struct gpio_chip *gc, unsigned int offset);       /* GPIO 转 IRQ */
	void (*dbg_show)(struct seq_file *s, struct gpio_chip *gc);     /* debugfs 展示 */
	int (*add_pin_ranges)(struct gpio_chip *gc);                    /* 添加 pinctrl range */
	int base;                                     /* 旧式全局 GPIO 编号起始值 */
	u16 ngpio;                                    /* 该控制器管理的 GPIO 数量 */
	const char *const *names;                     /* 每根 GPIO 的可选名字 */
	bool can_sleep;                               /* 操作该控制器是否可能睡眠 */
	struct gpio_irq_chip irq;                     /* IRQ 集成信息 */
	/* 下面还有 bgpio_* 等 generic GPIO 相关成员 */
};
```

作用说明：

1. `gpio_chip` 是 GPIO 控制器驱动向 `gpiolib` 提交的核心对象。
2. 它描述“这个控制器能提供哪些 GPIO，以及如何访问这些 GPIO”。
3. `gpiolib` 本身不操作寄存器，它只调用这里的回调。

### 2. `struct gpio_device`

源码位置：`drivers/gpio/gpiolib.h`

```c
struct gpio_device {
	int id;                                      /* gpiochipN 里的 N */
	struct device dev;                           /* 内核 device 对象 */
	struct cdev chrdev;                          /* GPIO 字符设备 */
	struct device *mockdev;                      /* 旧 sysfs 接口使用的设备 */
	struct module *owner;                        /* 所属模块 */
	struct gpio_chip *chip;                      /* 对应的 gpio_chip */
	struct gpio_desc *descs;                     /* 所有 GPIO line 的描述符数组 */
	int base;                                    /* 旧全局 GPIO 编号空间基址 */
	u16 ngpio;                                   /* GPIO line 数量 */
	const char *label;                           /* 控制器名字 */
	void *data;                                  /* 驱动私有数据 */
	struct list_head list;                       /* 挂到 gpio_devices 全局链表 */
	struct blocking_notifier_head notifier;      /* line 状态变化通知链 */
#ifdef CONFIG_PINCTRL
	struct list_head pin_ranges;                 /* GPIO 与 pinctrl 的映射范围 */
#endif
};
```

作用说明：

1. `gpio_device` 是 `gpiolib` 内部的运行时状态容器。
2. 一个 `gpio_chip` 注册进来后，`gpiolib` 会为它分配一个 `gpio_device`。
3. `gpio_desc[]` 数组就挂在这里，每根 GPIO line 对应一个 `gpio_desc`。

### 3. `struct gpio_desc`

源码位置：`drivers/gpio/gpiolib.h`

```c
struct gpio_desc {
	struct gpio_device *gdev;                    /* 该 line 属于哪个 gpio_device */
	unsigned long flags;                         /* 运行时状态标志位 */
	const char *label;                           /* 消费者标签 */
	const char *name;                            /* 这根 GPIO 的名字 */
#ifdef CONFIG_OF_DYNAMIC
	struct device_node *hog;                     /* 若是 hog，记录对应 DT 节点 */
#endif
#ifdef CONFIG_GPIO_CDEV
	unsigned int debounce_period_us;             /* 去抖时间 */
#endif
};
```

常见 `flags`：

1. `FLAG_REQUESTED`
   该 GPIO 是否已被请求。
2. `FLAG_IS_OUT`
   当前是否为输出模式。
3. `FLAG_ACTIVE_LOW`
   是否逻辑低有效。
4. `FLAG_OPEN_DRAIN`
   是否为开漏。
5. `FLAG_OPEN_SOURCE`
   是否为开源。
6. `FLAG_USED_AS_IRQ`
   是否作为 IRQ 使用。
7. `FLAG_IRQ_IS_ENABLED`
   对应 IRQ 是否已启用。
8. `FLAG_IS_HOGGED`
   是否为 hog。

作用说明：

1. `gpio_desc` 是消费者真正拿到并操作的对象。
2. 整个 descriptor 风格 GPIO API，核心都是围绕它展开的。

### 4. `struct gpio_irq_chip`

源码位置：`include/linux/gpio/driver.h`

```c
struct gpio_irq_chip {
	struct irq_chip *chip;                       /* GPIO IRQ 控制器实现 */
	struct irq_domain *domain;                   /* IRQ domain */
	const struct irq_domain_ops *domain_ops;     /* IRQ domain 操作 */
	struct fwnode_handle *fwnode;                /* 层次化 irqdomain 用 fwnode */
	struct irq_domain *parent_domain;            /* 父 irqdomain */
	int (*child_to_parent_hwirq)(struct gpio_chip *gc,
				     unsigned int child_hwirq,
				     unsigned int child_type,
				     unsigned int *parent_hwirq,
				     unsigned int *parent_type); /* 子 GPIO IRQ 到父 IRQ 翻译 */
	irq_flow_handler_t handler;                  /* IRQ handler */
	unsigned int default_type;                   /* 默认触发类型 */
	irq_flow_handler_t parent_handler;           /* 父中断 handler */
	void *parent_handler_data;                   /* 父 handler 数据 */
	unsigned int num_parents;                    /* 父中断数量 */
	unsigned int *parents;                       /* 父中断数组 */
	unsigned int *map;                           /* line 到 parent 映射 */
	bool threaded;                               /* 是否线程化处理 */
	int (*init_hw)(struct gpio_chip *gc);        /* 初始化 IRQ 硬件 */
	void (*init_valid_mask)(struct gpio_chip *gc,
				unsigned long *valid_mask,
				unsigned int ngpios); /* 初始化有效中断位图 */
	bool initialized;                            /* 是否已初始化 */
	unsigned long *valid_mask;                   /* 可作为 IRQ 的 line 位图 */
	unsigned int first;                          /* 静态 IRQ 分配起始号 */
};
```

作用说明：

1. GPIO 往往兼具“输入输出”和“中断”两种属性。
2. `gpio_irq_chip` 负责把 GPIO line 接进内核 IRQ 子系统。

### 5. `struct gpiod_lookup` / `struct gpiod_lookup_table`

源码位置：`include/linux/gpio/machine.h`

```c
struct gpiod_lookup {
	const char *key;                             /* chip 名或 GPIO line 名 */
	u16 chip_hwnum;                              /* 芯片内部硬件号 */
	const char *con_id;                          /* 消费者侧的功能名 */
	unsigned int idx;                            /* 同名 GPIO 的索引 */
	unsigned long flags;                         /* ACTIVE_LOW / OPEN_DRAIN 等 */
};

struct gpiod_lookup_table {
	struct list_head list;                       /* 挂到全局 lookup table 链表 */
	const char *dev_id;                          /* 消费者设备名 */
	struct gpiod_lookup table[];                 /* lookup 表项数组 */
};
```

作用说明：

1. 这是旧式 board file / platform data 路径使用的数据结构。
2. 当 DT/ACPI 不可用或没有匹配到时，`gpiod_get_index()` 会回退到这条路径。

### 6. 结构体之间的关系总结

最核心的关系可以概括为：

1. 控制器驱动提交 `gpio_chip`。
2. `gpiolib` 为它分配 `gpio_device`。
3. `gpio_device` 内部维护一个 `gpio_desc[]` 数组。
4. 消费者驱动通过 `gpiod_get()` 最终拿到某个 `gpio_desc *`。
5. `gpio_desc` 再反向找到所属的 `gpio_device` 和 `gpio_chip`，调用底层回调。

关系图如下：

```text
       GPIO 控制器驱动
             |
             v
      +--------------+
      |  gpio_chip   |
      | request/set  |
      | get/to_irq   |
      +------+-------+
             |
             | gc->gpiodev
             v
      +--------------+
      | gpio_device  |
      | descs[]      |
      | chip/data    |
      +------+-------+
             |
             | 一根 line 对应一个
             v
      +--------------+
      |  gpio_desc   |
      | flags/label  |
      +------+-------+
             ^
             |
     gpiod_get()/gpiod_put()
             |
             |
       普通消费者驱动
```

## 0x02 主要API

这一节优先挑最能体现 `gpio` 子系统主线的 API，且都使用非 `devm` 版本。

### 1. `gpiod_get()`

源码位置：`drivers/gpio/gpiolib.c`

```c
struct gpio_desc *__must_check gpiod_get(struct device *dev, const char *con_id,
					 enum gpiod_flags flags)
{
	return gpiod_get_index(dev, con_id, 0, flags);   /* 本质上就是取 index 0 */
}
```

#### 递归调用逻辑

```text
gpiod_get()
  -> gpiod_get_index()
     -> of_find_gpio() / acpi_find_gpio() / gpiod_find()
     -> gpiod_request()
        -> gpiod_request_commit()
           -> gc->request()
     -> gpiod_configure_flags()
        -> gpiod_direction_input()
        -> 或 gpiod_direction_output()
```

#### 关键实现 1：`gpiod_get_index()`

```c
struct gpio_desc *__must_check gpiod_get_index(struct device *dev,
					       const char *con_id,
					       unsigned int idx,
					       enum gpiod_flags flags)
{
	unsigned long lookupflags = GPIO_LOOKUP_FLAGS_DEFAULT;
	struct gpio_desc *desc = NULL;
	int ret;
	const char *devname = dev ? dev_name(dev) : "?";
	const struct fwnode_handle *fwnode = dev ? dev_fwnode(dev) : NULL;

	if (is_of_node(fwnode)) {
		desc = of_find_gpio(dev, con_id, idx, &lookupflags); /* 先走 DT 路径 */
	} else if (is_acpi_node(fwnode)) {
		desc = acpi_find_gpio(dev, con_id, idx, &flags, &lookupflags); /* 再看 ACPI */
	}

	if (!desc || gpiod_not_found(desc))
		desc = gpiod_find(dev, con_id, idx, &lookupflags); /* 最后回退到 lookup table */

	if (IS_ERR(desc))
		return desc;

	ret = gpiod_request(desc, con_id ? con_id : devname); /* 请求这根 GPIO */
	if (ret) {
		if (ret == -EBUSY && flags & GPIOD_FLAGS_BIT_NONEXCLUSIVE)
			return desc;                        /* 允许非独占时直接返回 */
		else
			return ERR_PTR(ret);
	}

	ret = gpiod_configure_flags(desc, con_id, lookupflags, flags); /* 按 flags 配置方向/初值 */
	if (ret < 0) {
		gpiod_put(desc);
		return ERR_PTR(ret);
	}

	blocking_notifier_call_chain(&desc->gdev->notifier,
				     GPIOLINE_CHANGED_REQUESTED, desc);
	return desc;
}
```

#### 关键实现 2：DT 路径里的 `of_get_named_gpiod_flags()`

源码位置：`drivers/gpio/gpiolib-of.c`

```c
static struct gpio_desc *of_get_named_gpiod_flags(const struct device_node *np,
		     const char *propname, int index, enum of_gpio_flags *flags)
{
	struct of_phandle_args gpiospec;
	struct gpio_chip *chip;
	struct gpio_desc *desc;
	int ret;

	ret = of_parse_phandle_with_args_map(np, propname, "gpio", index, &gpiospec);
	if (ret)
		return ERR_PTR(ret);                      /* 解析 xxx-gpios = <...> */

	chip = of_find_gpiochip_by_xlate(&gpiospec);   /* 找到对应 gpio_chip */
	if (!chip) {
		desc = ERR_PTR(-EPROBE_DEFER);
		goto out;
	}

	desc = of_xlate_and_get_gpiod_flags(chip, &gpiospec, flags); /* 用 of_xlate 翻译出 offset */
	if (IS_ERR(desc))
		goto out;

	if (flags)
		of_gpio_flags_quirks(np, propname, flags, index); /* 处理 DT 兼容性 quirks */

out:
	of_node_put(gpiospec.np);
	return desc;
}
```

#### 关键实现 3：`gpiod_request()`

源码位置：`drivers/gpio/gpiolib.c`

```c
int gpiod_request(struct gpio_desc *desc, const char *label)
{
	int ret = -EPROBE_DEFER;
	struct gpio_device *gdev;

	VALIDATE_DESC(desc);
	gdev = desc->gdev;

	if (try_module_get(gdev->owner)) {             /* 先给所属模块加引用计数 */
		ret = gpiod_request_commit(desc, label); /* 真正完成请求 */
		if (ret)
			module_put(gdev->owner);
		else
			get_device(&gdev->dev);           /* 请求成功则保持设备引用 */
	}

	return ret;
}
```

#### 关键实现 4：`gpiod_request_commit()`

`gpiod_request()` 再往下会进入真正的请求逻辑：

```c
static int gpiod_request_commit(struct gpio_desc *desc, const char *label)
{
	struct gpio_chip *gc;
	unsigned long flags;
	unsigned offset;
	int ret;

	spin_lock_irqsave(&gpio_lock, flags);
	gc = desc->gdev->chip;

	if (test_and_set_bit(FLAG_REQUESTED, &desc->flags) == 0) {
		desc_set_label(desc, label ? : "?");      /* 标记为已请求，并记录消费者名 */
	} else {
		ret = -EBUSY;
		goto out_free_unlock;
	}

	if (gc->request) {                            /* 如果控制器驱动实现了 request()，再下调 */
		spin_unlock_irqrestore(&gpio_lock, flags);
		offset = gpio_chip_hwgpio(desc);
		if (gpiochip_line_is_valid(gc, offset))
			ret = gc->request(gc, offset);
		else
			ret = -EINVAL;
		spin_lock_irqsave(&gpio_lock, flags);

		if (ret) {
			desc_set_label(desc, NULL);
			clear_bit(FLAG_REQUESTED, &desc->flags);
			goto out_free_unlock;
		}
	}

	if (gc->get_direction) {
		spin_unlock_irqrestore(&gpio_lock, flags);
		gpiod_get_direction(desc);                /* 同步方向状态到 FLAG_IS_OUT */
		spin_lock_irqsave(&gpio_lock, flags);
	}

	spin_unlock_irqrestore(&gpio_lock, flags);
	return 0;

out_free_unlock:
	spin_unlock_irqrestore(&gpio_lock, flags);
	kfree_const(label);
	return ret;
}
```

### 2. `gpiod_put()`

源码位置：`drivers/gpio/gpiolib.c`

```c
void gpiod_put(struct gpio_desc *desc)
{
	if (desc)
		gpiod_free(desc);                          /* 实际释放交给 gpiod_free() */
}
```

#### 递归调用逻辑

```text
gpiod_put()
  -> gpiod_free()
     -> gpiod_free_commit()
        -> gc->free()
```

#### 关键实现：`gpiod_free()` / `gpiod_free_commit()`

```c
void gpiod_free(struct gpio_desc *desc)
{
	if (desc && desc->gdev && gpiod_free_commit(desc)) {
		module_put(desc->gdev->owner);            /* 释放模块引用 */
		put_device(&desc->gdev->dev);             /* 释放设备引用 */
	}
}

static bool gpiod_free_commit(struct gpio_desc *desc)
{
	unsigned long flags;
	struct gpio_chip *gc;
	bool ret = false;

	gpiod_unexport(desc);                          /* 清理 sysfs 导出状态 */

	spin_lock_irqsave(&gpio_lock, flags);
	gc = desc->gdev->chip;

	if (gc && test_bit(FLAG_REQUESTED, &desc->flags)) {
		if (gc->free) {                          /* 调用控制器驱动的 free() */
			spin_unlock_irqrestore(&gpio_lock, flags);
			gc->free(gc, gpio_chip_hwgpio(desc));
			spin_lock_irqsave(&gpio_lock, flags);
		}

		kfree_const(desc->label);
		desc_set_label(desc, NULL);              /* 清理 label */
		clear_bit(FLAG_ACTIVE_LOW, &desc->flags);
		clear_bit(FLAG_REQUESTED, &desc->flags);
		clear_bit(FLAG_OPEN_DRAIN, &desc->flags);
		clear_bit(FLAG_OPEN_SOURCE, &desc->flags);
		clear_bit(FLAG_PULL_UP, &desc->flags);
		clear_bit(FLAG_PULL_DOWN, &desc->flags);
		clear_bit(FLAG_BIAS_DISABLE, &desc->flags);
		clear_bit(FLAG_EDGE_RISING, &desc->flags);
		clear_bit(FLAG_EDGE_FALLING, &desc->flags);
		clear_bit(FLAG_IS_HOGGED, &desc->flags); /* 清理运行时标志 */
		ret = true;
	}

	spin_unlock_irqrestore(&gpio_lock, flags);
	blocking_notifier_call_chain(&desc->gdev->notifier,
				     GPIOLINE_CHANGED_RELEASED, desc);
	return ret;
}
```

### 3. `gpiod_direction_input()`

源码位置：`drivers/gpio/gpiolib.c`

```c
int gpiod_direction_input(struct gpio_desc *desc)
{
	struct gpio_chip *gc;
	int ret = 0;

	VALIDATE_DESC(desc);
	gc = desc->gdev->chip;

	if (!gc->get && gc->direction_input)         /* 有 direction_input 却没有 get，不合理 */
		return -EIO;

	if (gc->direction_input) {
		ret = gc->direction_input(gc, gpio_chip_hwgpio(desc)); /* 直接调用底层驱动 */
	} else if (gc->get_direction &&
		   (gc->get_direction(gc, gpio_chip_hwgpio(desc)) != 1)) {
		return -EIO;                           /* 无法主动切输入时，只能检查当前是否已经是输入 */
	}

	if (ret == 0) {
		clear_bit(FLAG_IS_OUT, &desc->flags);  /* 切输入后清除输出标记 */
		ret = gpio_set_bias(desc);             /* 如有 pull-up/down 配置，一并下发 */
	}

	trace_gpio_direction(desc_to_gpio(desc), 1, ret);
	return ret;
}
```

#### 调用逻辑

```text
gpiod_direction_input()
  -> gc->direction_input()
  -> gpio_set_bias()
     -> gpio_set_config_with_argument_optional()
        -> gc->set_config()
```

### 4. `gpiod_direction_output()`

源码位置：`drivers/gpio/gpiolib.c`

```c
int gpiod_direction_output(struct gpio_desc *desc, int value)
{
	int ret;

	VALIDATE_DESC(desc);
	if (test_bit(FLAG_ACTIVE_LOW, &desc->flags))
		value = !value;                          /* 逻辑值先按 active-low 翻译成物理值 */
	else
		value = !!value;

	if (test_bit(FLAG_USED_AS_IRQ, &desc->flags) &&
	    test_bit(FLAG_IRQ_IS_ENABLED, &desc->flags))
		return -EIO;                            /* 作为已启用 IRQ 的 GPIO 不允许切成输出 */

	if (test_bit(FLAG_OPEN_DRAIN, &desc->flags)) {
		ret = gpio_set_config(desc, PIN_CONFIG_DRIVE_OPEN_DRAIN);
		if (!ret)
			goto set_output_value;
		if (value) {                           /* 硬件不支持时，用输入态模拟开漏高电平 */
			ret = gpiod_direction_input(desc);
			goto set_output_flag;
		}
	} else if (test_bit(FLAG_OPEN_SOURCE, &desc->flags)) {
		ret = gpio_set_config(desc, PIN_CONFIG_DRIVE_OPEN_SOURCE);
		if (!ret)
			goto set_output_value;
		if (!value) {
			ret = gpiod_direction_input(desc); /* 硬件不支持时，用输入态模拟开源低电平 */
			goto set_output_flag;
		}
	} else {
		gpio_set_config(desc, PIN_CONFIG_DRIVE_PUSH_PULL);
	}

set_output_value:
	ret = gpio_set_bias(desc);
	if (ret)
		return ret;
	return gpiod_direction_output_raw_commit(desc, value); /* 真正下发到控制器 */

set_output_flag:
	if (ret == 0)
		set_bit(FLAG_IS_OUT, &desc->flags);
	return ret;
}
```

#### `gpiod_direction_output_raw_commit()` 再往下做了什么

```c
static int gpiod_direction_output_raw_commit(struct gpio_desc *desc, int value)
{
	struct gpio_chip *gc = desc->gdev->chip;
	int val = !!value;
	int ret = 0;

	if (!gc->set && !gc->direction_output)
		return -EIO;

	if (gc->direction_output) {
		ret = gc->direction_output(gc, gpio_chip_hwgpio(desc), val);
	} else {
		if (gc->get_direction &&
		    gc->get_direction(gc, gpio_chip_hwgpio(desc)))
			return -EIO;

		gc->set(gc, gpio_chip_hwgpio(desc), val); /* output-only 芯片时直接 set */
	}

	if (!ret)
		set_bit(FLAG_IS_OUT, &desc->flags);
	return ret;
}
```

#### 调用逻辑

```text
gpiod_direction_output()
  -> gpio_set_config() / gpio_set_bias()
  -> gpiod_direction_output_raw_commit()
     -> gc->direction_output()
     -> 或 gc->set()
```

### 5. `gpiod_set_value()`

源码位置：`drivers/gpio/gpiolib.c`

```c
void gpiod_set_value(struct gpio_desc *desc, int value)
{
	VALIDATE_DESC_VOID(desc);
	WARN_ON(desc->gdev->chip->can_sleep);         /* 可能睡眠的芯片不应走这个 API */
	gpiod_set_value_nocheck(desc, value);
}
```

#### 关键实现：`gpiod_set_value_nocheck()`

```c
static void gpiod_set_value_nocheck(struct gpio_desc *desc, int value)
{
	if (test_bit(FLAG_ACTIVE_LOW, &desc->flags))
		value = !value;                          /* 逻辑值转物理值 */

	if (test_bit(FLAG_OPEN_DRAIN, &desc->flags))
		gpio_set_open_drain_value_commit(desc, value); /* 开漏特殊处理 */
	else if (test_bit(FLAG_OPEN_SOURCE, &desc->flags))
		gpio_set_open_source_value_commit(desc, value); /* 开源特殊处理 */
	else
		gpiod_set_raw_value_commit(desc, value); /* 普通路径 */
}
```

#### 调用逻辑

```text
gpiod_set_value()
  -> gpiod_set_value_nocheck()
     -> gpiod_set_raw_value_commit()
        -> gc->set()
```

这里要特别注意：

1. `gpiod_set_value()` 不能用于 `can_sleep = true` 的控制器。
2. 对于可能睡眠的 GPIO 扩展器，要使用 `gpiod_set_value_cansleep()`。

### 6. `gpiochip_add_data()`

这是 GPIO 控制器驱动注册自身的最重要 API。

头文件位置：`include/linux/gpio/driver.h`

```c
#define gpiochip_add_data(gc, data) ({                 \
	static struct lock_class_key lock_key;        \
	static struct lock_class_key request_key;     \
	gpiochip_add_data_with_key(gc, data, &lock_key, &request_key); \
})
```

也就是说，真正的实现是 `gpiochip_add_data_with_key()`。

#### 递归调用逻辑

```text
gpiochip_add_data()
  -> gpiochip_add_data_with_key()
     -> 分配 gpio_device
     -> gpiodev_add_to_list()
     -> gpiochip_alloc_valid_mask()
     -> of_gpiochip_add()
     -> gpiochip_init_valid_mask()
     -> gpiochip_add_pin_ranges()
     -> acpi_gpiochip_add()
     -> machine_gpiochip_add()
     -> gpiochip_add_irqchip()
     -> gpiochip_setup_dev()
```

#### 关键实现：`gpiochip_add_data_with_key()`

源码位置：`drivers/gpio/gpiolib.c`

```c
int gpiochip_add_data_with_key(struct gpio_chip *gc, void *data,
			       struct lock_class_key *lock_key,
			       struct lock_class_key *request_key)
{
	struct fwnode_handle *fwnode = gc->parent ? dev_fwnode(gc->parent) : NULL;
	unsigned long flags;
	int ret = 0;
	unsigned i;
	int base = gc->base;
	struct gpio_device *gdev;

	gdev = kzalloc(sizeof(*gdev), GFP_KERNEL);     /* 为这个 gpio_chip 分配运行时容器 */
	if (!gdev)
		return -ENOMEM;

	gdev->dev.bus = &gpio_bus_type;
	gdev->dev.parent = gc->parent;
	gdev->chip = gc;
	gc->gpiodev = gdev;

	of_gpio_dev_init(gc, gdev);
	acpi_gpio_dev_init(gc, gdev);

	gdev->dev.fwnode = dev_fwnode(&gdev->dev) ?: fwnode;

	gdev->id = ida_alloc(&gpio_ida, GFP_KERNEL);   /* 分配 gpiochipN 里的 N */
	...

	gdev->descs = kcalloc(gc->ngpio, sizeof(gdev->descs[0]), GFP_KERNEL);
	...

	gdev->label = kstrdup_const(gc->label ?: "unknown", GFP_KERNEL);
	gdev->ngpio = gc->ngpio;
	gdev->data = data;                             /* 保存驱动私有数据 */

	spin_lock_irqsave(&gpio_lock, flags);
	if (base < 0) {                               /* 动态分配旧 GPIO 编号空间基址 */
		base = gpiochip_find_base(gc->ngpio);
		...
		gc->base = base;
	}
	gdev->base = base;

	ret = gpiodev_add_to_list(gdev);              /* 加入 gpio_devices 全局链表 */
	...

	for (i = 0; i < gc->ngpio; i++)
		gdev->descs[i].gdev = gdev;              /* 初始化每根 line 的 gpio_desc */

	spin_unlock_irqrestore(&gpio_lock, flags);

	if (gc->names)
		ret = gpiochip_set_desc_names(gc);
	else
		ret = devprop_gpiochip_set_names(gc);

	ret = gpiochip_alloc_valid_mask(gc);          /* 分配 valid_mask */
	ret = of_gpiochip_add(gc);                    /* 接入 DT */
	ret = gpiochip_init_valid_mask(gc);           /* 初始化有效 GPIO 位图 */

	for (i = 0; i < gc->ngpio; i++) {             /* 同步每根 line 的初始方向状态 */
		struct gpio_desc *desc = &gdev->descs[i];
		if (gc->get_direction && gpiochip_line_is_valid(gc, i))
			assign_bit(FLAG_IS_OUT, &desc->flags,
				   !gc->get_direction(gc, i));
		else
			assign_bit(FLAG_IS_OUT, &desc->flags,
				   !gc->direction_input);
	}

	ret = gpiochip_add_pin_ranges(gc);            /* 接入 pinctrl pin range */
	acpi_gpiochip_add(gc);                        /* 接入 ACPI */
	machine_gpiochip_add(gc);                     /* 处理板级 hog */
	ret = gpiochip_add_irqchip(gc, lock_key, request_key); /* 接入 IRQ 子系统 */

	if (gpiolib_initialized) {
		ret = gpiochip_setup_dev(gdev);          /* 注册 chrdev / device 节点 */
		if (ret)
			goto err_remove_irqchip;
	}

	return 0;
}
```

### 7. `gpiochip_remove()`

源码位置：`drivers/gpio/gpiolib.c`

```c
void gpiochip_remove(struct gpio_chip *gc)
{
	struct gpio_device *gdev = gc->gpiodev;
	unsigned long flags;
	unsigned int i;

	gpiochip_sysfs_unregister(gdev);             /* 注销 sysfs */
	gpiochip_free_hogs(gc);                      /* 释放 hog */
	gdev->chip = NULL;                           /* 先把 chip 置空，阻止后续访问进入驱动 */
	gpiochip_irqchip_remove(gc);                 /* 移除 IRQ 集成 */
	acpi_gpiochip_remove(gc);                    /* 移除 ACPI 关联 */
	of_gpiochip_remove(gc);                      /* 移除 OF 关联 */
	gpiochip_remove_pin_ranges(gc);              /* 移除 pin ranges */
	gpiochip_free_valid_mask(gc);                /* 释放 valid_mask */
	gdev->data = NULL;                           /* 清空驱动私有数据 */

	spin_lock_irqsave(&gpio_lock, flags);
	for (i = 0; i < gdev->ngpio; i++) {
		if (gpiochip_is_requested(gc, i))
			break;                           /* 若仍有 GPIO 在使用，会给出严重告警 */
	}
	spin_unlock_irqrestore(&gpio_lock, flags);

	if (i != gdev->ngpio)
		dev_crit(&gdev->dev, "REMOVING GPIOCHIP WITH GPIOS STILL REQUESTED\n");

	gcdev_unregister(gdev);                      /* 注销字符设备 */
	put_device(&gdev->dev);                      /* 释放 device */
}
```

#### 调用逻辑

```text
gpiochip_remove()
  -> gpiochip_free_hogs()
  -> gpiochip_irqchip_remove()
  -> of_gpiochip_remove()
  -> gpiochip_remove_pin_ranges()
  -> gcdev_unregister()
  -> put_device()
```

## 0x03 初始化逻辑

这一节分成三块：

1. `gpiolib` 子系统自身初始化。
2. GPIO 控制器驱动如何注册 `gpio_chip`。
3. 消费者驱动如何通过 DT/lookup 拿到 GPIO。

### 1. `gpiolib` 子系统自身初始化

#### 调用逻辑栈

```text
内核 initcall 框架
  -> core_initcall(gpiolib_dev_init)
     -> gpiolib_dev_init()
        -> bus_register(&gpio_bus_type)
        -> driver_register(&gpio_stub_drv)
        -> alloc_chrdev_region()
        -> gpiochip_setup_devs()
```

#### 代码

源码位置：`drivers/gpio/gpiolib.c`

```c
static int __init gpiolib_dev_init(void)
{
	int ret;

	ret = bus_register(&gpio_bus_type);           /* 注册 gpio 总线 */
	if (ret < 0)
		return ret;

	ret = driver_register(&gpio_stub_drv);        /* 注册 stub driver */
	if (ret < 0) {
		bus_unregister(&gpio_bus_type);
		return ret;
	}

	ret = alloc_chrdev_region(&gpio_devt, 0, GPIO_DEV_MAX, GPIOCHIP_NAME);
	if (ret < 0) {
		driver_unregister(&gpio_stub_drv);
		bus_unregister(&gpio_bus_type);
		return ret;
	}

	gpiolib_initialized = true;                   /* 标记 gpiolib 已初始化完成 */
	gpiochip_setup_devs();                        /* 为早期已注册 chip 建立 device/chardev */

#if IS_ENABLED(CONFIG_OF_DYNAMIC) && IS_ENABLED(CONFIG_OF_GPIO)
	WARN_ON(of_reconfig_notifier_register(&gpio_of_notifier));
#endif

	return ret;
}
core_initcall(gpiolib_dev_init);
```

这一步的意义是：

1. 先把 `gpio` 总线、stub driver、字符设备号段准备好。
2. 之后控制器驱动才能安全调用 `gpiochip_add_data()`。

### 2. debugfs 初始化

#### 调用逻辑栈

```text
内核 initcall 框架
  -> subsys_initcall(gpiolib_debugfs_init)
     -> debugfs_create_file("gpio", ...)
```

#### 代码

源码位置：`drivers/gpio/gpiolib.c`

```c
static int __init gpiolib_debugfs_init(void)
{
	debugfs_create_file("gpio", 0444, NULL, NULL, &gpiolib_fops);
	return 0;
}
subsys_initcall(gpiolib_debugfs_init);
```

也就是说，`/sys/kernel/debug/gpio` 就是在这里建立的。

### 3. GPIO 控制器驱动初始化

为了和前面的 API 保持一致，这里选择一个明确使用非 `devm` 的控制器驱动例子：`drivers/gpio/gpio-sifive.c`。

#### 调用逻辑栈

```text
builtin_platform_driver(sifive_gpio_driver)
  -> 平台总线匹配
     -> sifive_gpio_probe()
        -> bgpio_init()
        -> gpiochip_add_data()
           -> gpiochip_add_data_with_key()
```

#### 代码

源码位置：`drivers/gpio/gpio-sifive.c`

```c
static int sifive_gpio_probe(struct platform_device *pdev)
{
	...
	ret = bgpio_init(&chip->gc, dev, 4,
			 chip->base + SIFIVE_GPIO_INPUT_VAL,
			 chip->base + SIFIVE_GPIO_OUTPUT_VAL,
			 NULL,
			 chip->base + SIFIVE_GPIO_OUTPUT_EN,
			 chip->base + SIFIVE_GPIO_INPUT_EN,
			 BGPIOF_READ_OUTPUT_REG_SET);
	if (ret)
		return ret;

	chip->gc.base = -1;
	chip->gc.ngpio = ngpio;
	chip->gc.label = dev_name(dev);
	chip->gc.parent = dev;
	chip->gc.owner = THIS_MODULE;
	...

	return gpiochip_add_data(&chip->gc, chip);   /* 把控制器注册进 gpiolib */
}
```

这里的关键点：

1. 驱动先把 `struct gpio_chip` 填好。
2. 然后调用 `gpiochip_add_data()`。
3. 之后这个控制器上的每根 GPIO 才会真正进入 `gpiolib` 的全局管理体系。

### 4. 一个完整的非 `devm` add/remove 例子

再看一个更完整的注册/注销闭环，来自 `drivers/gpio/gpio-menz127.c`。

#### 调用逻辑栈

```text
men_z127_probe()
  -> bgpio_init()
  -> gpiochip_add_data()

men_z127_remove()
  -> gpiochip_remove()
```

#### 代码

```c
ret = bgpio_init(&men_z127_gpio->gc, &mdev->dev, 4,
		 men_z127_gpio->reg_base + MEN_Z127_PSR,
		 men_z127_gpio->reg_base + MEN_Z127_CTRL,
		 NULL,
		 men_z127_gpio->reg_base + MEN_Z127_GPIODR,
		 NULL, 0);
if (ret)
	goto err_unmap;

men_z127_gpio->gc.set_config = men_z127_set_config;

ret = gpiochip_add_data(&men_z127_gpio->gc, men_z127_gpio);
if (ret)
	goto err_unmap;

return 0;
```

```c
static void men_z127_remove(struct mcb_device *mdev)
{
	struct men_z127_gpio *men_z127_gpio = mcb_get_drvdata(mdev);

	gpiochip_remove(&men_z127_gpio->gc);         /* 注销 gpio_chip */
	iounmap(men_z127_gpio->reg_base);
	mcb_release_mem(men_z127_gpio->mem);
}
```

### 5. 消费者通过 DT 获取 GPIO 的初始化路径

如果普通驱动通过 `gpiod_get(dev, "reset", GPIOD_OUT_LOW)` 获取 GPIO，并且 DT 里写了 `reset-gpios = <...>;`，调用链大致如下：

#### 调用逻辑栈

```text
driver probe()
  -> gpiod_get(dev, "reset", GPIOD_OUT_LOW)
     -> gpiod_get_index(dev, "reset", 0, ...)
        -> of_find_gpio()
           -> of_get_named_gpiod_flags()
              -> of_parse_phandle_with_args_map()
              -> of_find_gpiochip_by_xlate()
                 -> gpiochip_find()
              -> chip->of_xlate()
              -> gpiochip_get_desc()
        -> gpiod_request()
        -> gpiod_configure_flags()
           -> gpiod_direction_output()
```

这条路径其实很好地体现了 `gpio` 子系统的价值：

1. 驱动只说“我要一个叫 reset 的 GPIO”。
2. `gpiolib` 负责从固件里把它找到。
3. 找到之后再帮驱动完成请求、方向设置和初值配置。

## 0x04 示例

下面给出两个最常见的使用方式：

1. 普通设备驱动作为 GPIO 消费者。
2. GPIO 控制器驱动作为 GPIO 提供者。

### 1. 设备树中的消费者示例

```dts
mydev@0 {
	compatible = "vendor,mydev";
	reset-gpios = <&gpio1 5 GPIO_ACTIVE_LOW>;
	enable-gpios = <&gpio1 8 GPIO_ACTIVE_HIGH>;
};
```

这段 DT 最终会被 `gpiod_get(dev, "reset", ...)` 解析成：

```text
"reset-gpios"
  -> of_parse_phandle_with_args_map()
  -> 定位到 gpio1 这个 gpio_chip
  -> chip->of_xlate() 解析出 offset = 5
  -> gpiochip_get_desc(gc, 5)
  -> 返回对应 gpio_desc
```

### 2. 普通驱动侧示例

下面给出一个使用非 `devm` 接口的消费者示例：

```c
struct mydev_priv {
	struct gpio_desc *reset_gpio;
	struct gpio_desc *enable_gpio;
};

static int mydev_probe(struct platform_device *pdev)
{
	struct device *dev = &pdev->dev;
	struct mydev_priv *priv;

	priv = kzalloc(sizeof(*priv), GFP_KERNEL);
	if (!priv)
		return -ENOMEM;

	priv->reset_gpio = gpiod_get(dev, "reset", GPIOD_OUT_HIGH);
	if (IS_ERR(priv->reset_gpio))
		goto err_free;

	priv->enable_gpio = gpiod_get(dev, "enable", GPIOD_OUT_LOW);
	if (IS_ERR(priv->enable_gpio))
		goto err_put_reset;

	/* 拉低 reset，做一次复位 */
	gpiod_set_value(priv->reset_gpio, 0);

	/* 拉高 enable，使能设备 */
	gpiod_set_value(priv->enable_gpio, 1);

	platform_set_drvdata(pdev, priv);
	return 0;

err_put_reset:
	gpiod_put(priv->reset_gpio);
err_free:
	kfree(priv);
	return -EINVAL;
}

static int mydev_remove(struct platform_device *pdev)
{
	struct mydev_priv *priv = platform_get_drvdata(pdev);

	gpiod_put(priv->enable_gpio);
	gpiod_put(priv->reset_gpio);
	kfree(priv);
	return 0;
}
```

这个例子里最关键的是：

1. `gpiod_get()` 负责“查找 + 请求 + 初始配置”。
2. `gpiod_set_value()` 负责运行时写值。
3. `gpiod_put()` 负责释放。

### 3. GPIO 控制器驱动示例

下面给出一个典型 provider 侧示例，也就是如何把一个控制器注册进 `gpiolib`。

```c
struct demo_gpio {
	void __iomem *base;
	struct gpio_chip gc;
};

static int demo_gpio_get(struct gpio_chip *gc, unsigned int offset)
{
	struct demo_gpio *d = gpiochip_get_data(gc);
	u32 val = readl(d->base + 0x0);

	return !!(val & BIT(offset));
}

static void demo_gpio_set(struct gpio_chip *gc, unsigned int offset, int value)
{
	struct demo_gpio *d = gpiochip_get_data(gc);
	u32 val = readl(d->base + 0x4);

	if (value)
		val |= BIT(offset);
	else
		val &= ~BIT(offset);

	writel(val, d->base + 0x4);
}

static int demo_gpio_probe(struct platform_device *pdev)
{
	struct demo_gpio *d;
	int ret;

	d = kzalloc(sizeof(*d), GFP_KERNEL);
	if (!d)
		return -ENOMEM;

	d->gc.label = dev_name(&pdev->dev);
	d->gc.parent = &pdev->dev;
	d->gc.owner = THIS_MODULE;
	d->gc.base = -1;
	d->gc.ngpio = 32;
	d->gc.get = demo_gpio_get;
	d->gc.set = demo_gpio_set;

	ret = gpiochip_add_data(&d->gc, d);
	if (ret) {
		kfree(d);
		return ret;
	}

	platform_set_drvdata(pdev, d);
	return 0;
}

static int demo_gpio_remove(struct platform_device *pdev)
{
	struct demo_gpio *d = platform_get_drvdata(pdev);

	gpiochip_remove(&d->gc);
	kfree(d);
	return 0;
}
```

### 4. 学习这个子系统时建议重点盯住的文件

如果你要继续往下深挖，建议按下面顺序读：

1. `include/linux/gpio/consumer.h`
   先看消费者 API 长什么样。
2. `include/linux/gpio/driver.h`
   再看控制器驱动要实现什么。
3. `drivers/gpio/gpiolib.h`
   理解 `gpio_device`、`gpio_desc` 这些内部结构。
4. `drivers/gpio/gpiolib.c`
   看 descriptor API、请求释放、chip 注册与注销。
5. `drivers/gpio/gpiolib-of.c`
   看 DT 如何映射到 `gpio_desc`。
6. `include/linux/gpio/machine.h`
   看 lookup table / hog 的老路径。
7. 某个具体控制器驱动
   例如 `drivers/gpio/gpio-mxc.c`、`drivers/gpio/gpio-sifive.c`。

## 总结

`gpio` 子系统最核心的理解方式，不是把它看成“读一个值、写一个值”这么简单，而是看成一条完整的数据流：

```text
DT/ACPI/lookup table
  -> 找到 gpio_chip
  -> 定位到具体 gpio_desc
  -> gpiod_request()
  -> gpiod_direction_*()/gpiod_set_value()
  -> gpio_chip 回调
  -> 硬件寄存器
```

只要把下面 4 个问题想明白，这个子系统就基本掌握了：

1. 一根 GPIO 是如何从 DT/lookup 中被定位出来的？
2. `gpio_desc`、`gpio_device`、`gpio_chip` 三者之间是什么关系？
3. `gpiod_*` API 是如何一步步落到 `gpio_chip` 回调上的？
4. GPIO 控制器驱动是如何通过 `gpiochip_add_data()` 接入整个框架的？
