"""
hero全体.png の背景を rembg + birefnet-general モデルで除去
白・銀色の被写体でも正確に保持できる
"""
import os
import sys
from pathlib import Path
from rembg import remove, new_session
from PIL import Image

IMG_DIR   = Path(__file__).parent / "src" / "img"
INPUT_IMG  = IMG_DIR / "hero全体.png"
OUTPUT_IMG = IMG_DIR / "hero全体_transparent.png"

def remove_bg(input_path: Path, output_path: Path):
    print(f"入力: {input_path}")
    print("モデル読み込み中: birefnet-general ...")

    session = new_session("birefnet-general")

    print("背景除去中...")
    with open(input_path, "rb") as f:
        img_data = f.read()

    result = remove(img_data, session=session)

    with open(output_path, "wb") as f:
        f.write(result)

    img = Image.open(output_path)
    print(f"保存完了: {output_path}  サイズ: {img.size}  モード: {img.mode}")

if __name__ == "__main__":
    if not INPUT_IMG.exists():
        print(f"エラー: {INPUT_IMG} が見つかりません", file=sys.stderr)
        sys.exit(1)
    remove_bg(INPUT_IMG, OUTPUT_IMG)
    print("完了！")
