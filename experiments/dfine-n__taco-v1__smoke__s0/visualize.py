"""Draw COCO ground truth and D-FINE predictions in one image grid."""

import argparse
import json
import random
import sys
from collections import defaultdict
from collections.abc import Sequence
from pathlib import Path
from typing import Any, TypeAlias

import torch
import torchvision.transforms as T
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
DFINE_ROOT = ROOT / "members/hur-wan/models/D-FINE"
sys.path.insert(0, str(DFINE_ROOT))
from src.core import YAMLConfig


CELL_W, CELL_H, HEADER_H = 480, 640, 32
COLORS = ("#e53935", "#1e88e5", "#43a047", "#fb8c00")
FONT = ImageFont.load_default(size=16)
Detection: TypeAlias = tuple[Sequence[float], int, float | None]


def draw_panel(
    image: Image.Image,
    detections: Sequence[Detection],
    title: str,
    class_names: dict[int, str],
) -> Image.Image:
    scale = min(CELL_W / image.width, CELL_H / image.height)
    resized = image.resize(
        (round(image.width * scale), round(image.height * scale)), Image.Resampling.BILINEAR
    )
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

        label = class_names[class_id]
        if score is not None:
            label += f" {score:.2f}"
        text_box = draw.textbbox((0, 0), label, font=FONT)
        text_w, text_h = text_box[2] - text_box[0], text_box[3] - text_box[1]
        text_x = min(max(0, x1), CELL_W - text_w - 4)
        text_y = max(HEADER_H, y1 - text_h - 4)
        draw.rectangle((text_x, text_y, text_x + text_w + 4, text_y + text_h + 4), fill=color)
        draw.text((text_x + 2, text_y + 2), label, fill="white", font=FONT)

    return panel


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("-c", "--config", type=Path, default=DFINE_ROOT / "configs/dfine/custom/dfine_hgnetv2_n_custom.yml")
    parser.add_argument("-r", "--weights", type=Path, default=HERE / "best_stg1.pth")
    parser.add_argument("-o", "--output", type=Path)
    parser.add_argument("--dataset", default="taco", help="taco or a COCO annotations JSON path")
    parser.add_argument("--images", type=Path, help="Image directory for a custom --dataset JSON")
    parser.add_argument("--split", choices=("train", "val", "test"), default="val")
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--count", type=int, default=8)
    parser.add_argument("--conf", type=float, default=0.4)
    parser.add_argument("--device", default="cuda:0" if torch.cuda.is_available() else "cpu")
    args = parser.parse_args()
    if not 0 <= args.conf <= 1:
        parser.error("--conf must be between 0 and 1")
    if args.count < 1:
        parser.error("--count must be positive")

    if not args.config.is_file() or not args.weights.is_file():
        parser.error(f"Check config and checkpoint paths: {args.config}, {args.weights}")

    cfg = YAMLConfig(str(args.config))
    cfg.yaml_cfg["HGNetv2"]["pretrained"] = False
    if args.dataset == "taco":
        images_dir = ROOT / "data/taco_yolo/images" / args.split
        annotation_file = ROOT / "data/taco_coco/annotations" / f"{args.split}.json"
    else:
        annotation_file = Path(args.dataset)
        images_dir = args.images
        if images_dir is None:
            parser.error("--images is required with a custom --dataset JSON")
    if not images_dir.is_dir() or not annotation_file.is_file():
        parser.error(f"Check dataset paths: {images_dir}, {annotation_file}")
    output = args.output or HERE / f"gt_pred_{annotation_file.stem}_seed{args.seed}.png"
    if output.exists():
        parser.error(f"output already exists: {output}")
    coco: dict[str, Any] = json.loads(annotation_file.read_text(encoding="utf-8"))
    if len(coco["images"]) < args.count:
        parser.error(f"dataset contains fewer than {args.count} images")

    class_names: dict[int, str] = {
        category["id"]: category["name"] for category in coco["categories"]
    }
    annotations: defaultdict[int, list[dict[str, Any]]] = defaultdict(list)
    for annotation in coco["annotations"]:
        if not annotation.get("iscrowd", 0):
            annotations[annotation["image_id"]].append(annotation)

    checkpoint: dict[str, Any] = torch.load(args.weights, map_location="cpu", weights_only=False)
    state = checkpoint["ema"]["module"] if "ema" in checkpoint else checkpoint["model"]
    model = cfg.model
    model.load_state_dict(state)
    model = model.deploy().to(args.device).eval()
    postprocessor = cfg.postprocessor.deploy().to(args.device).eval()
    transform = T.Compose([T.Resize((640, 640)), T.ToTensor()])
    selected: list[dict[str, Any]] = random.Random(args.seed).sample(
        sorted(coco["images"], key=lambda image: image["id"]), args.count
    )

    panels: list[Image.Image] = []
    for image_info in selected:
        image = Image.open(images_dir / image_info["file_name"]).convert("RGB")
        original_size = torch.tensor([[image.width, image.height]], device=args.device)
        with torch.inference_mode():
            labels, boxes, scores = postprocessor(
                model(transform(image).unsqueeze(0).to(args.device)), original_size
            )

        ground_truth: list[Detection] = []
        for annotation in annotations[image_info["id"]]:
            x, y, width, height = annotation["bbox"]
            ground_truth.append(((x, y, x + width, y + height), annotation["category_id"], None))

        keep = scores[0] >= args.conf
        predictions: list[Detection] = [
            (box.tolist(), int(label), float(score))
            for box, label, score in zip(
                boxes[0][keep].cpu(), labels[0][keep].cpu(), scores[0][keep].cpu()
            )
        ]
        name = image_info["file_name"]
        panels.append(draw_panel(image, ground_truth, f"GT | {name}", class_names))
        panels.append(draw_panel(image, predictions, f"Pred | {name}", class_names))

    grid = Image.new("RGB", (4 * CELL_W, ((len(panels) + 3) // 4) * (CELL_H + HEADER_H)), "white")
    for index, panel in enumerate(panels):
        grid.paste(panel, ((index % 4) * CELL_W, (index // 4) * (CELL_H + HEADER_H)))
    output.parent.mkdir(parents=True, exist_ok=True)
    grid.save(output)
    print(f"Saved {output} from: {', '.join(image['file_name'] for image in selected)}")


if __name__ == "__main__":
    main()
