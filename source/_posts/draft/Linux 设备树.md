---
title: Linux 设备树
date: 2025-10-29 23:09:00
updated: 2025-10-22 21:19:01
hide: true
tags: 
  - Linux
categories: 学习
---



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



```
start_kernel（内核启动入口）
├─ setup_arch（架构初始化）
│  ├─ setup_machine_fdt（设备树机器匹配）
│  │  ├─ early_init_dt_verify（验证DTB合法性）
│  │  └─ of_flat_dt_match_machine（匹配machine_desc）
│  └─ unflatten_device_tree（解析DTB为device_node树）
│     └─ __unflatten_device_tree → unflatten_dt_node（递归创建device_node）
│        → 赋值全局of_root（设备树根节点）
├─ rest_init（启动核心进程）
│  └─ kernel_thread（创建kernel_init进程）
│     └─ kernel_init（用户态初始化入口）
│        ├─ kernel_init_freeable
│        │  └─ do_basic_setup（基础设置）
│        │     └─ do_initcalls（按优先级执行初始化函数）
│        │        └─ customize_machine（设备初始化，arch_initcall优先级）
│        │           ├─ 若有init_machine（如imx6ul_init_machine）则执行
│        │           └─ 否则调用of_platform_populate（设备树创建设备）
│        │              └─ of_platform_bus_create（递归创建platform_device）
│		 │					└─ of_platform_device_create_pdata（将device_node转换为platform_device并完成注册）
```



```c
struct platform_device {
	const char	*name;
	int		id;
	bool		id_auto;
	struct device	dev;
	u32		num_resources;
	struct resource	*resource;

	const struct platform_device_id	*id_entry;
	char *driver_override; /* Driver name to force a match */

	/* MFD cell pointer */
	struct mfd_cell *mfd_cell;

	/* arch specific additions */
	struct pdev_archdata	archdata;
};

struct resource {
	resource_size_t start;
	resource_size_t end;
	const char *name;
	unsigned long flags;
	struct resource *parent, *sibling, *child;
};
```

