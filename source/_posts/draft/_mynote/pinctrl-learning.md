# pinctrl子系统学习文档

## 0x00 背景

### 0. 前置知识

在看 `pinctrl` 之前，先把几个概念区分清楚：

1. `pin`
   SoC 上的一个物理引脚。
2. `group`
   一组需要一起配置的引脚，例如一组 `UART/I2C/SPI` 引脚。
3. `function`
   这些引脚要复用成什么功能，例如 `uart1`、`i2c2`、`gpio`。
4. `state`
   某个设备在某个时刻需要的一组 pin 配置，例如 `default`、`init`、`sleep`、`idle`。
5. `map`
   把“设备名 + 状态名”映射到“由哪个 pinctrl 控制器来配置哪些组/哪些 pin”的表项。

`pinctrl` 子系统本质上做了两件事：

1. 帮消费者设备把“状态名”翻译成具体的 pin 配置。
2. 帮 pin controller 驱动把“组/功能/配置”的硬件能力注册进内核。

### 1. 该子系统是什么

`pinctrl` 是 Linux 内核中的引脚控制子系统，源码主线在：

- `drivers/pinctrl/core.c`
- `drivers/pinctrl/devicetree.c`
- `drivers/pinctrl/pinmux.c`
- `drivers/pinctrl/pinconf.c`
- `include/linux/pinctrl/*.h`

它位于“设备驱动”和“SoC 引脚控制器驱动”之间，向上给普通设备驱动提供统一 API，向下调用具体 SoC pin controller 驱动实现的 `ops`。

### 2. 这个子系统的作用是什么

`pinctrl` 的作用可以概括为 4 点：

1. 管理 pin 的复用关系，例如把一组 pin 从 `gpio` 切到 `uart`。
2. 管理 pin 的电气参数，例如上拉、下拉、驱动强度、输入使能等。
3. 按设备状态切换 pin 配置，例如 `default/init/sleep/idle`。
4. 把设备树里的 `pinctrl-0/pinctrl-names` 转成统一的内核映射表。

### 3. 这个子系统的架构是怎么样的

从职责上看，`pinctrl` 可以拆成 5 层：

1. 消费者接口层
   头文件在 `include/linux/pinctrl/consumer.h`，常见 API 有 `pinctrl_get()`、`pinctrl_lookup_state()`、`pinctrl_select_state()`。
2. 核心管理层
   实现在 `drivers/pinctrl/core.c`，负责维护全局链表、创建 `struct pinctrl`、创建状态、切换状态、注册控制器。
3. 设备树解析层
   实现在 `drivers/pinctrl/devicetree.c`，负责把 `pinctrl-0/pinctrl-names` 解析成 `struct pinctrl_map`。
4. pinmux/pinconf 执行层
   实现在 `drivers/pinctrl/pinmux.c` 和 `drivers/pinctrl/pinconf.c`，负责把 map 转换成 setting，并调用底层驱动的 `ops`。
5. SoC pin controller 驱动层
   例如 `drivers/pinctrl/freescale/pinctrl-imx.c`，真正把寄存器配置写到硬件。

### 4. 大体架构图

```text
                    +----------------------------------+
                    |     普通设备驱动 / 设备核心         |
                    | pinctrl_bind_pins()/pinctrl_get()|
                    +-----------------+----------------+
                                      |
                                      v
                    +----------------------------------+
                    |        pinctrl core.c            |
                    |  pinctrl_list / pinctrldev_list  |
                    |  create_pinctrl / select_state   |
                    +-----------------+----------------+
                                      |
                    +-----------------+----------------+
                    |                                  |
                    v                                  v
        +---------------------------+      +---------------------------+
        |   devicetree.c            |      | pinmux.c / pinconf.c      |
        | pinctrl_dt_to_map()       |      | map_to_setting/apply      |
        | DT -> struct pinctrl_map  |      | 调用底层ops                |
        +-------------+-------------+      +-------------+-------------+
                      |                                  |
                      +-----------------+----------------+
                                        |
                                        v
                         +-------------------------------+
                         |   SoC pin controller driver   |
                         |   pctlops/pmxops/confops      |
                         |   例如 imx_pinctrl_probe()    |
                         +-------------------------------+
                                        |
                                        v
                                  实际硬件寄存器
```

### 5. 三条最重要的主线

#### 主线一：消费者获取并切换状态

```text
pinctrl_get()
  -> create_pinctrl()
     -> pinctrl_dt_to_map()
     -> add_setting()
        -> pinmux_map_to_setting() / pinconf_map_to_setting()

pinctrl_lookup_state()
  -> find_state()

pinctrl_select_state()
  -> pinctrl_commit_state()
     -> pinmux_enable_setting()
        -> ops->set_mux()
     -> pinconf_apply_setting()
        -> ops->pin_config_set() / ops->pin_config_group_set()
```

#### 主线二：pin controller 驱动注册

```text
controller_probe()
  -> pinctrl_register_and_init()
     -> pinctrl_init_controller()
        -> pinctrl_check_ops()
        -> pinmux_check_ops()
        -> pinconf_check_ops()
        -> pinctrl_register_pins()
  -> pinctrl_enable()
     -> pinctrl_claim_hogs()
        -> create_pinctrl()
        -> pinctrl_lookup_state(default/sleep)
        -> pinctrl_select_state(default)
```

#### 主线三：设备 probe 前后的自动 pin 状态切换

```text
really_probe()
  -> pinctrl_bind_pins()
     -> devm_pinctrl_get()
        -> pinctrl_get()
     -> pinctrl_lookup_state(default/init/sleep/idle)
     -> pinctrl_select_state(init 或 default)

driver probe() 完成后
  -> pinctrl_init_done()
     -> 如果当前还是 init，则切到 default
```

