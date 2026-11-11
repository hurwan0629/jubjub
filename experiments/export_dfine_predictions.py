"""Export D-FINE validation predictions as COCO detection results."""

import argparse
import json
import random
import sys
from pathlib import Path
from typing import Any

import torch
import torchvision.transforms as T
from PIL import Image


DFINE_ROOT = Path(__file__).resolve().parents[1] / "members/hur-wan/models/D-FINE"
sys.path.insert(0, str(DFINE_ROOT))
from src.core import YAMLConfig


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("--weights", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--limit", type=int, help="Export this many seeded validation images")
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--device", default="cuda:0" if torch.cuda.is_available() else "cpu")
    args = parser.parse_args()
    if args.output.exists():
        parser.error(f"output already exists: {args.output}")

    cfg = YAMLConfig(str(args.config))
    cfg.yaml_cfg["HGNetv2"]["pretrained"] = False
    dataset = cfg.yaml_cfg["val_dataloader"]["dataset"]
    images_dir = Path(dataset["img_folder"])
    annotation = json.loads(Path(dataset["ann_file"]).read_text(encoding="utf-8"))
    images = sorted(annotation["images"], key=lambda image: image["id"])
    category_ids = {category["id"] for category in annotation["categories"]}
    if args.limit is not None:
        if not 1 <= args.limit <= len(images):
            parser.error(f"--limit must be between 1 and {len(images)}")
        images = random.Random(args.seed).sample(images, args.limit)

    checkpoint: dict[str, Any] = torch.load(args.weights, map_location="cpu", weights_only=False)
    state = checkpoint["ema"]["module"] if "ema" in checkpoint else checkpoint["model"]
    model = cfg.model
    model.load_state_dict(state)
    model = model.deploy().to(args.device).eval()
    postprocessor = cfg.postprocessor.to(args.device).eval()
    transform = T.Compose([T.Resize((640, 640)), T.ToTensor()])

    predictions: list[dict[str, int | float | list[float]]] = []
    with torch.inference_mode():
        for image_info in images:
            with Image.open(images_dir / image_info["file_name"]) as source:
                image = source.convert("RGB")
            original_size = torch.tensor([[image.width, image.height]], device=args.device)
            result = postprocessor(
                model(transform(image).unsqueeze(0).to(args.device)), original_size
            )[0]
            for label, box, score in zip(result["labels"], result["boxes"], result["scores"]):
                category_id = int(label)
                if category_id not in category_ids:
                    raise ValueError(f"predicted category_id {category_id} is absent from GT categories")
                x1, y1, x2, y2 = box.tolist()
                predictions.append(
                    {
                        "image_id": image_info["id"],
                        "category_id": category_id,
                        "bbox": [x1, y1, x2 - x1, y2 - y1],
                        "score": float(score),
                    }
                )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(predictions, ensure_ascii=False), encoding="utf-8")
    print(f"Saved {len(predictions)} predictions for {len(images)} images to {args.output}")


if __name__ == "__main__":
    main()
