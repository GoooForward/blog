---
title: STM32学习笔记4——GPIO
date: 2024-11-04 21:39:00
updated: 2024-11-04 23:25:42
hide: false
tags: stm32
categories: 学习
---

# 0x00 Reference



# 0x01 GPIO简介

GPIO(General Purpose Input Output)，即通用输入输出端口，负责采集外部器件的信息或者控制外部器件工作，即输入输出

## 1-1 GPIO特点

1. 不同型号，IO口数量可能不一样，可通过选型手册快速查询

2. 快速翻转，每次翻转最快只需要两个时钟周期（F1最高速度可以到50Mhz）

3. 每个IO口都可以做中断

4. 支持8种工作模式

## 1-2 GPIO电气特性

1. STM32工作电压范围?

    > 2V ~ 3.6V

1. GPIO识别电压范围？

    > COMS端口：-0.3V ≤ V(IL) ≤ 1.164V ，1.833V ≤ V(IH) ≤ 3.6V
    
    > TLL端口（FT标记）:兼容5V
3. GPIO输出电流?

    > 单个IO，最大25mA

## 1-3 GPIO引脚分布类型

1. 电源引脚

2. 晶振引脚

3. 复位引脚

4. 下载引脚

5. BOOT引脚

6. GPIO引脚

# 0x02 IO端口基本结构介绍

![image.png](https://cdn.jsdelivr.net/gh/GoooForward/picture@main/note-image/image%202.png)

> ① 保护二极管 
>
> 保证了引脚只有在Vss到Vdd之间的电压信号才能传入IO端口内部
>
> ② 内部上拉、下拉电阻（30k~50k欧 )
>
> 用来设置IO口默认电平
>
> ③ 施密特触发器
>
> 用来整形输入电路
>
> ④ P-MOS & N-MOS管
>
> 用来控制输出电平

## 2-1 施密特触发器简介

施密特触发器就是一种整形电路，可以将非标准方波，整形成方波

