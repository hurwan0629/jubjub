"""채택한 데이터셋의 원본을 _raw/<이름>/ 에 내려받고 압축을 푼다.

실행: python scripts/download.py            (전부)
      python scripts/download.py tod        (하나만)

내려받은 파일의 SHA-256 이 아래 값과 다르면 멈춘다 (원본이 바뀌었거나 받다가 깨진 경우).
이미 받은 파일이 있고 값이 맞으면 다시 받지 않는다.
howa 는 신청 양식을 내야 받을 수 있어서 내려받지 않는다. 직접 받은 howa.zip 을 _raw/howa/ 에 두면 확인하고 압축만 푼다.
"""
import hashlib
import sys
import urllib.request
import zipfile

from common import RAW

SOURCES = {
    "click": {   # CLICK Trash Dataset v1.0, MIT, 5.6GB. Hugging Face 의 특정 버전(커밋)으로 고정했다.
        "url": "https://huggingface.co/datasets/manjt/click_trash_dataset/resolve/"
               "fb2b01640d90ca3d3f58c796c3dfcf1a50f2817a/data.zip",
        "file": "data.zip",
        "sha256": "902fd9665e3ca84222540ed5071d6a6d114ec09e785c2f174509b28fbd2e2d42",
    },
    "tod": {     # TOD: Trash Object Detection Dataset v1.0 (TADA), MIT, 0.8GB
        "url": "https://zenodo.org/records/4607158/files/TrAsh_DAtaset_v1.1.zip?download=1",
        "file": "TrAsh_DAtaset_v1.1.zip",
        "sha256": "36b0b0ed28cf9765d3ee9197096cb6b0112e0146dc8bb5aa826dc89785776e7f",
    },
    "howa": {    # HOWA dataset v1, 비영리 연구·교육용, 3.9GB. 신청 양식을 내야 받을 수 있어서 자동으로 받지 못한다.
        "url": None,     # https://iuii.ua.es/datasets/howa/index.html 에서 신청해 받은 파일을 _raw/howa/howa.zip 에 둔다
        "file": "howa.zip",
        "sha256": "dbb54dce12d4977a0a8a11befec08169318d5a20456fa2a50f7641451fe309de",
    },
}


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as file:
        while chunk := file.read(1 << 20):       # 1MB 씩 읽는다
            digest.update(chunk)
    return digest.hexdigest()


def main():
    for name in sys.argv[1:] or SOURCES:
        source = SOURCES[name]
        folder = RAW / name
        folder.mkdir(parents=True, exist_ok=True)
        archive = folder / source["file"]

        if source["url"] is None and not archive.exists():
            raise SystemExit(f"{name}: 자동으로 받을 수 없습니다. 직접 받은 파일을 {archive} 에 두고 다시 실행하세요.")
        if source["url"] is not None and (not archive.exists() or sha256(archive) != source["sha256"]):
            print(f"{name}: 내려받는 중 ... {source['url']}")
            request = urllib.request.Request(source["url"], headers={"User-Agent": "dataset-download-script"})
            with urllib.request.urlopen(request) as response, open(archive, "wb") as file:
                done = 0
                while chunk := response.read(1 << 20):
                    file.write(chunk)
                    done += len(chunk)
                    if done % (200 << 20) < (1 << 20):
                        print(f"  {done >> 20} MB")
        if sha256(archive) != source["sha256"]:
            raise SystemExit(f"{name}: SHA-256 이 다릅니다. 파일을 지우고 다시 받거나 원본이 바뀌었는지 확인하세요.")

        if not (folder / "extracted").exists():
            print(f"{name}: 압축 푸는 중 ...")
            with zipfile.ZipFile(archive) as bundle:
                bundle.extractall(folder / "extracted")
        print(f"{name}: 준비됨 -> {folder / 'extracted'}")


if __name__ == "__main__":
    main()
