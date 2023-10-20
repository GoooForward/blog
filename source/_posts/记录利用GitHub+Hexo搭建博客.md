---
title: 记录利用GitHub+Hexo搭建博客
date: 2023-10-15
update: {{ date }}
tags: hexo
categories: 记录
---

# 0x00 起因

之前在Internet冲浪时经常会搜到一些别人写的博客，通常国内普通人写博客往往是在平台之上创作，通过某乎、某某DN这样的平台。但是有时也能搜到一些个人博客，这些博客往往网页清爽，纯净无广告，有些博客还有些不错特效，抛开文章内容不谈，仅仅是如此清爽的页面就给了人良好的阅读体验。所以我便也想着整一个，这样就可以把自己写的一些垃圾扔在上面了，咱说整就整。

搭建一个博客的方法有很多，但是对于我这种纯小白来说，使用现成的方案显然是最方便滴。

首先，搭建博客需要肯定需要一个服务器，当然最好的办法就是自己物理上组一台主机当服务器，然后再搞到一个公网IP，这样整个服务器都完全掌握在自己手里。但是这样的服务器需要大把的“米”，而且在2023年的今天，获取一个私人的公网的IPv4地址也是十分困难滴，因此PlanA PASS。

随着云服务的发展，现如今通过租的方式来获取一个云服务器也是很容易的。但是云服务终究还是收费的，虽然各家云服务商都有新人优惠，但是小钱也是钱啊，咱这种玩玩而已的blog那自然是能省就省，等以后有钱有闲了再来研究研究这个方案。PlanB暂时放弃。

那最后咱们选择的方案是啥呢？嘿嘿，就是利用GitHub提供的免费pages功能来搭建这个blog。GitHub给每个人的每个仓库都提供了这个page功能，我认为GitHub的原意应该是方便用户给每个项目搭建一个介绍页面，但是我们正好就可以利用这个功能来搭建一个人博客。

OK，下面就记录一下我搭建这个blog的过程以及踩过的坑。



# 0x01 环境准备



## -0- 安装git

这个太基础了，在windows平台下就去Internet下载对应的安装包，一直默认next就好。

如果是在Ubuntu平台下，就用如下命令安装吧

```
sudo apt install git
```



##  -1- 创建仓库

创建仓库没什么好说的（~~如果不会就STFW吧~~），但唯一要注意的是必须要创建公共仓库

