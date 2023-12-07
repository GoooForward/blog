---
title: Unix高级环境编程-Chapter03
date: 2023-12-04 11:40:00
updated: {{ date }}
hide: true
tags: Linux
categories: 学习
---



# 0x00 Linux 文件的数据结构

创建进程时，会创建一个task_struct的结构体用来存储进程相关的信息，如下是ChatGPT给出的task_struct的部分内容。其中会包含一个files_struct结构体用来维护进程打开文件信息。

```c
struct task_struct {
    volatile long state;  /* 进程状态，如运行、睡眠等 */
    void *stack;          /* 进程内核栈的基地址 */
    struct task_struct *parent;  /* 父进程的指针 */
    struct list_head children;  /* 子进程链表 */
    struct pid *pid;      /* 进程标识符结构体指针 */
    struct task_struct *real_parent;  /* 实际父进程的指针 */
    struct mm_struct *mm;  /* 进程地址空间信息 */
    struct files_struct *files;  /* 进程打开文件信息 */
    struct fs_struct *fs;  /* 进程文件系统信息 */
    /* 更多的字段，具体取决于内核版本和配置 */
};

```

下面是6.2内核的files_struct定义

```c
struct files_struct {
  /*
   * read mostly part
   */
	atomic_t count;
	bool resize_in_progress;
	wait_queue_head_t resize_wait;

	struct fdtable __rcu *fdt;
	struct fdtable fdtab;
  /*
   * written part on a separate cache line in SMP
   */
	spinlock_t file_lock ____cacheline_aligned_in_smp;
	unsigned int next_fd;
	unsigned long close_on_exec_init[1];
	unsigned long open_fds_init[1];
	unsigned long full_fds_bits_init[1];
	struct file __rcu * fd_array[NR_OPEN_DEFAULT];
};
```