## 0x01 主要结构体

这一节只挑最核心、最常用的结构体。

### 1. `struct pinctrl_desc`

源码位置：`include/linux/pinctrl/pinctrl.h`

```c
struct pinctrl_desc {
	const char *name;                        /* 控制器名字 */
	const struct pinctrl_pin_desc *pins;     /* 该控制器管理的全部 pin 描述 */
	unsigned int npins;                      /* pin 数量 */
	const struct pinctrl_ops *pctlops;       /* 组管理、DT解析等全局操作 */
	const struct pinmux_ops *pmxops;         /* 复用功能相关操作 */
	const struct pinconf_ops *confops;       /* 电气配置相关操作 */
	struct module *owner;                    /* 模块引用计数归属 */
#ifdef CONFIG_GENERIC_PINCONF
	unsigned int num_custom_params;          /* 自定义 pinconf 参数数量 */
	const struct pinconf_generic_params *custom_params;
	const struct pin_config_item *custom_conf_items;
#endif
	bool link_consumers;                     /* 是否给消费者自动建立 device link */
};
```

作用说明：

1. 它是 pin controller 驱动注册进内核时提交的“能力描述表”。
2. `pinctrl core` 不直接操作硬件，只认这个描述表里的 `ops`。
3. 所有后续 `set_mux`、`pin_config_set`、`dt_node_to_map` 最终都要落到这里的函数指针上。

### 2. `struct pinctrl_dev`

源码位置：`drivers/pinctrl/core.h`

```c
struct pinctrl_dev {
	struct list_head node;                   /* 挂到全局 pinctrldev_list */
	struct pinctrl_desc *desc;               /* 控制器能力描述 */
	struct radix_tree_root pin_desc_tree;    /* pin号 -> pin_desc */
#ifdef CONFIG_GENERIC_PINCTRL_GROUPS
	struct radix_tree_root pin_group_tree;   /* group selector -> group_desc */
	unsigned int num_groups;                 /* group 数量 */
#endif
#ifdef CONFIG_GENERIC_PINMUX_FUNCTIONS
	struct radix_tree_root pin_function_tree;/* function selector -> function */
	unsigned int num_functions;              /* function 数量 */
#endif
	struct list_head gpio_ranges;            /* GPIO 与 pin 的映射范围 */
	struct device *dev;                      /* 对应的设备对象 */
	struct module *owner;                    /* 所属模块 */
	void *driver_data;                       /* 驱动私有数据 */
	struct pinctrl *p;                       /* hog 使用的 pinctrl 句柄 */
	struct pinctrl_state *hog_default;       /* hog default 状态 */
	struct pinctrl_state *hog_sleep;         /* hog sleep 状态 */
	struct mutex mutex;                      /* 控制器级互斥锁 */
#ifdef CONFIG_DEBUG_FS
	struct dentry *device_root;              /* debugfs 目录 */
#endif
};
```

作用说明：

1. 这是“一个 pin controller 实例”的运行时对象。
2. `desc` 是静态能力描述，`pinctrl_dev` 是动态实例。
3. `pinctrldev_list` 里存的就是它，消费者设备最终也要通过它找到真正的控制器。

### 3. `struct pinctrl`

源码位置：`drivers/pinctrl/core.h`

```c
struct pinctrl {
	struct list_head node;                   /* 挂到全局 pinctrl_list */
	struct device *dev;                      /* 这个 pinctrl 句柄属于哪个消费者设备 */
	struct list_head states;                 /* 该设备拥有的所有状态链表 */
	struct pinctrl_state *state;             /* 当前已经生效的状态 */
	struct list_head dt_maps;                /* 由设备树动态解析出来的 map 块 */
	struct kref users;                       /* 句柄引用计数 */
};
```

作用说明：

1. `struct pinctrl` 不是控制器，而是“消费者设备视角下的 pinctrl 句柄”。
2. 一个设备调用 `pinctrl_get()` 后拿到的就是它。
3. 里面挂着多个 `struct pinctrl_state`，表示该设备可以切换的各个状态。

### 4. `struct pinctrl_state`

源码位置：`drivers/pinctrl/core.h`

```c
struct pinctrl_state {
	struct list_head node;                   /* 挂到 pinctrl->states */
	const char *name;                        /* 状态名，如 default/sleep */
	struct list_head settings;               /* 该状态包含的 setting 列表 */
};
```

作用说明：

1. 一个状态名对应一个 `pinctrl_state`。
2. 一个状态下面可以同时有多条 setting，例如既有 mux 设置又有 config 设置。

### 5. `struct pinctrl_setting`

源码位置：`drivers/pinctrl/core.h`

```c
struct pinctrl_setting {
	struct list_head node;                   /* 挂到 state->settings */
	enum pinctrl_map_type type;              /* 当前 setting 的类型 */
	struct pinctrl_dev *pctldev;             /* 由哪个控制器来执行 */
	const char *dev_name;                    /* 哪个消费者设备拥有这条 setting */
	union {
		struct pinctrl_setting_mux mux;      /* MUX 类 setting */
		struct pinctrl_setting_configs configs; /* CONFIG 类 setting */
	} data;
};
```

作用说明：

1. `pinctrl_map` 是静态描述，`pinctrl_setting` 是运行时可执行对象。
2. `pinctrl_select_state()` 真正遍历和执行的是 `setting`。

### 6. `struct pinctrl_map`

源码位置：`include/linux/pinctrl/machine.h`

```c
struct pinctrl_map {
	const char *dev_name;                    /* 使用这条映射的消费者设备名 */
	const char *name;                        /* 状态名 */
	enum pinctrl_map_type type;              /* MUX/CONFIG/DUMMY 类型 */
	const char *ctrl_dev_name;               /* 执行该映射的控制器名字 */
	union {
		struct pinctrl_map_mux mux;          /* group + function */
		struct pinctrl_map_configs configs;  /* pin/group + config数组 */
	} data;
};
```

