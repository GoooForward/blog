/*
批量更新修改时间
博客自动更新文章的修改时间
*/

console.log('脚本开始运行..');
const { log } = require("console");
const fs = require("fs"); // 请求文件系统
const path = require("path")
const Reg = /updated:\s*(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}:\d{2})?)/img;
const dir = './source/_posts' 
excuteDir(dir)

function excuteDir(dirPath) {
	fs.readdir(dirPath, function(err, files){
		if (err) {
		  console.log('Error reading directory:', err);
		  return;
		}
		
		var len = files.length; // 检查 files 是否为 undefined
		console.log('Number of files:', len);
		var file=null;
		for(var i=0;i<len;i++){
			file=files[i];
			let filePath = path.join(dirPath, file)
			console.log("正在处理文件：",filePath);
			fs.stat(filePath, function(err, stats){ 
				if(err) {
					console.log('err', err);
					return
				}
				if (stats.isFile()) {
					if(filePath.indexOf(".md")>-1){
						console.log("开始处理更新时间：",filePath);
						writeFileTime(filePath,fs);
					}
				} else {
					console.log("递归文件夹：",filePath);
					excuteDir(filePath)
				}
			});
		}
	});
}


/*
file: 读取时间的文件以及写入内容的文件
fs: 文件系统
*/
function writeFileTime(file, fs) {
	fs.readFile(file, 'utf8', function(err, data) {
	  if (err) return console.log("读取文件内容错误：", err);
	  let data1 = data.substring(0, 500);
	  const data2 = data.substring(500, data.length);
	  const Reg = /updated:\s*(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}:\d{2})?)/img;
	  let rm = data1.match(Reg);
	  if (rm && rm.length && rm.length > 0) {
		let gDate = rm[0].split(": ")[1];
		console.log(file, " 定位updated ", gDate);
		fs.stat(file, function(err, stats) {
		  if (err) {
			return console.log("读取文件信息错误：", err);
		  }
		  let updated = gDate.replace(/-/g, "/");
		  if (new Date(stats.mtime).getTime() - new Date(Date.parse(updated)) > 1000 * 60 * 5) {
			console.log(file, " 需要更新时间");
			var result = data1.replace("updated: " + gDate, "updated: " + getFormatDate(stats.mtime));
			let out = result + data2;
			fs.writeFile(file, out, 'utf8', function(err) {
			  if (err) return console.log("写文件错误：", err);
			  console.log(file, " 成功更新时间");
			  fs.utimes(file, new Date(stats.atime), new Date(stats.mtime), function(err) {
				if (err) return console.log("修改时间失败：", err);
				console.log(file, " 成功还原访问和修改时间");
			  });
			});
		  } else {
			console.log(file, " 时间无需更新");
		  }
		});
	  } else {
		console.log(file, " 未找到updated字段");
	  }
	});
  }
  
  

/*
 timeStr: 时间，格式可为："September 16,2016 14:15:05、
 "September 16,2016"、"2016/09/16 14:15:05"、"2016/09/16"、
 '2014-04-23T18:55:49' 和毫秒
 dateSeparator：年、月、日之间的分隔符，默认为 "-"，
 timeSeparator：时、分、秒之间的分隔符，默认为 ":"
 */
function getFormatDate(timeStr, dateSeparator, timeSeparator) {
    dateSeparator = dateSeparator ? dateSeparator : "-";
    timeSeparator = timeSeparator ? timeSeparator : ":";
    var date = new Date(timeStr),
            year = date.getFullYear(),// 获取完整的年份 (4 位，1970)
            month = date.getMonth(),// 获取月份 (0-11,0 代表 1 月，用的时候记得加上 1)
            day = date.getDate(),// 获取日 (1-31)
            hour = date.getHours(),// 获取小时数 (0-23)
            minute = date.getMinutes(),// 获取分钟数 (0-59)
            seconds = date.getSeconds(),// 获取秒数 (0-59)
            Y = year + dateSeparator,
            M = ((month + 1) > 9 ? (month + 1) : ('0' + (month + 1))) + dateSeparator,
            D = (day > 9 ? day : ('0' + day)) + ' ',
            h = (hour > 9 ? hour : ('0' + hour)) + timeSeparator,
            m = (minute > 9 ? minute : ('0' + minute)) + timeSeparator,
            s = (seconds > 9 ? seconds : ('0' + seconds)),
            formatDate = Y + M + D + h + m + s;
    return formatDate;
}