# 0x00 ARM的中断触发流程

在 **ARM32（ARMv7-A 架构）Linux 系统**下，中断处理流程是硬件（ARM CPU + GIC/中断控制器）与 Linux 内核软件协同工作的结果。以下是完整的中断从触发到处理的详细流程：

---

## 一、硬件基础：ARM32 + 中断控制器（如 GIC）

- ARM32 支持两类物理中断信号：
  - **IRQ（Interrupt ReQuest）**：普通中断
  - **FIQ（Fast Interrupt ReQuest）**：高优先级快速中断（Linux 通常只使用 IRQ）
- 大多数 SoC 使用 **GIC（Generic Interrupt Controller）** 或厂商定制中断控制器（如 PL190、TZIC 等），但 Linux 通过统一的 **IRQ Domain / irqchip** 抽象层屏蔽差异。

---

## 二、中断触发到 CPU 响应（硬件阶段）

1. **外设触发中断** 
   
   如 UART 接收到数据，拉高其连接到 GIC 的中断线。
   
2. **GIC 接收并仲裁中断**  
   - GIC 将中断编号（HW IRQ number）与优先级、目标 CPU 等信息匹配。
   - 若目标 CPU 的 IRQ 未被屏蔽（CPSR.I = 0），GIC 向该 CPU 发送 IRQ 信号。

3. **CPU 响应 IRQ**  
   - ARM32 在检测到 IRQ 信号且 CPSR.I=0 时，自动：
     - 切换到 **IRQ 模式（Mode = 0b10010）**
     - 禁止进一步 IRQ（CPSR.I 自动置 1）
     - 将当前 PC+4 保存到 **LR_irq**
     - 跳转到 **异常向量表** 的 `0x18` 地址（即 `vector_irq`）

> 注：ARM32 异常向量表默认位于 `0x00000000` 或 `0xffff0000`（high vectors），由内核启动时配置。

---

## 三、Linux 内核入口：汇编级中断处理（arch/arm/kernel/entry-armv.S）

1. **跳转到 `__vectors_start + 0x18` → `vector_irq`**  
   - 这是一个跳板，最终跳转到 **`__irq_svc`**（若从中断返回到 SVC 模式，即内核态）或 **`__irq_usr`**（若从中断用户态）。

2. **保存上下文**  
   - 将寄存器（r0–r12、lr 等）压入当前栈（内核栈，因为中断只能发生在内核态或陷入内核后）。
   - 注意：ARM32 的 IRQ 模式有自己的 `r13 (sp)` 和 `r14 (lr)`，但 Linux 会尽快切换到 SVC 模式使用内核栈。

3. **调用 C 函数 `irq_handler`**  
   - 最终调用 `asm_do_IRQ()`（旧版本）或直接进入通用中断处理框架（新版本使用 `gic_handle_irq()` 等）。

---

## 四、C 语言级中断处理（通用中断子系统）

### 1. **获取硬件中断号（hwirq）**
- 通过读取中断控制器寄存器（如 GIC 的 `GICC_IAR`）获得 **硬件中断 ID**。
  ```c
  // 例如 GICv2
  unsigned int irqstat = readl_relaxed(gic_cpu_base + GIC_CPU_INTACK);
  irqnr = irqstat & 0x3ff;  // 提取中断号
  ```

### 2. **映射到 Linux 虚拟中断号（virq）**
- 使用 **IRQ Domain** 机制将 hwirq 转换为内核使用的 **虚拟 IRQ 号（virq）**。
  ```c
  unsigned int virq = irq_find_mapping(domain, hwirq);
  ```

### 3. **调用通用中断处理函数：`generic_handle_irq(virq)`**
- 该函数查找 `irq_desc[virq]`（中断描述符），并调用其 `handle_irq` 回调。

---

## 五、高层中断处理：流控与设备驱动

Linux 为不同中断类型提供不同的 **流控处理函数（IRQ flow handler）**：

| 流控类型             | 用途                                    |
| -------------------- | --------------------------------------- |
| `handle_level_irq`   | 电平触发中断（需在处理完后 ack 控制器） |
| `handle_edge_irq`    | 边沿触发中断                            |
| `handle_fasteoi_irq` | 支持 EOI 延后的控制器（如 GIC）         |