作用说明：

1. 它是 `pinctrl` 子系统最关键的“桥接数据结构”。
2. 设备树解析层会把 `pinctrl-0` 等属性翻译成它。
3. `create_pinctrl()` 再把它转成 `pinctrl_state + pinctrl_setting`。

### 7. `struct dev_pin_info`

源码位置：`include/linux/pinctrl/devinfo.h`

```c
struct dev_pin_info {
	struct pinctrl *p;                       /* 设备绑定到的 pinctrl 句柄 */
	struct pinctrl_state *default_state;     /* default 状态 */
	struct pinctrl_state *init_state;        /* init 状态 */
#ifdef CONFIG_PM
	struct pinctrl_state *sleep_state;       /* suspend 用状态 */
	struct pinctrl_state *idle_state;        /* runtime idle 用状态 */
#endif
};
```

作用说明：

1. 这是设备核心挂在 `struct device` 上的 pinctrl 缓存。
2. `drivers/base/pinctrl.c` 会在 probe 前自动填好它。

## 0x02 主要API

这一节按“消费者侧”和“控制器侧”两条线展开，代码都使用非 `devm` 版本。

### 1. `pinctrl_get()`

源码位置：`drivers/pinctrl/core.c`

```c
struct pinctrl *pinctrl_get(struct device *dev)
{
	struct pinctrl *p;

	if (WARN_ON(!dev))
		return ERR_PTR(-EINVAL);                 /* 设备为空，直接报错 */

	p = find_pinctrl(dev);                        /* 先看这个设备之前是否已经拿过句柄 */
	if (p) {
		kref_get(&p->users);                    /* 已存在就增加引用计数 */
		return p;
	}

	return create_pinctrl(dev, NULL);            /* 首次获取则创建新的 pinctrl 句柄 */
}
```

#### 递归调用逻辑

```text
pinctrl_get()
  -> find_pinctrl()
  -> create_pinctrl()
     -> pinctrl_dt_to_map()
     -> 遍历全局 pinctrl_maps
     -> add_setting()
        -> find_state()/create_state()
        -> pinmux_map_to_setting() 或 pinconf_map_to_setting()
```

#### 关键实现 1：`create_pinctrl()`

```c
static struct pinctrl *create_pinctrl(struct device *dev,
				      struct pinctrl_dev *pctldev)
{
	struct pinctrl *p;
	const char *devname;
	struct pinctrl_maps *maps_node;
	int i;
	const struct pinctrl_map *map;
	int ret;

	p = kzalloc(sizeof(*p), GFP_KERNEL);         /* 为消费者创建 pinctrl 句柄 */
	if (!p)
		return ERR_PTR(-ENOMEM);

	p->dev = dev;
	INIT_LIST_HEAD(&p->states);                  /* 初始化状态链表 */
	INIT_LIST_HEAD(&p->dt_maps);                 /* 初始化 DT map 链表 */

	ret = pinctrl_dt_to_map(p, pctldev);         /* 先把 DT 里的 pinctrl-0 等解析成 map */
	if (ret < 0) {
		kfree(p);
		return ERR_PTR(ret);
	}

	devname = dev_name(dev);

	mutex_lock(&pinctrl_maps_mutex);
	for_each_maps(maps_node, i, map) {           /* 遍历全局 map 表，挑出属于当前设备的项 */
		if (strcmp(map->dev_name, devname))
			continue;

		if (pctldev &&
		    strcmp(dev_name(pctldev->dev), map->ctrl_dev_name))
			continue;                        /* hog 场景下只允许使用自身控制器 */

		ret = add_setting(p, pctldev, map);      /* 把 map 变成 runtime setting */
		if (ret == -EPROBE_DEFER) {
			pinctrl_free(p, false);
			mutex_unlock(&pinctrl_maps_mutex);
			return ERR_PTR(ret);
		}
	}
	mutex_unlock(&pinctrl_maps_mutex);

	if (ret < 0) {
		pinctrl_free(p, false);
		return ERR_PTR(ret);
	}

	kref_init(&p->users);                        /* 初始化引用计数 */

	mutex_lock(&pinctrl_list_mutex);
	list_add_tail(&p->node, &pinctrl_list);      /* 加入全局 pinctrl 句柄链表 */
	mutex_unlock(&pinctrl_list_mutex);

	return p;
}
```

#### 关键实现 2：`add_setting()`

```c
static int add_setting(struct pinctrl *p, struct pinctrl_dev *pctldev,
		       const struct pinctrl_map *map)
{
	struct pinctrl_state *state;
	struct pinctrl_setting *setting;
	int ret;

	state = find_state(p, map->name);            /* 先按状态名查找，例如 default */
	if (!state)
		state = create_state(p, map->name);     /* 不存在就新建一个状态对象 */
	if (IS_ERR(state))
		return PTR_ERR(state);

	if (map->type == PIN_MAP_TYPE_DUMMY_STATE)
		return 0;                               /* dummy state 不需要真正 setting */

	setting = kzalloc(sizeof(*setting), GFP_KERNEL);
	if (!setting)
		return -ENOMEM;

	setting->type = map->type;

	if (pctldev)
		setting->pctldev = pctldev;            /* hog 场景直接使用当前控制器 */
	else
		setting->pctldev =
			get_pinctrl_dev_from_devname(map->ctrl_dev_name);

	if (!setting->pctldev) {                    /* 控制器还没注册，可能需要 defer probe */
		kfree(setting);
		if (!strcmp(map->ctrl_dev_name, map->dev_name))
			return -ENODEV;
		return -EPROBE_DEFER;
	}

	setting->dev_name = map->dev_name;

	switch (map->type) {
	case PIN_MAP_TYPE_MUX_GROUP:
		ret = pinmux_map_to_setting(map, setting);   /* group/function -> selector */
		break;
	case PIN_MAP_TYPE_CONFIGS_PIN:
	case PIN_MAP_TYPE_CONFIGS_GROUP:
		ret = pinconf_map_to_setting(map, setting);  /* pin/group 名字 -> selector */
		break;
	default:
		ret = -EINVAL;
		break;
	}

	if (ret < 0) {
		kfree(setting);
		return ret;
	}

	list_add_tail(&setting->node, &state->settings);
	return 0;
}
```

