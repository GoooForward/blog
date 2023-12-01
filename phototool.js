"use strict";

const sizeOf = require('image-size');
const path = require('path');
const { readdir, readdirSync, writeFileSync, stat } = require('fs');

var dimensions;

const imagesSrcPath = 'images/original-image/'; // hexo/images/原图/
const imagesThumbPath = 'images/mini-image/'; // hexo/images/缩略图/
const sourcePath = 'source/'; // hexo/source/
const pageArr = readdirSync(imagesSrcPath); // 读取出所有页面

for (var i in pageArr) {
	// console.log("Page: " + pageArr[i]);
	
    const pageSrcPath = imagesSrcPath + pageArr[i] + '/'; // hexo/images/原图/photo/
    const pageThumbPath = imagesThumbPath + pageArr[i] + '/'; // hexo/images/原图/photo/
    const output = sourcePath + pageArr[i] + '/' + 'image.json'; // hexo/source/photo/image.json
    readdir(pageSrcPath, function (err, filesInPage) { // 读取出所有相册
        if (err) {
			console.log("Error: readdir(pageSrcPath, function (err, filesInPage)");
			return; 
		}
		
        let imagesInPage = [];
        (function iterator(j) {
            if (j == filesInPage.length) {
                return;
            }
			
			const albumSrcPath = pageSrcPath + filesInPage[j]+ '/';
			const albumThumbPath = pageThumbPath + filesInPage[j]+ '/';
			stat(albumSrcPath, function (err, file) { // stat + isDirectory(): 过滤掉 images.json 文件
                if (err) {
					console.log("Error: stat(albumSrcPath, function (err, file)");
                    return;
                }
				
                if (file.isDirectory()) {
					// console.log("Dir: " + filesInPage[j]);
					
					let imagesInAlbum = {};
					imagesInAlbum.name = filesInPage[j];
					let children = [];
					
					readdir(albumSrcPath, function (err, imageFile) { // 读取出所有图片
						if (err) {
							console.log("Error: readdir(albumSrcPath, function (err, imageFile)");
							return; 
						}
						
						(function iterator(k) {
							if (k == imageFile.length) {
								imagesInAlbum.children = children;
								console.log(JSON.stringify(imagesInAlbum));
								imagesInPage.push(imagesInAlbum);
								// writeFileSync(output, JSON.stringify(imagesInPage));
								writeFileSync(output, JSON.stringify(imagesInPage, null, "\t"));
								return;
							}
							
							// console.log("File: " + imageFile[k]);	
														
							if (path.extname(imageFile[k]) !== ".mp4") {
								dimensions = sizeOf(albumSrcPath + imageFile[k]);
								console.log(dimensions.width, dimensions.height, imageFile[k], imageFile[k]);
								children.push(dimensions.width + '.' + dimensions.height + ' ' + imageFile[k] + ' ' + imageFile[k]);
							} else {
								dimensions = sizeOf(albumThumbPath + path.basename(imageFile[k], ".mp4") + ".png");
								console.log(dimensions.width, dimensions.height, imageFile[k], path.basename(imageFile[k], ".mp4") + ".png");
								children.push(dimensions.width + '.' + dimensions.height + ' ' + imageFile[k] + ' ' + path.basename(imageFile[k], ".mp4") + ".png");
							}
							
							iterator(k + 1);
						}(0));
					});
				}
			})
			iterator(j + 1);
        }(0));
    });
}