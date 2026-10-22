"""Rock and ice detail textures for cliff walls (terrain v15, docs/26).

The user asked for "rocky textures too so it looks more detailed" on the new cliff walls. The runtime maps follow
the existing Khepri convention (art/source/polyhaven/README.md): colour stays with the planet palette and vertex
colours, so a detail map holds only a luminance ratio (0.5 = neutral) and a normal map holds OpenGL-convention
vectors. Both stay tileable: every filter here wraps around the edges.

Sources (CC0, Poly Haven, in art/source/polyhaven/):
- `cliff_side`: layered, fractured cliff rock. Khepri and Luna walls use it directly; the image's ledges run
  horizontally (image x = along the wall, image y = up).
- Vesper's ice walls (since 22 October: the user wanted them "more crispy ... darker sharp texture like in the original
  concept"; the smoothed rock gave soft, low-contrast strata) are procedural: long near-vertical fractures as sharp
  dark lines with a bright lip, branching cross-cracks, faceted plates between them and faint strata, at 1024 px.

Outputs (512 px JPG; Vesper's 1024 px):
- public/assets/khepri/textures/cliff-rock-detail.jpg, cliff-rock-normal.jpg
- public/assets/vesper/textures/ice-wall-detail.jpg, ice-wall-normal.jpg

    cd /mnt/c && "/mnt/c/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup \\
        --python "$(wslpath -w tools/blender/cliff_textures.py)" [-- --only vesper]
"""
import os
import sys

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


def blur_xy(a, sx, sy):
    """Periodic anisotropic Gaussian blur (FFT): sx across, sy up the wall."""
    fy = np.fft.fftfreq(a.shape[0])[:, None]
    fx = np.fft.fftfreq(a.shape[1])[None, :]
    kernel = np.exp(-2 * np.pi ** 2 * ((sx * fx) ** 2 + (sy * fy) ** 2))
    return np.real(np.fft.ifft2(np.fft.fft2(a) * kernel))