#### 关键实现 3：`pinctrl_dt_to_map()`

`create_pinctrl()` 最关键的一步是先解析 DT：

```c
int pinctrl_dt_to_map(struct pinctrl *p, struct pinctrl_dev *pctldev)
{
	struct device_node *np = p->dev->of_node;
	int state, ret;
	char *propname;
	struct property *prop;
	const char *statename;
	const __be32 *list;
	int size, config;
	phandle phandle;
	struct device_node *np_config;

	if (!np)
		return 0;                                  /* 没有设备树节点，就没有 DT map */

	ret = dt_gpio_assert_pinctrl(p);               /* 先处理 pinctrl-assert-gpios */
	if (ret)
		return ret;

	of_node_get(np);

	for (state = 0; ; state++) {
		propname = kasprintf(GFP_KERNEL, "pinctrl-%d", state);
		prop = of_find_property(np, propname, &size); /* 读取 pinctrl-0/pinctrl-1... */
		kfree(propname);
		if (!prop) {
			if (state == 0) {
				of_node_put(np);
				return -ENODEV;
			}
			break;
		}

		list = prop->value;
		size /= sizeof(*list);

		ret = of_property_read_string_index(np, "pinctrl-names",
						    state, &statename);
		if (ret < 0)
			statename = prop->name + strlen("pinctrl-");

		for (config = 0; config < size; config++) {
			phandle = be32_to_cpup(list++);
			np_config = of_find_node_by_phandle(phandle); /* 找到对应 pin 配置子节点 */
			if (!np_config) {
				ret = -EINVAL;
				goto err;
			}

			ret = dt_to_map_one_config(p, pctldev, statename, np_config);
			of_node_put(np_config);
			if (ret < 0)
				goto err;
		}

		if (!size) {
			ret = dt_remember_dummy_state(p, statename); /* 空状态就创建 dummy */
			if (ret < 0)
				goto err;
		}
	}

	return 0;
err:
	pinctrl_dt_free_maps(p);
	return ret;
}
```

#### `dt_to_map_one_config()` 再往下做了什么

```text
dt_to_map_one_config()
  -> 向上找父节点，定位这个配置节点属于哪个 pin controller
  -> 调用 pctldev->desc->pctlops->dt_node_to_map()
  -> 让具体 SoC 驱动把 DT 节点翻译成 struct pinctrl_map[]
  -> dt_remember_or_free_map()
     -> pinctrl_register_mappings()
```

也就是说：

1. `devicetree.c` 只负责“框架解析”。
2. “某个 SoC 的 DT 属性到底怎么翻译成 pin/group/function/config”由具体 pin controller 驱动的 `dt_node_to_map()` 决定。

### 2. `pinctrl_lookup_state()`

源码位置：`drivers/pinctrl/core.c`

```c
struct pinctrl_state *pinctrl_lookup_state(struct pinctrl *p,
					   const char *name)
{
	struct pinctrl_state *state;

	state = find_state(p, name);                  /* 直接在 p->states 链表里按名字找 */
	if (!state) {
		if (pinctrl_dummy_state) {
			state = create_state(p, name);      /* 开启 dummy 支持时动态补一个空状态 */
		} else {
			state = ERR_PTR(-ENODEV);
		}
	}

	return state;
}
```

调用逻辑很直接：

```text
pinctrl_lookup_state()
  -> find_state()
  -> （可选）create_state()
```

其中 `find_state()` 只是遍历 `p->states` 链表按 `state->name` 比较字符串。

### 3. `pinctrl_select_state()`

源码位置：`drivers/pinctrl/core.c`

```c
int pinctrl_select_state(struct pinctrl *p, struct pinctrl_state *state)
{
	if (p->state == state)
		return 0;                               /* 当前已经在这个状态，直接返回 */

	return pinctrl_commit_state(p, state);      /* 真正的切换逻辑在这里 */
}
```

#### 递归调用逻辑

```text
pinctrl_select_state()
  -> pinctrl_commit_state()
     -> pinmux_disable_setting()      // 先撤销旧状态中的 mux 占用
     -> pinmux_enable_setting()       // 先执行新状态中的 mux
        -> pin_request()
        -> ops->set_mux()
     -> pinconf_apply_setting()       // 再执行新状态中的 pinconf
        -> ops->pin_config_set()
        -> 或 ops->pin_config_group_set()
```

#### 关键实现 1：`pinctrl_commit_state()`