![](https://gcore.jsdelivr.net/gh/GoooForward/picture@main/note-image/image-20231018230150149.png)



>  其实如果不会魔法上网，无法使用Github，也可以使用国内的代码托管平台gitee，gitee同样提供pages的功能，但是必须先通过实名认证。但是我还是推荐先学会魔法



## -2- 安装Node.js环境

什么是Node.js？咱也不知道啊，不知道就STFW呗。wiki上是这样说的：

> *"Node.js 是能够在服务器端运行 JavaScript 的开放源代码、跨平台执行环境。"*

在[Node.js的官网](https://nodejs.org/zh-cn)上也有这样一句话：

> *"Node.js® is an open-source, cross-platform JavaScript runtime environment."*

![](https://gcore.jsdelivr.net/gh/GoooForward/picture@main/note-image/image-20231018230213736.png)

在Internet搜了一圈，大概了解了一下，浅显的理解为开源的JavaScript这个语言的运行环境，应该包括一些基本的运行库之类的。

在[官网](https://nodejs.org/zh-cn)上下载一下安装包，LTS是长期维护版，理论上更稳定；Current就是当前最新版。我这里就下载LTS版本了，因为我也用不上新特性。

我使用的是Ubuntu 22.04，下载下来是一个tar.xz格式的压缩包，使用如下目录进行解压

```bash
tar -Jxf node-v18.18.1-linux-x64.tar.xz 		#-J 指定xz压缩格式（必须大写J）-x 解压操作 -f 指定要解压的文件
#or
tar --xz -xf node-v18.18.1-linux-x64.tar.xz		#我觉得这个更好记，就是不够优雅
```

解压之后就得到了Node.js的二进制可执行文件了，这就相当于windows下的portable版本的软件，解压即用，不用注册表等信息。

如果是Windows下载下来应该是一个.exe的安装程序，就按照软件的正常安装步骤来就好。

现在进入bin文件夹下就可以看到npm包管理软件的可执行文件了，接下来将该路径添加到系统的环境变量中，这样在其他的路径下也可以直接通过软件名来调用npm等软件了。在bin文件夹中执行如下命令

```bash
echo "export PATH=$(pwd):$PATH" >> ~/.bashrc
#or
echo "export PATH=[your-nodejs-bin-path]:$PATH" >> ~/.bashrc
```

然后加载一下bash配置文件

```bash
source ~/.bashrc
```

这样就将该路径添加到了环境变量中了，下面安装Hexo。



## -3- 安装Hexo

Hexo是一个快速、简洁且高效的博客框架。hexo就相当于一个毛坯房，我们只需要装修就行了，不需要再打地基从平地起楼房。

为什么选择Hexo框架而不是其他框架呢？对我来说，主要有以下几个优势：

* 简单。hexo可以一键部署，命令简单，不需要复杂的操作，而且有中文的文档，最适合我这种纯小白了
* 支持Markdown。Markdown太好用了，YYDS，谁用谁知道
* 有许多的主题。颜值即正义，谁不想用好看的皮肤呢，自己写不出来，就直接clone大佬的主题，改个配置文件直接用，美滋滋

[Hexo官网](https://hexo.io/zh-cn/index.html)

![](https://gcore.jsdelivr.net/gh/GoooForward/picture@main/note-image/image-20231018230241456.png)

执行如下命令安装Hexo

```bash
npm install hexo-cli -g 		#-g 全局安装  
```

> hexo-cli中的cli是指command line interface版本，即命令行接口版本

可以通过`hexo -v`命令来判断是否安装成功，如果看到了版本号就是安装成功

---

PS：这里可能会有人安装失败，因为国内复杂的网络环境以及众所周知的GreatWall，如果你的网络无法反复连接到npm服务器，就很可能导致安装失败，可以尝试使用国内镜像的cnpm（请自行搜索使用）。



OK，到这里搭建的环境就准备好了，下面就可以开始搭建工作了



# 0x02 操作步骤



## -1- 初始化文件夹

首先创建一个空文件夹，用于存放blog的文件，然后进入该文件夹中，用`hexo init`初始化文件夹

```bash
mkdir blog
cd blog
hexo init
```

此时，hexo会自动clone框架代码，目录结构如下：

```bash
.
├── _config.landscape.yml	#主题landscape的配置文件
├── _config.yml				#整个网页的配置文件
├── node_modules
├── package.json
├── package-lock.json
├── scaffolds
├── source					#用于存放网页的源文件
└── themes					#用于存放主题的源文件
```



## -2- 配置网页

在根目录下有一个_config.yml 文件，它描述了整个hexo博客框架的配置。我们可以在这个文件里修改网页的标题和副标题、是否开启代码高亮功能等等，具体的配置可以根据[hexo官方文档](https://hexo.io/zh-cn/docs/configuration.html)，但是这里有一个配置项很重要，留到后面再说。





## -3- 预览网页

其实初始化后，我们就已经获得了一个博客页面。使用

```bash
hexo server
#or
hexo s			#hexo可以自动补全
```

就可以在本地预览默认的博客样式，按Ctrl+C退出。

![](https://gcore.jsdelivr.net/gh/GoooForward/picture@main/note-image/image-20231018230309151.png)



使用`hexo cl`可以清除掉hexo生成的静态网页，类似于make clean。

清除之后通过`hexo g`可以重新生成网页。



hexo的命令并不多，使用`hexo help`可以看到hexo的命令

```bash
  clean     Remove generated files and cache.                                   
  config    Get or set configurations.                                          
  deploy    Deploy your website.                                                
  generate  Generate static files.
  help      Get help on a command.
  init      Create a new Hexo folder.
  list      List the information of the site
  migrate   Migrate your site from other system to Hexo.
  new       Create a new post.
  publish   Moves a draft post from _drafts to _posts folder.
  render    Render files with renderer plugins.
  server    Start the server.
  version   Display version information.
```



## -4- 部署网页

现在我们已经获得了一个网页，但是还是只能在本地浏览，如何将其放到github中呢？这时就需要编辑配置文件了。

打开博客根目录下的 _config.yml 文件，找到deploy项，按如下格式修改

```yaml
deploy: 
  type: git 
  repo: your-git-link
  branch: your-pages-branch
```

其中

1. type选择git
2. repo是指你github上的博客仓库链接

![](https://gcore.jsdelivr.net/gh/GoooForward/picture@main/note-image/image-20231018230332444.png)



这里如果选择SSH链接，需要提前生成ssh id_rsa的公钥，并且添加到github上，如果没有添加的话就请STFW吧

由于github改版，如果选择HTTP链接，现在已经不能直接通过帐号密码访问到仓库了，必须要生成一个token，通过token做密码才能访问到仓库，而这个token只会在生成时以明文的形式显示一次，并且很难记。所以这里最推荐的是配置公钥后使用SSH，如果非要使用HTTPS链接，又不想每次都输入密码，这里也有一个曲线救国的方法，就是开启git的记住密码功能，这样只用输入一次之后就可以不用输入了。

```bash
#开启git全局记住密码
git config --global credential.helper store
```

3. branch是指你想要将git提交到哪个分支上。这里我推荐仓库创建两个分支，一个pages用于存放静态网页资源，一个source用于存放整个blog的源文件。这里的配置应该选择用于存放网页资源的pages分支。所以我的配置如下

```yaml
deploy: 
  type: git 
  repo: git@github.com:GoooForward/blog.git
  branch: pages
```

---

修改好配置文件后保存退出，使用`hexo d`将网页资源push到仓库上时会发现报错了

```shell
tangyuwei@legion:~/blog$ hexo d
INFO  Validating config
ERROR Deployer not found: git
```

这是因为我们选择了git来部署页面，而hexo此时还不知道git是什么，因此要安装一个插件

```
npm install hexo-deployer-git --save
#--save 是指将插件安装到项目的node_modules目录下，并且写入依赖
```

安装好插件之后再执行`hexo d`就能成功将网页资源push到仓库的对应分支了

---

然后，来到github的对应仓库页面，选择Settings -> Pages -> Branch -> 选择分支 -> Save。

![](https://gcore.jsdelivr.net/gh/GoooForward/picture@main/note-image/image-20231018230600315.png)



![](https://gcore.jsdelivr.net/gh/GoooForward/picture@main/note-image/image-20231018230611572.png)

保存后，Github就会开始部署该分支上的网页了，这个过程需要一段时间，可以在Actions页面看到部署进度

![](https://gcore.jsdelivr.net/gh/GoooForward/picture@main/note-image/image-20231018230637169.png)

成功部署之后就可以回到之前的pages页面访问你的Blog了

![](https://gcore.jsdelivr.net/gh/GoooForward/picture@main/note-image/image-20231018230657411.png)



### 踩坑一

当你兴致勃勃的打开你的博客页面时，大概率要失望了，因为你会发现页面的排版是乱的，并且图片资源加载不出来，但是文字的链接还是在的。

![](https://gcore.jsdelivr.net/gh/GoooForward/picture@main/note-image/202310191626076.png)

这就是我踩到的第一个坑了，当时一直搞不清楚是什么原因导致的。使用`hexo s`在本地预览是正常的，但是部署到github上就会出现排版混乱。使用firefox的F12开发者工具查看网络请求，可以看到资源都没有找到
![](https://gcore.jsdelivr.net/gh/GoooForward/picture@main/note-image/202310191636116.png)

---

经过一番search，终于找到了症结所在。回到本地的blog目录，编辑博客配置文件_config.yml，找到url的配置项，根据注释可以看到我们需要将github的博客页面的网址配置给url（注：url：后面有一个空格），还需要新增根目录项root并配置，其值为`/仓库名/`，其中前后的斜杠 / 不能省。

![](https://gcore.jsdelivr.net/gh/GoooForward/picture@main/note-image/202310191706912.png)

编辑好配置文件之后，重新执行重新生成一次网页资源并部署，执行如下命令

```bash
hexo cl		#清除项目
hexo g		#重新生成项目
hexo d		#部署项目
```

执行后等待github重新部署网页完成，此时再打开博客网页就会发现和之前预览的页面是一样的了。

其实_config.yml中还有很多和页面相关的配置，包括代码高亮，页面名称等等。



# 0x03 主题美化

虽然hexo自带的landspace主题也还不错，但是还是缺少一些个性。hexo的一大优势就是支持更换主题，我们可以直接在github上clone大佬的开源主题，然后部署到我们自己的博客上，前人栽树，后人乘凉啊。



## -1- 下载主题

Hexo有一个官方的[主题站](https://hexo.io/themes/)，里面收录了很多的优质主题，这些主题提供了预览页面和github仓库主页，这里也推荐三个比较喜欢的主题

* [NexT](https://github.com/theme-next/hexo-theme-next)  [预览](https://theme-next.js.org/)

​		这可能是最出名的hexo主题之一了，在github有高达8k的star。它的功能很强大，还有很多开发者为其开发了插件，如果不知道选什么主题，用NexT肯定不会是一个错误的选择

![image-20231020154556334](https://gcore.jsdelivr.net/gh/GoooForward/picture@main/note-image/202310201545466.png)

* [Fluid](https://github.com/fluid-dev/hexo-theme-fluid) [预览](https://hexo.fluid-dev.com/)

​		一款国人大佬开发的hexo主题，也是我现在使用的主题。这款主题在github上也有6.4K的star，这款主题对国人很友好，不光文档是中文的，连配置文件里的注释都用中文写好了

![](https://gcore.jsdelivr.net/gh/GoooForward/picture@main/note-image/202310201546103.png)

* [Arknights](https://github.com/Yue-plus/hexo-theme-arknights) [预览](https://arknights.theme.hexo.yue.zone/)

​		老博士应该懂的都懂，有一说一，鹰角的UI设计的确是一流的

![](https://gcore.jsdelivr.net/gh/GoooForward/picture@main/note-image/202310201550671.png)



下载主题就直接将主题源文件clone到博客仓库下的themes文件夹，或者下载release的文件，将其解压到themes文件夹中。这里有一个点要注意，也是我踩的第二个坑



### 踩坑二

大多数的主题仓库名都是 `hexo-theme-主题名`，直接clone下来会自动创建一个以仓库名命名的文件夹，这里一定要看主题的文档，大部分的主题都会要求将这个文件夹重命名为主题名，或者直接在克隆时就给出目标文件夹，例如Arknights主题，其clone命令是

```bash
git clone https://github.com/Yue-plus/hexo-theme-arknights.git themes/arknights
```



当时我就是因为看文档不仔细，忽略了clone命令最后的目标文件夹参数，导致下载的主题死活不生效，留下了粗心大意的泪水。



## -2- 配置主题

































> To be continue



# -END-
