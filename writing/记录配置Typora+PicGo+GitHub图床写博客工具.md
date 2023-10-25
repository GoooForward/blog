---
title: 记录配置Typora+PicGo+GitHub图床写博客工具
date: 2023-10-25
updated: {{ date }}
tags: 
categories: 记录
---



# 0x00 引言

在之前已经搭建好了博客的框架，现在就差博文了。正所谓磨刀不误砍柴工，在写博客之前，准备一个趁手的工具很重要。对于写博客来说，主要就是解决两个问题，第一个是用哪个markdown编辑器，二就是图片的保存方案。下面就聊聊为什么选择Typora+PicGo+GitHub来进行博客写作，以及记录我的配置过程。



# 0x01 方案选择



## -1- markdown编辑器

首先说markdown编辑器，我第一次接触到markdown是无意中在网上冲浪时认识到了notion这款笔记软件，当时我还只接触过doc这种富文本格式的文本以及txt无格式的纯文本，第一次接触markdown这种轻量级的标记语言仿佛是打开了新世界的大门，它太好用了，既不像doc那样臃肿，又不像txt那样完全没有格式，它的语法突出一个恰到好处，够用！notion固然是个很好用的软件，但是用他来写博客还是有些问题，首先是因为它不仅仅只是markdown编辑器，它还支持很多的其他功能，像日历、看板这些，而这些功能在其他的markdown编辑器中就不支持了，降低了它的可移植性；其次是对于图片的保存，notion之类的软件通常都是将图片上传到自身的图床平台，而这些为自身软件搭建的图床当然都是不支持外链访问的，因此导出为markdown就必须将图片打包，否则图片就全挂了，这个后面再细说；最后一点就是notion并没有Linux版本，只能使用网页版，网页版不是不能用，但是确实不好用，这也是我后来放弃用飞书的原因。除了notion之外，一些国产的类notion软件我也都体验过，包括wolai,flowus ,飞书，这类软件都有notion的问题，因为说到底，这些软件都并非是专门的markdown编辑器，而是团队知识文档合作平台，只是支持了markdown文本格式，他们并非为了markdown而服务，并非这些软件做的不好，相反，他们都有各自的长处，但是写博客还是需要寻找其他的写作工具。

>使用Notion也能搭建个人博客，如果你感兴趣，可以去自行搜索了解



市面上的markdown编辑器有很多，随便一搜就有一大把，但是他们大致分为两类，一类是源代码写作类型的，其中为代表的就是VScode（VScode原生是不支持预览md的，需要插件支持），包括CSDN的网页版的markdown编辑器也是这种类型。这一类优势是啥呢？可能是方便学习markdown语法？Maybe......反正我用Typora。