### 典型流程（以 GIC + `handle_fasteoi_irq` 为例）：

1. **Mask（可选）**：某些控制器需要先 mask 中断（GIC 通常不需要）。
2. **Ack / 获取中断号**：已在底层完成。
3. **遍历 action 链表**：  
   - `irq_desc[virq]->action` 是一个链表，包含所有注册到该中断的设备驱动处理函数（`request_irq()` 注册）。
   - 依次调用每个 `action->handler(irq, dev_id)`。
4. **发送 EOI（End of Interrupt）**：  
   - 向 GIC 的 `GICC_EOIR` 写回原始中断号，允许同优先级中断再次触发。
5. **Unmask（若之前 masked）**

> 对于 GIC，由于支持 **priority drop + EOI**，通常使用 `handle_fasteoi_irq`，无需提前 mask。

---

## 六、中断下半部（Bottom Half）

为减少关中断时间，驱动通常只在上半部做最小化处理（如读状态、ack、调度下半部），然后通过以下机制延迟处理：

- **Softirq**（如网络收包 `NET_RX_SOFTIRQ`）
- **Tasklet**（基于 softirq）
- **Workqueue**（进程上下文，可睡眠）

---

## 七、关键数据结构

| 结构               | 作用                                                       |
| ------------------ | ---------------------------------------------------------- |
| `struct irq_desc`  | 每个 virq 对应一个，包含流控函数、action 链表、chip 指针等 |
| `struct irq_chip`  | 描述中断控制器操作（mask/unmask/eoi 等）                   |
| `struct irqaction` | 驱动注册的中断处理函数（handler）、设备名、flags 等        |
| `irq_domain`       | hwirq ↔ virq 映射域                                        |

---

## 八、典型调用栈（简化）

```
Hardware IRQ
  ↓
ARM vector_irq (0x18)
  ↓
__irq_svc (entry-armv.S)
  ↓
gic_handle_irq()        // arch/arm/common/gic.c
    → read GICC_IAR → get hwirq
    → irq_find_mapping() → virq
    → generic_handle_irq(virq)
      ↓
handle_fasteoi_irq()    // kernel/irq/chip.c
  → action->handler()   // 驱动注册的中断处理函数（如 serial8250_interrupt）
    → maybe raise softirq / schedule work
  → chip->irq_eoi()     // gic_eoi_irq → write GICC_EOIR
  ↓
eret / restore context
```

---

## 九、补充说明

- **中断嵌套**：ARM32 默认进入 IRQ 后自动关 IRQ，因此 **不支持嵌套**。若需嵌套，必须手动开 IRQ（Linux 一般不这么做）。
- **抢占**：中断处理期间不可被其他任务抢占，但可被更高优先级中断（如 FIQ）打断（若启用）。
- **SMP 支持**：GIC 可将中断定向到特定 CPU，Linux 使用 `irq_set_affinity()` 控制。



# 0x01 中断子系统启动流程

> - 查看 `start_kernel()` → `init_IRQ()`（位于 `kernel/irq/manage.c` 或架构特定的 `arch/*/kernel/irq.c`）
> - ARM32 中：`init_IRQ()` 调用 `machine_desc->init_irq()`（由板级文件提供，如 `arch/arm/mach-xxx/`）
> - ARM64 中：使用 Device Tree + irqchip 驱动自动探测（无需 machine_desc）



在 Linux 内核（以 NXP 提供的 **Linux Kernel 5.15**，基于 **lf-5.15.y** 分支）中，针对 **i.MX6ULL（ARM32 + GICv2）** 平台，中断子系统的初始化流程是一个典型的 **设备树驱动 + GIC 驱动 + 中断核心层** 协同工作的过程。以下是详细初始化流程说明：

---

## 一、整体架构概览

i.MX6ULL 使用 **ARM Cortex-A7** 核心，其内建 **GIC-400**（即 GICv2 架构）。中断系统包含：

- **GIC Distributor (GICD)**：全局中断分发器
- **GIC CPU Interface (GICC)**：每个 CPU 核心的接口
- **外设中断源**（如 UART、GPIO、I2C 等）通过 **SPI（Shared Peripheral Interrupt）** 连接到 GIC
- **PPI（Private Peripheral Interrupt）** 用于核私有外设（如 Timer）
- **SGI（Software Generated Interrupt）**