```c
static int pinctrl_commit_state(struct pinctrl *p, struct pinctrl_state *state)
{
	struct pinctrl_setting *setting, *setting2;
	struct pinctrl_state *old_state = p->state;
	int ret;

	if (p->state) {
		list_for_each_entry(setting, &p->state->settings, node) {
			if (setting->type != PIN_MAP_TYPE_MUX_GROUP)
				continue;
			pinmux_disable_setting(setting);   /* 旧状态里先把 mux 类占用撤掉 */
		}
	}

	p->state = NULL;

	list_for_each_entry(setting, &state->settings, node) {
		switch (setting->type) {
		case PIN_MAP_TYPE_MUX_GROUP:
			ret = pinmux_enable_setting(setting);  /* 新状态先配置 mux */
			break;
		case PIN_MAP_TYPE_CONFIGS_PIN:
		case PIN_MAP_TYPE_CONFIGS_GROUP:
			ret = 0;                              /* pinconf 放到下一轮执行 */
			break;
		default:
			ret = -EINVAL;
			break;
		}

		if (ret < 0)
			goto unapply_new_state;
	}

	list_for_each_entry(setting, &state->settings, node) {
		switch (setting->type) {
		case PIN_MAP_TYPE_MUX_GROUP:
			ret = 0;
			break;
		case PIN_MAP_TYPE_CONFIGS_PIN:
		case PIN_MAP_TYPE_CONFIGS_GROUP:
			ret = pinconf_apply_setting(setting); /* 再配置 pin 电气属性 */
			break;
		default:
			ret = -EINVAL;
			break;
		}

		if (ret < 0)
			goto unapply_new_state;
	}

	p->state = state;                              /* 切换成功，更新当前状态 */
	return 0;

unapply_new_state:
	list_for_each_entry(setting2, &state->settings, node) {
		if (&setting2->node == &setting->node)
			break;
		if (setting2->type == PIN_MAP_TYPE_MUX_GROUP)
			pinmux_disable_setting(setting2);   /* 失败后回滚已生效的 mux */
	}

	if (old_state)
		pinctrl_select_state(p, old_state);       /* 尝试切回旧状态 */
	return ret;
}
```

#### 关键实现 2：`pinmux_enable_setting()`

源码位置：`drivers/pinctrl/pinmux.c`

```c
int pinmux_enable_setting(const struct pinctrl_setting *setting)
{
	struct pinctrl_dev *pctldev = setting->pctldev;
	const struct pinctrl_ops *pctlops = pctldev->desc->pctlops;
	const struct pinmux_ops *ops = pctldev->desc->pmxops;
	const unsigned *pins = NULL;
	unsigned num_pins = 0;
	int ret = 0;
	int i;

	if (pctlops->get_group_pins)
		ret = pctlops->get_group_pins(pctldev, setting->data.mux.group,
					      &pins, &num_pins); /* 先拿到 group 包含哪些 pin */

	for (i = 0; i < num_pins; i++) {              /* 逐个 pin 申请所有权 */
		ret = pin_request(pctldev, pins[i], setting->dev_name, NULL);
		if (ret)
			goto err_pin_request;
	}

	for (i = 0; i < num_pins; i++)                /* 给每个 pin_desc 记录当前 mux setting */
		pin_desc_get(pctldev, pins[i])->mux_setting = &(setting->data.mux);

	ret = ops->set_mux(pctldev,
			   setting->data.mux.func,
			   setting->data.mux.group);       /* 最终调用底层驱动写寄存器 */
	if (ret)
		goto err_set_mux;

	return 0;

err_set_mux:
	for (i = 0; i < num_pins; i++)
		if (pin_desc_get(pctldev, pins[i]))
			pin_desc_get(pctldev, pins[i])->mux_setting = NULL;
err_pin_request:
	while (--i >= 0)
		pin_free(pctldev, pins[i], NULL);         /* 出错就释放已申请的 pin */
	return ret;
}
```

#### 关键实现 3：`pinconf_apply_setting()`

源码位置：`drivers/pinctrl/pinconf.c`

```c
int pinconf_apply_setting(const struct pinctrl_setting *setting)
{
	struct pinctrl_dev *pctldev = setting->pctldev;
	const struct pinconf_ops *ops = pctldev->desc->confops;
	int ret;

	if (!ops)
		return -EINVAL;

	switch (setting->type) {
	case PIN_MAP_TYPE_CONFIGS_PIN:
		if (!ops->pin_config_set)
			return -EINVAL;
		ret = ops->pin_config_set(pctldev,
				setting->data.configs.group_or_pin,
				setting->data.configs.configs,
				setting->data.configs.num_configs);
		if (ret < 0)
			return ret;
		break;

	case PIN_MAP_TYPE_CONFIGS_GROUP:
		if (!ops->pin_config_group_set)
			return -EINVAL;
		ret = ops->pin_config_group_set(pctldev,
				setting->data.configs.group_or_pin,
				setting->data.configs.configs,
				setting->data.configs.num_configs);
		if (ret < 0)
			return ret;
		break;

	default:
		return -EINVAL;
	}

	return 0;
}
```

### 4. `pinctrl_register_and_init()`

源码位置：`drivers/pinctrl/core.c`

```c
int pinctrl_register_and_init(struct pinctrl_desc *pctldesc,
			      struct device *dev, void *driver_data,
			      struct pinctrl_dev **pctldev)
{
	struct pinctrl_dev *p;

	p = pinctrl_init_controller(pctldesc, dev, driver_data); /* 先初始化控制器实例 */
	if (IS_ERR(p))
		return PTR_ERR(p);

	*pctldev = p;                                  /* 提前把返回句柄交给驱动 */
	return 0;
}
```

#### 为什么这个 API 很重要

注释里已经说得很清楚：推荐用它替代 `pinctrl_register()`。

原因是：

1. `create_pinctrl()` 在某些场景下会提前调用 pin controller 驱动的函数，例如 `dt_node_to_map()`。
2. 所以在这些回调发生前，驱动需要先拿到一个有效的 `struct pinctrl_dev *`。
3. `pinctrl_register_and_init()` 先只做初始化，不马上 `enable`，让驱动有机会把上下文准备完整。

#### 递归调用逻辑

```text
pinctrl_register_and_init()
  -> pinctrl_init_controller()
     -> pinctrl_check_ops()
     -> pinmux_check_ops()
     -> pinconf_check_ops()
     -> pinctrl_register_pins()
        -> pinctrl_register_one_pin()
```

