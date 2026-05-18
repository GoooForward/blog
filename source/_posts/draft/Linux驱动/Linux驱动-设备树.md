# 0x00 设备树的基本知识



## -1- 为什么引入设备树？

在设备树出现之前，Linux 内核对每种硬件平台都需要硬编码其硬件信息（如通过 `mach-xxx` 或 `plat-xxx` 目录下的 C 代码）。这种方式存在以下问题：

1. **可维护性差**
     每增加一个新板子，就要写大量重复的 C 代码，容易出错且难以维护。
2. **内核膨胀**
     所有板级支持都编译进内核，导致内核体积庞大，即使只用其中一小部分。
3. **缺乏灵活性**
     修改硬件配置（如换一个串口引脚）需要重新编译内核，开发效率低。
4. **不利于通用化**
     同一 SoC 的不同开发板差异仅在于外围设备连接方式，但内核却要为每个板子单独支持。

引入设备树后，实现了**硬件描述与内核代码的解耦**：

- 内核只需解析设备树，根据其中的信息动态初始化设备。
- 不同硬件平台可以共用同一个内核镜像，只需更换对应的 `.dtb` 文件。
- 板级差异通过设备树文件体现，无需修改内核源码。



## -2- 什么是设备树？

设备树（Device Tree）是一种用于描述硬件配置的数据结构，最初源于 PowerPC 架构，在 Linux 内核中被广泛采用，特别是在 ARM 架构上。它的主要作用是在不修改内核源代码的前提下，向操作系统描述系统中的硬件信息

设备树是一个**与平台无关的、以树形结构组织的、描述硬件资源**（如 CPU、内存、外设等）的数据结构。它通常以 `.dts`（Device Tree Source）源文件形式编写，经编译后生成 `.dtb`（Device Tree Blob）二进制文件，在系统启动时由 Bootloader（如 U-Boot）传递给内核。



## -3- 设备树相关名词解释

① **DT：Device Tree // 设备树**

- **中文名**：设备树
- **含义**：一种用于描述硬件平台结构和资源的**数据结构**，以树形方式组织硬件信息。
- 作用：
    - 向操作系统（如 Linux 内核）提供硬件配置信息（如内存、外设地址、中断等）。
    - 实现“硬件描述与内核代码分离”，提高系统的可移植性和灵活性。
- 特点：
    - 不依赖于特定的 CPU 或 SoC 架构。
    - 支持多种硬件平台共用一个内核镜像。

------

② **FDT：Flattened Device Tree // 开放设备树，起源于 OpenFirmware (OF)**

- **中文名**：扁平化设备树
- **含义**：设备树在内存中的一种**二进制格式**，是设备树的“运行时”表示形式。
- **来源**：最初由 OpenFirmware（OF）项目提出，用于 PowerPC 平台。
- 用途：
    - 被 Bootloader 加载后传给操作系统内核。
    - 内核通过解析 FDT 来识别系统中的硬件设备。
- **注意**：FDT 是 DT 在运行时的“扁平化”表示，即把树状结构转换为线性字节流。

> 📌 简单说：`DT` 是概念，`FDT` 是它在内存中的实际形态。

------

③ **dts：device tree source 的缩写 // 设备树源码**

- **中文名**：设备树源文件

- **含义**：用人类可读的文本格式编写的设备树定义文件。

- **扩展名**：`.dts`

- 内容：

    - 使用类似 C 语言的语法描述硬件节点和属性。
    - 包含节点（Node）、属性（Property）、子节点等。

- 示例：

    ```dts
    / {
        model = "My Board";
        compatible = "myvendor,myboard";
    };
    ```

- **作用**：编写硬件配置的起点，需通过 `dtc` 编译成 `.dtb`。

------

④ **dtsi：device tree source include 的缩写 // 通用的设备树源码**

- **中文名**：设备树源码包含文件

- **含义**：类似于 C 语言中的头文件（`.h`），用于**共享通用硬件描述**。

- **扩展名**：`.dtsi`

- 用途：

    - 定义多个开发板共用的部分（如 SoC 核心、CPU、总线等）。
    - 避免重复代码，提升维护效率。

