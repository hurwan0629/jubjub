"""Draw eight COCO GT/prediction pairs in a 4x4 grid, independent of model."""

import argparse
import json
import random
from collections import defaultdict
from collections.abc import Sequence
from pathlib import Path
from typing import Any, TypeAlias

from PIL import Image, ImageDraw, ImageFont


CELL_W, CELL_H, HEADER_H = 480, 640, 32
COLORS = ("#e53935", "#1e88e5", "#43a047", "#fb8c00")
FONT = ImageFont.load_default(size=16)
Detection: TypeAlias = tuple[tuple[float, float, float, float], int, float | None]


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

    for (x1, y1, x2, y2), class_id, score in detections:
        color = COLORS[class_id % len(COLORS)]
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
    parser.add_argument("--images", type=Path, required=True)
    parser.add_argument("--ground-truth", type=Path, required=True)
    parser.add_argument("--predictions", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--conf", type=float, default=0.4)
    args = parser.parse_args()
    if not 0 <= args.conf <= 1:
        parser.error("--conf must be between 0 and 1")
    if args.output.exists():
        parser.error(f"output already exists: {args.output}")

    coco: dict[str, Any] = json.loads(args.ground_truth.read_text(encoding="utf-8"))
    predictions: list[dict[str, Any]] = json.loads(args.predictions.read_text(encoding="utf-8"))
    if len(coco["images"]) < 8:
        parser.error("ground truth must contain at least eight images")
    class_names: dict[int, str] = {
        category["id"]: category["name"] for category in coco["categories"]
    }
    image_ids = {image["id"] for image in coco["images"]}
    ground_truth: defaultdict[int, list[Detection]] = defaultdict(list)
    for annotation in coco["annotations"]:
        if not annotation.get("iscrowd", 0):
            x, y, width, height = annotation["bbox"]
            ground_truth[annotation["image_id"]].append(
                ((x, y, x + width, y + height), annotation["category_id"], None)
            )

    predicted: defaultdict[int, list[Detection]] = defaultdict(list)
    for prediction in predictions:
        image_id, category_id = prediction["image_id"], prediction["category_id"]
        if image_id not in image_ids or category_id not in class_names:
            parser.error(f"unknown image_id or category_id in prediction: {prediction}")
        if prediction["score"] >= args.conf:
            x, y, width, height = prediction["bbox"]
            predicted[image_id].append(
                ((x, y, x + width, y + height), category_id, prediction["score"])
            )

    selected = random.Random(args.seed).sample(
        sorted(coco["images"], key=lambda image: image["id"]), 8
    )
    panels: list[Image.Image] = []
    for image_info in selected:
        with Image.open(args.images / image_info["file_name"]) as source:
            image = source.convert("RGB")
        image_id, name = image_info["id"], image_info["file_name"]
        panels.append(draw_panel(image, ground_truth[image_id], f"GT | {name}", class_names))
        panels.append(draw_panel(image, predicted[image_id], f"Pred | {name}", class_names))

    grid = Image.new("RGB", (4 * CELL_W, 4 * (CELL_H + HEADER_H)), "white")
    for index, panel in enumerate(panels):
        grid.paste(panel, ((index % 4) * CELL_W, (index // 4) * (CELL_H + HEADER_H)))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    grid.save(args.output)
    print(f"Saved {args.output} from: {', '.join(image['file_name'] for image in selected)}")


if __name__ == "__main__":
    main()