#### 关键实现：`pinctrl_init_controller()`

```c
static struct pinctrl_dev *
pinctrl_init_controller(struct pinctrl_desc *pctldesc, struct device *dev,
			void *driver_data)
{
	struct pinctrl_dev *pctldev;
	int ret;

	if (!pctldesc || !pctldesc->name)
		return ERR_PTR(-EINVAL);

	pctldev = kzalloc(sizeof(*pctldev), GFP_KERNEL); /* 分配运行时控制器对象 */
	if (!pctldev)
		return ERR_PTR(-ENOMEM);

	pctldev->owner = pctldesc->owner;
	pctldev->desc = pctldesc;
	pctldev->driver_data = driver_data;
	INIT_RADIX_TREE(&pctldev->pin_desc_tree, GFP_KERNEL);
	INIT_LIST_HEAD(&pctldev->gpio_ranges);
	INIT_LIST_HEAD(&pctldev->node);
	pctldev->dev = dev;
	mutex_init(&pctldev->mutex);

	ret = pinctrl_check_ops(pctldev);             /* 检查 pctlops 是否完整 */
	if (ret)
		goto out_err;

	if (pctldesc->pmxops) {                       /* 如果支持 pinmux，再检查 pmxops */
		ret = pinmux_check_ops(pctldev);
		if (ret)
			goto out_err;
	}

	if (pctldesc->confops) {                      /* 如果支持 pinconf，再检查 confops */
		ret = pinconf_check_ops(pctldev);
		if (ret)
			goto out_err;
	}

	ret = pinctrl_register_pins(pctldev,
				    pctldesc->pins,
				    pctldesc->npins);           /* 把全部 pin 注册进 pin_desc_tree */
	if (ret)
		goto out_err;

	return pctldev;

out_err:
	mutex_destroy(&pctldev->mutex);
	kfree(pctldev);
	return ERR_PTR(ret);
}
```

### 5. `pinctrl_enable()`

源码位置：`drivers/pinctrl/core.c`

```c
int pinctrl_enable(struct pinctrl_dev *pctldev)
{
	int error;

	error = pinctrl_claim_hogs(pctldev);          /* 先处理 hog 节点 */
	if (error) {
		pinctrl_free_pindescs(pctldev, pctldev->desc->pins,
				      pctldev->desc->npins);
		mutex_destroy(&pctldev->mutex);
		kfree(pctldev);
		return error;
	}

	mutex_lock(&pinctrldev_list_mutex);
	list_add_tail(&pctldev->node, &pinctrldev_list); /* 再把控制器放进全局链表 */
	mutex_unlock(&pinctrldev_list_mutex);

	pinctrl_init_device_debugfs(pctldev);         /* 最后初始化 debugfs */
	return 0;
}
```

#### `pinctrl_claim_hogs()` 做了什么

```text
pinctrl_claim_hogs()
  -> create_pinctrl(pctldev->dev, pctldev)
  -> pinctrl_lookup_state(default)
  -> pinctrl_select_state(default)
  -> pinctrl_lookup_state(sleep)
```

也就是说，控制器自己的 hog 配置其实也被统一建模成了一个 `struct pinctrl` 句柄。

## 0x03 初始化逻辑

这一节分成三块：

1. `pinctrl` 子系统自身初始化。
2. pin controller 驱动初始化。
3. 消费者设备在 probe 期间自动绑定 pin 状态。

### 1. 子系统自身初始化

#### 调用逻辑栈

```text
内核 initcall 框架
  -> core_initcall(pinctrl_init)
     -> pinctrl_init()
        -> pinctrl_init_debugfs()
```

#### 代码

源码位置：`drivers/pinctrl/core.c`

```c
static int __init pinctrl_init(void)
{
	pr_info("initialized pinctrl subsystem\n");
	pinctrl_init_debugfs();                    /* 初始化 pinctrl 的 debugfs 根目录 */
	return 0;
}

core_initcall(pinctrl_init);                 /* 比很多普通驱动更早执行 */
```

这里要注意一点：

1. `pinctrl` 使用的是 `core_initcall`。
2. 注释里写得很明确：很多驱动很早就需要 pinmux，所以它必须尽早初始化。

### 2. pin controller 驱动初始化

以本仓库里的 i.MX 实现为例，控制器驱动在 probe 中会这样做。

#### 调用逻辑栈

```text
平台驱动 probe
  -> imx_pinctrl_probe()
     -> devm_pinctrl_register_and_init()
        -> pinctrl_register_and_init()
           -> pinctrl_init_controller()
     -> imx_pinctrl_probe_dt()
     -> pinctrl_enable()
        -> pinctrl_claim_hogs()
        -> list_add_tail(&pctldev->node, &pinctrldev_list)
```

#### 代码

源码位置：`drivers/pinctrl/freescale/pinctrl-imx.c`

```c
ret = devm_pinctrl_register_and_init(&pdev->dev,
				     imx_pinctrl_desc, ipctl,
				     &ipctl->pctl);
if (ret) {
	dev_err(&pdev->dev, "could not register IMX pinctrl driver\n");
	return ret;
}

ret = imx_pinctrl_probe_dt(pdev, ipctl);     /* 解析控制器自身的 DT 信息 */
if (ret) {
	dev_err(&pdev->dev, "fail to probe dt properties\n");
	return ret;
}

return pinctrl_enable(ipctl->pctl);          /* 所有准备完成后再 enable */
```

这个顺序非常关键：

1. 先 `register_and_init`，拿到有效 `pctldev`。
2. 再解析控制器驱动自身需要的 DT 数据。
3. 最后 `pinctrl_enable()`，把控制器真正加入全局系统并处理 hog。