Linux 中断子系统由以下部分组成：

- **IRQ Core（通用中断核心）**
- **GIC 驱动（drivers/irqchip/irq-gic.c）**
- **设备树（Device Tree）描述中断控制器和外设中断映射**
- **arch/arm/kernel/irq.c** 提供 ARM 架构特定入口

---

## 二、初始化流程详解（按执行顺序）

### 1. **内核启动早期：setup_arch() → init_IRQ()**

在 `start_kernel()` → `setup_arch()` → `init_IRQ()` 被调用。

```c
// arch/arm/kernel/irq.c
void __init init_IRQ(void)
{
    if (IS_ENABLED(CONFIG_OF) && !machine_desc->init_irq)
        irqchip_init();  // 使用设备树方式初始化中断控制器
    else
        machine_desc->init_irq(); // 旧式板级初始化（i.MX6ULL 不使用）
}
```

由于 i.MX6ULL 使用设备树，`machine_desc->init_irq` 为 NULL，因此调用 **`irqchip_init()`**。

---

### 2. **irqchip_init()：遍历设备树中的 interrupt-controller**

```c
// drivers/irqchip/irqchip.c
void __init irqchip_init(void)
{
    of_irq_init(__irqchip_of_table);
}
```

`__irqchip_of_table` 是一个由 `IRQCHIP_DECLARE()` 宏生成的表，其中包含所有支持的中断控制器驱动（包括 GIC）。

对于 GICv2，注册如下：

```c
// drivers/irqchip/irq-gic.c
IRQCHIP_DECLARE(gic_400, "arm,cortex-a7-gic", gic_of_init);
IRQCHIP_DECLARE(arm_gic_400, "arm,gic-400", gic_of_init);
```

i.MX6ULL 的设备树中通常包含：

```dts
interrupt-controller@00a01000 {
    compatible = "arm,cortex-a7-gic";
    ...
};
```

因此匹配到 `gic_of_init` 函数。

---

### 3. **gic_of_init()：GIC 驱动初始化**

```c
// drivers/irqchip/irq-gic.c
int __init gic_of_init(struct device_node *node, struct device_node *parent)
```

主要步骤：

#### a. 映射 GIC 寄存器（Distributor + CPU Interface）

- 从设备树读取 reg 属性：
  - 第一段：GIC Distributor 基地址（如 0x00A01000）
  - 第二段：GIC CPU Interface 基地址（如 0x00A02000）

- 使用 `of_iomap()` 映射到内核虚拟地址

#### b. 调用 `gic_init_bases()` 初始化 GIC 实例

```c
gic_init_bases(gic, ...);
```

关键操作包括：

- 分配 `struct gic_chip_data`
- 设置 `gic->domain = irq_domain_add_linear(...)`  
  → 创建一个 **线性 IRQ Domain**，将硬件中断号（hwirq）映射到 Linux 虚拟 IRQ 号（virq）
- 注册 GIC 的 `irq_chip` 操作集（如 mask/unmask/eoi 等）
- 调用 `set_handle_irq(gic_handle_irq)`  
  → 设置 **主中断处理入口函数**（汇编跳转到 C 的桥梁）

> 注意：`gic_handle_irq()` 是 ARM 异常向量表中 IRQ 入口最终跳转的 C 函数。

#### c. 初始化 CPU 接口（per-CPU）

- 在 `gic_cpu_init()` 中：
  - 使能 GICC（CPU Interface）
  - 设置优先级掩码（通常允许所有优先级）
  - 使能 Banked PPI 和 SGI

#### d. 初始化 Distributor（全局）

- 在 `gic_dist_init()` 中：
  - 使能 Distributor
  - 禁用所有 SPI 中断（初始状态）
  - 设置默认目标 CPU（通常是 CPU0）
  - 配置中断类型（电平/边沿）——但具体配置由外设驱动在 request_irq 时完成

---

### 4. **中断域（IRQ Domain）建立**

- GIC 驱动创建一个 **linear IRQ domain**，例如：
  - hwirq 32~127（SPI） → virq 32~127（假设无其他中断控制器）
- 外设在设备树中声明中断，如：