![image.png](https://cdn.jsdelivr.net/gh/GoooForward/picture@main/note-image/image%203.png)

**特点：**

- 当输入电压高于正向阈值电压，输出为高；

- 当输入电压低于负向阈值电压，输出为低；

- 当输入在正负向阈值电压之间，输出不改变。

**作用：整形！如正弦波转方波**

## 2-2 P-MOS & N-MOS管简介

MOS管是压控型元件，通过控制栅源电压（ Vgs ）来实现导通或关闭。

![image.png](https://cdn.jsdelivr.net/gh/GoooForward/picture@main/note-image/image%204.png)



![image.png](https://cdn.jsdelivr.net/gh/GoooForward/picture@main/note-image/image%205.png)

> G：栅极 
> S：源极 
> D：漏极

> P-MOS：Vgs<0，导通 
> N-MOS：Vgs>0，导通

# 0x03 GPIO的八种模式

![image.png](https://cdn.jsdelivr.net/gh/GoooForward/picture@main/note-image/image%206.png)

## 3-1 输入浮空

![image-20241104222755793](https://cdn.jsdelivr.net/gh/GoooForward/picture@main/note-image/image-20241104222755793.png)

> ①上拉电阻关闭 
> ②下拉电阻关闭 
> ③施密特触发器打开 
> ④双MOS管不导通

**特点：空闲时，IO状态不确定，由外部环境决定，可以用于按键检测等场景**

## 3-2 输入上拉

![image-20241104222906176](https://cdn.jsdelivr.net/gh/GoooForward/picture@main/note-image/image-20241104222906176.png)

> ①上拉电阻打开 
> ②下拉电阻关闭 
> ③施密特触发器打开 
> ④双MOS管不导通

**特点：空闲时，IO呈现高电平；由于内部上拉电阻阻值大，电流小，不适合做驱动**

## 3-3 输入下拉

![image-20241104223039869](https://cdn.jsdelivr.net/gh/GoooForward/picture@main/note-image/image-20241104223039869.png)

> ①上拉电阻关闭 
> ②下拉电阻打开 
> ③施密特触发器打开 
> ④双MOS管不导通 

**特点：空闲时，IO呈现低电平，同输入上拉一样，不适合做电流型驱动**

## 3-4 模拟功能

![image-20241104223126451](https://cdn.jsdelivr.net/gh/GoooForward/picture@main/note-image/image-20241104223126451.png)

> ①上拉电阻关闭 
> ②下拉电阻关闭 
> ③施密特触发器关闭
> ④双MOS管不导通 

**特点：专门用于模拟信号输入或输出，如：ADC和DAC**

## 3-5 开漏输出

![image.png](https://cdn.jsdelivr.net/gh/GoooForward/picture@main/note-image/image%2011.png)

> ①上拉电阻关闭 
> ②下拉电阻关闭 
> ③施密特触发器打开 
> ④P-MOS管始终不导通 
> ⑤往ODR对应位写0，N-MOS管导通，写1则N-MOS管不导通的

**特点：**

1. **内部只能输出低电平Vss和高阻态，输出高电平需要外部上拉电阻**
2. **施密特触发器打开，可以读取IO口的电平状态**

## 3-6 开漏式复用功能

![image.png](https://cdn.jsdelivr.net/gh/GoooForward/picture@main/note-image/image%2012.png)

> ①上拉电阻关闭 
> ②下拉电阻关闭 
> ③施密特触发器打开 
> ④ P-MOS管始终不导通

**特点： **

1. **不能输出高电平， 必须有外部（或内部），上拉才能输出高电平**

2. **由其他外设控制输出**

## 3-7 推挽输出

![image-20241104223753436](https://cdn.jsdelivr.net/gh/GoooForward/picture@main/note-image/image-20241104223753436.png)

> ①上拉电阻关闭 
> ②下拉电阻关闭 
> ③施密特触发器打开 
> ④往ODR对应位写0，N-MOS管导通，写1则P-MOS管导通 

**特点：**

1. **可输出高低电平，驱动能力强**
2. **P-MOS和N-MOS只能同时有一个导通**
3. **施密特触发器打开，可以读取IO输入电平**

## 3-8 推挽式复用功能

![image.png](https://cdn.jsdelivr.net/gh/GoooForward/picture@main/note-image/image%2014.png)

> ①上拉电阻关闭 
> ②下拉电阻关闭 
> ③施密特触发器打开

**特点：**

1. **可输出高低电平，驱动能力强 **

2. **由其他外设控制输出**

# 0x04 GPIO寄存器介绍

STM32F1 **每组** 通用 GPIO 口有 7 个 32 位寄存器控制，包括 ：
2 个 32 位端口配置寄存器（CRL 和 CRH）
2 个 32 位端口数据寄存器（IDR 和 ODR）
1 个 32 位端口置位/复位寄存器（BSRR）
1 个 16 位端口复位寄存器（BRR）
1 个 32 位端口锁定寄存器 (LCKR)

## 4-1 端口配置低寄存器（GPIOx_CRL）

![image.png](https://cdn.jsdelivr.net/gh/GoooForward/picture@main/note-image/image%2015.png)

## 4-2 **端口配置高寄存器（GPIOx_CRH）**

![image.png](https://cdn.jsdelivr.net/gh/GoooForward/picture@main/note-image/image%2016.png)

## 4-3 **工作模式配置补充**

![image.png](https://cdn.jsdelivr.net/gh/GoooForward/picture@main/note-image/image%2017.png)



## 4-4 端口输入数据寄存器（GPIOx_IDR)

用于读取IO引脚输入的电平

![image.png](https://cdn.jsdelivr.net/gh/GoooForward/picture@main/note-image/image%2018.png)

## 4-5 端口输出数据寄存器（GPIOx_ODR）

该寄存器用于控制 GPIOx 的输出高电平或者低电平

![image-20241104224320179](https://cdn.jsdelivr.net/gh/GoooForward/picture@main/note-image/image-20241104224320179.png)

## 4-6 **端口位设置/清除寄存器（GPIOx_BSRR）**

用于设置ODR寄存器

![image.png](https://cdn.jsdelivr.net/gh/GoooForward/picture@main/note-image/image%2019.png)

## **4-6 ODR和BSRR寄存器控制输出有什么区别？**

首先 BSRR 是只写权限，而 ODR 是可读可写权限。BSRR 寄存器 32 位有效，对于低 16 位，我们往相应的位写 1，那么对应的 IO 口会输出高电平，往相应的位写 0，对 IO 口没有任何影响，高16位作用刚好相反，对相应的位写 1会输出低电平，写 0没有任何影响。

也就是说，对于BSRR寄存器，你写 0 的话，对 IO 口电平是没有任何影响的。我们要设置某个 IO 口电平，只需要相关位设置为 1 即可。而 ODR 寄存器，我们要设置某个 IO 口电平，我们首先需要读出来 ODR 寄存器的值，然后对整个 ODR 寄存器重新赋值来达到设置某个或者某些 IO 口的目的，而 BSRR 寄存器直接设置即可，这在多任务实时操作系统中作用很大。BSRR寄存器还有一个好处，就是 BSRR 寄存器改变引脚状态的时候，不会被中断打断，而 ODR 寄存器有被中断打断的风险。

**总的来说，建议使用BSRR寄存器控制输出！**

# 0x05 通用外设驱动模型（四步法）

![image.png](https://cdn.jsdelivr.net/gh/GoooForward/picture@main/note-image/image%2021.png)

# 0x06 GPIO配置步骤

## 6-1 配置步骤

1. 使能时钟 __HAL_RCC_GPIOx_CLK_ENABLE()

2. 设置工作模式 HAL_GPIO_Init()

3. 设置输出状态（可选） HAL_GPIO_WritePin()、HAL_GPIO_TogglePin()

4. 读取输入状态（可选） HAL_GPIO_ReadPin()

## 6-2 相关HAL库函数简介

![image.png](https://cdn.jsdelivr.net/gh/GoooForward/picture@main/note-image/image%2022.png)

HAL 库中关于 GPIO 的驱动程序在 `stm32f1xx_hal_gpio.c` 文件以及其对应的头文件。

### 6.2.1 HAL_GPIO_Init

**初始化GPIO口**

```c
void HAL_GPIO_Init(GPIO_TypeDef  *GPIOx, GPIO_InitTypeDef *GPIO_Init)
```

* 第一个入口参数是GPIOx，实际上就是对应的GPIO寄存器组的基地址

    ```c
    #define GPIOA               ((GPIO_TypeDef *)GPIOA_BASE)
    #define GPIOB               ((GPIO_TypeDef *)GPIOB_BASE)
    #define GPIOC               ((GPIO_TypeDef *)GPIOC_BASE)
    #define GPIOD               ((GPIO_TypeDef *)GPIOD_BASE)
    #define GPIOE               ((GPIO_TypeDef *)GPIOE_BASE)
    ```

* 第二个入口参数是一个结构体指针，其描述了GPIO组下的各引脚的功能

    ```c
    //define in stm32f1xx_hal_gpio.h
    typedef struct 
    { 
      uint32_t Pin;        /* 引脚号 */ 
      uint32_t Mode;       /* 模式设置 */ 
      uint32_t Pull;       /* 上拉下拉设置 */ 
      uint32_t Speed;      /* 速度设置 */ 
    } GPIO_InitTypeDef;
    ```

由CubeMX自动生成的配置GPIO的代码示例如下

```c
  GPIO_InitStruct.Pin = GPIO_PIN_0|GPIO_PIN_1|GPIO_PIN_2|GPIO_PIN_3
                          |GPIO_PIN_4|GPIO_PIN_5|GPIO_PIN_6|GPIO_PIN_7;
  GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP
  GPIO_InitStruct.Pull = GPIO_NOPULL;
  GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;
  HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);
```



### 6.2.2 HAL_GPIO_WritePin

**控制GPIO口输出电平**

```c
void HAL_GPIO_WritePin(GPIO_TypeDef *GPIOx, uint16_t GPIO_Pin, GPIO_PinState PinState)
```

* 第一个入口参数同样是GPIOx，就是对应的GPIO寄存器组的基地址，同上

* 第二个入口参数是GPIO_Pin，是该GPIO组中具体的Pin，可选GPIO_PIN_0到GPIO_PIN_15

    ```c
    //define in stm32f1xx_hal_gpio.h
    #define GPIO_PIN_0                 ((uint16_t)0x0001)  /* Pin 0 selected    */
    #define GPIO_PIN_1                 ((uint16_t)0x0002)  /* Pin 1 selected    */
    #define GPIO_PIN_2                 ((uint16_t)0x0004)  /* Pin 2 selected    */
    #define GPIO_PIN_3                 ((uint16_t)0x0008)  /* Pin 3 selected    */
    #define GPIO_PIN_4                 ((uint16_t)0x0010)  /* Pin 4 selected    */
    #define GPIO_PIN_5                 ((uint16_t)0x0020)  /* Pin 5 selected    */
    #define GPIO_PIN_6                 ((uint16_t)0x0040)  /* Pin 6 selected    */
    #define GPIO_PIN_7                 ((uint16_t)0x0080)  /* Pin 7 selected    */
    #define GPIO_PIN_8                 ((uint16_t)0x0100)  /* Pin 8 selected    */
    #define GPIO_PIN_9                 ((uint16_t)0x0200)  /* Pin 9 selected    */
    #define GPIO_PIN_10                ((uint16_t)0x0400)  /* Pin 10 selected   */
    #define GPIO_PIN_11                ((uint16_t)0x0800)  /* Pin 11 selected   */
    #define GPIO_PIN_12                ((uint16_t)0x1000)  /* Pin 12 selected   */
    #define GPIO_PIN_13                ((uint16_t)0x2000)  /* Pin 13 selected   */
    #define GPIO_PIN_14                ((uint16_t)0x4000)  /* Pin 14 selected   */
    #define GPIO_PIN_15                ((uint16_t)0x8000)  /* Pin 15 selected   */
    #define GPIO_PIN_All               ((uint16_t)0xFFFF)  /* All pins selected */
    ```

* 第三个入口参数PinState是要输出的电平状态，0为低电平，1为高电平

    ```c
    //define in stm32f1xx_hal_gpio.h
    typedef enum
    {
      GPIO_PIN_RESET = 0u,
      GPIO_PIN_SET
    } GPIO_PinState;
    ```

### 6.2.3 HAL_GPIO_ReadPin

**从GPIO中读取IO口电平状态**

```c
GPIO_PinState HAL_GPIO_ReadPin(GPIO_TypeDef *GPIOx, uint16_t GPIO_Pin)
```

* 第一个入口参数同样是GPIOx，就是对应的GPIO寄存器组的基地址，同上
* 第二个入口参数是GPIO_Pin，是该GPIO组中具体的Pin，同上
* **返回值**是枚举类型GPIO_PinState，代表IO口的电平状态，0为低电平，1为高电平，同上

### 6.2.4 HAL_GPIO_TogglePin

**用于设置引脚的电平翻转，调用此函数后，对应的GPIO引脚电平会发生翻转**

```c
void HAL_GPIO_TogglePin(GPIO_TypeDef *GPIOx, uint16_t GPIO_Pin);
```

* 第一个入口参数同样是GPIOx，同上
* 第二个入口参数是GPIO_Pin，是GPIO组中具体的引脚号，同上