- 使用方式：

    ```dts
    #include "imx6ull.dtsi"
    ```

- **示例**：所有基于 i.MX6ULL 的开发板都可以引用同一个 `imx6ull.dtsi` 文件。

------

⑤ **dtb：device tree blob 的缩写 // 编译设备树源码得到的文件**

- **中文名**：设备树二进制文件
- **含义**：由 `.dts` 文件经过 `dtc` 编译后生成的**二进制文件**。
- **扩展名**：`.dtb`
- 用途：
    - 由 Bootloader（如 U-Boot）加载并传递给 Linux 内核。
    - 内核在启动时解析该文件来初始化硬件。
- 特点：
    - 机器可读，不能直接编辑。
    - 是设备树在运行时的实际输入。

------

⑥ **dtc：device tree compiler 的缩写 // 设备树编译器**

- **中文名**：设备树编译器

- **含义**：将 `.dts` 源文件编译为 `.dtb` 二进制文件的工具。

- 功能：

    - 将人类可读的 DTS 文件 → 机器可读的 DTB 文件。
    - 支持反向操作（将 `.dtb` 反编译为 `.dts`）。

- 常用命令：

    ```bash
    dtc -I dts -O dtb -o output.dtb input.dts     # 编译
    dtc -I dtb -O dts -o output.dts input.dtb     # 反编译
    ```

------

**总结表（简洁版）**

| 缩写 | 全称                       | 中文             | 说明                                      |
| ---- | -------------------------- | ---------------- | ----------------------------------------- |
| DT   | Device Tree                | 设备树           | 描述硬件的树形结构                        |
| FDT  | Flattened Device Tree      | 扁平化设备树     | DT 的二进制运行格式，源自 OpenFirmware    |
| dts  | device tree source         | 设备树源码       | 文本格式的硬件描述文件（.dts）            |
| dtsi | device tree source include | 通用设备树源码   | 可被多个 .dts 文件包含的公共部分（.dtsi） |
| dtb  | device tree blob           | 设备树二进制文件 | 编译后的二进制文件，供内核使用（.dtb）    |
| dtc  | device tree compiler       | 设备树编译器     | 将 dts → dtb 的工具                       |



# 0x01 如何编译DTS

## -1- DTC

编译设备树源码的工具叫做dtc，其源码位于**内核源码中** `scripts/dtc/` 目录下，如果配置了CONFIG_DTC，编译内核时会自动构建出dtc的可执行文件。



## -2- DTC的用法

1. **编译 DTS → DTB**

```
dtc -I dts -O dtb -o myboard.dtb myboard.dts
```

- `-I dts`：输入格式为 DTS 源码
- `-O dtb`：输出格式为 DTB 二进制
- `-o`：指定输出文件名

2. **反编译 DTB → DTS**

```
dtc -I dtb -O dts -o myboard.dts myboard.dtb
```

> 常用于分析 Bootloader 传递给内核的设备树内容。



# 0x02 设备树的基本语法



## -1- 设备树的根节点

设备树根节点是整个设备树的起始点和顶层节点。根节点以/标识符作为开头，以{}表示根节点所包含的内容，以分号表示结尾

```c
/dts-v1/;

/ {
    /* 
     * 根节点：描述整个硬件平台
     * 必须包含 model、compatible、memory 等基本信息
     */
	......
};
```



## -2- 设备树的子节点

子节点是根节点的子项，用于描述具体的硬件设备或设备集合。子节点采用特定的格式来表示

```dts
[label:] node-name[@unit-address] {
    [properties definitions]
    [child nodes]
};
```

* label 节点别名（小名）：是可选项。
* node-name 节点名称（大名）：在设备树中是唯一且必不可少的。
* @unit-address 单元地址：单元地址用于标识设备的实例。它可以是一个整数、一个十六进制值或一个字符串，具体取决于设备的要求。**对于驱动来说此部分没有实际意义**，只是为了代码更易读，所以也是可选项。它最主要的功能是区分名称相同的节点。
* properties definitions 属性定义：属性定义是一组键值对，用于描述设备的配置和特性。属性可以根据设备的需求进行定义，例如寄存器地址、中断号、时钟频率等。
* child node 子节点：子节点是当前节点的子项，用于进一步描述硬件设备的子组件或配置。子节点可以包含自己的属性定义和更深层次的子节点，形成设备树的层次结构。



