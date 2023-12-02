"use strict";

const sizeOf = require('image-size');
const path = require('path');
const { readdir, writeFileSync, stat } = require('fs').promises;

const imagesSrcPath = 'images/original-image/';
const imagesThumbPath = 'images/mini-image/';
const sourcePath = 'source/';

async function processPages() {
    try {
        const pageArr = await readdir(imagesSrcPath);

        for (const page of pageArr) {
            const pageSrcPath = path.join(imagesSrcPath, page);
            const pageThumbPath = path.join(imagesThumbPath, page);
            const output = path.join(sourcePath, page, 'image.json');
            
            const filesInPage = await readdir(pageSrcPath);

            let imagesInPage = [];

            for (const album of filesInPage) {
                const albumSrcPath = path.join(pageSrcPath, album);
                const albumThumbPath = path.join(pageThumbPath, album);
                
                try {
                    const albumStat = await stat(albumSrcPath);

                    if (albumStat.isDirectory()) {
                        let imagesInAlbum = { name: album };
                        let children = [];

                        const imageFile = await readdir(albumSrcPath);

                        for (const file of imageFile) {
                            if (path.extname(file) !== ".mp4") {
                                const dimensions = sizeOf(path.join(albumSrcPath, file));
                                // Generate and add the thumbnail information
                                const thumbnailName = file.replace(path.extname(file), '_mini' + path.extname(file));
                                children.push(dimensions.width + '.' + dimensions.height + ' ' + file + ' ' + thumbnailName);
                            } else {
                                const dimensions = sizeOf(path.join(albumThumbPath, path.basename(file, ".mp4") + ".png"));
                                children.push(dimensions.width + '.' + dimensions.height + ' ' + file + ' ' + path.basename(file, ".mp4") + ".png");
                            }
                        }

                        imagesInAlbum.children = children;
                        imagesInPage.push(imagesInAlbum);
                        const fs = require('fs');
						fs.writeFileSync(output, JSON.stringify(imagesInPage, null, "\t"));

                    }
                } catch (error) {
                    console.error("Error:", error);
                }
            }
        }
    } catch (error) {
        console.error("Error:", error);
    }
}

processPages();