def ice_maps(n=1024, seed=22):
    """Crisp fractured glacier ice, tileable both ways (image x = along the wall, image y = up): returns the luminance
    detail (0.5 neutral) and the height field its normals come from."""
    rng = np.random.default_rng(seed)
    rows, cols = np.arange(n, dtype=np.float32), np.arange(n, dtype=np.float32)[None, :]
    # Long fractures running up the face: straight runs with kinks (piecewise linear, periodic in y so the map tiles).
    count = 13
    lines = []
    for bx in np.sort(rng.uniform(0, n, count)):
        ys = np.cumsum(rng.uniform(70, 190, 12)); ys = ys[ys < n - 40]
        ys = np.concatenate([[0.0], ys, [float(n)]])
        xs = bx + rng.uniform(-14, 14, len(ys)); xs[-1] = xs[0]
        lines.append(np.interp(rows, ys, xs) % n)
    lines = np.stack(lines).astype(np.float32)               # (count, rows): x of each fracture per row
    diff = (cols[None, :, :] - lines[:, :, None] + n / 2) % n - n / 2   # (count, rows, cols) signed periodic distance
    dist = np.abs(diff)
    nearest = dist.argmin(axis=0)
    d = np.take_along_axis(dist, nearest[None], 0)[0]
    side = np.sign(np.take_along_axis(diff, nearest[None], 0)[0])
    # Fracture width varies along each line (hairlines to open cracks).
    width = (0.6 + 1.6 * (0.5 + 0.5 * np.sin(rows[:, None] / n * 2 * np.pi * 3 + nearest * 1.7))).astype(np.float32)
    core = np.clip(1.0 - (d - width) / 1.1, 0.0, 1.0)              # 1 inside the crack, anti-aliased over ~1 px
    lip = np.clip(1.0 - np.abs(d - width - 1.6) / 1.4, 0.0, 1.0) * (side > 0)   # a bright fresh edge on one side
    # Plates: the strip to the right of each fracture, each its own tone and tilt, with vertical streaks inside.
    right = (cols[None, :, :] - lines[:, :, None]) % n
    plate = right.argmin(axis=0)
    across = np.take_along_axis(right, plate[None], 0)[0]
    tones, tilts = rng.uniform(-0.08, 0.08, count), rng.uniform(-1.0, 1.0, count)
    streaks = blur_xy(rng.standard_normal((n, n)).astype(np.float32), 1.5, 30.0)
    streaks = streaks / max(float(streaks.std()), 1e-6)
    strata = 0.5 + 0.5 * np.sin(rows[:, None] / n * 2 * np.pi * 9 + blur_xy(rng.standard_normal((n, n)).astype(np.float32), 40, 8) * 6)
    lum = 0.5 + tones[plate] + 0.03 * streaks + 0.02 * (strata - 0.5) + 0.05 * tilts[plate] * (across / 60.0 - 0.5).clip(-1, 1)
    # Cross-cracks branching off the fractures: short diagonal segments, sharp and dark.
    cross = np.zeros((n, n), dtype=np.float32)
    for _ in range(34):
        y0 = rng.uniform(0, n); i = rng.integers(0, count); x0 = lines[i, int(y0) % n]
        angle = np.radians(rng.uniform(25, 70)) * rng.choice((-1, 1)); length = rng.uniform(25, 90)
        dx, dy = np.sin(angle) * rng.choice((-1, 1)), np.cos(angle)
        ys = np.arange(int(y0 - length) - 4, int(y0 + length) + 5)
        xs = np.arange(int(x0 - length) - 4, int(x0 + length) + 5)
        py, px = np.meshgrid(ys.astype(np.float32), xs.astype(np.float32), indexing='ij')
        t = np.clip((px - x0) * dx + (py - y0) * dy, 0, length)
        dd = np.hypot(px - (x0 + dx * t), py - (y0 + dy * t))
        w = rng.uniform(0.5, 1.2)
        seg = np.clip(1.0 - (dd - w) / 1.0, 0.0, 1.0) * np.clip(1.0 - t / length, 0.25, 1.0)
        np.maximum.at(cross, (ys[:, None] % n, xs[None, :] % n), seg)
    crack = np.maximum(core, cross * 0.85)
    lum = lum * (1.0 - 0.82 * crack) + 0.16 * lip * (1.0 - crack)
    # Height: plates tilted their own way, fractures cut in.
    height = tilts[plate] * across * 0.035 - 2.2 * crack + 0.15 * streaks
    return np.clip(lum, 0.04, 0.96).astype(np.float32), height.astype(np.float32)


def height_normals(height, strength=1.4):
    """OpenGL-convention normals from a periodic height field."""
    gx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * 0.5 * strength
    gy = (np.roll(height, 1, axis=0) - np.roll(height, -1, axis=0)) * 0.5 * strength   # rows run from the top
    v = np.stack([-gx, -gy, np.ones_like(height)], axis=-1)
    v /= np.linalg.norm(v, axis=-1, keepdims=True)
    return v * 0.5 + 0.5


def run():
    only = sys.argv[sys.argv.index('--only') + 1] if '--only' in sys.argv else None
    scene = bpy.context.scene
    # Write data values unchanged (no view transform on save).
    scene.view_settings.view_transform = 'Standard'
    scene.display_settings.display_device = 'sRGB'
    diffuse = shrink(load('cliff_side_Diffuse_1k.jpg'))
    lum = diffuse @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    nor = shrink(load('cliff_side_nor_gl_1k.jpg'))
    khepri = os.path.join(ROOT, 'public', 'assets', 'khepri', 'textures')
    vesper = os.path.join(ROOT, 'public', 'assets', 'vesper', 'textures')
    if only != 'vesper':
        # Rock: crisp grain, ledges and cracks at full strength.
        save(detail(lum, 0.17), os.path.join(khepri, 'cliff-rock-detail.jpg'))
        save(normals(nor), os.path.join(khepri, 'cliff-rock-normal.jpg'))
    if only != 'khepri':
        # Ice: crisp procedural fractures (see ice_maps).
        ice, height = ice_maps()
        save(ice, os.path.join(vesper, 'ice-wall-detail.jpg'), quality=94)
        save(height_normals(height), os.path.join(vesper, 'ice-wall-normal.jpg'), quality=94)


if __name__ == '__main__':
    run()