## -3- reg属性

`reg` 属性是设备树（Device Tree）中**最核心、最常用的属性之一**，用于描述一个设备在父总线地址空间中的**资源位置和大小**，通常是**寄存器的基地址和长度**。

```
reg = <address1 length1 [address2 length2 ...]>;
```

**reg 的解析依赖父节点的两个属性：**

| 父节点属性       | 作用                                                       |
| ---------------- | ---------------------------------------------------------- |
| `#address-cells` | 定义子节点 `reg` 中 **地址部分占几个 32 位单元**（cell）   |
| `#size-cells`    | 定义子节点 `reg` 中 **长度部分占几个 32 位单元**父节点属性 |

**特别说明**

- `reg` 描述的是**物理地址**，不是虚拟地址。
- 在 64 位系统中，若地址超过 32 位，需用两个 cell 表示地址（`#address-cells = <2>`）。



## -4- model属性

`model` 属性是设备树（Device Tree）**根节点**（`/`）中的一个标准属性，用于**以人类可读的方式描述硬件平台的型号或产品名称**。

> `model` 属性从语法上可以用于任意节点，但实践中几乎只用于根节点。

- **属性名**：`model`

- **类型**：字符串（`string`）

- **位置**：通常只出现在**根节点**（`/`）中

- **语法**：

    ```
    / {
        model = "Raspberry Pi 4 Model B";
        compatible = "raspberrypi,4-model-b", "brcm,bcm2711";
        ...
    };
    ```



## -5- status属性

`status` 属性是设备树（Device Tree）中一个**非常常用且重要的标准属性**，用于**控制设备是否被操作系统启用**。

- **属性名**：`status`
- **类型**：字符串（`string`）
- **可出现在**：**任何设备节点**（包括根节点、外设节点、总线节点等）
- **作用**：告诉内核该设备当前是否“可用”或“应被驱动绑定”。

**常见取值及含义**

| 值           | 含义                                          | 内核行为                                     |
| ------------ | --------------------------------------------- | -------------------------------------------- |
| `"okay"`     | 设备已启用，正常工作                          | ✅ 加载匹配的驱动                             |
| `"disabled"` | 设备被禁用                                    | ❌ **跳过驱动绑定**（即使 `compatible` 匹配） |
| `"reserved"` | 资源被保留（如由 bootloader 或安全世界使用）  | ❌ 不初始化，避免冲突                         |
| `"fail"`     | 设备探测失败（运行时设置，极少在 DTS 中写死） | 通常用于动态状态                             |

> 🔔 **最常用的是 `"okay"` 和 `"disabled"`**。



## -6- compatible属性

**`compatible` 是 Linux 内核用来匹配设备与驱动程序的核心依据**。它告诉内核：“这个硬件是什么类型，应该用哪个驱动来管理它”。

**基本语法**

```dts
compatible = "manufacturer,device-model", "generic-device-type";
```

- 类型：**字符串** 或 **字符串列表**
- 值按**优先级从高到低**排列
- 必须出现在**需要驱动绑定的设备节点**中（如 UART、I2C、GPIO 控制器等）



**工作原理（内核如何使用）**

当内核遍历设备树时，会对每个节点：

1. 读取其 `compatible` 字符串列表；
2. 按顺序在已注册的驱动中查找匹配项；
3. **第一个匹配成功的驱动将被绑定到该设备**。

> 💡 驱动通过 `of_match_table` 声明自己支持哪些 `compatible` 值。



## -7- 举例

