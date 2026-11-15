"""루트 data/figures/make_figures.py 의 그리기 함수를 그대로 불러서 claude_data 의 그림을 figures/ 에 만든다.

실행: python scripts/make_figures.py

형식이 data/ 와 같기 때문에 원본 스크립트를 고치지 않고, 읽을 폴더와 데이터셋 목록만 바꿔서 쓴다.
(원본 스크립트가 claude_data 를 문제없이 읽는지 확인하는 호환성 검사이기도 하다.)

  figures/01_dist_<이름>.png ...   분할별 클래스 분포
  figures/0N_sample_<이름>.png ... 라벨을 그린 샘플 1장
  figures/class_counts_table.png   데이터셋별 클래스 개수 표
"""
import importlib.util

from common import NAMES, ROOT

REPO = ROOT.parents[3]                                   # 저장소 루트 (parkkeeper-jupjup/)
ORIGINAL = REPO / "data" / "figures" / "make_figures.py"
OUT = ROOT / "figures"
DATASETS = [("click", "CLICK"), ("tod", "TOD")]          # (폴더 이름 앞부분, 그림에 쓸 이름)


def main():
    spec = importlib.util.spec_from_file_location("data_make_figures", ORIGINAL)
    figures = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(figures)                     # 원본 파일을 모듈로 읽는다 (main 은 실행되지 않는다)
    figures.DATA = ROOT                                  # 읽을 폴더만 claude_data 로 바꾼다
    OUT.mkdir(exist_ok=True)

    rows = []
    for i, (prefix, title) in enumerate(DATASETS):
        splits = figures.load(prefix)
        counts = figures.class_counts(splits)
        figures.plot_distribution(counts, title, OUT / f"{i + 1:02d}_dist_{prefix}.png")
        file, image, anns = figures.pick_sample(prefix, splits)
        figures.plot_sample(file, image, anns, title, OUT / f"{len(DATASETS) + i + 1:02d}_sample_{prefix}.png")
        images = sum(len(imgs) for imgs, _ in splits.values())
        rows.append((title, images, [sum(counts[s][c] for s in counts) for c in range(len(NAMES))]))
        print(title, counts)
    figures.plot_table(rows, OUT / "class_counts_table.png")
    print("저장:", OUT)


if __name__ == "__main__":
    main()
