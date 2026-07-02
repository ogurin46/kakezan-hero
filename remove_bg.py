"""
hero全体.png の背景を Replicate 851-labs/background-removal (BiRefNet) で除去するスクリプト
白っぽい被写体でも正確に保持できるモデル
"""
import os
import sys
import urllib.request
import replicate

# APIキーは .env の REPLICATE_API_TOKEN から読み込む（ハードコード禁止）
def _load_env():
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if not os.path.exists(env_path):
        return
    with open(env_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))

_load_env()
if not os.environ.get("REPLICATE_API_TOKEN"):
    print("エラー: .env に REPLICATE_API_TOKEN=r8_xxx を設定してください", file=sys.stderr)
    sys.exit(1)

IMG_DIR   = os.path.join(os.path.dirname(__file__), "src", "img")
INPUT_IMG  = os.path.join(IMG_DIR, "hero全体.png")
OUTPUT_IMG = os.path.join(IMG_DIR, "hero全体_transparent.png")

def remove_bg(input_path: str, output_path: str):
    print(f"入力: {input_path}")
    print("Replicate 851-labs/background-removal (BiRefNet) に送信中...")

    with open(input_path, "rb") as f:
        output = replicate.run(
            "851-labs/background-removal",
            input={"image": f}
        )

    # output は画像URLまたはFileOutput
    if hasattr(output, "url"):
        url = output.url
    elif hasattr(output, "read"):
        data = output.read()
        with open(output_path, "wb") as out:
            out.write(data)
        print(f"保存完了: {output_path}")
        return
    else:
        url = str(output)

    print(f"ダウンロード中: {url}")
    urllib.request.urlretrieve(url, output_path)
    print(f"保存完了: {output_path}")

if __name__ == "__main__":
    if not os.path.exists(INPUT_IMG):
        print(f"エラー: {INPUT_IMG} が見つかりません", file=sys.stderr)
        sys.exit(1)
    remove_bg(INPUT_IMG, OUTPUT_IMG)
    print("完了！")
