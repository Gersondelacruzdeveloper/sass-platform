from io import BytesIO

from django.core.files.base import ContentFile
from PIL import Image


def generate_square_icon_from_logo(uploaded_file, size=512, background=(255, 255, 255, 0)):
    uploaded_file.seek(0)

    image = Image.open(uploaded_file).convert("RGBA")
    image.thumbnail((size, size), Image.LANCZOS)

    canvas = Image.new("RGBA", (size, size), background)

    x = (size - image.width) // 2
    y = (size - image.height) // 2

    canvas.paste(image, (x, y), image)

    output = BytesIO()
    canvas.save(output, format="PNG")
    output.seek(0)

    return ContentFile(output.read())


def generate_maskable_icon_from_logo(uploaded_file, size=512, background=(17, 24, 39, 255)):
    uploaded_file.seek(0)

    image = Image.open(uploaded_file).convert("RGBA")

    safe_size = int(size * 0.65)
    image.thumbnail((safe_size, safe_size), Image.LANCZOS)

    canvas = Image.new("RGBA", (size, size), background)

    x = (size - image.width) // 2
    y = (size - image.height) // 2

    canvas.paste(image, (x, y), image)

    output = BytesIO()
    canvas.save(output, format="PNG")
    output.seek(0)

    return ContentFile(output.read())