```dts
uart1: serial@021e8000 {
    compatible = "fsl,imx6ul-uart", "fsl,imx21-uart";
    interrupts = <GIC_SPI 26 IRQ_TYPE_LEVEL_HIGH>;
};
```

- 当驱动调用 `platform_get_irq()` 或 `irq_of_parse_and_map()` 时：
  - 解析设备树中断属性
  - 调用 `irq_create_mapping(domain, hwirq)`
  - 返回对应的 **virq**

---

### 5. **外设驱动请求中断**

例如 UART 驱动：

```c
int irq = platform_get_irq(pdev, 0);
request_irq(irq, imx_uart_rxint, IRQF_TRIGGER_HIGH, "imx-uart", sport);
```

此时：
- `request_irq()` 会设置该 virq 的 handler
- 调用 GIC 的 `.irq_unmask()` 使能对应 SPI
- 设置触发类型（通过 `.irq_set_type()`）

---

## 三、关键数据结构

| 结构                   | 作用                                             |
| ---------------------- | ------------------------------------------------ |
| `struct irq_desc`      | 每个 virq 对应一个，包含 handler、action 链等    |
| `struct irq_chip`      | GIC 提供的操作函数集（mask/unmask/eoi/set_type） |
| `struct irq_domain`    | hwirq ↔ virq 映射域                              |
| `struct gic_chip_data` | GIC 驱动私有数据（寄存器基址、CPU mask 等）      |

---

## 四、中断处理流程（简要）

1. 外设触发中断 → GIC Distributor 接收
2. GIC 将中断转发给 CPU Interface
3. CPU 跳转到异常向量 `vector_irq`（汇编）
4. 调用 `__irq_svc` → `gic_handle_irq()`
5. `gic_handle_irq()` 读取 GICC_IAR 获取 hwirq
6. 通过 domain 映射到 virq
7. 调用 `generic_handle_irq(virq)`
8. 执行注册的中断 handler（如 UART RX handler）

---

## 五、i.MX6ULL 特殊点

- i.MX6ULL 的 GIC 是标准 Cortex-A7 GIC-400，无需额外 patch
- 所有外设中断均为 **SPI（32~127）**
- PPI 包括：
  - 27: Virtual Timer
  - 29: Global Timer（若启用）
  - 30: Private Timer（若启用）

---

## 六、参考代码路径（Linux 5.15）

- `arch/arm/kernel/irq.c`
- `drivers/irqchip/irq-gic.c`
- `drivers/irqchip/irqchip.c`
- `kernel/irq/`（核心层）
- 设备树：`arch/arm/boot/dts/imx6ull.dtsi`

---

## 总结流程图（文字版）

```
start_kernel()
 └─ setup_arch()
     └─ imx6ul_init_irq()
         └─ irqchip_init()
             └─ of_irq_init() → 匹配 "arm,cortex-a7-gic"
                 └─ gic_of_init()
                     ├─ ioremap GICD/GICC
                     ├─ gic_init_bases()
                     │   ├─ irq_domain_add_linear()
                     │   ├─ set_handle_irq(gic_handle_irq)
                     │   └─ 注册 irq_chip
                     ├─ gic_dist_init()  // 全局初始化
                     └─ gic_cpu_init()   // per-CPU 初始化
```

之后，外设驱动通过设备树获取 virq，并调用 `request_irq()` 完成中断注册。

---



# 0x02 

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 阶段 1: 内核启动 - 中断子系统初始化                                          	│
└─────────────────────────────────────────────────────────────────────────────┘

start_kernel()
    │
    └──> init_IRQ()  [arch/arm/kernel/irq.c]
             │
             └──> irqchip_init()  [mach-imx6ul.c:52]
                      │
                      └──> of_irq_init(__irqchip_of_table)
                               │
                               └──> gic_of_init()  [irq-gic.c:1511]
                                        │
                                        └──> __gic_init_bases()
                                                 │
                                                 └──> irq_domain_create_linear()
                                                      │
                                                      └──> 创建 irq_domain
                                                           │
                                                           └──> 分配 radix tree / linear 数组
                                                                (用于存储 hwirq → virq 映射)
                                                                
注意：此时只是创建了 irq_domain 结构，还没有建立具体的 hwirq → virq 映射！


