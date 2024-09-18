import os
from PIL import Image

# 创建目录用于存储生成的图片
save_dirname = "mini_picture"
if not os.path.exists(save_dirname):
    os.mkdir(save_dirname)

dirname = "ori_picture"
imgs = [os.path.join(dirname, i) for i in os.listdir(dirname)]

for idx, img_path in enumerate(imgs):
    if img_path.endswith("jpg") or img_path.endswith("png") or img_path.endswith("jpeg"):
        original_filename, extension = os.path.splitext(os.path.basename(img_path))
        img = Image.open(img_path)
        img.thumbnail((240, 480))
        
        # 构造新的文件名，加上 "_mini" 后缀
        new_filename = f"{original_filename}_mini{extension}"
        
        img.save(os.path.join(save_dirname, new_filename))
