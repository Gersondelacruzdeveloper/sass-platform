"""Unit tests for in-memory organisation branding icon generation."""

from io import BytesIO

from django.core.files.base import ContentFile
from django.test import SimpleTestCase
from PIL import Image, UnidentifiedImageError

from organisations.utils.branding_icons import (
    generate_maskable_icon_from_logo,
    generate_square_icon_from_logo,
)


class BrandingIconUtilityTests(SimpleTestCase):
    def make_image_file(
        self,
        *,
        width=200,
        height=100,
        colour=(255, 0, 0, 255),
        image_format="PNG",
    ):
        mode = "RGB" if image_format == "JPEG" else "RGBA"
        if mode == "RGB":
            colour = colour[:3]
        image = Image.new(mode, (width, height), colour)
        uploaded = BytesIO()
        image.save(uploaded, format=image_format)
        uploaded.seek(0)
        return uploaded

    def open_generated(self, generated):
        self.assertIsInstance(generated, ContentFile)
        generated.seek(0)
        image = Image.open(generated)
        image.load()
        return image

    def test_square_icon_is_png_with_requested_dimensions(self):
        generated = generate_square_icon_from_logo(
            self.make_image_file(),
            size=128,
        )

        image = self.open_generated(generated)
        self.assertEqual(image.format, "PNG")
        self.assertEqual(image.mode, "RGBA")
        self.assertEqual(image.size, (128, 128))

    def test_square_icon_preserves_aspect_ratio_and_centres_logo(self):
        generated = generate_square_icon_from_logo(
            self.make_image_file(width=200, height=100),
            size=100,
        )

        image = self.open_generated(generated)
        self.assertEqual(image.getpixel((0, 0)), (255, 255, 255, 0))
        self.assertEqual(image.getpixel((50, 10)), (255, 255, 255, 0))
        self.assertEqual(image.getpixel((50, 50)), (255, 0, 0, 255))
        self.assertEqual(image.getpixel((50, 89)), (255, 255, 255, 0))

    def test_square_icon_accepts_custom_background(self):
        generated = generate_square_icon_from_logo(
            self.make_image_file(width=20, height=20),
            size=60,
            background=(1, 2, 3, 255),
        )

        image = self.open_generated(generated)
        self.assertEqual(image.getpixel((0, 0)), (1, 2, 3, 255))
        self.assertEqual(image.getpixel((30, 30)), (255, 0, 0, 255))

    def test_small_logo_is_not_upscaled(self):
        generated = generate_square_icon_from_logo(
            self.make_image_file(width=10, height=10),
            size=100,
        )

        image = self.open_generated(generated)
        self.assertEqual(image.getpixel((44, 50)), (255, 255, 255, 0))
        self.assertEqual(image.getpixel((45, 50)), (255, 0, 0, 255))
        self.assertEqual(image.getpixel((54, 50)), (255, 0, 0, 255))
        self.assertEqual(image.getpixel((55, 50)), (255, 255, 255, 0))

    def test_jpeg_input_is_converted_to_rgba_png(self):
        generated = generate_square_icon_from_logo(
            self.make_image_file(
                width=40,
                height=40,
                colour=(10, 120, 220, 255),
                image_format="JPEG",
            ),
            size=40,
        )

        image = self.open_generated(generated)
        self.assertEqual(image.format, "PNG")
        self.assertEqual(image.mode, "RGBA")
        red, green, blue, alpha = image.getpixel((20, 20))
        self.assertLess(abs(red - 10), 10)
        self.assertLess(abs(green - 120), 10)
        self.assertLess(abs(blue - 220), 10)
        self.assertEqual(alpha, 255)

    def test_transparent_logo_pixels_preserve_background(self):
        uploaded = self.make_image_file(
            width=20,
            height=20,
            colour=(255, 0, 0, 0),
        )

        generated = generate_square_icon_from_logo(
            uploaded,
            size=20,
            background=(9, 8, 7, 255),
        )

        image = self.open_generated(generated)
        self.assertEqual(image.getpixel((10, 10)), (9, 8, 7, 255))

    def test_maskable_icon_uses_safe_padding_and_opaque_background(self):
        generated = generate_maskable_icon_from_logo(
            self.make_image_file(width=200, height=100),
            size=100,
        )

        image = self.open_generated(generated)
        self.assertEqual(image.size, (100, 100))
        self.assertEqual(image.getpixel((0, 0)), (17, 24, 39, 255))
        self.assertEqual(image.getpixel((50, 50)), (255, 0, 0, 255))
        self.assertEqual(image.getpixel((16, 50)), (17, 24, 39, 255))
        self.assertEqual(image.getpixel((17, 50)), (255, 0, 0, 255))

    def test_maskable_icon_accepts_custom_background(self):
        generated = generate_maskable_icon_from_logo(
            self.make_image_file(width=30, height=30),
            size=80,
            background=(40, 50, 60, 255),
        )

        image = self.open_generated(generated)
        self.assertEqual(image.getpixel((0, 0)), (40, 50, 60, 255))
        self.assertEqual(image.getpixel((40, 40)), (255, 0, 0, 255))

    def test_input_stream_is_rewound_before_reading(self):
        uploaded = self.make_image_file()
        uploaded.seek(7)

        generated = generate_square_icon_from_logo(uploaded, size=32)

        image = self.open_generated(generated)
        self.assertEqual(image.size, (32, 32))

    def test_malformed_image_is_rejected_without_output_file(self):
        uploaded = BytesIO(b"not-an-image-or-a-secret")

        with self.assertRaises(UnidentifiedImageError):
            generate_square_icon_from_logo(uploaded, size=64)

        with self.assertRaises(UnidentifiedImageError):
            generate_maskable_icon_from_logo(uploaded, size=64)