### 3. 消费者设备 probe 期间的自动绑定

设备驱动就算自己不显式调用 `pinctrl_get()`，设备核心也可能帮它做掉一部分工作。

#### 调用逻辑栈

```text
really_probe()
  -> pinctrl_bind_pins(dev)
     -> devm_pinctrl_get(dev)
        -> pinctrl_get(dev)
     -> pinctrl_lookup_state(default)
     -> pinctrl_lookup_state(init)
     -> pinctrl_select_state(init 或 default)
     -> pinctrl_lookup_state(sleep)
     -> pinctrl_lookup_state(idle)

driver probe() 返回成功后
  -> pinctrl_init_done(dev)
     -> 如果当前还是 init 状态，则自动切到 default
```

#### 代码 1：`really_probe()` 中调用时机

源码位置：`drivers/base/dd.c`

```c
ret = pinctrl_bind_pins(dev);                /* 在驱动 probe 之前先绑定 pins */
if (ret)
	goto pinctrl_bind_failed;

ret = call_driver_probe(dev, drv);           /* 真正进入驱动 probe() */
if (ret) {
	ret = -ret;
	goto probe_failed;
}

pinctrl_init_done(dev);                      /* probe 完成后做 init -> default 切换 */
```

#### 代码 2：`pinctrl_bind_pins()`

源码位置：`drivers/base/pinctrl.c`

```c
int pinctrl_bind_pins(struct device *dev)
{
	int ret;

	dev->pins = devm_kzalloc(dev, sizeof(*(dev->pins)), GFP_KERNEL);
	if (!dev->pins)
		return -ENOMEM;

	dev->pins->p = devm_pinctrl_get(dev);      /* 获取该设备的 pinctrl 句柄 */
	if (IS_ERR(dev->pins->p)) {
		ret = PTR_ERR(dev->pins->p);
		goto cleanup_alloc;
	}

	dev->pins->default_state =
		pinctrl_lookup_state(dev->pins->p, PINCTRL_STATE_DEFAULT);
	if (IS_ERR(dev->pins->default_state)) {
		ret = 0;
		goto cleanup_get;
	}

	dev->pins->init_state =
		pinctrl_lookup_state(dev->pins->p, PINCTRL_STATE_INIT);
	if (IS_ERR(dev->pins->init_state)) {
		ret = pinctrl_select_state(dev->pins->p,
					   dev->pins->default_state);
	} else {
		ret = pinctrl_select_state(dev->pins->p,
					   dev->pins->init_state);
	}

#ifdef CONFIG_PM
	dev->pins->sleep_state =
		pinctrl_lookup_state(dev->pins->p, PINCTRL_STATE_SLEEP);
	dev->pins->idle_state =
		pinctrl_lookup_state(dev->pins->p, PINCTRL_STATE_IDLE);
#endif

	return 0;

cleanup_get:
	devm_pinctrl_put(dev->pins->p);
cleanup_alloc:
	devm_kfree(dev, dev->pins);
	dev->pins = NULL;
	return ret == -EPROBE_DEFER || ret == -EINVAL ? ret : 0;
}
```

#### 代码 3：`pinctrl_init_done()`

源码位置：`drivers/pinctrl/core.c`

```c
int pinctrl_init_done(struct device *dev)
{
	struct dev_pin_info *pins = dev->pins;
	int ret;

	if (!pins)
		return 0;

	if (IS_ERR(pins->init_state))
		return 0;                               /* 没有 init 状态 */

	if (pins->p->state != pins->init_state)
		return 0;                               /* 当前已经不是 init 状态 */

	if (IS_ERR(pins->default_state))
		return 0;                               /* 没有 default 状态 */

	ret = pinctrl_select_state(pins->p, pins->default_state); /* init -> default */
	if (ret)
		dev_err(dev, "failed to activate default pinctrl state\n");

	return ret;
}
```

### 4. 初始化小结

把整个流程串起来就是：

```text
[阶段A] pinctrl 子系统先通过 core_initcall 初始化
    |
    v
[阶段B] pin controller 驱动 probe，调用 pinctrl_register_and_init()/pinctrl_enable()
    |
    v
[阶段C] 消费者设备 probe 前，设备核心通过 pinctrl_bind_pins() 自动准备状态
    |
    v
[阶段D] 驱动 probe 完成后，pinctrl_init_done() 视情况把 init 切到 default
    |
    v
[阶段E] 运行期/休眠期，驱动可调用 pinctrl_select_state() 或 pinctrl_pm_select_*()
```

## 0x04 示例

下面给出一个最常见的使用方式：设备树声明状态，驱动里在运行期切换状态。

### 1. 设备树示例

前面那种“空节点”更像示意图。下面给一个仓库里真实存在风格的 i.MX DTS 示例。

示例一：消费者设备节点引用 pinctrl 状态。

```dts
&uart1 {
	pinctrl-names = "default";
	pinctrl-0 = <&pinctrl_uart1>;
	uart-has-rtscts;
	status = "okay";
};
```

示例二：在 `iomuxc` 节点下定义真正的 pin 配置状态。

```dts
&iomuxc {
	pinctrl_uart1: uart1grp {
		fsl,pins = <
			MX8MM_IOMUXC_SAI2_RXC_UART1_DCE_RX		0x140
			MX8MM_IOMUXC_SAI2_RXFS_UART1_DCE_TX		0x140
			MX8MM_IOMUXC_SAI2_RXD0_UART1_DCE_RTS_B		0x140
			MX8MM_IOMUXC_SAI2_TXFS_UART1_DCE_CTS_B		0x140
		>;
	};
};
```

再给一个老一点的 i.MX53 风格例子，结构是一样的，只是 pad 宏名字不同：

