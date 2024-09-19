import os
from PIL import Image

def compress_image(input_path, output_path, quality=85):
    """压缩图片并保存到指定路径"""
    with Image.open(input_path) as img:
        # 如果是PNG图片，使用save时设置optimize=True来优化
        if img.format == 'PNG':
            img.save(output_path, 'PNG', optimize=True)
        else:
            img.save(output_path, 'JPEG', quality=quality)

def batch_compress_images(directory, output_directory, quality=85):
    """批量压缩指定目录下的所有图片，并将压缩后的图片保存到输出目录"""
    if not os.path.exists(output_directory):
        os.makedirs(output_directory)
    
    for root, _, files in os.walk(directory):
        for file in files:
            if file.lower().endswith(('.png', '.jpg', '.jpeg')):
                input_path = os.path.join(root, file)
                # 创建输出文件的相对路径
                relative_path = os.path.relpath(root, directory)
                output_subdir = os.path.join(output_directory, relative_path)
                if not os.path.exists(output_subdir):
                    os.makedirs(output_subdir)
                output_path = os.path.join(output_subdir, file)
                compress_image(input_path, output_path, quality)
                print(f'Compressed: {input_path} -> {output_path}')

# 获取用户输入的图片目录
image_directory = input("Please enter the directory path of the images: ")
if not os.path.isdir(image_directory):
    print("The specified directory does not exist.")
    exit(1)

# 获取原图文件夹的名称
base_name = os.path.basename(os.path.normpath(image_directory))

# 创建输出目录，以compressed_原图文件夹名称为名
output_directory = os.path.join(os.path.dirname(image_directory), f'compressed_{base_name}')

# 设置JPEG图片的压缩质量
jpeg_quality = 85  # 范围为1到100

# 调用批量压缩函数
batch_compress_images(image_directory, output_directory, jpeg_quality)