```dts
/dts-v1/;

/ {
    model = "My Embedded Board";
    compatible = "myvendor,myboard";

    soc {
        compatible = "simple-bus";
        #address-cells = <1>;
        #size-cells = <1>;
        ranges;

        /* 子节点：I2C 控制器 */
        i2c0: i2c@1c28000 {
            compatible = "snps,designware-i2c";
            reg = <0x1c28000 0x100>;
            #address-cells = <1>;
            #size-cells = <0>;
            clocks = <&clk 123>;
            status = "okay";

            /* 子子节点（孙子节点）：挂在 I2C 总线上的 EEPROM */
            eeprom@50 {
                compatible = "atmel,24c02";
                reg = <0x50>;           // I2C 设备地址
                pagesize = <16>;        // 自定义属性：页大小
            };

            /* 另一个子子节点：温度传感器 */
            temp-sensor@48 {
                compatible = "ti,tmp102";
                reg = <0x48>;
            };
        };
    };
};
```



# 0x03 特殊节点

## -1- aliases节点

`aliases` 节点是设备树（Device Tree）中的一个**特殊辅助节点**，用于为设备树中的**其他节点定义简短、易记的别名**（alias），方便在内核或用户空间中引用。

- **位置**：通常位于**根节点**（`/`）下

- **作用**：提供“快捷方式”，避免使用冗长的完整路径

- **语法**：

    ```dts
    aliases {
        alias-name = &label;
    };
    ```

    

### 1.为什么需要 `aliases`？

设备树节点的完整路径可能很长，例如：

```
/soc/serial@1c28000
```

如果多个地方需要引用它（如 `chosen` 节点指定控制台），写全路径很麻烦且易错。
 `aliases` 提供了简洁的替代名称。

### 2.典型使用场景

```
/ {
    aliases {
        serial0 = &uart0;   // 定义别名
    };

    chosen {
        stdout-path = "serial0:115200n8";  // 使用别名
    };

    soc {
        uart0: serial@1c28000 {
            compatible = "ns16550a";
            reg = <0x1c28000 0x100>;
        };
    };
};
```

- 内核通过 `stdout-path = "serial0:..."` 知道控制台是 `uart0`。

- 如果没有`aliases`，就得写成：

    ```
    stdout-path = "/soc/serial@1c28000:115200n8";
    ```

    > → 不仅冗长，而且地址硬编码，可移植性差。





## -2- chosen节点

**`chosen` 节点不是用来描述硬件的，而是用于在 Bootloader（如 U-Boot）和 Linux 内核之间传递启动时的配置信息**。它是一个**特殊的、约定俗成的通信接口**。

### **1.基本定义**

- **位置**：必须位于**根节点**（`/`）下
- **是否描述硬件**？ ❌ **否！**
- **是否会被内核解析**？ ✅ **是！**
- **典型内容**：启动参数、控制台设备、初始内存等

```dts
/ {
    chosen {
        bootargs = "console=ttyS0,115200 root=/dev/mmcblk0p2";
        stdout-path = "serial0:115200n8";
    };
};
```

### 2.关键属性解析

**`bootargs`**（最常用）

- **作用**：向内核传递**命令行参数**（command line）

- **等效于**：x86 上的 `GRUB_CMDLINE_LINUX`

- **示例**：

    ```dts
    bootargs = "console=ttyS0,115200 earlyprintk rootwait root=/dev/mmcblk0p2 rw";
    ```

- **注意**：

    - 如果 Bootloader（如 U-Boot）在启动时**动态设置了 `bootargs`**，它会**覆盖** DTS 中的值。
    - DTS 中的 `bootargs` 通常作为**默认值或备用值**。

---

**`stdout-path`**

- **作用**：指定**内核早期打印**（early console）

- **格式**：`"alias-or-path[:options]"`

- **依赖 `aliases` 节点**（推荐用别名）：

    ```dts
    aliases {
        serial0 = &uart0;
    };
    chosen {
        stdout-path = "serial0:115200n8";
    };
    ```

- 支持选项：波特率、数据位、校验等（如 `115200n8`）

> 💡 这是 ARM 嵌入式系统实现串口输出的关键！

---

**`linux,initrd-start` / `linux,initrd-end`**（较少见）

