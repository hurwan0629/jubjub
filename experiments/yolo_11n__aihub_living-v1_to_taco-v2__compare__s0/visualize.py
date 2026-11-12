"""AIHub 또는 TACO 단계의 YOLO 예측과 정답을 PNG 그리드로 비교한다.

사용법 (이 폴더에서):
    python visualize.py --model taco --dataset taco --split test --seed 1

--model aihub는 aihub_run/, --model taco는 run/의 best.pt를 읽는다.
"""

import argparse
from pathlib import Path
from random import Random

import yaml
from PIL import Image, ImageDraw, ImageFont
from ultralytics import YOLO


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
DATASETS = {
    "aihub": ROOT / "data/aihub_living_yolo/data.yaml",
    "taco": ROOT / "data/taco_yolo/data.yaml",
}
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
CELL_W, CELL_H, HEADER_H = 480, 640, 32
COLORS = ("#e53935", "#1e88e5", "#43a047", "#fb8c00")
FONT = ImageFont.load_default(size=16)


def draw_panel(image, detections, title, names):
    # 원본 비율을 유지해 패널에 맞추고, 박스 좌표에도 같은 배율과 여백을 적용한다.
    scale = min(CELL_W / image.width, CELL_H / image.height)
    resized = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.BILINEAR)
    panel = Image.new("RGB", (CELL_W, CELL_H + HEADER_H), "white")
    offset_x = (CELL_W - resized.width) // 2
    offset_y = HEADER_H + (CELL_H - resized.height) // 2
    panel.paste(resized, (offset_x, offset_y))
    draw = ImageDraw.Draw(panel)
    draw.text((6, 6), title, fill="black", font=FONT)
    for box, class_id, score in detections:
        color = COLORS[class_id % len(COLORS)]
        x1, y1, x2, y2 = box
        x1, x2 = offset_x + x1 * scale, offset_x + x2 * scale
        y1, y2 = offset_y + y1 * scale, offset_y + y2 * scale
        draw.rectangle((x1, y1, x2, y2), outline=color, width=3)
        label = str(names[class_id]) + (f" {score:.2f}" if score is not None else "")
        text_box = draw.textbbox((0, 0), label, font=FONT)
        text_w, text_h = text_box[2] - text_box[0], text_box[3] - text_box[1]
        text_x = min(max(0, x1), CELL_W - text_w - 4)
        text_y = max(HEADER_H, y1 - text_h - 4)
        draw.rectangle((text_x, text_y, text_x + text_w + 4, text_y + text_h + 4), fill=color)
        draw.text((text_x + 2, text_y + 2), label, fill="white", font=FONT)
    return panel


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", choices=("aihub", "taco", "run"), help="Checkpoint stage for a two-stage experiment")
    parser.add_argument("--dataset", help="aihub, taco, or a data.yaml path")
    parser.add_argument("--split", choices=("train", "val", "test"))
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--count", type=int, default=8)
    parser.add_argument("--conf", type=float, default=0.4)
    parser.add_argument("--device", help="Override the device in config.yaml")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.count < 1:
        parser.error("--count must be positive")
    if not 0 <= args.conf <= 1:
        parser.error("--conf must be between 0 and 1")

    # --model aihub는 aihub_run/weights/best.pt, --model taco는 run/weights/best.pt를 읽는다.
    config_path = HERE / "config.yaml"
    config = yaml.safe_load(config_path.read_text(encoding="utf-8")) if config_path.is_file() else {}
    if not config_path.is_file() and not args.dataset:
        parser.error("The notebook baseline needs --dataset pointing to its original data.yaml")
    available_models = {"aihub", "taco"} if config.get("aihub_data") else {"run"}
    model_stage = args.model or ("taco" if config.get("aihub_data") else "run")
    if model_stage not in available_models:
        parser.error(f"Available model stages: {', '.join(sorted(available_models))}")
    run_dir = "aihub_run" if model_stage == "aihub" else "run"
    if not config_path.is_file():
        run_dir = "train"  # The notebook baseline wrote to train/.
    weights = HERE / run_dir / "weights/best.pt"
    dataset_name = args.dataset or ("aihub" if "aihub" in str(config.get("data", "")) else "taco")
    data_yaml = DATASETS.get(dataset_name, Path(dataset_name))
    if not data_yaml.is_absolute():
        data_yaml = (HERE / data_yaml).resolve()
    if not weights.is_file() or not data_yaml.is_file():
        parser.error(f"Check checkpoint and dataset paths: {weights}, {data_yaml}")

    data = yaml.safe_load(data_yaml.read_text(encoding="utf-8"))
    split = args.split or ("test" if dataset_name == "taco" else "val")
    if split not in data:
        parser.error(f"{data_yaml} has no {split} split")
    # data.yaml의 images/<split>과 같은 위치의 labels/<split>을 짝지어 읽는다.
    data_root = Path(data["path"])
    if not data_root.is_absolute():
        data_root = (data_yaml.parent / data_root).resolve()
    image_relative = Path(data[split])
    if not image_relative.parts or image_relative.parts[0] != "images":
        parser.error(f"Expected images/<split> in {data_yaml}: {data[split]}")
    image_root = data_root / image_relative
    label_root = data_root / "labels" / Path(*image_relative.parts[1:])
    if not image_root.is_dir() or not label_root.is_dir():
        parser.error(f"Missing image or label directory: {image_root}, {label_root}")
    images = sorted(path for path in image_root.rglob("*") if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES)
    if len(images) < args.count:
        parser.error(f"Requested {args.count} images, found {len(images)} in {image_root}")
    selected = Random(args.seed).sample(images, args.count)
    output = args.output or HERE / f"gt_pred_{model_stage}_{data_yaml.parent.name}_{split}_seed{args.seed}.png"
    if output.exists():
        parser.error(f"Output already exists: {output}")

    # 클래스 번호의 의미가 다르면 GT와 예측을 나란히 놓아도 비교할 수 없다.
    model = YOLO(str(weights))
    names = {int(key): value for key, value in data["names"].items()} if isinstance(data["names"], dict) else dict(enumerate(data["names"]))
    if {int(key): str(value) for key, value in model.names.items()} != names:
        parser.error("Checkpoint and dataset class names differ")
    panels = []
    for image_path in selected:
        with Image.open(image_path) as source:
            image = source.convert("RGB")
        label_path = label_root / image_path.relative_to(image_root).with_suffix(".txt")
        # YOLO 라벨의 정규화된 중심 좌표를 원본 이미지의 모서리 좌표로 바꾼다.
        ground_truth = []
        lines = label_path.read_text(encoding="utf-8").splitlines() if label_path.is_file() else []
        for line_number, line in enumerate(lines, 1):
            values = line.split()
            if len(values) != 5:
                parser.error(f"Invalid YOLO label: {label_path}:{line_number}")
            class_id = int(values[0])
            if class_id not in names:
                parser.error(f"Unknown class {class_id}: {label_path}:{line_number}")
            x, y, width, height = map(float, values[1:])
            ground_truth.append((((x - width / 2) * image.width, (y - height / 2) * image.height,
                                  (x + width / 2) * image.width, (y + height / 2) * image.height), class_id, None))
        result = model.predict(source=str(image_path), conf=args.conf, imgsz=config.get("imgsz", 640),
                               device=args.device or config.get("device"), verbose=False)[0]
        predictions = [(tuple(box.xyxy[0].tolist()), int(box.cls[0]), float(box.conf[0])) for box in result.boxes]
        name = str(image_path.relative_to(image_root))
        panels.append(draw_panel(image, ground_truth, f"GT | {name}", names))
        panels.append(draw_panel(image, predictions, f"Pred | {name}", names))

    # 이미지마다 GT와 예측 패널을 연속 배치하고 네 열짜리 PNG 한 장으로 저장한다.
    rows = (len(panels) + 3) // 4
    grid = Image.new("RGB", (4 * CELL_W, rows * (CELL_H + HEADER_H)), "white")
    for index, panel in enumerate(panels):
        grid.paste(panel, ((index % 4) * CELL_W, (index // 4) * (CELL_H + HEADER_H)))
    output.parent.mkdir(parents=True, exist_ok=True)
    grid.save(output)
    print(f"Saved {output} from: {', '.join(path.name for path in selected)}")


if __name__ == "__main__":
    main()
