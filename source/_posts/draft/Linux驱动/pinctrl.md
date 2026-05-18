## 0x01 核心结构体



```c
struct pinctrl {                     /* 某个设备对应的 pinctrl 句柄，保存该设备的 pin 状态信息 */
	struct list_head node;        /* 链表节点：把当前 pinctrl 挂到全局 pinctrl_list 链表中 */
	struct device *dev;           /* 关联的消费者设备，即哪个设备在使用这组 pinctrl 状态 */
	struct list_head states;      /* 状态链表头：保存该设备拥有的所有 pinctrl_state */
	struct pinctrl_state *state;  /* 当前正在生效的状态 */
	struct list_head dt_maps;     /* 由设备树解析得到的映射表链表 */
	struct kref users;            /* 引用计数：记录有多少地方持有这个 pinctrl 句柄 */
};
```



```c
struct pinctrl_state {              /* 表示一个设备的某种 pin 控制状态，例如 default/sleep */
	struct list_head node;       /* 链表节点：把当前 state 挂到 pinctrl->states 链表中 */
	const char *name;            /* 状态名称，例如 "default"、"init"、"sleep"、"idle" */
	struct list_head settings;   /* setting 链表头：保存该状态下的所有具体 pin 配置项 */
};
```



```c
struct pinctrl_setting {                 /* 一个具体的 pinctrl 设置项，属于某个 state */
	struct list_head node;           /* 链表节点：把该 setting 挂到 pinctrl_state->settings 链表里 */
	enum pinctrl_map_type type;      /* 设置类型：说明这是 mux 配置、单 pin 配置，还是 group 配置 */
	struct pinctrl_dev *pctldev;     /* 负责执行这条 setting 的 pinctrl 控制器实例 */
	const char *dev_name;            /* 使用这条 setting 的设备名，也就是消费者设备名 */
	union {
		struct pinctrl_setting_mux mux;       /* 当 type 是 PIN_MAP_TYPE_MUX_GROUP 时使用，保存 group/function 选择器 */
		struct pinctrl_setting_configs configs; /* 当 type 是 CONFIGS_PIN 或 CONFIGS_GROUP 时使用，保存配置参数数组 */
	} data;
};
```



```c
struct pinctrl_dev {                           /* pinctrl 控制器的运行时实例，对应一个已注册的 pin controller */
	struct list_head node;                  /* 链表节点：把当前控制器挂到全局 pinctrl 设备链表中 */
	struct pinctrl_desc *desc;              /* 控制器描述符，保存 pin 列表及各类操作函数集合 */
	struct radix_tree_root pin_desc_tree;   /* pin 描述树：按 pin number 索引每个 pin 的运行时描述信息 */
#ifdef CONFIG_GENERIC_PINCTRL_GROUPS
	struct radix_tree_root pin_group_tree;  /* pin group 描述树：按 group selector/编号索引 group 信息 */
	unsigned int num_groups;                /* 当前控制器支持的 group 数量 */
#endif
#ifdef CONFIG_GENERIC_PINMUX_FUNCTIONS
	struct radix_tree_root pin_function_tree; /* pin function 描述树：按 function selector/编号索引 function 信息 */
	unsigned int num_functions;               /* 当前控制器支持的 function 数量 */
#endif
	struct list_head gpio_ranges;           /* GPIO range 链表：描述该控制器管理的 GPIO 与 pin 的映射范围 */
	struct device *dev;                     /* 对应的设备对象，即这个 pinctrl 控制器自身的 struct device */
	struct module *owner;                   /* 所属模块，用于模块引用计数管理 */
	void *driver_data;                      /* 控制器驱动私有数据，供具体 pinctrl 驱动使用 */
	struct pinctrl *p;                      /* 该控制器自身作为 consumer 时持有的 pinctrl 句柄，常用于 hog 配置 */
	struct pinctrl_state *hog_default;      /* 控制器自身的 hog 默认状态 */
	struct pinctrl_state *hog_sleep;        /* 控制器自身的 hog 休眠状态 */
	struct mutex mutex;                     /* 互斥锁：保护该控制器相关运行时数据和操作 */
#ifdef CONFIG_DEBUG_FS
	struct dentry *device_root;             /* debugfs 目录项，对应此控制器在 debugfs 下的根节点 */
#endif
};
```



```c
struct pinctrl_desc {                                 /* pinctrl 控制器描述符：驱动注册控制器时提交给 pinctrl core 的静态描述信息 */
	const char *name;                             /* 控制器名称 */
	const struct pinctrl_pin_desc *pins;          /* 该控制器管理的所有 pin 描述数组 */
	unsigned int npins;                           /* pin 描述数组中的 pin 数量 */
	const struct pinctrl_ops *pctlops;            /* pinctrl 操作集：group 管理、DT 转 map 等全局控制操作 */
	const struct pinmux_ops *pmxops;              /* pinmux 操作集：function/group 复用选择相关操作 */
	const struct pinconf_ops *confops;            /* pinconf 操作集：pin 电气属性配置相关操作 */
	struct module *owner;                         /* 所属模块，用于模块引用计数管理 */
#ifdef CONFIG_GENERIC_PINCONF
	unsigned int num_custom_params;               /* 驱动自定义 pinconf 参数的数量 */
	const struct pinconf_generic_params *custom_params; /* 驱动自定义 pinconf 参数描述表 */
	const struct pin_config_item *custom_conf_items;    /* 自定义参数在 debugfs 等场景下的显示信息表 */
#endif
	bool link_consumers;                          /* 是否为控制器与消费者设备建立 device link，用于电源管理/挂起恢复顺序控制 */
};
```



## 0x02 关键API

设备驱动侧（消费者）

```c
struct pinctrl *pinctrl_get(struct device *dev)
{
	struct pinctrl *p;

	if (WARN_ON(!dev))
		return ERR_PTR(-EINVAL);

	/*
	 * See if somebody else (such as the device core) has already
	 * obtained a handle to the pinctrl for this device. In that case,
	 * return another pointer to it.
	 */
	p = find_pinctrl(dev);
	if (p) {
		dev_dbg(dev, "obtain a copy of previously claimed pinctrl\n");
		kref_get(&p->users);
		return p;
	}

	return create_pinctrl(dev, NULL);
}
EXPORT_SYMBOL_GPL(pinctrl_get);
```

