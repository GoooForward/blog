![](https://cdn.jsdelivr.net/gh/GoooForward/picture@main/note-image/image-20251202234101816.png)





### 杂项设备驱动

------

#### **功能简述**

杂项设备（`miscdevice`）是 Linux 内核提供的一种**简化版字符设备驱动框架**，适用于**不需要独立主设备号**的简单字符设备。
内核为所有杂项设备**共享一个主设备号（`MISC_MAJOR = 10`）**，每个设备通过**唯一的次设备号**区分。
使用 `miscdevice` 可省去手动分配/注册设备号、创建 `cdev` 和管理 `/dev` 节点等步骤，**大幅简化驱动代码**。

> ✅ 适用场景：看门狗（watchdog）、EEPROM、温度传感器、LED 控制器等简单外设。

------

#### **头文件**

```c
#include <linux/miscdevice.h>
```

------

#### **核心结构体：`struct miscdevice`**

```c
struct miscdevice {
    int minor;                      // 次设备号（可指定或动态分配）
    const char *name;               // 设备名（将出现在 /dev/ 和 /sys/class/misc/）
    const struct file_operations *fops; // 文件操作集
    struct list_head list;
    struct device *parent;
    struct device *this_device;
    const char *nodename;
    umode_t mode;
};
```

- `minor`：
    - 若需固定次设备号（如看门狗为 130），直接赋值（参考 `Documentation/admin-guide/devices.txt`）；
    - 若设为 `MISC_DYNAMIC_MINOR`（值为 `-1`），内核自动分配未使用的次设备号。
- **`name`**：设备节点名（如 `"my_misc_dev"` → `/dev/my_misc_dev`）。
- **`fops`**：标准 `file_operations`，定义 `open`/`read`/`write` 等回调。

------

#### **注册与注销函数**

| 函数     | 原型                                            | 说明                                                         |
| -------- | ----------------------------------------------- | ------------------------------------------------------------ |
| **注册** | `int misc_register(struct miscdevice *misc);`   | 自动： • 分配设备号（主=10，次=`minor`） • 创建 `cdev` • 在 `/sys/class/misc/` 创建类 • 触发 udev 创建 `/dev/<name>` |
| **注销** | `int misc_deregister(struct miscdevice *misc);` | 自动清理上述所有资源                                         |

> ✅ **无需调用** `alloc_chrdev_region()`、`cdev_init()`、`cdev_add()`、`class_create()`、`device_create()`！

------

#### **完整示例：最简杂项设备驱动**

```c
#include <linux/module.h>
#include <linux/fs.h>
#include <linux/miscdevice.h>
#include <linux/uaccess.h>

#define DEVICE_NAME "my_misc"

static ssize_t my_read(struct file *file, char __user *buf, size_t count, loff_t *ppos)
{
    const char *msg = "Hello from misc driver!\n";
    size_t len = strlen(msg);
    
    if (*ppos >= len) return 0;
    if (copy_to_user(buf, msg + *ppos, min(count, len - (size_t)*ppos)))
        return -EFAULT;
    
    *ppos += min(count, len - (size_t)*ppos);
    return min(count, len - (size_t)*ppos);
}

static const struct file_operations my_fops = {
    .owner = THIS_MODULE,
    .read  = my_read,
};

// 定义杂项设备
static struct miscdevice my_misc = {
    .minor = MISC_DYNAMIC_MINOR,   // 动态分配次设备号
    .name  = DEVICE_NAME,
    .fops  = &my_fops,
};

static int __init misc_init(void)
{
    int ret = misc_register(&my_misc);
    if (ret) {
        pr_err("Failed to register misc device\n");
        return ret;
    }
    pr_info("Misc device /dev/%s registered (minor=%d)\n", 
            DEVICE_NAME, my_misc.minor);
    return 0;
}

static void __exit misc_exit(void)
{
    misc_deregister(&my_misc);
    pr_info("Misc device unregistered\n");
}

MODULE_LICENSE("GPL");
MODULE_DESCRIPTION("Simple misc device driver example");
```

------

#### **效果验证**

加载模块后：

```bash
# 查看设备节点（自动创建！）
ls -l /dev/my_misc
# crw------- 1 root root 10, 58 Dec  7 14:00 /dev/my_misc

# 查看 sysfs
ls /sys/class/misc/
# my_misc

# 测试读取
cat /dev/my_misc
# Hello from misc driver!
```

卸载模块后，`/dev/my_misc` **自动消失**。

------

#### **关键优势 vs 普通字符设备**

| 功能          | 普通字符设备                        | 杂项设备                           |
| ------------- | ----------------------------------- | ---------------------------------- |
| 设备号管理    | 需手动分配/释放                     | 自动（主=10）                      |
| cdev 初始化   | 需 `cdev_init` + `cdev_add`         | 内核自动处理                       |
| /dev 节点创建 | 需 `class_create` + `device_create` | 自动触发 udev                      |
| 代码量        | 较多（20+ 行初始化）                | 极简（仅需定义 `miscdevice` 结构） |
| 适用场景      | 复杂设备、需独立主设备号            | 简单设备、单实例                   |

------

#### **注意事项**

1. **次设备号冲突**  
    - 若指定固定 `minor`（如 `130`），需确保未被占用（查看 `/proc/misc`）；
    - 推荐优先使用 `MISC_DYNAMIC_MINOR`。
2. **设备名称唯一性**  
    - `name` 必须全局唯一，否则 `misc_register` 失败（返回 `-EBUSY`）。
3. **权限控制**  
    - 默认设备节点权限为 `600`（root-only）；
    - 如需开放权限，需配置 udev 规则（如 `KERNEL=="my_misc", MODE="0666"`）。
4. **多实例支持**  
    - 每个 `miscdevice` 实例对应一个 `/dev` 节点；
    - 若需多个设备，定义多个 `miscdevice` 结构体。
5. **错误处理**  
    - `misc_register` 失败时，**不会残留资源**，无需手动回滚。

------

#### **典型内核杂项设备**

| 设备            | 次设备号 | 用途                 |
| --------------- | -------- | -------------------- |
| `/dev/watchdog` | 130      | 看门狗定时器         |
| `/dev/rtc0`     | 135      | 实时时钟（部分实现） |
| `/dev/ppdev0`   | 147      | 并口设备             |
| `/dev/hwrng`    | 183      | 硬件随机数生成器     |

> 📌 参考：`Documentation/admin-guide/devices.txt` 中 "Miscellaneous devices" 章节。

------

#### **总结**

- **何时使用**：当你需要快速实现一个**简单、单实例**的字符设备，且**不想处理设备号和 sysfs 细节**时。
- **核心 API**：只需 `struct miscdevice` + `misc_register()`/`misc_deregister()`。
- **开发效率**：比普通字符设备减少 50% 以上样板代码，且自动支持 udev。

> 💡 **记住：对于简单外设，优先考虑 `miscdevice` —— 这是内核为你准备的“快捷通道”！**





### misc_register()

- **功能简述**：  
    用于注册一个“杂项设备”（miscellaneous device），即主设备号固定为 `MISC_MAJOR`（通常为 10）的一类字符设备。内核为这类设备提供简化注册接口，自动分配次设备号并创建 `/dev` 节点（通过 udev/mdev），适用于不需要专属主设备号的简单字符设备驱动。

- **头文件**：  

    ```c
    #include <linux/miscdevice.h>
    ```

- **函数原型**：  

    ```c
    int misc_register(struct miscdevice *misc);
    ```

- **参数说明**：

    - `misc`：指向 `struct miscdevice` 结构体的指针，该结构体描述了要注册的杂项设备，关键成员包括：
        - `minor`：次设备号。可设为特定值（如 `MY_DEVICE_MINOR`），或使用 `MISC_DYNAMIC_MINOR` 让内核自动分配。
        - `name`：设备在 `/dev/` 下的名称（如 `"my_misc_dev"`），也将出现在 `/sys/class/misc/` 中。
        - `fops`：指向 `struct file_operations` 的指针，定义设备的文件操作方法（如 `open`、`read`、`write` 等）。
        - 其他成员（如 `mode`）可选，用于设置设备节点权限等。

- **返回值**：  

    - 成功时返回 `0`；
    - 失败时返回负的错误码（如 `-EBUSY` 表示次设备号已被占用，`-ENOMEM` 表示内存不足等）。

- **注意事项**：

    - 杂项设备共享主设备号 10，因此仅靠次设备号区分不同设备。若需多个设备，建议使用 `MISC_DYNAMIC_MINOR` 避免冲突。
    - 注册成功后，内核会自动在 `/sys/class/misc/` 下创建对应条目，并触发 udev/mdev 在 `/dev/` 下创建设备节点（如 `/dev/my_misc_dev`）。
    - 必须在模块退出时调用 `misc_deregister()` 来注销设备，否则会导致资源泄漏或无法重新加载模块。
    - `miscdevice` 结构体通常作为驱动私有数据的一部分静态定义或动态分配，其生命周期应覆盖从 `misc_register()` 到 `misc_deregister()` 的整个过程。
    - 若指定固定次设备号，需确保该号未被其他杂项设备使用（可查阅 `Documentation/admin-guide/devices.txt` 或 `/proc/misc`）。



### misc_deregister()

- **功能简述**：  
    用于注销一个已通过 `misc_register()` 注册的杂项设备（miscellaneous device）。该函数会从内核中移除该设备的注册信息，删除 `/sys/class/misc/` 下对应的 sysfs 条目，并通知用户空间设备管理器（如 udev 或 mdev）移除 `/dev` 下的设备节点，从而完成设备的清理工作。

- **头文件**：  

    ```c
    #include <linux/miscdevice.h>
    ```

- **函数原型**：  

    ```c
    int misc_deregister(struct miscdevice *misc);
    ```

- **参数说明**：

    - `misc`：指向之前传给 `misc_register()` 的 `struct miscdevice` 结构体的指针。该结构体的内容必须与注册时一致，尤其是 `minor` 和 `name` 字段，内核据此识别要注销的设备。

- **返回值**：  

    - 成功时返回 `0`；
    - 失败时返回负的错误码（例如 `-EINVAL` 表示传入的 `misc` 无效或设备未注册）。

- **注意事项**：

    - 必须确保传入的 `misc` 指针与注册时使用的结构体是同一个（或内容一致），否则可能导致注销失败或内核异常。
    - 通常在内核模块的退出函数（如 `module_exit`）中调用此函数，以确保模块卸载前正确释放设备资源。
    - 在调用 `misc_deregister()` 后，不应再访问该设备的 `/dev` 节点或对其执行 I/O 操作。
    - 若 `misc_register()` 未成功（返回非零），则不应调用 `misc_deregister()`，以免传入未注册的设备结构。
    - 该函数是 `misc_register()` 的配对清理函数，二者应成对使用，以避免设备节点残留或内核资源泄漏。