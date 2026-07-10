"""背景を透過にする（四隅からフラッドフィル）"""
from PIL import Image
import numpy as np
from collections import deque
import os, sys

TOLERANCE = 40  # 色の許容誤差（0-255）

def remove_bg(src_path, tolerance=TOLERANCE):
    img = Image.open(src_path).convert('RGBA')
    data = np.array(img, dtype=np.int32)
    h, w = data.shape[:2]

    # 四隅の平均色を背景色とみなす
    corners = np.array([
        data[0, 0, :3], data[0, -1, :3],
        data[-1, 0, :3], data[-1, -1, :3],
    ])
    bg = np.median(corners, axis=0).astype(int)

    # 外周全ピクセルからフラッドフィル
    visited = np.zeros((h, w), dtype=bool)
    queue = deque()
    for x in range(w):
        queue.append((0, x))
        queue.append((h - 1, x))
    for y in range(1, h - 1):
        queue.append((y, 0))
        queue.append((y, w - 1))

    while queue:
        y, x = queue.popleft()
        if visited[y, x]:
            continue
        diff = data[y, x, :3] - bg
        dist = float(np.sqrt(np.sum(diff ** 2)))
        if dist > tolerance:
            continue
        visited[y, x] = True
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx]:
                queue.append((ny, nx))

    data = np.array(img)  # uint8 に戻す
    data[visited, 3] = 0  # 背景ピクセルを透明に

    result = Image.fromarray(data, 'RGBA')
    result.save(src_path)
    removed = int(np.sum(visited))
    print(f'  {os.path.basename(src_path)}: {removed} px 透過 (bg={bg.tolist()})')

IMG_DIR = os.path.join(os.path.dirname(__file__), '..', 'src', 'img')

targets = [
    'hero_ginga.png',
    'hero_omega.png',
    'hero_omega2.png',
    'hero_shuketsu.png',
    'hero_zero.png',
    'hero_zett.png',
]

print('背景除去中...')
for fname in targets:
    path = os.path.join(IMG_DIR, fname)
    if os.path.exists(path):
        remove_bg(path)
    else:
        print(f'  {fname}: not found')
print('完了')