- 用于传递 initramfs/initrd 的内存地址（当 Bootloader 加载了 initrd 但未通过 ATAGS 传递时）。

---

**`kaslr-seed`**（安全相关）

- 为内核地址空间布局随机化（KASLR）提供种子。

---



## -3- device_type属性

`device_type` 是设备树（Device Tree）中的一个**历史遗留属性**，主要用于 **PowerPC 和早期 Open Firmware（IEEE 1275）系统**，在现代 ARM/Linux 系统中**基本已被弃用**。

### 1. 基本定义

- **属性名**：`device_type`
- **类型**：字符串（`string`）
- **原始用途**：标识设备的**通用类别**（如 `"cpu"`、`"memory"`、`"serial"` 等）

```dts
memory {
    device_type = "memory";
    reg = <0x80000000 0x40000000>;
};

cpus {
    #address-cells = <1>;
    #size-cells = <0>;

    cpu@0 {
        device_type = "cpu";
        compatible = "arm,cortex-a9";
        reg = <0>;
    };
};
```



## -4- 自定义属性

在设备树（Device Tree）中，**自定义属性**（Custom Properties）是开发者根据具体硬件或驱动需求**自行定义的属性**，用于传递标准属性无法表达的配置信息。

Linux 内核和设备树规范**允许并鼓励合理使用自定义属性**，只要驱动能正确解析它们。

### 1. 为什么需要自定义属性？

标准属性（如 `compatible`、`reg`、`interrupts`）只能描述通用硬件特征。但实际项目中常有**特殊需求**，例如：

- LED 的默认亮灭状态
- 传感器的校准参数
- 引脚复用的私有配置
- 厂商特定的寄存器初始值

这时就需要自定义属性。



### 2.命名规范（非常重要！）

为避免冲突，**自定义属性必须加厂商前缀**

```dts
myvendor,led-active-low = <1>;
myvendor,sensor-calibration = [01 02 03];
```

> ✅ **格式**：`<vendor-prefix>,<property-name>`
>  ❌ 禁止：直接写 `active-low`（可能与未来标准属性冲突）



### 3.常见数据类型与语法

| 类型             | DTS 语法         | C 驱动读取函数                    |
| ---------------- | ---------------- | --------------------------------- |
| **32位整数**     | `<123>`          | `of_property_read_u32()`          |
| **布尔值**       | `<1>` 或省略值   | `of_property_read_bool()`         |
| **字符串**       | `"hello"`        | `of_property_read_string()`       |
| **字节数组**     | `[01 02 ab cd]`  | `of_property_read_u8_array()`     |
| **字符串数组**   | `"red", "green"` | `of_property_read_string_array()` |
| **phandle 引用** | `<&gpio1>`       | `of_parse_phandle()`              |

### 4.实际示例

#### 示例 1：自定义 LED 行为
```dts
backlight-led {
    compatible = "myvendor,bl-ctrl";
    myvendor,max-brightness = <255>;
    myvendor,default-on = <1>;        // 布尔：开机默认亮
    myvendor,pwm-channel = <2>;
};
```

驱动读取：
```c
u32 brightness;
bool default_on;

of_property_read_u32(np, "myvendor,max-brightness", &brightness);
default_on = of_property_read_bool(np, "myvendor,default-on");
```

#### 示例 2：传感器校准数据
```dts
temperature-sensor@48 {
    compatible = "myvendor,temp-sensor-v2";
    reg = <0x48>;
    myvendor,calibration-data = [0a 14 28]; // 10, 20, 40 (十进制)
};
```

驱动读取：
```c
u8 cal[3];
of_property_read_u8_array(np, "myvendor,calibration-data", cal, 3);
```

#### 示例 3：引用其他节点（phandle）
```dts
my-device {
    compatible = "myvendor,custom-dev";
    myvendor,gpio-reset = <&gpio2 12 GPIO_ACTIVE_LOW>;
};
```

驱动读取：
```c
struct gpio_desc *reset_gpio;
reset_gpio = gpiod_get_from_of_node(np, "myvendor,gpio-reset", 0, GPIOD_OUT_LOW, "reset");
```

