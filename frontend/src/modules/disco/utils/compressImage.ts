// src/modules/disco/utils/compressImage.ts

export type CompressImageOptions = {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  outputType?: "image/webp" | "image/jpeg" | "image/png";
  fileNamePrefix?: string;
};

const DEFAULT_OPTIONS: Required<CompressImageOptions> = {
  maxWidth: 1200,
  maxHeight: 1200,
  quality: 0.82,
  outputType: "image/webp",
  fileNamePrefix: "compressed",
};

function getFileExtension(outputType: string) {
  if (outputType === "image/jpeg") return "jpg";
  if (outputType === "image/png") return "png";
  return "webp";
}

function createImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not load image for compression."));
    };

    image.src = objectUrl;
  });
}

function calculateSize(
  originalWidth: number,
  originalHeight: number,
  maxWidth: number,
  maxHeight: number
) {
  let width = originalWidth;
  let height = originalHeight;

  if (width <= maxWidth && height <= maxHeight) {
    return { width, height };
  }

  const widthRatio = maxWidth / width;
  const heightRatio = maxHeight / height;
  const ratio = Math.min(widthRatio, heightRatio);

  width = Math.round(width * ratio);
  height = Math.round(height * ratio);

  return { width, height };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  outputType: string,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Image compression failed."));
          return;
        }

        resolve(blob);
      },
      outputType,
      quality
    );
  });
}

export async function compressImageFile(
  file: File,
  options: CompressImageOptions = {}
): Promise<File> {
  if (!file.type.startsWith("image/")) {
    return file;
  }

  // Keep SVG as-is. Canvas rasterizes SVG and can break logos.
  if (file.type === "image/svg+xml") {
    return file;
  }

  const finalOptions = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const image = await createImageFromFile(file);

  const { width, height } = calculateSize(
    image.naturalWidth || image.width,
    image.naturalHeight || image.height,
    finalOptions.maxWidth,
    finalOptions.maxHeight
  );

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");

  if (!context) {
    return file;
  }

  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  const blob = await canvasToBlob(
    canvas,
    finalOptions.outputType,
    finalOptions.quality
  );

  // If compression made the file bigger, keep the original.
  if (blob.size >= file.size) {
    return file;
  }

  const extension = getFileExtension(finalOptions.outputType);
  const cleanOriginalName = file.name
    .replace(/\.[^/.]+$/, "")
    .replace(/[^\w-]+/g, "-")
    .toLowerCase();

  return new File(
    [blob],
    `${finalOptions.fileNamePrefix}-${cleanOriginalName}.${extension}`,
    {
      type: finalOptions.outputType,
      lastModified: Date.now(),
    }
  );
}

export async function compressBrandingImage(file: File): Promise<File> {
  return compressImageFile(file, {
    maxWidth: 1000,
    maxHeight: 1000,
    quality: 0.82,
    outputType: "image/webp",
    fileNamePrefix: "branding",
  });
}

export async function compressProfilePhoto(file: File): Promise<File> {
  return compressImageFile(file, {
    maxWidth: 900,
    maxHeight: 900,
    quality: 0.8,
    outputType: "image/webp",
    fileNamePrefix: "profile",
  });
}

export async function compressProductImage(file: File): Promise<File> {
  return compressImageFile(file, {
    maxWidth: 1200,
    maxHeight: 1200,
    quality: 0.82,
    outputType: "image/webp",
    fileNamePrefix: "product",
  });
}

export async function compressAppIcon(file: File): Promise<File> {
  return compressImageFile(file, {
    maxWidth: 512,
    maxHeight: 512,
    quality: 0.85,
    outputType: "image/webp",
    fileNamePrefix: "icon",
  });
}

export async function compressAnyUploadImage(file: File): Promise<File> {
  return compressImageFile(file, {
    maxWidth: 1200,
    maxHeight: 1200,
    quality: 0.82,
    outputType: "image/webp",
    fileNamePrefix: "upload",
  });
}