┌─────────────────────────────────────────────────────────────────────────────┐
│ 阶段 2: 设备树解析 - 建立 virq 和 hwirq 的映射关系                            	│
└─────────────────────────────────────────────────────────────────────────────┘

of_platform_default_populate()  [mach-imx6ul.c:42]
    │
    └──> 遍历设备树中的所有设备节点
             │
             └──> of_platform_device_create()
                      │
                      └──> 平台设备注册
                               │
                               └──> 设备驱动 probe()
                                        │
                                        └──> 例如：平台设备驱动调用
                                                 │
                                                 └──> platform_get_irq()
                                                          │
                                                          └──> of_irq_get()
                                                                   │
                                                                   └──> of_irq_parse_one()
                                                                        (解析设备树 interrupts 属性)
                                                                   │
                                                                   └──> irq_create_of_mapping()
                                                                            │
                                                                            └──> irq_create_fwspec_mapping()
                                                                                     │
                                                                                     └──> irq_domain_alloc_irqs()  [层级模式]
                                                                                              │
                                                                                              └──> gic_irq_domain_alloc()
                                                                                                       │
                                                                                                       ├──> gic_irq_domain_translate()
                                                                                                       │    (解析 hwirq)
                                                                                                       │
                                                                                                       └──> gic_irq_domain_map()
                                                                                                            │
                                                                                                            ├──> irq_domain_set_info()
                                                                                                            │    └──> 设置 irq_data->hwirq
                                                                                                            │    └──> 设置 irq_data->chip
                                                                                                            │    └──> 设置处理函数
                                                                                                            │
                                                                                                            └──> irq_set_probe()
                                                                                                                 │
                                                                                                                 └──> __irq_alloc_descs()
                                                                                                                      │
                                                                                                                      └──> 分配 irq_desc 内存空间
                                                                                                                           │
                                                                                                                           └──> 建立 virq → irq_desc 的映射


┌─────────────────────────────────────────────────────────────────────────────┐
│ 阶段 3: 驱动请求中断 - 注册中断处理函数                                       │
└─────────────────────────────────────────────────────────────────────────────┘

驱动程序 probe()
    │
    └──> request_irq(irq, handler, flags, name, dev_id)
             │
             └──> __setup_irq()  [kernel/irq/manage.c:1490]
                      │
                      ├──> 检查 irq_desc 是否已存在
                      │    (在阶段 2 中已分配)
                      │
                      ├──> 创建 irqaction 结构体
                      │    └──> 存储 handler、dev_id、name 等
                      │
                      ├──> 将 irqaction 添加到 irq_desc->action 链表
                      │
                      ├──> 调用 irq_request_resources() (如果存在)
                      │
                      └──> 启用中断
                           └──> __enable_irq()


┌─────────────────────────────────────────────────────────────────────────────┐
│ 关键数据结构关系图                                                           │
└─────────────────────────────────────────────────────────────────────────────┘

                    ┌─────────────────┐
                    │   irq_desc      │  ← 阶段 2 分配
                    │   - irq         │
                    │   - depth       │
                    │   - wake_depth  │
                    │   - irq_data    │
                    │   - action      │  ← 阶段 3 设置
                    │   - ...         │
                    └────────┬────────┘
                             │
                             │ irq_data
                             ▼
                    ┌─────────────────┐
                    │   irq_data      │
                    │   - hwirq       │  ← 硬件中断号 (阶段 2 设置)
                    │   - domain      │  ← irq_domain 指针
                    │   - chip        │  ← gic_chip (阶段 2 设置)
                    │   - chip_data   │
                    │   - ...         │
                    └────────┬────────┘
                             │
                             │ domain
                             ▼
                    ┌─────────────────┐
                    │  irq_domain     │
                    │   - ops         │  ← gic_irq_domain_ops
                    │   - host_data   │  ← gic_chip_data
                    │   - radix_tree  │  ← hwirq → irq_data 映射
                    │   - ...         │
                    └─────────────────┘

                    ┌─────────────────┐
                    │   irqaction     │  ← 阶段 3 创建
                    │   - handler     │  ← 驱动的中断处理函数
                    │   - dev_id      │  ← 驱动的私有数据
                    │   - name        │  ← 中断名称
                    │   - next        │  ← 链表 (支持共享中断)
                    └─────────────────┘
```