![](https://gcore.jsdelivr.net/gh/GoooForward/picture@main/note-image/202310251506592.png)

另一类是即使渲染类型的，其中最具代表的就是Typora。它最大的优点就是所见即所得，你输入的语法马上就会被渲染成对应的样式。当然，它的缺点就是现在Typora已经是收费软件了。当然，你依以在互联网上找到它过去的不收费版本，这里也提供一个免费版的下载链接：[Typora 最后的免费版 全平台(win mac linux)下载](https://babudiu.com/archives/typora)

**Typora的正版收费还是比较合理的，目前是`89元`人民币，如果有经济实力还是建议大家支持正版。**

除了Typora，还有一个开源软件[MarkText](https://github.com/marktext/marktext)，同样支持实施渲染markdown，有兴趣可以尝试一下。~~不过我觉得Typora更好用~~

![](https://gcore.jsdelivr.net/gh/GoooForward/picture@main/note-image/202310251509098.png)

以上的两类编辑器我都用过，萝卜青菜，各有所爱，我最终的选择还是Typora。



## -2- 图片保存方案

如今写博客肯定离不开图片，那图片的保存就成了一个问题。这个问题无非就两个解决方法，一是存在本地，而是存在云端。

存在本地隐私性好，不用用担心安全性问题，稳定，但是用在博客上会影响网页的加载速度，并且联合markdown使用会降低md文件的可移植性，图片必须跟着md文件一起打包，这就会使md文件变得臃肿。

用于存放图片的服务器就被称为图床，图片存在图床上可移植性好，无论是放在网页上还是在不同的机器上图都不会挂，但是放在图床就意味着图片不在自己手上，这就意味着导致隐私差，安全性不好，只适合用于存放一些非关键图片。此外，图片加载还会受到网络环境的影响。

权衡利弊，我还是选择使用图床方案，主要是想探索一下图床的使用，其次也能保证md文件良好我移植性，方便搬移到不同的平台上。



## -3- 图床的选择

图床的选择有很多，网上有很多对比的文章，我就不对比了，这里就讲一下我选择github作为图床的原因：

* 免费，这是最主要的原因，因为我没钱

* 图片不易丢失，github至少在可遇见的未来应该还是不会倒闭的，对比那些小图床服务商，github应该是不会突然跑路的

* gitee太烂了，我起初是想将图片放在gitee上的，因为毕竟gitee服务器在国内，加载速度还是快太多了，但是gitee对于免费用户的限制太多了，最重要的是现在gitee会封外链访问了，已经无法作为图床使用了，除非你的博客只基于gitee的pages功能搭建。

  放一个知乎的问答：[如何看待使用gitee大量屏蔽外链，之后不能在继续做图床了，对大家的影响大吗，这种情况会持续多久？](https://www.zhihu.com/question/524089317)

综上，我选择github作为博客的图床



## -4- PicGo

OK，现在已经选好了图床和编辑器，还差一个工具将图片上传到图床上，这个工具就是PicGo。为什么选择PicGo呢？那是因为Typora官方支持的工具就是它，当然，PicGo也是足够好用的，并且它是开源的，在Win、Linux、MacOS都可以使用，支持的图床也足够丰富，还有插件可以扩展的它功能，所以大家几乎都使用它。

[PicGo GitHub页面](https://github.com/Molunerfinn/PicGo)

[PicGo 使用指南](https://picgo.github.io/PicGo-Doc/)



# 0x02 配置过程

以下过程全程以Ubuntu 22.04为例,其他系统大同小异。



## -1- 安装Typora

首先，需要获取安装包，在linux环境下是deb格式的，使用如下命令对安装进行解包安装

```
sudo dpkg -i Typora_Linux_xxxx_amd64.deb 
```

输入密码，就安装完成了



## -2- 准备GitHub仓库

打开GitHub新建一个仓库，这个仓库和之前部署博客的仓库一样，必须选择公共仓库。

![](https://gcore.jsdelivr.net/gh/GoooForward/picture@main/note-image/image-20231018230150149.png)

ok，创建仓库完成后，图床就准备好了。It‘s too simple。

### 创建token

我们这里再顺手创建一个token，这个token就相当于github仓库的密码，可以用于访问你的仓库，之后配置picgo时会用到。

首先来到github的setting页面，选择导航栏最下方的Developer setting（开发者设置）

![](https://gcore.jsdelivr.net/gh/GoooForward/picture@main/note-image/image-20231025202653090.png)

然后选择Persional access tokens -> Tokens(classic)

![](https://gcore.jsdelivr.net/gh/GoooForward/picture@main/note-image/image-20231025202845916.png)

再然后选择上方的Generate new tokens -> Generate new tokens(classic)

![](https://gcore.jsdelivr.net/gh/GoooForward/picture@main/note-image/image-20231025203039991.png)

输入你的账户密码后会来到如下界面，这里的Note是用来给你的token取名字的，分别区分管理，Expiration是有效时间，时间越久风险越高，自行决定，不建议选择无限期。下面的权限只勾选上repo就行了，然后滑动到最底部，选择Generate token。

![](https://gcore.jsdelivr.net/gh/GoooForward/picture@main/note-image/image-20231025203300229.png)

此时你就获得了一个token，它仅会以明文的形式展示这一次，当你关闭此页面你就再也没办法知道它是什么了，所以这里将它复制保存下来，之后配置PicGo时会用到。

![](https://gcore.jsdelivr.net/gh/GoooForward/picture@main/note-image/image-20231025203722658.png)



## -3- 安装PicGo

打开[PicGo GitHub页面](https://github.com/Molunerfinn/PicGo)，找到它的release

![](https://gcore.jsdelivr.net/gh/GoooForward/picture@main/note-image/image-20231025192018530.png)



第一次来到这个界面我蒙了，因为我不知道下载哪一个，通常来说，linux的软件安装包是deb格式的拓展名，或者直接是打包好的二进制可执行程序，又或者是纯源码通过编译来安装。但是这里我找不到下载哪一个，通过一番搜索，发现这里有两个是linux下的安装包，一个扩展名为snap，这种安装包是基于snap这种新的包管理方式。对于这种包管理方式我也没接触过，浅浅地了解了一下，其优势是安全以及依赖自包含，其文件内包含了全部依赖的库。AppImage也是一种性质类似的安装包，其本质是一个压缩文件，其内也包含了全部的所需的运行库，因此安装这两个安装包不需要安装其他依赖。这里我下载AppImage，因为安装.snap安装包需要使用snap包管理工具，我当时不会。
![](https://gcore.jsdelivr.net/gh/GoooForward/picture@main/note-image/image-20231025192612648.png)



下载完成后，赋予安装包可执行权限，使用命令

```
sudo chmod +x PicGo-2.3.1.AppImage
```

或者右键 -> 属性 -> 权限 -> 勾选运行执行权限

![](https://gcore.jsdelivr.net/gh/GoooForward/picture@main/note-image/image-20231025194941228.png)

然后在终端直接`./PicGo-2.3.1.AppImage` 执行该安装包，发现会报错如下

```
dlopen(): error loading libfuse.so.2

AppImages require FUSE to run. 
You might still be able to extract the contents of this AppImage 
if you run it with the --appimage-extract option. 
See https://github.com/AppImage/AppImageKit/wiki/FUSE 
for more information
```

意思是我们执行该安装包缺少FUSE，但是我们可以使用`--appimage-extract`这个选项来提取该安装包。于是我们的命令就变成了

```
./PicGo-2.3.1.AppImage --appimage-extract
```

回车之后，安装包的文件就被提取出来了，生成了一个名为`squashfs-root`的文件夹，这个文件夹里就有我们要的picgo可执行文件了,在该目录下执行`./picgo`可以测试是否能打开PicGo，打开之后会在桌面生成一个小图标，看到这个图标就说明安装PicGo完成了。

![](https://gcore.jsdelivr.net/gh/GoooForward/picture@main/note-image/image-20231025200122451.png)

>PicGo有两个版本，一个是带图像界面的，可以通过UI交互的，也就是当前下载的这个。还有一个仅保留核心功能，通过命令行交互的PicGo-Core，PicGo其实也是对PicGo-Core的封装，但是增加了图像界面，更易用，而PicGo-Core使用起来更无感，但是使用门槛更高。大家可以根据使用习惯自行选择。
>
>[PicGo-Core GitHub界面](https://github.com/PicGo/PicGo-Core)



## -4- 配置PicGo

打开PicGo的主界面，先选择图床设置，再选择GitHub，然后编辑配置，就来到了图床配置界面。下面分别来讲解各项

![](https://gcore.jsdelivr.net/gh/GoooForward/picture@main/note-image/image-20231025201525131.png)

* 图床配置名：该配置的名称，随便取就行

* 设定仓库名：格式为`GitHub用户名/图床仓库名`，按照创建创建仓库时取得名字来就行

* 设定分支名：上传到仓库的哪个分支上，没修改的话默认是main

* 设定token：相当于密码，使用之前创建GitHub仓库时顺便创建的token

* 设定存储路径：想要图片存放在哪个文件夹下，不填默认是根目录，注前面不能有斜杠/，最后的斜杠/不能省略

* 设定自定义域名：此项不填，则你上传图片后获取的url是`https://raw.githubusercontent.com/用户名/仓库名/分支名/设定存储路径/文件名`，填写此项会替换掉前面的`https://raw.githubusercontent.com/用户名/仓库名/分支名`部分。

  通过这个功能，我们可以使用CDN加速，便于我们在国内访问GitHub图床。这里推荐jsDriver这个免费的CDN，因此这里的格式为`https://cdn.jsdelivr.net/gh/用户名/仓库名@分支名`



### CDN加速

CDN（**C**ontent **D**istribution **N**etwork），中文全称是内容分发网络，它的本质是部署多个服务器，用户请求资源时通过最近的服务器来分发资源，降低主服务器的压力，同时也能提升用户的体验。最开始我是没有配置CDN的，因为我都是开着魔法上网的，没有意识到国内网络访问github慢这个问题，直到我想看看博客的手机端的观看体验才发现图片根本加载不出来，这才意识到想要正常在国内访问github图床，就必须配置CDN。

好在有免费的CDN服务可以白嫖，jsDeliver是一款开源的免费公共CDN，它可以为国内用户加速github的开源项目，所以也可以用来帮助我们加速我们的开源github图床。

但是jsDeliver目前在国内的备案以及被撤销了，这个CDN的前途目前还不明，这也是这套方案中最薄弱的一环，目前还能正常使用，但是未来的监管如何，现在就无从知晓了。



> 对于jsDeliver的过往可以看看这篇博文：[jsDelivr域名遭到DNS污染](https://luotianyi.vc/6295.html)

>  jsDelivr有很多的CDN赞助商共同支持，每一个服务商都会有自己的专有子域名，通过替换访问资源到其他的二级域名可以恢复访问。但这些CDN普遍速度一般，而且前途并不明朗，建议仅供临时使用。
>
> > CloudFlare：`test1.jsdelivr.net`
> > CloudFlare：`testingcf.jsdelivr.net`
> > Fastly：`fastly.jsdelivr.net`
> > GCORE：`gcore.jsdelivr.net`









# -END-
