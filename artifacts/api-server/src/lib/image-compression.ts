/**
 * Image Compression Service
 * Compress images on upload to reduce storage and bandwidth
 */

import sharp from "sharp";
import fs from "fs/promises";
import path from "path";

interface CompressionOptions {
  quality?: number; // 1-100, default 80
  maxWidth?: number; // resize if wider
  maxHeight?: number; // resize if taller
}

const DEFAULT_OPTIONS: Required<CompressionOptions> = {
  quality: 80,
  maxWidth: 1920,
  maxHeight: 1920,
};

/**
 * Check if file is an image
 */
export function isImage(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

/**
 * Compress image file
 * Reduces size by resizing and reducing quality
 * Returns compressed file path or original if not compressible
 */
export async function compressImage(
  filePath: string,
  mimeType: string,
  options?: CompressionOptions
): Promise<{ success: boolean; outputPath: string; originalSize: number; compressedSize: number; ratio: number; error?: string }> {
  if (!isImage(mimeType)) {
    return {
      success: false,
      outputPath: filePath,
      originalSize: 0,
      compressedSize: 0,
      ratio: 0,
      error: "Not an image file",
    };
  }

  const opts = { ...DEFAULT_OPTIONS, ...options };

  try {
    const originalStats = await fs.stat(filePath);
    const originalSize = originalStats.size;

    // SVG files don't benefit from compression, skip
    if (mimeType === "image/svg+xml") {
      return {
        success: true,
        outputPath: filePath,
        originalSize,
        compressedSize: originalSize,
        ratio: 100,
      };
    }

    // Determine output format and quality
    let sharpPipeline = sharp(filePath);

    // Get image metadata to check if resize needed
    const metadata = await sharpPipeline.metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;

    // Resize if needed
    if (width > opts.maxWidth || height > opts.maxHeight) {
      sharpPipeline = sharpPipeline.resize(opts.maxWidth, opts.maxHeight, {
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    // Compress based on format
    if (mimeType === "image/png") {
      sharpPipeline = sharpPipeline.png({ quality: opts.quality, compressionLevel: 9 });
    } else if (mimeType === "image/webp") {
      sharpPipeline = sharpPipeline.webp({ quality: opts.quality });
    } else {
      // JPEG, GIF, BMP, etc.
      sharpPipeline = sharpPipeline.jpeg({ quality: opts.quality, mozjpeg: true });
    }

    // Save compressed image (overwrite original)
    await sharpPipeline.toFile(filePath);

    const compressedStats = await fs.stat(filePath);
    const compressedSize = compressedStats.size;
    const ratio = Math.round((compressedSize / originalSize) * 100);

    console.log(
      `🖼️  Image compressed: ${path.basename(filePath)} ${(originalSize / 1024).toFixed(2)}KB → ${(compressedSize / 1024).toFixed(2)}KB (${ratio}%)`
    );

    return {
      success: true,
      outputPath: filePath,
      originalSize,
      compressedSize,
      ratio,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("❌ Image compression failed:", errorMsg);

    return {
      success: false,
      outputPath: filePath,
      originalSize: 0,
      compressedSize: 0,
      ratio: 0,
      error: errorMsg,
    };
  }
}

/**
 * Batch compress multiple images
 */
export async function compressImages(
  filePaths: Array<{ path: string; mimeType: string }>,
  options?: CompressionOptions
): Promise<Array<{ path: string; success: boolean; ratio: number }>> {
  const results = await Promise.all(
    filePaths.map((file) => compressImage(file.path, file.mimeType, options))
  );

  return results.map((result, idx) => ({
    path: filePaths[idx].path,
    success: result.success,
    ratio: result.ratio,
  }));
}
