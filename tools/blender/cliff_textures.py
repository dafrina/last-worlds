"""Rock and ice detail textures for cliff walls (terrain v15, docs/26).

The user asked for "rocky textures too so it looks more detailed" on the new cliff walls. The runtime maps follow
the existing Khepri convention (art/source/polyhaven/README.md): colour stays with the planet palette and vertex
colours, so a detail map holds only a luminance ratio (0.5 = neutral) and a normal map holds OpenGL-convention
vectors. Both stay tileable: every filter here wraps around the edges.

Sources (CC0, Poly Haven, in art/source/polyhaven/):
- `cliff_side`: layered, fractured cliff rock. Khepri and Luna walls use it directly; the image's ledges run
  horizontally (image x = along the wall, image y = up).
- The same source, smoothed and with less contrast, gives Vesper's ice walls their layering and fractures without
  the rock grain.

Outputs (512 px JPG):
- public/assets/khepri/textures/cliff-rock-detail.jpg, cliff-rock-normal.jpg
- public/assets/vesper/textures/ice-wall-detail.jpg, ice-wall-normal.jpg

    cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup \\
        --python "$(wslpath -w tools/blender/cliff_textures.py)"
"""
import os

import bpy
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SOURCE = os.path.join(ROOT, 'art', 'source', 'polyhaven', 'cliff_side')
SIZE = 512


def load(name):
    """Source map as a float array (rows from the top, values as stored: no colour conversion)."""
    image = bpy.data.images.load(os.path.join(SOURCE, name))
    image.colorspace_settings.name = 'Non-Color'
    w, h = image.size
    pixels = np.empty(w * h * 4, dtype=np.float32)
    image.pixels.foreach_get(pixels)
    bpy.data.images.remove(image)
    return pixels.reshape(h, w, 4)[::-1, :, :3]


def shrink(a):
    """Box-filters to SIZE (sources are 1k: 2x2 averaging)."""
    f = a.shape[0] // SIZE
    return a.reshape(SIZE, f, SIZE, f, -1).mean(axis=(1, 3))


def blur(a, sigma):
    """Periodic Gaussian blur (FFT), so the result stays tileable."""
    fy = np.fft.fftfreq(a.shape[0])[:, None]
    fx = np.fft.fftfreq(a.shape[1])[None, :]
    kernel = np.exp(-2 * (np.pi * sigma) ** 2 * (fx * fx + fy * fy))
    if a.ndim == 2:
        return np.real(np.fft.ifft2(np.fft.fft2(a) * kernel))
    return np.stack([blur(a[..., c], sigma) for c in range(a.shape[2])], axis=-1)


def detail(lum, spread, smooth=0.0, large=40.0):
    """Luminance ratio around 0.5: large-scale shading removed, contrast set by `spread` (std of the result)."""
    ratio = lum / np.maximum(blur(lum, large), 1e-4)
    if smooth:
        ratio = blur(ratio, smooth)
    ratio = np.log(np.maximum(ratio, 1e-3))
    ratio = (ratio - ratio.mean()) / max(ratio.std(), 1e-6)
    return np.clip(0.5 + ratio * spread, 0.04, 0.96)


def normals(nor, smooth=0.0, flatten=1.0):
    v = nor * 2.0 - 1.0
    if smooth:
        v = blur(v, smooth)
    v[..., :2] *= flatten
    v /= np.linalg.norm(v, axis=-1, keepdims=True)
    return v * 0.5 + 0.5


def save(a, path, quality=90):
    if a.ndim == 2:
        a = np.repeat(a[..., None], 3, axis=-1)
    h, w, _ = a.shape
    rgba = np.concatenate([a, np.ones((h, w, 1), dtype=np.float32)], axis=-1)[::-1].astype(np.float32)
    image = bpy.data.images.new(os.path.basename(path), w, h, alpha=False)
    image.colorspace_settings.name = 'Non-Color'
    image.pixels.foreach_set(rgba.ravel())
    scene = bpy.context.scene
    scene.render.image_settings.file_format = 'JPEG'
    scene.render.image_settings.color_mode = 'RGB'
    scene.render.image_settings.quality = quality
    os.makedirs(os.path.dirname(path), exist_ok=True)
    image.save_render(path, scene=scene)
    bpy.data.images.remove(image)
    print(f'{os.path.relpath(path, ROOT)}  {w}x{h}  mean {a.mean():.3f}  std {a[..., 0].std():.3f}'
          f'  {os.path.getsize(path) // 1024} KB')


def run():
    scene = bpy.context.scene
    # Write data values unchanged (no view transform on save).
    scene.view_settings.view_transform = 'Standard'
    scene.display_settings.display_device = 'sRGB'
    diffuse = shrink(load('cliff_side_Diffuse_1k.jpg'))
    lum = diffuse @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    nor = shrink(load('cliff_side_nor_gl_1k.jpg'))
    khepri = os.path.join(ROOT, 'public', 'assets', 'khepri', 'textures')
    vesper = os.path.join(ROOT, 'public', 'assets', 'vesper', 'textures')
    # Rock: crisp grain, ledges and cracks at full strength.
    save(detail(lum, 0.17), os.path.join(khepri, 'cliff-rock-detail.jpg'))
    save(normals(nor), os.path.join(khepri, 'cliff-rock-normal.jpg'))
    # Ice: the same layering and fractures, grain smoothed away, gentler relief.
    save(detail(lum, 0.11, smooth=1.6, large=56.0), os.path.join(vesper, 'ice-wall-detail.jpg'))
    save(normals(nor, smooth=2.2, flatten=0.6), os.path.join(vesper, 'ice-wall-normal.jpg'))


if __name__ == '__main__':
    run()