```dts
&iomuxc {
	pinctrl_uart3: uart3grp {
		fsl,pins = <
			MX53_PAD_PATA_CS_0__UART3_TXD_MUX	0x1e4
			MX53_PAD_PATA_CS_1__UART3_RXD_MUX	0x1e4
			MX53_PAD_PATA_DA_1__UART3_CTS		0x1e4
			MX53_PAD_PATA_DA_2__UART3_RTS		0x1e4
		>;
	};
};
```

这几段 DTS 里最关键的是：

1. `pinctrl-names` 定义状态名，这里是 `default`。
2. `pinctrl-0 = <&pinctrl_uart1>;` 表示 `default` 状态引用 `pinctrl_uart1` 这个配置节点。
3. `fsl,pins` 里的每一项描述“某个 pad 要复用成什么功能，以及对应的 pad config 值”。
4. 这些 `fsl,pins` 并不是 pinctrl core 直接认识的通用格式，而是由 i.MX pinctrl 驱动自己的 `dt_node_to_map()` / DT 解析逻辑来翻译。

这段 DT 最终会经过：

```text
pinctrl_bind_pins()
	-> devm_pinctrl_get()
	   -> pinctrl_get()
	      -> create_pinctrl()
	         -> pinctrl_dt_to_map()
	            -> dt_to_map_one_config()
	               -> pctldev->desc->pctlops->dt_node_to_map()
```

如果继续往 i.MX 驱动里追，核心就是：

1. `pinctrl_dt_to_map()` 先把 `pinctrl-0` 里的 phandle 找出来。
2. `dt_to_map_one_config()` 找到它属于哪个 pin controller。
3. 然后调用具体控制器驱动的 `dt_node_to_map()`。
4. i.MX 驱动再把 `fsl,pins = <...>` 翻译成 `struct pinctrl_map[]`，最后进入 `add_setting()`。

### 2. 驱动侧示例

```c
struct demo_priv {
	struct pinctrl *p;
	struct pinctrl_state *default_state;
	struct pinctrl_state *sleep_state;
};

static int demo_probe(struct platform_device *pdev)
{
	struct device *dev = &pdev->dev;
	struct demo_priv *priv;

	priv = devm_kzalloc(dev, sizeof(*priv), GFP_KERNEL);
	if (!priv)
		return -ENOMEM;

	priv->p = pinctrl_get(dev);                        /* 获取 pinctrl 句柄 */
	if (IS_ERR(priv->p))
		return PTR_ERR(priv->p);

	priv->default_state = pinctrl_lookup_state(priv->p, "default");
	if (IS_ERR(priv->default_state))
		goto err_put;

	priv->sleep_state = pinctrl_lookup_state(priv->p, "sleep");
	if (IS_ERR(priv->sleep_state))
		goto err_put;

	return pinctrl_select_state(priv->p, priv->default_state); /* 切到默认状态 */

err_put:
	pinctrl_put(priv->p);
	return -EINVAL;
}

static int demo_suspend(struct device *dev)
{
	struct demo_priv *priv = dev_get_drvdata(dev);

	return pinctrl_select_state(priv->p, priv->sleep_state);   /* 休眠时切到 sleep */
}

static int demo_resume(struct device *dev)
{
	struct demo_priv *priv = dev_get_drvdata(dev);

	return pinctrl_select_state(priv->p, priv->default_state); /* 恢复时切回 default */
}
```

### 3. 如果使用设备核心的自动绑定

很多驱动甚至不用手写上面的 `probe` 逻辑，而是直接使用设备核心准备好的状态：

```c
static int xxx_suspend(struct device *dev)
{
	return pinctrl_pm_select_sleep_state(dev);
}

static int xxx_resume(struct device *dev)
{
	return pinctrl_pm_select_default_state(dev);
}
```

原因是 `drivers/base/pinctrl.c` 已经在 probe 前帮设备缓存好了：

1. `default_state`
2. `init_state`
3. `sleep_state`
4. `idle_state`

### 4. 学习这个子系统时建议重点盯住的文件

如果你要继续往下深挖，建议按下面顺序读：

1. `include/linux/pinctrl/pinctrl.h`
   先看框架暴露给控制器驱动的描述结构。
2. `include/linux/pinctrl/consumer.h`
   再看消费者 API 长什么样。
3. `drivers/pinctrl/core.h`
   理解运行时对象：`pinctrl_dev`、`pinctrl`、`pinctrl_state`、`pinctrl_setting`。
4. `drivers/pinctrl/core.c`
   看句柄创建、状态切换、控制器注册。
5. `drivers/pinctrl/devicetree.c`
   看设备树如何变成 map。
6. `drivers/pinctrl/pinmux.c`
   看 mux 状态如何真正执行。
7. `drivers/pinctrl/pinconf.c`
   看 pin config 如何真正执行。
8. 某个具体 SoC 驱动
   例如 `drivers/pinctrl/freescale/pinctrl-imx.c`，看 `dt_node_to_map()`、`set_mux()`、`pin_config_set()` 最终如何落到寄存器。

## 总结

`pinctrl` 子系统最核心的理解方式，不是把它看成“单个 API”，而是把它看成一条完整的数据流：

```text
设备树/板级描述
  -> struct pinctrl_map
  -> struct pinctrl_state + struct pinctrl_setting
  -> pinctrl_select_state()
  -> pinmux/pinconf
  -> SoC 驱动 ops
  -> 硬件寄存器
```

只要把下面 4 个问题想明白，这个子系统就基本掌握了：

1. 状态 `state` 是怎么创建出来的？
2. `state` 里的 `setting` 是怎么从 DT/map 转出来的？
3. `pinctrl_select_state()` 是怎么把 `setting` 交给 `pinmux/pinconf` 执行的？
4. SoC pin controller 驱动是通过哪些 `ops` 接入整个框架的？
